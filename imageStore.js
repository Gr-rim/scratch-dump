// imageStore.js — IndexedDB-backed image blob storage for ScratchDump
// Offloads base64 image data from chrome.storage.local (10 MB cap)
// into IndexedDB (quota-managed, typically GBs available).
// Falls back gracefully if IndexedDB is unavailable (incognito, storage pressure).

const IMG_DB_NAME    = 'ScratchDumpImages';
const IMG_DB_VERSION = 1;
const IMG_STORE      = 'blobs';

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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
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
    const tx    = db.transaction(IMG_STORE, 'readwrite');
    const store = tx.objectStore(IMG_STORE);
    store.delete(id);
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
  const imgs = doc.querySelectorAll('img[src^="data:"]');
  for (const img of imgs) {
    const id = await imgStorePut(img.getAttribute('src'));
    img.setAttribute('src', 'idb:' + id);
  }
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
    }
  }
  return doc.body.innerHTML;
}
