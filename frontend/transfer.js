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

  // Images dominate both the time and the size, so progress tracks them.
  const obj = await _packFolder(folderKey, name, fd.pages,
    (done, total) => report(Math.round((done / total) * 90)));
  const blob = await wireSerialize(obj);
  report(100);

  return { obj, blob, filename: wireFilename(name) };
}

/**
 * One folder as a wire object, with every image and recognized text it
 * references read out of the blob store.
 *
 * @param {string} folderKey @param {string} name @param {string[]} pages
 * @param {(done:number, total:number) => void} [onImage]
 * @returns {Promise<Object>}
 */
async function _packFolder(folderKey, name, pages, onImage) {
  const ids = wireImageIds(pages);
  const images = {};
  const ocr = {};

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
    if (onImage) onImage(i + 1, ids.length);
  }

  return wirePack({ key: folderKey, name, pages }, images, ocr);
}

// ─── BACKUP ──────────────────────────────────────────────────────────────────
// Every folder in one file. This is what moves notes between installs: the
// extension's storage belongs to its ID, so a copy loaded under another ID —
// an install from before the ID was pinned, or a store listing later — starts
// empty, and this file is how the notes follow.
//
// The container lives here rather than in wireFormat.js, which has to stay
// byte-identical to the mobile client's copy. Each folder inside it is an
// ordinary wire object, so it imports through exactly the same path as a
// single-folder file.

const BACKUP_FORMAT  = 'scratchdump-backup';
const BACKUP_VERSION = 1;

/**
 * @param {(pct:number) => void} [onProgress]
 * @returns {Promise<{blob:Blob, filename:string, folders:number, images:number}>}
 */
async function exportEverything(onProgress) {
  const report = (p) => { if (typeof onProgress === 'function') onProgress(p); };
  report(0);

  const all = await storageGet(null);
  const names = new Map((all['__scratchList__'] || []).map(s => [s.key, s.name]));

  // Site folders that hold nothing are not shown anywhere, so they are not
  // worth carrying. A named scratch is shown even when empty, so it is.
  const keys = Object.keys(all).filter((k) => {
    const fd = all[k];
    if (!fd || !Array.isArray(fd.pages)) return false;
    if (k.startsWith('scratch:')) return true;
    return k.startsWith('site:') && fd.pages.some(p => p && p.trim() !== '' && p !== '<br>');
  });
  if (!keys.length) throw new Error('There are no notes to back up yet.');

  const folders = [];
  let images = 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const name = key.startsWith('scratch:')
      ? (names.get(key) || scratchNameFromKey(key))
      : key.slice('site:'.length);
    const obj = await _packFolder(key, name, all[key].pages);
    images += Object.keys(obj.images).length;
    folders.push(obj);
    report(Math.round(((i + 1) / keys.length) * 90));
  }

  const blob = await wireSerialize({
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: Date.now(), folders,
  });
  report(100);

  const date = new Date().toISOString().slice(0, 10);
  return { blob, filename: 'scratchdump-backup-' + date + WIRE_EXT, folders: folders.length, images };
}

/**
 * A scratch space's display name, from its key alone. Keys are
 * "scratch:<name>:<created-ms>"; the timestamp is what keeps two spaces with
 * the same name apart, and it is not part of the name.
 * @param {string} key
 */
function scratchNameFromKey(key) {
  return key.slice('scratch:'.length).replace(/:\d+$/, '');
}

// ─── READABLE EXPORT ─────────────────────────────────────────────────────────

/**
 * A folder as Markdown or plain text. One way only — see textExport.js.
 *
 * @param {string} folderKey @param {string} title
 * @param {'md'|'txt'} mode
 * @returns {Promise<{blob:Blob, filename:string}>}
 */
