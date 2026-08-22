// ocr.js — recognition orchestration for ScratchDump.
//
// Three responsibilities, in order of how much trouble they cause:
//   1. Language data — downloaded on request, deleted on request. Until it is
//      present, everything here is inert and pasting behaves exactly as before.
//   2. The job queue — one image at a time, off the paste path entirely.
//   3. The Tesseract worker lifecycle — created lazily, torn down when idle,
//      because a warm WASM instance is tens of MB of resident memory.
//
// Recognition itself is not on the main thread: tesseract.js runs it in its own
// worker, and ocrWorker.js does the canvas preprocessing in a second one.
'use strict';

const OCR_LANG = 'eng';

// Pinned tag, not a branch: this URL decides what bytes land in the user's
// browser, and `main` is a moving target.
const OCR_LANG_URL =
  'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@4.1.0/eng.traineddata';
const OCR_LANG_ORIGIN = 'https://cdn.jsdelivr.net/';

// Vendored, never fetched — MV3 forbids remotely hosted code, so the engine
// ships in the package and only the language data is downloadable.
const TESS_LIB    = 'vendor/tesseract/tesseract.min.js';
const TESS_WORKER = 'vendor/tesseract/worker.min.js';
const TESS_CORE   = 'vendor/tesseract/tesseract-core-simd-lstm.js';

// tesseract.js caches language data in its own idb-keyval store and consults it
// before reaching for the network. Seeding that store from our copy is what
// keeps a "downloaded" install completely offline. Names and key shape are
// fixed by the vendored build (tesseract.js 7.0.0) — see langSeedCache().
const TESS_CACHE_DB    = 'tesseract-ocr';
const TESS_CACHE_STORE = 'keyval';
const TESS_CACHE_KEY   = './' + OCR_LANG + '.traineddata';

// Images below this are decoration — icons, avatars, emoji, spacer gifs. OCR on
// them costs a full WASM pass and returns noise.
const MIN_OCR_WIDTH  = 150;
const MIN_OCR_HEIGHT = 40;
const MIN_OCR_AREA   = 15000;

// How long the Tesseract worker sticks around after the queue drains.
const WORKER_IDLE_MS = 60000;

// ─── STATE ───────────────────────────────────────────────────────────────────

/** Blob ids with a job queued or running, for the context menu to report on. */
const _inFlight = new Set();
/** Pending jobs: { id, dataUrl }. Drained serially by _pump(). */
const _queue = [];
let _pumping = false;

let _tessWorker = null;          // tesseract.js worker, or null when torn down
let _tessWorkerPromise = null;   // in-flight creation, so two jobs share one
let _idleTimer = null;
let _prepWorker = null;          // ocrWorker.js
let _prepSeq = 0;
const _prepJobs = new Map();     // jobId -> {resolve, reject}

/** Set by panel.js so the settings row can re-render when state changes. */
let _onStateChange = null;
function ocrOnStateChange(fn) { _onStateChange = fn; }
function _announce() { if (typeof _onStateChange === 'function') _onStateChange(); }

// ─── LANGUAGE DATA ───────────────────────────────────────────────────────────

/** @returns {Promise<boolean>} whether OCR is usable right now. */
async function ocrIsInstalled() {
  if (!idbAvailable) return false;
  try { return (await langBytes(OCR_LANG)) > 0; }
  catch { return false; }
}

/** @returns {Promise<number>} installed size in bytes, 0 when absent. */
async function ocrInstalledBytes() {
  if (!idbAvailable) return 0;
  try { return await langBytes(OCR_LANG); }
  catch { return 0; }
}

/**
 * Minimal idb-keyval-compatible write into tesseract.js's own cache.
 *
 * We keep the authoritative copy in our `ocrlang` store and seed theirs from
 * it, rather than treating their cache as the source of truth. Their key
 * format is an implementation detail of the vendored build; ours is not. If a
 * future bump changes it, re-seeding fixes it and the user's download survives.
 *
 * @param {ArrayBuffer} buf
 */
