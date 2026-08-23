// background.js — ScratchDump

// The blob store and the schema migration both live here. imageStore.js is
// written to be importable into a worker: nothing at its top level touches the
// DOM, and its DOMParser-based helpers are never called from this file.
importScripts('/frontend/imageStore.js');

const SCHEMA_VERSION = 2;
const NOTE_KEY_RE = /^(site|scratch):/;

// ── STORAGE HELPERS ──────────────────────────────────────────────────────────
// chrome.storage reports failures through runtime.lastError rather than by
// throwing. Unchecked, a failed write looks exactly like a successful one.

function _swLastError(verb) {
  const err = chrome.runtime.lastError;
  return err ? new Error(err.message || ('storage.' + verb + ' failed')) : null;
}

function swGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const err = _swLastError('get');
      err ? reject(err) : resolve(result);
    });
  });
}

function swSet(obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      const err = _swLastError('set');
      err ? reject(err) : resolve();
    });
  });
}

// ── MIGRATION v1 → v2 ────────────────────────────────────────────────────────
// Moves inline base64 images out of chrome.storage.local and into IndexedDB.
//
// This used to run from the panel's init, which meant one migration per open
// panel: two tabs would walk the same notes at the same time, each storing its
// own copy of every image and overwriting the other's refs. A service worker is
// a single instance per profile, which is the guarantee this needs.

async function migrateV1toV2() {
  // Mark in-progress so a crash mid-migration resumes on the next start.
  await swSet({ _migrationStatus: 'in_progress' });

  const allData = await swGet(null);
  let migrated = 0;

  for (const [key, val] of Object.entries(allData)) {
    if (!NOTE_KEY_RE.test(key)) continue;
    if (!val || !Array.isArray(val.pages)) continue;

    let changed = false;
    for (let i = 0; i < val.pages.length; i++) {
      const page = val.pages[i];
      if (!page || !page.includes('data:image')) continue;
      val.pages[i] = await extractImagesToIDBFromString(page);
      changed = true;
    }
    if (changed) {
      await swSet({ [key]: val });
      migrated++;
    }
  }

  // Verify before committing. Every ref is checked, not a sample, and the
  // first failure is named so a retry has something to go on.
  const failures = [];
  for (const [key, val] of Object.entries(allData)) {
    if (!NOTE_KEY_RE.test(key)) continue;
    if (!val || !Array.isArray(val.pages)) continue;
    for (const page of val.pages) {
      for (const id of extractImageIds(page)) {
        if (!(await imgStoreHas(id))) failures.push(key + ' -> ' + id);
      }
    }
  }

  if (failures.length) {
    await swSet({ _migrationStatus: 'failed' });
    throw new Error(
      failures.length + ' image ref(s) did not resolve, first: ' + failures[0]);
  }

  await swSet({
    _schemaVersion: SCHEMA_VERSION,
    _migrationStatus: 'complete',
    _migratedAt: Date.now(),
  });
  console.log(`ScratchDump: migration v1→v2 complete (${migrated} folders updated)`);
}

// ── READINESS ────────────────────────────────────────────────────────────────
// Panels ask before they touch notes. Concurrent asks share one promise, so the
// work happens once however many panels are open.

let storageReadyPromise = null;

function ensureStorageReady() {
  if (!storageReadyPromise) {
    storageReadyPromise = prepareStorage().catch(err => {
      storageReadyPromise = null;   // let a later panel retry
      throw err;
    });
  }
  return storageReadyPromise;
}

