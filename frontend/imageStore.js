// imageStore.js — IndexedDB-backed image blob storage for ScratchDump
// Offloads base64 image data from chrome.storage.local (10 MB cap)
// into IndexedDB (quota-managed, typically GBs available).
// Falls back gracefully if IndexedDB is unavailable (incognito, storage pressure).

const IMG_DB_NAME    = 'ScratchDumpImages';
const IMG_DB_VERSION = 2;
const IMG_STORE      = 'blobs';
// Recognized text, keyed by the *same* UUID as the blob it came from. Kept out
// of note HTML so the note body stays clean and re-running OCR is a store
// update rather than a document rewrite.
const OCR_STORE      = 'ocr';
// Tesseract language data, keyed by lang code ('eng'). Downloaded on request,
// deletable on request — see ocr.js.
const LANG_STORE     = 'ocrlang';

/** Whether IndexedDB is available. Set during init, checked by panel.js. */
let idbAvailable = false;

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function _openImageDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IMG_DB_NAME, IMG_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IMG_STORE)) {
        db.createObjectStore(IMG_STORE); // keyed by UUID string
      }
      if (!db.objectStoreNames.contains(OCR_STORE)) {
        db.createObjectStore(OCR_STORE); // keyed by the blob's UUID
      }
      if (!db.objectStoreNames.contains(LANG_STORE)) {
        db.createObjectStore(LANG_STORE); // keyed by lang code
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    // A v1 connection still open elsewhere holds the v2 upgrade back for as
    // long as it lives, and the open request then neither succeeds nor errors.
    // Only reachable when a panel from before the update is still running, but
    // silence is the worst possible symptom: images simply stop loading.
    req.onblocked = () => console.warn(
      'ScratchDump: image database upgrade is blocked by another open panel — close other tabs');
  });
}

/** Singleton DB promise — opened once, reused. */
let _dbPromise = null;
function getImageDB() {
  if (!_dbPromise) _dbPromise = _openImageDB();
  return _dbPromise;
}

/**
 * Attempt to open IndexedDB. Sets idbAvailable flag.
 * Call once at startup from panel.js init().
 */