function langSeedCache(buf) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TESS_CACHE_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TESS_CACHE_STORE)) {
        db.createObjectStore(TESS_CACHE_STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TESS_CACHE_STORE)) {
        db.close(); reject(new Error('tesseract cache store missing')); return;
      }
      const tx = db.transaction(TESS_CACHE_STORE, 'readwrite');
      tx.objectStore(TESS_CACHE_STORE).put(new Uint8Array(buf), TESS_CACHE_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); reject(tx.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

/** Drop our seed from tesseract.js's cache so deletion is actually complete. */
function langClearCache() {
  return new Promise((resolve) => {
    const req = indexedDB.open(TESS_CACHE_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TESS_CACHE_STORE)) {
        db.createObjectStore(TESS_CACHE_STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TESS_CACHE_STORE)) { db.close(); resolve(); return; }
      const tx = db.transaction(TESS_CACHE_STORE, 'readwrite');
      tx.objectStore(TESS_CACHE_STORE).delete(TESS_CACHE_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      // Deletion is best-effort: our own store is what gates OCR, and a
      // stale seed with no `ocrlang` row can only ever be re-seeded over.
      tx.onerror    = () => { db.close(); resolve(); };
    };
    req.onerror = () => resolve();
  });
}

/**
 * Request the CDN host permission. Declared optional in the manifest, so a
 * user who never turns on OCR is never asked for it and the extension makes
 * no network request of any kind.
 *
 * Must be called from a user gesture — the Settings button click.
 * @returns {Promise<boolean>}
 */
function ocrRequestNetworkPermission() {
  return new Promise((resolve) => {
    try {
      chrome.permissions.request({ origins: [OCR_LANG_ORIGIN + '*'] }, (granted) => {
        if (chrome.runtime.lastError) { resolve(false); return; }
        resolve(!!granted);
      });
    } catch { resolve(false); }
  });
}

/** Give the permission back on delete, so "deleted" means deleted. */
function ocrDropNetworkPermission() {
  return new Promise((resolve) => {
    try {
      chrome.permissions.remove({ origins: [OCR_LANG_ORIGIN + '*'] }, () => {
        void chrome.runtime.lastError; resolve();
      });
    } catch { resolve(); }
  });
}

/**
 * Download the language data and install it.
 * @param {(pct:number|null) => void} [onProgress] null when size is unknown
 * @returns {Promise<{ok:boolean, bytes?:number, error?:string}>}
 */
async function ocrDownloadLang(onProgress) {
  if (!idbAvailable) return { ok: false, error: 'Storage unavailable' };

  const granted = await ocrRequestNetworkPermission();
  if (!granted) return { ok: false, error: 'Permission denied' };

  try {
    const res = await fetch(OCR_LANG_URL, { cache: 'no-store' });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };

    // jsDelivr serves this gzipped over the wire (~1.9 MB) and the browser
    // inflates it, so content-length is the compressed figure and only useful
    // as a rough progress denominator.
    const total = Number(res.headers.get('content-length')) || 0;
    let buf;

    if (res.body && typeof onProgress === 'function') {
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        onProgress(total ? Math.min(99, Math.round((got / total) * 100)) : null);
      }
      const merged = new Uint8Array(got);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      buf = merged.buffer;
    } else {
      buf = await res.arrayBuffer();
    }

    // A truncated or error-page response would otherwise be stored as a
    // perfectly valid-looking install that fails at every recognition.
    if (buf.byteLength < 1000000) {
      return { ok: false, error: 'Download looks truncated' };
    }

    await langPut(OCR_LANG, buf);
    await langSeedCache(buf);
    if (typeof onProgress === 'function') onProgress(100);
    _announce();
    return { ok: true, bytes: buf.byteLength };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * Remove the language data. Any queued work is dropped — without the data
 * there is nothing those jobs could do.
 * @returns {Promise<void>}
 */
async function ocrDeleteLang() {
  _queue.length = 0;
  _inFlight.clear();
  await _teardownTessWorker();
  try { await langDelete(OCR_LANG); } catch { /* nothing installed */ }
  await langClearCache();
  await ocrDropNetworkPermission();
  _announce();
}

// ─── PREPROCESSING WORKER ────────────────────────────────────────────────────

