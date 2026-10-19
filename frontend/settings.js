// settings.js — Settings persistence + application for ScratchDump
// Reads/writes ScratchDump.settings. DOM access limited to settings controls.
'use strict';

// ─── LOAD / SAVE ─────────────────────────────────────────────────────────────

async function loadSettings() {
  const data = await storageGet(['__settings__']);
  if (data['__settings__']) {
    ScratchDump.settings = { ...ScratchDump.settings, ...data['__settings__'] };
  }
  applySettings();
}

async function saveSettings() {
  await storageSet({ '__settings__': ScratchDump.settings });
}

// ─── APPLY ───────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add('theme-' + theme);
}

function applySettings() {
  const s = ScratchDump.settings;
  const editor = document.getElementById('editor');

  document.getElementById('fixedSizeCheck').checked = s.fixedSize;
  document.getElementById('opacityInput').value = s.opacity;
  document.getElementById('textSizeInput').value = s.textSize;
  document.getElementById('fontSelect').value = s.font;
  document.getElementById('themeSelect').value = s.theme;
  document.getElementById('sttLangSelect').value = s.sttLang;
  editor.style.fontSize = s.textSize + 'px';
  editor.style.fontFamily = s.font + ', sans-serif';
  applyTheme(s.theme);

  // Only send to the parent once the worker has resolved the host origin.
  // Before that there is nothing to address the message to, and initWithHostname
  // sends both of these itself as soon as identity lands.
  if (ScratchDump.hostOrigin) {
    postToHost('setOpacity', s.opacity);
    postToHost('setFixedSize', s.fixedSize);
  }
}

// ─── OCR LANGUAGE DATA ───────────────────────────────────────────────────────
// Not a persisted setting: the state is "are the bytes in IndexedDB", and this
// row reports it. It lives here because it is a settings control, and because
// the download has to start from a real user gesture — chrome.permissions
// .request() is only granted from one.

function _fmtMB(bytes) {
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/** True while a download or delete owns the row, so re-renders don't fight it. */
let _ocrBusy = false;

async function renderOcrRow() {
  const btn    = document.getElementById('ocrActionBtn');
  const status = document.getElementById('ocrStatus');
  if (!btn || !status || _ocrBusy) return;

  status.classList.remove('is-error');

  if (!idbAvailable) {
    btn.disabled = true;
    btn.textContent = 'Download';
    status.textContent = 'Unavailable — no local database in this window.';
    return;
  }

  const bytes = await ocrInstalledBytes();
  btn.disabled = false;

  if (bytes > 0) {
    btn.textContent = 'Delete';
    btn.classList.add('is-danger');
    status.textContent = 'On — ' + _fmtMB(bytes) + ' stored. Pasted images are read automatically.';
  } else {
    btn.textContent = 'Download';
    btn.classList.remove('is-danger');
    status.textContent = 'Off. One ~2 MB download, then it works offline.';
  }
}

function initOcrSettings() {
  const btn    = document.getElementById('ocrActionBtn');
  const status = document.getElementById('ocrStatus');
  if (!btn || !status) return;

  // The queue announces when a job starts or finishes; the row only cares
  // because install state can change underneath it.
  ocrOnStateChange(renderOcrRow);

  btn.addEventListener('click', async () => {
    if (_ocrBusy) return;
    const installed = (await ocrInstalledBytes()) > 0;

    _ocrBusy = true;
    btn.disabled = true;

    // Collected rather than rendered inline: every path below has to end with
    // one re-render, and an early return would leave the row stuck on
    // whatever transient text it was showing.
    let errorMsg = null;

    try {
      if (installed) {
        status.textContent = 'Removing…';
        await ocrDeleteLang();
      } else {
        status.textContent = 'Starting…';
        const res = await ocrDownloadLang((pct) => {
          status.textContent = pct === null ? 'Downloading…' : 'Downloading… ' + pct + '%';
        });
        if (!res.ok) {
          errorMsg = res.error === 'Permission denied'
            ? 'Needs permission to reach the download host.'
            : 'Could not download — ' + res.error;
        }
      }
    } catch (e) {
      errorMsg = String((e && e.message) || e);
    } finally {
      _ocrBusy = false;
    }

    await renderOcrRow();
    if (errorMsg) {
      // After the re-render, so the reason survives it.
      status.textContent = errorMsg;
      status.classList.add('is-error');
    }
  });

  renderOcrRow();
}

// ─── FOLDER FILES, READABLE EXPORT, BACKUP ───────────────────────────────────
// Export writes the current folder — pages, images, recognized text — to one
// .scratch file, and Back up does the same for every folder at once. Import and
// Restore read either kind back, replacing the folders they name. Markdown and
// Text write a file for reading, which is never read back.
//
// Replacing rather than merging is a deliberate choice, and the confirmation
// dialog is what makes it defensible: it counts what is about to be overwritten
// and says so, so a destructive import is something the user chose rather than
// something that happened to them.

function _fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function _plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

/**
 * Display name for a folder key. prettyName() covers hostnames only; a named
 * scratch carries its name in the key.
 * @param {string} key
 */
function _xferFolderName(key) {
  if (key.startsWith('scratch:')) return scratchNameFromKey(key);
  if (key.startsWith('site:')) return prettyName(key.slice('site:'.length));
  return key;
}

/** Title for a readable export, where the full hostname says more than the short name. */
function _readableTitle(key) {
  return key.startsWith('site:') ? key.slice('site:'.length) : _xferFolderName(key);
}

const XFER_BUTTONS = ['exportBtn', 'importBtn', 'mdExportBtn', 'txtExportBtn', 'backupBtn', 'restoreBtn'];

let _xferBusy = false;

/** Status line under a settings row. */
function _say(id, msg, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('is-error', !!isError);
}

function _xferLock(locked) {
  _xferBusy = locked;
  for (const id of XFER_BUTTONS) {
    const b = document.getElementById(id);
    if (b) b.disabled = locked;
  }
}

/**
 * Run one transfer with every transfer button locked — two at once would read
 * and write the same folders — and report a failure on the row it started from.
 */
async function _xferRun(statusId, fn) {
  if (_xferBusy) return;
  _xferLock(true);
  try { await fn(); }
  catch (e) { _say(statusId, String((e && e.message) || e), true); }
  finally { _xferLock(false); }
}

/**
 * The dialog both confirmations share. Resolves true only on an explicit
 * confirm — the backdrop, Escape and Cancel all resolve false, because the safe
 * answer is the one you get by doing nothing.
 *
 * @param {string} title @param {Node[]} body @param {string} okLabel
 * @returns {Promise<boolean>}
 */
function _confirmDialog(title, body, okLabel) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'xfer-confirm';
    const card = document.createElement('div');
    card.className = 'xfer-card';
    const h = document.createElement('h3');
    h.textContent = title;

    const actions = document.createElement('div');
    actions.className = 'xfer-actions';
    const cancel = document.createElement('button');
    cancel.className = 'btn-secondary';
    cancel.textContent = 'Cancel';
    const ok = document.createElement('button');
    ok.className = 'btn-primary';
    ok.textContent = okLabel;
    actions.append(cancel, ok);

    card.append(h, ...body, actions);
    back.append(card);
    document.body.append(back);
    ok.focus();

    const close = (val) => { back.remove(); resolve(val); };
    cancel.addEventListener('click', () => close(false));
    ok.addEventListener('click', () => close(true));
    back.addEventListener('click', (e) => { if (e.target === back) close(false); });
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });
  });
}

