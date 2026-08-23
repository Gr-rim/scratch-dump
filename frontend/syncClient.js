// syncClient.js — the extension's side of sync.
//
// Calls the phone. Never listens, because it cannot: this is the half of the
// conversation a browser is allowed to have, which is the whole reason the
// phone is the one running a server.
//
// Storage access goes through transfer.js, so a folder that arrives over the
// wire is applied by exactly the same code that applies one from a file —
// including the overwrite dialog and the atomic apply.
'use strict';

const SYNC_STORE_KEY = '__sync__';   // { address, code, device, pairedAt }

// A pull of a folder full of screenshots is slow but not unbounded. Long enough
// not to cut off a real transfer, short enough that an unreachable phone is
// reported rather than hung on.
const SYNC_TIMEOUT_MS = 30000;

/** Derived from the code and salt, kept in memory only — it is re-derivable. */
let _syncKey = null;
let _syncKeyFor = '';   // address+code the cached key belongs to

// ─── PEER CONFIG ─────────────────────────────────────────────────────────────

/** @returns {Promise<{address,code,device,pairedAt}|null>} */
async function syncGetPeer() {
  try {
    const d = await storageGet([SYNC_STORE_KEY]);
    return d[SYNC_STORE_KEY] || null;
  } catch { return null; }
}

/**
 * Normalise whatever was typed into a base URL.
 * People paste "192.168.1.42:8765", "http://192.168.1.42:8765/" and everything
 * between; all of them mean the same thing.
 * @param {string} raw
 */
function syncNormalizeAddress(raw) {
  let s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  if (!/:\d+$/.test(s)) s += ':8765';
  return s;
}

/**
 * The match pattern covering one peer.
 *
 * Deliberately not `new URL(address).origin` — an origin carries the port,
 * and a Chrome match pattern has no port component at all. Including one makes
 * the pattern invalid, and an invalid pattern grants nothing while looking
 * like it might have. The host is the unit of permission and already covers
 * every port on it.
 *
 * @param {string} address
 * @returns {string|null}
 */
function syncOriginPattern(address) {
  try {
    const u = new URL(address);
    return u.protocol + '//' + u.hostname + '/*';
  } catch { return null; }
}

/** Whether the permission for this peer is currently held. */
function syncHasPermission(address) {
  const origin = syncOriginPattern(address);
  if (!origin) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      chrome.permissions.contains({ origins: [origin] }, (has) => {
        if (chrome.runtime.lastError) { resolve(false); return; }
        resolve(!!has);
      });
    } catch { resolve(false); }
  });
}

function syncRequestPermission(address) {
  const origin = syncOriginPattern(address);
  if (!origin) return Promise.resolve(false);

  return new Promise((resolve) => {
    try {
      chrome.permissions.request({ origins: [origin] }, (granted) => {
        // An invalid pattern reports here rather than throwing, which is how
        // the port bug looked like a network failure instead of a rejected
        // request. Worth surfacing rather than folding into a bare false.
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn('ScratchDump: permission request refused —', err.message, origin);
          resolve(false); return;
        }
        resolve(!!granted);
      });
    } catch (e) {
      console.warn('ScratchDump: permission request threw —', e, origin);
      resolve(false);
    }
  });
}

function syncDropPermission(address) {
  const origin = syncOriginPattern(address);
  return new Promise((resolve) => {
    if (!origin) { resolve(); return; }
    try {
      chrome.permissions.remove({ origins: [origin] }, () => { void chrome.runtime.lastError; resolve(); });
    } catch { resolve(); }
  });
}

// ─── TRANSPORT ───────────────────────────────────────────────────────────────

/**
 * A fetch failure here is almost always "the phone is not there", which is an
 * ordinary state rather than an error — the app closed, the phone slept, it
 * left the network. Say that, rather than surfacing a TypeError.
 *
 * The request itself is made by the service worker, not here. This page is a
 * chrome-extension:// document and therefore a secure context, so Chrome reads
 * a plain-http request out of it as mixed content and upgrades it to https.
 * The phone has no TLS, so the upgraded request fails in the handshake and
 * arrives back as an unreachable address. background.js is not a document and
 * is not subject to that upgrade. See `syncFetch` there.
 */
async function _fetchJson(url, init) {
  let res;
  try {
    res = await chrome.runtime.sendMessage({
      action: 'syncFetch',
      url,
      init: {
        method: (init && init.method) || 'GET',
        headers: (init && init.headers) || undefined,
        body: (init && init.body) || undefined,
      },
      timeoutMs: SYNC_TIMEOUT_MS,
    });
  } catch (e) {
    // The worker was asleep or the channel closed under us. Not the phone's
    // fault, and not something the usual Wi-Fi advice fits.
    throw new Error('The extension could not run the request. Reload the extension and try again.');
  }

  if (!res) throw new Error('The extension could not run the request. Reload the extension and try again.');

  if (!res.ok) {
    if (res.kind === 'timeout') throw new Error('The phone stopped responding. Is it still on the same Wi-Fi?');
    throw new Error("Can't reach that address. Check the phone is on the same Wi-Fi and sync is switched on.");
  }

  return { status: res.status, body: res.body };
}