async function prepareStorage() {
  const meta = await swGet(['_schemaVersion', '_migrationStatus']);

  if (!meta._schemaVersion) {
    // No version marker means one of two things: a fresh profile, or a v1
    // profile written before versioning existed. Only the second has anything
    // to migrate, and a fresh profile should not pay for a full scan.
    const all = await swGet(null);
    const hasNotes = Object.keys(all).some(k => NOTE_KEY_RE.test(k));
    if (!hasNotes) {
      await swSet({ _schemaVersion: SCHEMA_VERSION, _migrationStatus: 'complete' });
      return;
    }
    await swSet({ _schemaVersion: 1, _migrationStatus: 'pending' });
  } else if (meta._schemaVersion >= SCHEMA_VERSION && meta._migrationStatus === 'complete') {
    return;
  }

  await initImageStore();
  if (!idbAvailable) {
    // Nowhere to put the blobs. Images stay inline and a later start retries.
    console.warn('ScratchDump: IndexedDB unavailable, deferring migration');
    return;
  }
  await migrateV1toV2();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;

  if (msg.action === 'ensureStorageReady') {
    ensureStorageReady()
      .then(() => sendResponse({ ready: true }))
      .catch(err => sendResponse({ ready: false, error: String((err && err.message) || err) }));
    return true;   // response is sent asynchronously
  }

  // Which site is the asking panel on?
  //
  // The panel cannot read its parent's origin, and it must not take the page's
  // word for it: the page and our content script share one window and one
  // origin, so a hostname the page forged is indistinguishable at the receiving
  // end from one the content script sent. An origin check cannot separate them.
  // sender.tab.url is filled in by the browser, so it is the one answer a page
  // has no way to influence.
  if (msg.action === 'getHostInfo') {
    const url = sender && sender.tab && sender.tab.url;
    if (!url) { sendResponse({ ok: false, reason: 'no tab on sender' }); return false; }
    try {
      const u = new URL(url);
      sendResponse({ ok: true, hostname: u.hostname, origin: u.origin });
    } catch (err) {
      sendResponse({ ok: false, reason: String((err && err.message) || err) });
    }
    return false;
  }

  // Sync's transport, run here rather than in the panel.
  //
  // panel.html is a chrome-extension:// page, which Chrome treats as a secure
  // context, so a plain-http fetch out of it counts as mixed content and gets
  // silently upgraded to https. The phone speaks http on a raw socket and has
  // no TLS to answer with, so the upgraded request dies in the handshake —
  // net::ERR_SSL_PROTOCOL_ERROR, which surfaces as "can't reach that address"
  // and looks for all the world like a network fault.
  //
  // A service worker is not a document and its fetches are not subresource
  // loads, so no upgrade is applied. Only the transport moved: pairing, key
  // derivation and every envelope still happen in syncClient.js.
  if (msg.action === 'syncFetch') {
    syncFetch(msg.url, msg.init, msg.timeoutMs)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, kind: 'network', error: String((err && err.message) || err) }));
    return true;   // response is sent asynchronously
  }

  return false;
});

// ── SYNC TRANSPORT ───────────────────────────────────────────────────────────

/**
 * One http request to the phone, on the panel's behalf.
 *
 * Returns rather than throws: the panel needs to tell a timeout apart from a
 * refusal, and an exception thrown here would reach it as a bare
 * "could not establish connection" with everything useful lost.
 *
 * @param {string} url
 * @param {{method?:string, headers?:Object, body?:string}} init
 * @param {number} timeoutMs
 * @returns {Promise<{ok:boolean, kind?:string, status?:number, body?:*, error?:string}>}
 */
async function syncFetch(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeoutMs) || 30000);

  try {
    const res = await fetch(url, {
      method: (init && init.method) || 'GET',
      headers: (init && init.headers) || undefined,
      body: (init && init.body) || undefined,
      signal: controller.signal,
      cache: 'no-store',
    });

    // Read as text and parse here. A body that is not JSON is a peer that is
    // not ScratchDump, which the panel reports differently from a failure to
    // reach anything at all.
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }

    return { ok: true, status: res.status, body };

  } catch (e) {
    const kind = (e && e.name === 'AbortError') ? 'timeout' : 'network';
    return { ok: false, kind, error: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

// ── ORPHANED IMAGE SWEEP ─────────────────────────────────────────────────────
// Deleting a note drops its text but leaves its image blobs behind, and older
// builds duplicated blobs on every save. Reclaim both on startup.

const SWEEP_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;   // at most twice a day

async function runImageSweep(reason) {
  try {
    const { _lastSweepAt = 0 } = await swGet(['_lastSweepAt']);
    if (Date.now() - _lastSweepAt < SWEEP_MIN_INTERVAL_MS) return;

    await initImageStore();
    if (!idbAvailable) return;

    const removed = await sweepOrphanImages();
    await swSet({ _lastSweepAt: Date.now() });
    if (removed > 0) {
      console.log(`ScratchDump: reclaimed ${removed} orphaned image blob(s) on ${reason}`);
    }
  } catch (err) {
    console.warn('ScratchDump: image sweep failed', err);
  }
}

// Migrate first: the sweep must not run against half-rewritten refs.
async function onWake(reason) {
  try {
    await ensureStorageReady();
  } catch (err) {
    console.warn('ScratchDump: storage preparation failed', err);
    return;   // a sweep on an unmigrated profile has nothing safe to do
  }
  await runImageSweep(reason);
}

chrome.runtime.onStartup.addListener(() => onWake('browser start'));
chrome.runtime.onInstalled.addListener(() => onWake('install/update'));

// ── TOOLBAR ICON ─────────────────────────────────────────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url || '';
  if (/^(chrome|brave|edge|about|data):/.test(url) || !url) return;

  try {
    // Try sending to existing content script first
    await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
  } catch {
    // Content script not present — inject it, then toggle
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['backend/content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['backend/content.css']
      });
      // Retry sending the message until the content script is ready
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise(r => setTimeout(r, 50 * attempt));
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
          return; // success
        } catch { /* content script not ready yet, retry */ }
      }
      console.warn('ScratchDump: content script did not respond after retries');
    } catch (err) {
      console.warn('ScratchDump: could not inject', err);
    }
  }
});
