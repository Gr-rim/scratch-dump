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

// ─── FOLDER TRANSFER ─────────────────────────────────────────────────────────
// Export writes the current folder — pages, images, recognized text — to a
// single file. Import reads one back, replacing the folder it names.
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

/**
 * Display name for a folder key. prettyName() covers hostnames only; a named
 * scratch carries its name in the key.
 * @param {string} key
 */
function _xferFolderName(key) {
  if (key.startsWith('scratch:')) return key.slice('scratch:'.length);
  if (key.startsWith('site:')) return prettyName(key.slice('site:'.length));
  return key;
}

let _xferBusy = false;

function _xferSay(msg, isError) {
  const el = document.getElementById('xferStatus');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('is-error', !!isError);
}

function _xferReset() {
  _xferBusy = false;
  const ex = document.getElementById('exportBtn');
  const im = document.getElementById('importBtn');
  if (ex) ex.disabled = false;
  if (im) im.disabled = false;
}

/**
 * Ask before overwriting. Resolves true only on an explicit confirm — clicking
 * the backdrop or Cancel resolves false, because the safe answer is the one you
 * get by doing nothing.
 *
 * @param {{exists:boolean, localPages:number, incomingPages:number,
 *          changed:number, missingImages:number}} info
 * @param {string} folderName
 * @returns {Promise<boolean>}
 */
function confirmImport(info, folderName) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'xfer-confirm';

    const card = document.createElement('div');
    card.className = 'xfer-card';

    const h = document.createElement('h3');
    h.textContent = info.exists ? 'Replace this folder?' : 'Import folder?';

    const p = document.createElement('p');
    if (info.exists) {
      const lost = document.createElement('span');
      lost.className = 'is-loss';
      lost.textContent = info.changed + (info.changed === 1 ? ' page' : ' pages')
        + ' will be overwritten';
      p.append(
        folderName + ' already exists here with ' + info.localPages
          + (info.localPages === 1 ? ' page. ' : ' pages. '),
        lost,
        ' and replaced with ' + info.incomingPages + '. This cannot be undone.'
      );
    } else {
      p.textContent = folderName + ' will be added with ' + info.incomingPages
        + (info.incomingPages === 1 ? ' page.' : ' pages.');
    }

    const actions = document.createElement('div');
    actions.className = 'xfer-actions';
    const cancel = document.createElement('button');
    cancel.className = 'btn-secondary';
    cancel.textContent = 'Cancel';
    const ok = document.createElement('button');
    ok.className = 'btn-primary';
    ok.textContent = info.exists ? 'Replace' : 'Import';

    actions.append(cancel, ok);
    card.append(h, p);

    if (info.missingImages) {
      const warn = document.createElement('p');
      warn.className = 'is-loss';
      warn.textContent = info.missingImages
        + (info.missingImages === 1 ? ' image is' : ' images are')
        + ' missing from this file and will not appear.';
      card.append(warn);
    }

    card.append(actions);
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

function initTransferSettings() {
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const fileInput = document.getElementById('importFile');
  if (!exportBtn || !importBtn || !fileInput) return;

  exportBtn.addEventListener('click', async () => {
    if (_xferBusy) return;
    _xferBusy = true;
    exportBtn.disabled = true;
    importBtn.disabled = true;

    try {
      // Anything still in the save debounce belongs in the file.
      await flushSave();

      const key = ScratchDump.currentFolderKey;
      if (!key) { _xferSay('No folder open yet.', true); return; }
      const name = _xferFolderName(key);

      _xferSay('Packing…');
      const { obj, blob, filename } = await exportFolder(key, name, (pct) => {
        if (pct < 100) _xferSay('Packing… ' + pct + '%');
      });

      downloadBlob(blob, filename);
      const imgs = Object.keys(obj.images).length;
      _xferSay('Saved ' + filename + ' — ' + _fmtSize(blob.size)
        + (imgs ? ', ' + imgs + (imgs === 1 ? ' image' : ' images') : ''));
    } catch (e) {
      _xferSay(String((e && e.message) || e), true);
    } finally {
      _xferReset();
    }
  });

  importBtn.addEventListener('click', () => {
    if (_xferBusy) return;
    // Cleared first, so picking the same file twice in a row still fires.
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    _xferBusy = true;
    exportBtn.disabled = true;
    importBtn.disabled = true;

    try {
      _xferSay('Reading…');
      const obj = await readImportFile(file);
      const info = await describeImport(obj);
      const name = obj.folder.name || obj.folder.key;

      // Released before the dialog so a long deliberation doesn't sit on top of
      // a disabled UI.
      _xferReset();
      const go = await confirmImport(info, name);
      if (!go) { _xferSay('Import cancelled.'); return; }

      _xferBusy = true;
      exportBtn.disabled = true;
      importBtn.disabled = true;

      _xferSay('Importing…');
      const res = await applyImport(obj);

      // The folder on screen may be the one just replaced.
      if (obj.folder.key === ScratchDump.currentFolderKey) {
        // loadFolder() drops the cache and re-reads, which is exactly what is
        // needed after the folder underneath the editor has been replaced.
        await loadFolder(obj.folder.key);
      }
      await renderFolderMenu();

      _xferSay('Imported ' + name + ' — ' + res.pages
        + (res.pages === 1 ? ' page' : ' pages')
        + (res.images ? ', ' + res.images + (res.images === 1 ? ' image' : ' images') : ''));
    } catch (e) {
      _xferSay(String((e && e.message) || e), true);
    } finally {
      _xferReset();
    }
  });

  _xferSay('Save this folder to a file, or open one.');
}
