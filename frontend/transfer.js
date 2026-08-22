// transfer.js — moving a folder in and out of this machine.
//
// Everything that touches storage lives here; wireFormat.js stays pure so it
// can be copied into the mobile client unchanged. The split matters: the two
// codebases must agree about the *format*, and must not share assumptions about
// where anything is stored.
//
// The rule this file exists to enforce: an import applies in one step, at the
// end, or not at all. Data is assembled and checked in memory first, so a file
// that turns out to be damaged half way through leaves nothing behind.
'use strict';

// ─── EXPORT ──────────────────────────────────────────────────────────────────

/**
 * Read a folder and everything it references into an export object.
 *
 * @param {string} folderKey
 * @param {string} name — display name, used for the filename
 * @param {(pct:number) => void} [onProgress]
 * @returns {Promise<{obj:Object, blob:Blob, filename:string}>}
 */
async function exportFolder(folderKey, name, onProgress) {
  const report = (p) => { if (typeof onProgress === 'function') onProgress(p); };
  report(0);

  // Read past the cache: the cached copy may be the one this panel is editing,
  // and an export should reflect what is actually saved.
  const raw = await storageGet([folderKey]);
  const fd = raw[folderKey];
  if (!fd || !Array.isArray(fd.pages)) {
    throw new Error('That folder has nothing saved in it yet.');
  }

  const pages = fd.pages;
  const ids = wireImageIds(pages);
  const images = {};
  const ocr = {};

  // Images dominate both the time and the size, so progress tracks them.
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const dataUrl = await imgStoreGet(id);
      // A missing blob is survivable — the page keeps its ref and the image is
      // simply absent. Failing the whole export over one lost image would be
      // worse than exporting the other nine.
      if (dataUrl) images[id] = dataUrl;
      const rec = await ocrGet(id);
      if (rec && rec.text) ocr[id] = rec;
    } catch (e) {
      console.warn('ScratchDump: could not read image for export', id, e);
    }
    report(Math.round(((i + 1) / ids.length) * 90));
  }

  const obj = wirePack({ key: folderKey, name, pages }, images, ocr);
  const blob = await wireSerialize(obj);
  report(100);

  return { obj, blob, filename: wireFilename(name) };
}

/**
 * Hand a blob to the browser as a download.
 *
 * The panel is an iframe on an arbitrary page, but it carries no `sandbox`
 * attribute and runs on the extension origin, so an anchor click is a normal
 * download rather than a blocked one.
 *
 * @param {Blob} blob @param {string} filename
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Revoking synchronously can cancel the download in some builds; one turn of
  // the event loop is enough for the click to have been taken.
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

// ─── IMPORT ──────────────────────────────────────────────────────────────────

/**
 * Read a file into a validated export object. Writes nothing.
 * @param {File|Blob} file
 * @returns {Promise<Object>}
 */
async function readImportFile(file) {
  return wireDeserialize(file);
}

/**
 * What importing this would do to what is already here.
 *
 * This is what the confirmation dialog is built from: the user is told the
 * damage in numbers before anything is overwritten, which is the whole basis
 * for folder-level replace being an acceptable design.
 *
 * @param {Object} obj — validated export
 * @returns {Promise<{exists:boolean, localPages:number, incomingPages:number,
 *                    changed:number, missingImages:number}>}
 */
async function describeImport(obj) {
  const key = obj.folder.key;
  const raw = await storageGet([key]);
  const local = raw[key];
  const localPages = (local && Array.isArray(local.pages)) ? local.pages : null;
  const incoming = obj.folder.pages;

  let changed = 0;
  if (localPages) {
    const n = Math.max(localPages.length, incoming.length);
    for (let i = 0; i < n; i++) {
      if ((localPages[i] || '') !== (incoming[i] || '')) changed++;
    }
  }

  return {
    exists: !!localPages,
    localPages: localPages ? localPages.length : 0,
    incomingPages: incoming.length,
    changed,
    missingImages: wireMissingImages(obj).length,
  };
}

/**
 * Write an export into local storage, replacing the folder it names.
 *
 * Ordering is deliberate. Images and OCR rows go in first, so that the moment
 * the folder becomes visible every reference it holds already resolves. Doing
 * it the other way round leaves a window where the notes render with broken
 * images, and if the write fails midway that window never closes.
 *
 * @param {Object} obj — validated export
 * @returns {Promise<{pages:number, images:number}>}
 */
async function applyImport(obj) {
  const key = obj.folder.key;

  let imageCount = 0;
  if (idbAvailable) {
    for (const [id, dataUrl] of Object.entries(obj.images)) {
      try {
        // Same id means re-importing is idempotent rather than duplicating
        // every blob, so imgStorePut — which always mints a new id — is the
        // wrong tool here.
        await imgStorePutWithId(id, dataUrl);
        imageCount++;
        const rec = obj.ocr[id];
        if (rec) await ocrPut(id, rec);
      } catch (e) {
        console.warn('ScratchDump: could not store imported image', id, e);
      }
    }
  }

  // Blobs the old version referenced and the new one does not are now
  // unreachable. Collect them before the overwrite, release them after.
  const rawBefore = await storageGet([key]);
  const before = (rawBefore[key] && rawBefore[key].pages) || [];
  const doomed = wireImageIds(before).filter(id => !obj.images[id]);

  await storageReady;
  invalidateFolderCache(key);
  await saveFolderData(key, { pages: obj.folder.pages.slice() });

  // A named scratch has to exist in the list, or it is saved but unreachable.
  if (obj.folder.kind === 'scratch') {
    const list = await getScratchList();
    if (!list.some(s => s.key === key)) {
      list.push({ key, name: obj.folder.name || key.slice('scratch:'.length) });
      await saveScratchList(list);
    }
  }

  if (doomed.length) {
    releaseUnreferencedImages(doomed).catch(err =>
      console.warn('ScratchDump: post-import cleanup failed', err));
  }

  return { pages: obj.folder.pages.length, images: imageCount };
}