/**
 * Handshake with a peer and derive the shared key.
 * @param {string} address @param {string} code
 * @returns {Promise<{device:string}>}
 */
async function syncConnect(address, code) {
  // A fetch blocked for want of permission fails identically to one that
  // found nothing listening — same TypeError, same message. Checking first is
  // what makes the two distinguishable, and they need entirely different
  // things from the user.
  if (!(await syncHasPermission(address))) {
    throw new Error('ScratchDump is not allowed to reach ' + address.replace(/^https?:\/\//, '') + '. Pair again to grant it.');
  }
  const { status, body } = await _fetchJson(address + '/hello', { method: 'GET' });
  if (status !== 200 || !body) throw new Error("That address answered, but it isn't ScratchDump.");

  const hello = syncValidateHello(body);
  _syncKey = await syncDeriveKey(code, hello.salt);
  _syncKeyFor = address + '|' + syncNormalizeCode(code);
  return { device: hello.device };
}

/**
 * One RPC. Reconnects transparently if the key is not for this peer — the salt
 * changes whenever the phone restarts, so this is routine, not exceptional.
 *
 * @param {string} method @param {Object} [params]
 * @returns {Promise<Object>} the `result` field
 */
async function syncCall(method, params) {
  const peer = await syncGetPeer();
  if (!peer) throw new Error('No phone paired yet.');

  const want = peer.address + '|' + syncNormalizeCode(peer.code);
  if (!_syncKey || _syncKeyFor !== want) await syncConnect(peer.address, peer.code);

  const envelope = await syncSeal(_syncKey, { method, params: params || {} });
  const { status, body } = await _fetchJson(peer.address + '/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envelope),
  });

  if (status === 401) {
    // The phone refused us. Overwhelmingly this means its code has rotated —
    // it restarts, it generates a new one, and the stored pair is now stale.
    _syncKey = null;
    throw new Error('The phone refused the pairing code. It changes when the app restarts — re-pair with the code it shows now.');
  }
  if (status !== 200 || !body) throw new Error('The phone sent back something unreadable.');

  const msg = await syncOpen(_syncKey, body);
  if (!msg.ok) throw new Error(msg.error || 'The phone could not do that.');
  return msg.result || {};
}

// ─── OPERATIONS ──────────────────────────────────────────────────────────────

/**
 * Pair with a phone and remember it.
 * @param {string} rawAddress @param {string} code
 * @returns {Promise<{device:string, address:string}>}
 */
async function syncPair(rawAddress, code) {
  const address = syncNormalizeAddress(rawAddress);
  if (!address) throw new Error('Enter the address shown on your phone.');
  if (!syncNormalizeCode(code)) throw new Error('Enter the pairing code shown on your phone.');

  const granted = await syncRequestPermission(address);
  if (!granted) {
    throw new Error('Permission to reach ' + address.replace(/^https?:\/\//, '') + ' was not granted.');
  }
  // Asked and answered are not the same thing. Confirming closes the gap
  // where a pattern is accepted but grants nothing.
  if (!(await syncHasPermission(address))) {
    throw new Error('Chrome reported that address as granted but is not honouring it. Check it looks like 192.168.1.42:8765.');
  }

  const { device } = await syncConnect(address, code);
  await storageSet({ [SYNC_STORE_KEY]: { address, code, device, pairedAt: Date.now() } });
  return { device, address };
}

/** Forget the phone, and hand back the permission that was granted for it. */
async function syncUnpair() {
  const peer = await syncGetPeer();
  _syncKey = null;
  _syncKeyFor = '';
  if (peer) await syncDropPermission(peer.address);
  await new Promise((resolve) => {
    chrome.storage.local.remove(SYNC_STORE_KEY, () => { void chrome.runtime.lastError; resolve(); });
  });
}

/** @returns {Promise<Array<{key,name,kind,pages,images,updatedAt}>>} */
async function syncListFolders() {
  const r = await syncCall(SYNC_METHODS.LIST);
  return Array.isArray(r.folders) ? r.folders : [];
}

/**
 * Bring a folder down from the phone. Returns the export without applying it,
 * so the caller can show the overwrite dialog first — the same order the file
 * import uses, and for the same reason.
 *
 * @param {string} key
 * @returns {Promise<Object>} validated export
 */
async function syncPullFolder(key) {
  const r = await syncCall(SYNC_METHODS.PULL, { key });
  if (!r.export) throw new Error('The phone sent an empty folder.');
  return wireValidate(r.export);
}

/**
 * Send a local folder up.
 * @param {string} key @param {string} name
 * @param {(pct:number)=>void} [onProgress]
 * @returns {Promise<{pages:number, images:number}>}
 */
async function syncPushFolder(key, name, onProgress) {
  const { obj } = await exportFolder(key, name, onProgress);
  const r = await syncCall(SYNC_METHODS.PUSH, { export: obj });
  return { pages: r.pages || 0, images: r.images || 0 };
}