function _getPrepWorker() {
  if (_prepWorker) return _prepWorker;
  _prepWorker = new Worker(chrome.runtime.getURL('frontend/ocrWorker.js'));
  _prepWorker.onmessage = (e) => {
    const { jobId, blob, error } = e.data || {};
    const job = _prepJobs.get(jobId);
    if (!job) return;
    _prepJobs.delete(jobId);
    error ? job.reject(new Error(error)) : job.resolve(blob);
  };
  _prepWorker.onerror = () => {
    for (const job of _prepJobs.values()) job.reject(new Error('preprocessing worker failed'));
    _prepJobs.clear();
    _prepWorker = null;
  };
  return _prepWorker;
}

/**
 * @param {ImageBitmap} bitmap — transferred, not usable afterwards
 * @returns {Promise<Blob>}
 */
function _preprocess(bitmap) {
  const jobId = ++_prepSeq;
  const worker = _getPrepWorker();
  return new Promise((resolve, reject) => {
    _prepJobs.set(jobId, { resolve, reject });
    worker.postMessage({ jobId, bitmap }, [bitmap]);
  });
}

// ─── TESSERACT WORKER ────────────────────────────────────────────────────────

function _loadTesseractLib() {
  if (self.Tesseract) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(TESS_LIB);
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error('could not load tesseract.js'));
    document.head.appendChild(s);
  });
}

async function _getTessWorker() {
  if (_tessWorker) return _tessWorker;
  if (_tessWorkerPromise) return _tessWorkerPromise;

  _tessWorkerPromise = (async () => {
    await _loadTesseractLib();

    // Seed the cache before init: with the data already there, the loader's
    // first step finds it and the fetch branch is never reached.
    const rec = await langGet(OCR_LANG);
    if (!rec) throw new Error('language data not installed');
    await langSeedCache(rec.buf);

    const worker = await Tesseract.createWorker(OCR_LANG, 1, {
      workerPath: chrome.runtime.getURL(TESS_WORKER),
      corePath:   chrome.runtime.getURL(TESS_CORE),
      // Not optional in an extension. Left at its default, tesseract.js fetches
      // workerPath, wraps it in a Blob and starts the worker from a blob: URL.
      // That worker no longer carries the extension origin, so its
      // importScripts() of a chrome-extension:// core is a cross-origin load
      // and is refused — 'Network error: failed to execute importScripts'.
      // The core loader breaks the same way: it resolves the sibling .wasm
      // from its own script URL and special-cases blob:, which lands nowhere.
      workerBlobURL: false,
      // Only ever consulted if the cache seed above failed. The optional host
      // permission is dropped on delete, so this would fail closed rather than
      // silently reaching the network.
      langPath:   OCR_LANG_URL.replace(/\/[^/]+$/, ''),
      cacheMethod: 'read',
      gzip: false,
      legacyCore: false,
      legacyLang: false,
    });
    _tessWorker = worker;
    _tessWorkerPromise = null;
    return worker;
  })().catch((e) => { _tessWorkerPromise = null; throw e; });

  return _tessWorkerPromise;
}

async function _teardownTessWorker() {
  clearTimeout(_idleTimer);
  const w = _tessWorker;
  _tessWorker = null;
  if (w) { try { await w.terminate(); } catch { /* already gone */ } }
  if (_prepWorker) { try { _prepWorker.terminate(); } catch { /* already gone */ } _prepWorker = null; }
  _prepJobs.clear();
}

function _scheduleIdleTeardown() {
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    if (!_queue.length && !_pumping) _teardownTessWorker();
  }, WORKER_IDLE_MS);
}

// ─── QUEUE ───────────────────────────────────────────────────────────────────

/**
 * Whether an image is worth a recognition pass.
 * @param {number} w @param {number} h
 */
function ocrWorthReading(w, h) {
  return w >= MIN_OCR_WIDTH && h >= MIN_OCR_HEIGHT && (w * h) >= MIN_OCR_AREA;
}

/**
 * Queue an image for recognition. Never throws and never blocks the caller:
 * the paste path must stay synchronous-feeling whatever happens here.
 *
 * @param {string} id — blob UUID, the key the text will be stored under
 * @param {string} dataUrl — the *original* clipboard bitmap, before compression
 */