function _missingImagesNote(count) {
  const warn = document.createElement('p');
  warn.className = 'is-loss';
  warn.textContent = (count === 1 ? '1 image is' : count + ' images are')
    + ' missing from this file and will not appear.';
  return warn;
}

/**
 * Ask before one folder lands.
 * @param {{exists:boolean, localPages:number, incomingPages:number,
 *          changed:number, missingImages:number}} info
 * @param {string} folderName
 * @returns {Promise<boolean>}
 */
function confirmImport(info, folderName) {
  const p = document.createElement('p');
  if (info.exists) {
    const lost = document.createElement('span');
    lost.className = 'is-loss';
    lost.textContent = _plural(info.changed, 'page', 'pages') + ' will be overwritten';
    p.append(
      folderName + ' already exists here with ' + _plural(info.localPages, 'page', 'pages') + '. ',
      lost,
      ' and replaced with ' + info.incomingPages + '. This cannot be undone.'
    );
  } else {
    p.textContent = folderName + ' will be added with ' + _plural(info.incomingPages, 'page.', 'pages.');
  }
  const body = [p];
  if (info.missingImages) body.push(_missingImagesNote(info.missingImages));
  return _confirmDialog(info.exists ? 'Replace this folder?' : 'Import folder?', body,
    info.exists ? 'Replace' : 'Import');
}

/**
 * Ask before several folders land at once — a backup, or several files.
 * The totals carry the same warning confirmImport() gives for one.
 * @param {Object[]} objs @param {Object[]} infos — describeImport() of each
 * @returns {Promise<boolean>}
 */
function confirmRestore(objs, infos) {
  const replaced = objs.filter((_, i) => infos[i].exists);
  const pagesLost = infos.reduce((n, info) => n + (info.exists ? info.changed : 0), 0);
  const missing = infos.reduce((n, info) => n + info.missingImages, 0);

  const p = document.createElement('p');
  p.append(_plural(objs.length, 'folder', 'folders') + ' to restore. ');
  if (replaced.length) {
    const lost = document.createElement('span');
    lost.className = 'is-loss';
    lost.textContent = _plural(replaced.length, 'already exists', 'already exist')
      + ' here and will be replaced, overwriting ' + _plural(pagesLost, 'page', 'pages');
    p.append(lost, '. This cannot be undone.');
  } else {
    p.append('None of them exist here yet, so nothing is overwritten.');
  }
  const body = [p];

  if (replaced.length) {
    const names = replaced.map(o => o.folder.name || o.folder.key);
    const list = document.createElement('p');
    list.className = 'xfer-names';
    list.textContent = 'Replaced: ' + names.slice(0, 6).join(', ')
      + (names.length > 6 ? ' and ' + (names.length - 6) + ' more' : '');
    body.push(list);
  }
  if (missing) body.push(_missingImagesNote(missing));
  return _confirmDialog('Restore ' + _plural(objs.length, 'folder', 'folders') + '?', body, 'Restore');
}

