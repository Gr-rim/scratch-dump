// noteStorage.js — chrome.storage.local helpers + cross-tab sync for ScratchDump
// No DOM. Only touches chrome.storage and IndexedDB (via imageStore).
// Migration lives in the service worker — see backend/background.js.
'use strict';

// ─── LOW-LEVEL HELPERS ───────────────────────────────────────────────────────
// chrome.storage reports failures through runtime.lastError rather than by
// throwing or passing an error to the callback. Unchecked, a failed write is
// indistinguishable from a successful one and the user keeps typing into a pad
// that stopped saving.

function _lastError(verb) {
  const err = chrome.runtime.lastError;
  return err ? new Error(err.message || ('storage.' + verb + ' failed')) : null;
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const err = _lastError('get');
      err ? reject(err) : resolve(result);
    });
  });
}

function storageSet(obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      const err = _lastError('set');
      err ? reject(err) : resolve();
    });
  });
}

// ─── FOLDER DATA ─────────────────────────────────────────────────────────────
// Shape: { pages: [htmlString, ...] }

async function getFolderData(folderKey) {
  const cache = ScratchDump.folderCache;
  if (cache.key === folderKey && cache.data) return cache.data;
  const data = await storageGet([folderKey]);
  const fd = data[folderKey] || { pages: [''] };
  ScratchDump.folderCache = { key: folderKey, data: fd };
  return fd;
}

async function saveFolderData(folderKey, folderData) {
  // Stamp the writer so our own onChanged echo can be told apart from a write
  // made by a panel in another tab.
  folderData._w = ScratchDump.instanceId;
  ScratchDump.folderCache = { key: folderKey, data: folderData };
  await storageSet({ [folderKey]: folderData });
}

/** Drop the in-memory copy of a folder, forcing the next read to hit storage. */
function invalidateFolderCache(folderKey) {
  if (!folderKey || ScratchDump.folderCache.key === folderKey) {
    ScratchDump.folderCache = { key: '', data: null };
  }
}

// ─── SCRATCH LIST ────────────────────────────────────────────────────────────
// Shape: [{ key, name }]

async function getScratchList() {
  const data = await storageGet(['__scratchList__']);
  return data['__scratchList__'] || [];
}

async function saveScratchList(list) {
  await storageSet({ '__scratchList__': list });
}

// ─── ALL FOLDER KEYS (for dropdown) ──────────────────────────────────────────

async function getAllStorageData() {
  return storageGet(null);
}

/**
 * Keys this panel deleted itself. A deletion echo has no newValue, so it
 * carries no _w stamp to recognise it by — this set stands in for one.
 */
const _selfRemoved = new Set();

async function removeStorageKey(key) {
  invalidateFolderCache(key);
  _selfRemoved.add(key);
  await new Promise((resolve, reject) => {
    chrome.storage.local.remove(key, () => {
      const err = _lastError('remove');
      err ? reject(err) : resolve();
    });
  });
  // Safety net, in case the change event never arrives.
  setTimeout(() => _selfRemoved.delete(key), 1000);
}

// ─── CROSS-TAB SYNC ──────────────────────────────────────────────────────────
// Each panel iframe caches the folder it is showing. Without this listener a
// second panel on the same site keeps serving its stale cache and overwrites
// whatever the first one saved.

const NOTE_KEY_PREFIX_RE = /^(site|scratch):/;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  for (const [key, change] of Object.entries(changes)) {
    if (!NOTE_KEY_PREFIX_RE.test(key)) continue;

    // onChanged fires in the writing context too; skip our own writes.
    if (change.newValue && change.newValue._w === ScratchDump.instanceId) continue;
    if (!change.newValue && _selfRemoved.has(key)) { _selfRemoved.delete(key); continue; }

    invalidateFolderCache(key);

    if (key === ScratchDump.currentFolderKey &&
        typeof ScratchDump.onExternalChange === 'function') {
      ScratchDump.onExternalChange(key, change.newValue || null);
    }
  }
});

// ─── INIT STORAGE ────────────────────────────────────────────────────────────
// Called once from panel.js init(). Opens the blob store and waits for the
// service worker to confirm the schema is current.

// Resolves once the worker has confirmed the schema is current. Writes wait on
// it, so a panel cannot save a page into a folder the migration is rewriting.
let _markStorageReady;
const storageReady = new Promise(resolve => { _markStorageReady = resolve; });

async function initStorage() {
  // IndexedDB first — if it is unavailable, images stay inline as base64.
  await initImageStore();

  // Migration is owned by the service worker. It runs as one instance per
  // profile, so it cannot race itself the way one-migration-per-open-panel did.
  try {
    const res = await chrome.runtime.sendMessage({ action: 'ensureStorageReady' });
    if (res && res.ready === false) {
      console.warn('ScratchDump: storage not ready —', res.error);
    }
  } catch (e) {
    // The panel still works on already-migrated data; a later start retries.
    console.warn('ScratchDump: could not reach the service worker', e);
  } finally {
    // Always release the gate — a stuck worker must not freeze saving forever.
    _markStorageReady();
  }
}