async function initImageStore() {
  try {
    await getImageDB();
    idbAvailable = true;
  } catch (e) {
    console.warn('ScratchDump: IndexedDB unavailable, images will stay in chrome.storage.local', e);
    idbAvailable = false;
  }
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

/**
 * Store an image data URL in IndexedDB.
 * @param {string} dataUrl — e.g. "data:image/jpeg;base64,..."
 * @returns {Promise<string>} — the UUID key
 */
async function imgStorePut(dataUrl) {
  const id = crypto.randomUUID();
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(IMG_STORE, 'readwrite');
    const store = tx.objectStore(IMG_STORE);
    store.put(dataUrl, id);
    tx.oncomplete = () => resolve(id);
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Store an image data URL under an id chosen by the caller.
 *
 * imgStorePut() always mints a fresh UUID, which is right for a paste and wrong
 * for an import: an imported folder carries ids its pages already reference, so
 * reusing them is what makes importing the same file twice idempotent instead
 * of duplicating every blob and orphaning the last set.
 *
 * @param {string} id — a UUID that came from an export
 * @param {string} dataUrl
 * @returns {Promise<string>} the same id
 */
async function imgStorePutWithId(id, dataUrl) {
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).put(dataUrl, id);
    tx.oncomplete = () => resolve(id);
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Retrieve an image data URL by its key.
 * @param {string} id
 * @returns {Promise<string|null>} — the data URL, or null if missing
 */
async function imgStoreGet(id) {
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(IMG_STORE, 'readonly');
    const store = tx.objectStore(IMG_STORE);
    const req   = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Check whether a key exists.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function imgStoreHas(id) {
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(IMG_STORE, 'readonly');
    const store = tx.objectStore(IMG_STORE);
    const req   = store.count(id);
    req.onsuccess = () => resolve(req.result > 0);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Delete an image by key.
 * @param {string} id
 * @returns {Promise<void>}
 */
async function imgStoreDelete(id) {
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    // Both stores in one transaction: OCR text is derived from the blob and
    // must never outlive it. Doing this at the call sites instead would mean
    // every future deletion path has to remember, and the one that forgets
    // turns C2's orphan sweep back into a slow leak.
    const tx = db.transaction([IMG_STORE, OCR_STORE], 'readwrite');
    tx.objectStore(IMG_STORE).delete(id);
    tx.objectStore(OCR_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── HTML HELPERS ────────────────────────────────────────────────────────────
// These convert between the stored format (idb:<id>) and renderable data URLs.
// When IndexedDB is unavailable, these are no-ops (pass-through).

/**
 * Replace every <img src="data:..."> in an HTML string with <img src="idb:<id>">
 * after storing the data URL in IndexedDB.
 * If IndexedDB is unavailable, returns the original HTML unchanged.
 * @param {string} html
 * @returns {Promise<string>} — html with idb: refs (or unchanged)
 */
async function extractImagesToIDB(html) {
  if (!idbAvailable) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  for (const img of doc.querySelectorAll('img[src^="data:"]')) {
    // An image that already knows its blob keeps it. Without this the editor's
    // resolved data: URLs look brand new on every save, and each save stores a
    // fresh copy of every image and orphans the last one.
    let id = null;
    const known = img.getAttribute('data-idb');
    if (known) {
      try { if (await imgStoreHas(known)) id = known; }
      catch { /* unreadable — fall through and store it again */ }
    }
    if (!id) id = await imgStorePut(img.getAttribute('src'));
    img.setAttribute('src', 'idb:' + id);
  }

  // data-idb is a runtime hint for the live editor; storage holds idb: refs.
  for (const img of doc.querySelectorAll('img[data-idb]')) img.removeAttribute('data-idb');

  return doc.body.innerHTML;
}

/**
 * Replace every <img src="idb:<id>"> with the actual data URL from IndexedDB.
 * If IndexedDB is unavailable, returns the original HTML unchanged.
 * @param {string} html
 * @returns {Promise<string>} — html with data: URLs restored (or unchanged)
 */
async function resolveIDBImages(html) {
  if (!idbAvailable) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = doc.querySelectorAll('img[src^="idb:"]');
  for (const img of imgs) {
    const id = img.getAttribute('src').slice(4); // strip "idb:"
    const dataUrl = await imgStoreGet(id);
    if (dataUrl) {
      img.setAttribute('src', dataUrl);
      img.setAttribute('data-idb', id);   // so the next save reuses this blob
    }
  }
  return doc.body.innerHTML;
}

/**
 * Worker-safe counterpart to extractImagesToIDB, for the one-time v1→v2
 * migration only. A service worker has no DOMParser; stored v1 HTML only ever
 * carries plain `data:` srcs with no data-idb hint to preserve, so a narrow
 * substitution over the src attribute covers it.
 * @param {string} html
 * @returns {Promise<string>}
 */
async function extractImagesToIDBFromString(html) {
  if (!idbAvailable || !html) return html;
  const RE = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(data:image\/[^"']*)\2/gi;
  const matches = Array.from(html.matchAll(RE));
  if (!matches.length) return html;

  let out = '', last = 0;
  for (const m of matches) {
    const id = await imgStorePut(m[3]);
    out += html.slice(last, m.index) + m[1] + m[2] + 'idb:' + id + m[2];
    last = m.index + m[0].length;
  }
  return out + html.slice(last);
}

// ─── GARBAGE COLLECTION ──────────────────────────────────────────────────────
// Blobs are only reachable through `idb:<uuid>` refs inside note HTML. When a
// note is deleted, or an image is removed from a note, its blob becomes
// unreachable. Nothing else reclaims it, so these helpers do.
//
// Self-contained on purpose: this file is also `importScripts`-ed by the
// service worker, which has no `ScratchDump` namespace and no noteStorage.js.

/** Matches `idb:<uuid-v4>` refs as written by extractImagesToIDB(). */
const IDB_REF_RE = /idb:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/** Note folders live under these key prefixes. */
const NOTE_KEY_PREFIXES = ['site:', 'scratch:'];

/**
 * chrome.storage reports failures through runtime.lastError rather than by
 * throwing. A failed read matters more here than anywhere else in the
 * extension: this result decides what gets deleted, and an empty one makes
 * every blob look unreferenced. Rejecting is what makes the callers below
 * fail closed instead of reclaiming the whole store.
 *
 * Duplicated from noteStorage.js deliberately — this file is importScripts-ed
 * into the service worker, which has no ScratchDump namespace and no
 * noteStorage.js to borrow from.
 */
function _imgStorageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const err = chrome.runtime.lastError;
      if (err) { reject(new Error(err.message || 'storage.get failed')); return; }
      if (!result) { reject(new Error('storage.get returned no result')); return; }
      resolve(result);
    });
  });
}

function _rawStorageGetAll() {
  return _imgStorageGet(null);
}

/**
 * Pull every `idb:` id out of an HTML string.
 * @param {string} html
 * @returns {string[]}
 */
function extractImageIds(html) {
  const ids = [];
  if (!html) return ids;
  IDB_REF_RE.lastIndex = 0;
  let m;
  while ((m = IDB_REF_RE.exec(html)) !== null) ids.push(m[1].toLowerCase());
  return ids;
}

/**
 * Every image id currently referenced by any stored note.
 * @returns {Promise<Set<string>>}
 */
async function collectReferencedImageIds() {
  const all = await _rawStorageGetAll();
  const refs = new Set();
  for (const [key, val] of Object.entries(all)) {
    if (!NOTE_KEY_PREFIXES.some(p => key.startsWith(p))) continue;
    if (!val || !Array.isArray(val.pages)) continue;
    for (const page of val.pages) {
      for (const id of extractImageIds(page)) refs.add(id);
    }
  }
  return refs;
}

/**
 * Every key currently in the blob store.
 * @returns {Promise<string[]>}
 */
async function imgStoreAllKeys() {
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).getAllKeys();
    req.onsuccess = () => resolve(Array.from(req.result || []));
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Delete each candidate id that no remaining note references.
 * Call this *after* the owning note has been removed from storage, so the
 * reference snapshot no longer counts it.
 *
 * Fails closed: if the reference read fails this rejects and deletes nothing,
 * because an unreadable set of references is indistinguishable from an empty
 * one, and an empty one condemns everything.
 * @param {string[]} candidateIds
 * @returns {Promise<number>} how many blobs were reclaimed
 */
async function releaseUnreferencedImages(candidateIds) {
  if (!idbAvailable || !candidateIds || !candidateIds.length) return 0;
  const refs = await collectReferencedImageIds();
  let removed = 0;
  for (const id of candidateIds) {
    if (refs.has(id)) continue;   // still used by another note
    try { await imgStoreDelete(id); removed++; }
    catch (e) { console.warn('ScratchDump: could not delete image', id, e); }
  }
  return removed;
}

/**
 * Full sweep: delete every blob no note references any more.
 *
 * Ordering matters. Keys are snapshotted *first* so that a blob written after
 * the snapshot can never be a deletion candidate, and references are collected
 * twice so that a blob whose ref was still in the 300 ms save debounce during
 * the first pass gets a second chance to be claimed.
 *
 * Every read on this path rejects rather than returning something empty, so a
 * storage failure aborts the sweep instead of condemning the whole store.
 *
 * @returns {Promise<number>} how many blobs were reclaimed
 */
async function sweepOrphanImages() {
  if (!idbAvailable) return 0;

  // Refs are in flux mid-migration — a sweep then could delete live blobs.
  const meta = await _imgStorageGet(['_migrationStatus']);
  if (meta._migrationStatus === 'in_progress') return 0;

  const keys = await imgStoreAllKeys();
  if (!keys.length) return 0;

  const refsA   = await collectReferencedImageIds();
  const orphans = keys.filter(id => !refsA.has(String(id).toLowerCase()));
  if (!orphans.length) return 0;

  // Re-check: a migration that began after the first check would be writing
  // refs right now, and those blobs must not be reclaimed underneath it.
  const meta2 = await _imgStorageGet(['_migrationStatus']);
  if (meta2._migrationStatus === 'in_progress') return 0;

  const refsB  = await collectReferencedImageIds();
  const doomed = orphans.filter(id => !refsB.has(String(id).toLowerCase()));

  let removed = 0;
  for (const id of doomed) {
    try { await imgStoreDelete(id); removed++; }
    catch (e) { console.warn('ScratchDump: could not delete image', id, e); }
  }
  return removed;
}

// ─── OCR TEXT ────────────────────────────────────────────────────────────────
// Recognized text lives beside the blob under the same UUID, never inside note
// HTML. Keeping it out of the document means the note body stays clean, the
// sanitizer needs no new attribute, and re-running recognition with a better
// engine later is a store update rather than a rewrite of every note.
//
// Deletion is handled by imgStoreDelete() above, which drops both rows in one
// transaction — there is deliberately no standalone ocrDelete().

/**
 * Record the outcome of a recognition pass.
 *
 * A hopeless result is stored *with* its score rather than dropped. An absent
 * row means "never attempted" and would be retried forever; a row with a low
 * confidence means "tried, this is all there was".
 *
 * @param {string} id — the blob UUID this text came from
 * @param {{text:string, confidence:number, lang:string, engineVersion:string}} rec
 * @returns {Promise<void>}
 */
async function ocrPut(id, rec) {
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OCR_STORE, 'readwrite');
    tx.objectStore(OCR_STORE).put({ ...rec, ts: Date.now() }, id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * @param {string} id
 * @returns {Promise<{text:string, confidence:number, lang:string, engineVersion:string, ts:number}|null>}
 *   null means recognition was never attempted for this blob.
 */
async function ocrGet(id) {
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OCR_STORE, 'readonly');
    const req = tx.objectStore(OCR_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

// ─── LANGUAGE DATA ───────────────────────────────────────────────────────────
// Tesseract's traineddata is several MB, so it is not shipped in the package.
// The user downloads it from Settings when they want OCR, and deletes it when
// they don't. Until it is present the OCR queue is inert — see ocr.js.

/**
 * @param {string} code — e.g. 'eng'
 * @param {ArrayBuffer} buf — raw .traineddata bytes
 * @returns {Promise<void>}
 */
async function langPut(code, buf) {
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LANG_STORE, 'readwrite');
    tx.objectStore(LANG_STORE).put({ buf, bytes: buf.byteLength, ts: Date.now() }, code);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * @param {string} code
 * @returns {Promise<{buf:ArrayBuffer, bytes:number, ts:number}|null>}
 */
async function langGet(code) {
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(LANG_STORE, 'readonly');
    const req = tx.objectStore(LANG_STORE).get(code);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Size of the stored language data without deserialising the buffer itself.
 * @param {string} code
 * @returns {Promise<number>} bytes, or 0 when absent
 */
async function langBytes(code) {
  const rec = await langGet(code);
  return rec ? rec.bytes : 0;
}

/**
 * @param {string} code
 * @returns {Promise<void>}
 */
async function langDelete(code) {
  const db = await getImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LANG_STORE, 'readwrite');
    tx.objectStore(LANG_STORE).delete(code);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