/**
 * Import whatever was picked: one folder file, several, or a backup. Every
 * file is read and checked before the dialog opens, and nothing is written
 * until it is confirmed.
 * @param {File[]} files @param {string} statusId
 */
async function _importFiles(files, statusId) {
  // Pending edits land before the folders underneath them are replaced, not
  // after: a debounced save arriving late would write the old page back into
  // the imported folder. Flushed before counting, too, so the dialog's count of
  // overwritten pages includes what was just typed.
  await flushSave();

  _say(statusId, 'Reading…');
  const objs = await readImportFiles(files);
  if (!objs.length) { _say(statusId, 'There are no folders in that file.'); return; }
  const infos = [];
  for (const obj of objs) infos.push(await describeImport(obj));

  const go = objs.length === 1
    ? await confirmImport(infos[0], objs[0].folder.name || objs[0].folder.key)
    : await confirmRestore(objs, infos);
  if (!go) { _say(statusId, 'Import cancelled.'); return; }

  _say(statusId, 'Importing…');
  let pages = 0, images = 0;
  for (const obj of objs) {
    const res = await applyImport(obj);
    pages += res.pages;
    images += res.images;
  }

  // The folder on screen may be one just replaced. loadFolder() drops the
  // cache and re-reads, which is exactly what that needs.
  if (objs.some(o => o.folder.key === ScratchDump.currentFolderKey)) {
    await loadFolder(ScratchDump.currentFolderKey);
  }
  await renderFolderMenu();

  const what = objs.length === 1
    ? (objs[0].folder.name || objs[0].folder.key)
    : _plural(objs.length, 'folder', 'folders');
  _say(statusId, 'Imported ' + what + ' — ' + _plural(pages, 'page', 'pages')
    + (images ? ', ' + _plural(images, 'image', 'images') : ''));
}

function initTransferSettings() {
  const fileInput = document.getElementById('importFile');
  const btn = (id) => document.getElementById(id);
  if (!fileInput || XFER_BUTTONS.some(id => !btn(id))) return;

  btn('exportBtn').addEventListener('click', () => _xferRun('xferStatus', async () => {
    await flushSave();   // anything still in the save debounce belongs in the file
    const key = ScratchDump.currentFolderKey;
    if (!key) { _say('xferStatus', 'No folder open yet.', true); return; }
    const name = _xferFolderName(key);

    _say('xferStatus', 'Packing…');
    const { obj, blob, filename } = await exportFolder(key, name, (pct) => {
      if (pct < 100) _say('xferStatus', 'Packing… ' + pct + '%');
    });
    downloadBlob(blob, filename);

    const imgs = Object.keys(obj.images).length;
    _say('xferStatus', 'Saved ' + filename + ' — ' + _fmtSize(blob.size)
      + (imgs ? ', ' + _plural(imgs, 'image', 'images') : ''));
  }));

  for (const [id, mode] of [['mdExportBtn', 'md'], ['txtExportBtn', 'txt']]) {
    btn(id).addEventListener('click', () => _xferRun('readStatus', async () => {
      await flushSave();
      const key = ScratchDump.currentFolderKey;
      if (!key) { _say('readStatus', 'No folder open yet.', true); return; }
      const { blob, filename } = await exportReadable(key, _readableTitle(key), mode);
      downloadBlob(blob, filename);
      _say('readStatus', 'Saved ' + filename + ' — ' + _fmtSize(blob.size));
    }));
  }

  btn('backupBtn').addEventListener('click', () => _xferRun('backupStatus', async () => {
    await flushSave();
    _say('backupStatus', 'Packing…');
    const res = await exportEverything((pct) => {
      if (pct < 100) _say('backupStatus', 'Packing… ' + pct + '%');
    });
    downloadBlob(res.blob, res.filename);
    _say('backupStatus', 'Saved ' + res.filename + ' — ' + _plural(res.folders, 'folder', 'folders')
      + (res.images ? ', ' + _plural(res.images, 'image', 'images') : '')
      + ', ' + _fmtSize(res.blob.size));
  }));

  // Import and Restore share one picker, and both take folder files and
  // backups alike. Which row asked is only about where the outcome is reported.
  let importStatus = 'xferStatus';
  const pick = (statusId) => {
    if (_xferBusy) return;
    importStatus = statusId;
    fileInput.value = '';   // so picking the same file twice in a row still fires
    fileInput.click();
  };
  btn('importBtn').addEventListener('click', () => pick('xferStatus'));
  btn('restoreBtn').addEventListener('click', () => pick('backupStatus'));

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    _xferRun(importStatus, () => _importFiles(files, importStatus));
  });
}
