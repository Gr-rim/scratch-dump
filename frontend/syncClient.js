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
 * Ask for permission to reach exactly this one address.
 *
 * Declared optional and requested narrow on purpose. Chrome match patterns
 * cannot express an IP range, so the only static alternative would be
 * `http://*` for every install — a permission to reach the entire web, granted
 * to everyone including people who never sync. This way a user who never pairs
 * is never asked, and the grant covers one device.
 *
 * Must be called from a user gesture.
 * @param {string} address
 * @returns {Promise<boolean>}
 */
function syncRequestPermission(address) {
  let origin;
  try { origin = new URL(address).origin + '/*'; }
  catch { return Promise.resolve(false); }

  return new Promise((resolve) => {
    try {
      chrome.permissions.request({ origins: [origin] }, (granted) => {
        if (chrome.runtime.lastError) { resolve(false); return; }
        resolve(!!granted);
      });
    } catch { resolve(false); }
  });
}

function syncDropPermission(address) {
  return new Promise((resolve) => {
    let origin;
    try { origin = new URL(address).origin + '/*'; } catch { resolve(); return; }
    try {
      chrome.permissions.remove({ origins: [origin] }, () => { void chrome.runtime.lastError; resolve(); });
    } catch { resolve(); }
  });
}

// ─── TRANSPORT ───────────────────────────────────────────────────────────────

function _timeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

/**
 * A fetch failure here is almost always "the phone is not there", which is an
 * ordinary state rather than an error — the app closed, the phone slept, it
 * left the network. Say that, rather than surfacing a TypeError.
 */
async function _fetchJson(url, init) {
  const to = _timeout(SYNC_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: to.signal, cache: 'no-store' });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('The phone stopped responding. Is it still on the same Wi-Fi?');
    throw new Error("Can't reach that address. Check the phone is on the same Wi-Fi and sync is switched on.");
  } finally {
    to.done();
  }
}

/**
 * Handshake with a peer and derive the shared key.
 * @param {string} address @param {string} code
 * @returns {Promise<{device:string}>}
 */
async function syncConnect(address, code) {
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
  if (!granted) throw new Error('ScratchDump needs permission to reach that address.');

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