async function exportReadable(folderKey, title, mode) {
  // Past the cache, as exportFolder does: export what is saved.
  const raw = await storageGet([folderKey]);
  const fd = raw[folderKey];
  if (!fd || !Array.isArray(fd.pages)) {
    throw new Error('That folder has nothing saved in it yet.');
  }

  // Recognized text stands in for each image, which a text file cannot hold.
  const ocrText = {};
  if (idbAvailable) {
    for (const id of wireImageIds(fd.pages)) {
      try {
        const rec = await ocrGet(id);
        if (rec && rec.text) ocrText[id] = rec.text;
      } catch { /* the image simply goes without its text */ }
    }
  }

  const body = readableFolder(title, fd.pages, mode, ocrText);
  if (!body) throw new Error('Every page here is empty — nothing to export.');

  const type = (mode === 'md' ? 'text/markdown' : 'text/plain') + ';charset=utf-8';
  return {
    blob: new Blob([body], { type }),
    filename: wireFilename(title).replace(/\.scratch$/, mode === 'md' ? '.md' : '.txt'),
  };
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

/**
 * Hand the export to the OS share sheet if this platform has one, and fall back
 * to a download if it does not.
 *
 * Not called while the phone app is unreleased: with nothing on the phone to
 * open a .scratch file, Export saving a file is what people expect, and a share
 * sheet in its place is a detour.
 *
 * Worth trying because on Windows and macOS the sheet contains the routes that
 * actually get a file onto a phone — Nearby Share, Phone Link, AirDrop — which
 * collapses "export it, find it in Downloads, move it across somehow" into one
 * step. Support is genuinely patchy though (no file sharing on Linux Chrome,
 * none in Firefox), so the download is the base case and this is the shortcut.
 *
 * Needs allow="web-share" on the panel iframe: the API is permission-policy
 * gated and an iframe is not granted it by default. See backend/content.js.
 *
 * @param {Blob} blob @param {string} filename
 * @returns {Promise<'shared'|'cancelled'|'downloaded'>}
 */
async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: 'application/octet-stream' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      // Dismissing the sheet is a decision, not a failure — do not then drop a
      // file into Downloads that the user just declined to send.
      if (e && e.name === 'AbortError') return 'cancelled';
      // Anything else (no target app, policy refusal) falls through.
    }
  }

  downloadBlob(blob, filename);
  return 'downloaded';
}

// ─── IMPORT ──────────────────────────────────────────────────────────────────

/**
 * Read files into validated folder exports. Writes nothing.
 *
 * Each file may be a single folder or a whole backup, and the result is a flat
 * list either way. Every file is read and checked before the caller applies
 * any of it, so one damaged file in a selection costs nothing.
 *
 * A folder named twice — two files, or a file and a backup — keeps the copy
 * picked last, the same as importing them one after another would.
 *
 * @param {Iterable<File|Blob>} files
 * @returns {Promise<Object[]>}
 */
async function readImportFiles(files) {
  const byKey = new Map();
  for (const file of files) {
    let parsed;
    try {
      parsed = await _readMaybeGzippedJson(file);
    } catch (e) {
      throw new Error((file.name ? file.name + ': ' : '') + e.message);
    }

    const folders = (parsed && parsed.format === BACKUP_FORMAT)
      ? _backupFolders(parsed)
      : [parsed];
    for (const f of folders) {
      const obj = wireValidate(f);
      byKey.delete(obj.folder.key);   // re-insert, so order follows the last copy
      byKey.set(obj.folder.key, obj);
    }
  }
  return Array.from(byKey.values());
}

function _backupFolders(backup) {
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of ScratchDump. Update the extension to open it.');
  }
  if (!Array.isArray(backup.folders)) {
    throw new Error("That backup is incomplete and can't be opened.");
  }
  return backup.folders;
}

/**
 * wireDeserialize() without its single-folder check, so a backup can be told
 * apart from a folder before either is validated. Duplicated rather than
 * shared because wireFormat.js has to stay byte-identical to its mobile copy.
 * @param {Blob} blob
 * @returns {Promise<any>}
 */
async function _readMaybeGzippedJson(blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  let text;
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error("This browser can't read compressed exports.");
    }
    try {
      text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } catch {
      throw new Error("That file is damaged and can't be opened.");
    }
  } else {
    text = await blob.text();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("That doesn't look like a ScratchDump export.");
  }
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

const IMPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
      // Ids are global across folders, so a file that named an arbitrary key
      // could overwrite an image in a note it has nothing to do with. Only
      // what an export actually writes is accepted: a uuid, and image data.
      if (!IMPORT_ID_RE.test(id) || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        console.warn('ScratchDump: skipped a malformed image in the import', id);
        continue;
      }
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
      list.push({ key, name: obj.folder.name || scratchNameFromKey(key) });
      await saveScratchList(list);
    }
  }

  if (doomed.length) {
    releaseUnreferencedImages(doomed).catch(err =>
      console.warn('ScratchDump: post-import cleanup failed', err));
  }

  return { pages: obj.folder.pages.length, images: imageCount };
}