function ocrEnqueue(id, dataUrl, force = false) {
  if (!id || !dataUrl) return;
  if (_inFlight.has(id)) return;
  _inFlight.add(id);
  _queue.push({ id, dataUrl, force });
  _announce();
  _pump();
}

/**
 * Queue an image that has no result yet, reading the copy already in the blob
 * store.
 *
 * This is the only route for anything pasted before recognition was switched
 * on: those pastes were dropped from the queue because there was no language
 * data to run them against, and the original clipboard bitmap is long gone.
 * What is left is the 800px JPEG display copy, so results here are noticeably
 * worse than a fresh paste. Offering it anyway beats leaving every image
 * already sitting in a note permanently unreadable.
 *
 * The size gate is bypassed: the user asked for this specific image.
 *
 * @param {string} id
 * @returns {Promise<boolean>} false when there is nothing stored to read
 */
async function ocrEnqueueStored(id) {
  if (!id || !idbAvailable) return false;
  if (_inFlight.has(id)) return true;
  if (!(await ocrIsInstalled())) return false;
  let dataUrl = null;
  try { dataUrl = await imgStoreGet(id); } catch { return false; }
  if (!dataUrl) return false;
  ocrEnqueue(id, dataUrl, true);
  return true;
}

async function _pump() {
  if (_pumping) return;
  _pumping = true;

  try {
    while (_queue.length) {
      // Checked per job, not once: the user can delete the language data while
      // a queue is draining.
      if (!(await ocrIsInstalled())) { _queue.length = 0; _inFlight.clear(); break; }

      const job = _queue.shift();
      try {
        await _runJob(job);
      } catch (e) {
        console.warn('ScratchDump: OCR failed for', job.id, e);
        // Record the failure so the image is not retried forever. An absent
        // row means "never attempted"; this says "attempted, and here is why
        // it produced nothing". Keeping the reason matters: an engine that
        // never started and an image with genuinely no text are the same empty
        // string, and telling the user "No text found" for the first one sends
        // them looking at their screenshot instead of at the console.
        try {
          await ocrPut(job.id, {
            text: '', confidence: 0, lang: OCR_LANG,
            engineVersion: 'tesseract.js@7.0.0',
            error: String((e && e.message) || e),
          });
        } catch { /* store unavailable — it will be retried next session */ }
      } finally {
        _inFlight.delete(job.id);
        _announce();
      }
    }
  } finally {
    _pumping = false;
    _scheduleIdleTeardown();
  }
}

async function _runJob(job) {
  const res   = await fetch(job.dataUrl);
  const blob  = await res.blob();
  const bmp   = await createImageBitmap(blob);

  // An explicit request skips the gate — the user pointed at this image.
  if (!job.force && !ocrWorthReading(bmp.width, bmp.height)) { bmp.close(); return; }

  const prepped = await _preprocess(bmp);   // bmp is transferred and closed
  const worker  = await _getTessWorker();
  const out     = await worker.recognize(prepped);

  const text = (out && out.data && out.data.text || '').trim();
  await ocrPut(job.id, {
    text,
    confidence: (out && out.data && out.data.confidence) || 0,
    lang: OCR_LANG,
    engineVersion: 'tesseract.js@7.0.0',
  });
}

// ─── READ-BACK ───────────────────────────────────────────────────────────────

/**
 * State of the recognized text for one image, for the context menu.
 * @param {string} id
 * @returns {Promise<{state:'reading'|'ready'|'empty'|'error'|'none', text:string, error?:string}>}
 */
async function ocrStatusFor(id) {
  if (!id) return { state: 'none', text: '' };
  if (_inFlight.has(id)) return { state: 'reading', text: '' };
  if (!idbAvailable) return { state: 'none', text: '' };
  try {
    const rec = await ocrGet(id);
    if (!rec) return { state: 'none', text: '' };
    if (rec.text) return { state: 'ready', text: rec.text };
    if (rec.error) return { state: 'error', text: '', error: rec.error };
    return { state: 'empty', text: '' };
  } catch {
    return { state: 'none', text: '' };
  }
}
