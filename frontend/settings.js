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

      const imgs = Object.keys(obj.images).length;
      const detail = _fmtSize(blob.size)
        + (imgs ? ', ' + imgs + (imgs === 1 ? ' image' : ' images') : '');

      const how = await shareOrDownload(blob, filename);
      if (how === 'shared') {
        _xferSay('Sent ' + filename + ' — ' + detail);
      } else if (how === 'cancelled') {
        _xferSay('Not sent.');
      } else {
        _xferSay('Saved ' + filename + ' — ' + detail);
      }
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

// ─── SYNC WITH PHONE ─────────────────────────────────────────────────────────
// Pairing is entered once and remembered. Everything after that is two actions:
// send this folder up, or bring one down.
//
// Both dialogs reuse the overlay the file import uses, and a folder arriving
// over the wire goes through confirmImport() exactly as one arriving in a file
// does — same count of pages about to be lost, same atomic apply.

let _syncBusy = false;

function _syncSay(msg, isError) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('is-error', !!isError);
}

/** The shared modal shell. */
function _syncModal(title) {
  const back = document.createElement('div');
  back.className = 'xfer-confirm';
  const card = document.createElement('div');
  card.className = 'xfer-card';
  const h = document.createElement('h3');
  h.textContent = title;
  card.append(h);
  back.append(card);
  document.body.append(back);

  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return { back, card, close };
}

/** Ask for the address and code the phone is showing. */
function syncPairDialog() {
  return new Promise((resolve) => {
    const { card, close } = _syncModal('Pair with phone');

    const p = document.createElement('p');
    p.textContent = 'Open ScratchDump on your phone and turn on sync, then enter what it shows.';

    const addr = document.createElement('input');
    addr.className = 'sync-input';
    addr.type = 'text';
    addr.placeholder = '192.168.1.42:8765';
    addr.spellcheck = false;

    const code = document.createElement('input');
    code.className = 'sync-input';
    code.type = 'text';
    code.placeholder = 'Pairing code';
    code.spellcheck = false;
    code.autocapitalize = 'characters';

    const actions = document.createElement('div');
    actions.className = 'xfer-actions';
    const cancel = document.createElement('button');
    cancel.className = 'btn-secondary';
    cancel.textContent = 'Cancel';
    const ok = document.createElement('button');
    ok.className = 'btn-primary';
    ok.textContent = 'Pair';
    actions.append(cancel, ok);

    card.append(p, addr, code, actions);
    addr.focus();

    const done = (val) => { close(); resolve(val); };
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', () => done({ address: addr.value, code: code.value }));
    for (const el of [addr, code]) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); done({ address: addr.value, code: code.value }); }
      });
    }
  });
}

/** List what is on the phone, and offer to move a folder either way. */
async function syncBrowseDialog() {
  const { card, close } = _syncModal('Sync');

  const status = document.createElement('p');
  status.textContent = 'Asking the phone...';
  card.append(status);

  const actions = document.createElement('div');
  actions.className = 'xfer-actions';
  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn-secondary';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', close);
  actions.append(doneBtn);

  // Sending the folder already open is the common case, so it goes first and
  // costs nothing to find.
  const key = ScratchDump.currentFolderKey;
  const name = key ? _xferFolderName(key) : '';

  const send = document.createElement('button');
  send.className = 'ocr-btn sync-send';
  send.textContent = key ? 'Send "' + name + '" to phone' : 'No folder open';
  send.disabled = !key;
  send.addEventListener('click', async () => {
    send.disabled = true;
    status.classList.remove('is-loss');
    try {
      await flushSave();
      status.textContent = 'Sending...';
      const r = await syncPushFolder(key, name, (pct) => {
        if (pct < 100) status.textContent = 'Packing ' + pct + '%';
      });
      status.textContent = 'Sent ' + name + ' - ' + r.pages + (r.pages === 1 ? ' page' : ' pages')
        + (r.images ? ', ' + r.images + (r.images === 1 ? ' image' : ' images') : '');
    } catch (e) {
      status.textContent = (e && e.message) || String(e);
      status.classList.add('is-loss');
    }
    send.disabled = false;
  });

  const list = document.createElement('div');
  list.className = 'sync-list';

  card.append(send, list, actions);

  let folders;
  try {
    folders = await syncListFolders();
  } catch (e) {
    status.textContent = (e && e.message) || String(e);
    status.classList.add('is-loss');
    return;
  }

  status.textContent = folders.length
    ? 'On your phone:'
    : 'Nothing on the phone yet. Send a folder to start.';

  for (const f of folders) {
    const row = document.createElement('div');
    row.className = 'sync-row';

    const label = document.createElement('div');
    label.className = 'sync-row-main';
    const nm = document.createElement('div');
    nm.className = 'sync-row-name';
    nm.textContent = f.name || f.key;
    const meta = document.createElement('div');
    meta.className = 'sync-row-meta';
    meta.textContent = f.pages + (f.pages === 1 ? ' page' : ' pages')
      + (f.images ? ' - ' + f.images + (f.images === 1 ? ' image' : ' images') : '');
    label.append(nm, meta);

    const get = document.createElement('button');
    get.className = 'ocr-btn';
    get.textContent = 'Get';
    get.addEventListener('click', async () => {
      get.disabled = true;
      status.classList.remove('is-loss');
      status.textContent = 'Fetching ' + (f.name || f.key) + '...';
      try {
        const obj = await syncPullFolder(f.key);
        const info = await describeImport(obj);

        const go = await confirmImport(info, obj.folder.name || obj.folder.key);
        if (!go) { status.textContent = 'Not imported.'; get.disabled = false; return; }

        const res = await applyImport(obj);
        if (obj.folder.key === ScratchDump.currentFolderKey) await loadFolder(obj.folder.key);
        await renderFolderMenu();

        status.textContent = 'Imported ' + (obj.folder.name || obj.folder.key) + ' - '
          + res.pages + (res.pages === 1 ? ' page' : ' pages')
          + (res.images ? ', ' + res.images + (res.images === 1 ? ' image' : ' images') : '');
      } catch (e) {
        status.textContent = (e && e.message) || String(e);
        status.classList.add('is-loss');
      }
      get.disabled = false;
    });

    row.append(label, get);
    list.append(row);
  }
}

async function renderSyncRow() {
  const primary = document.getElementById('syncPrimaryBtn');
  const unpair = document.getElementById('syncUnpairBtn');
  if (!primary || !unpair || _syncBusy) return;

  const peer = await syncGetPeer();
  if (peer) {
    primary.textContent = 'Sync...';
    unpair.hidden = false;
    _syncSay('Paired with ' + peer.device + ' at ' + peer.address.replace(/^https?:\/\//, '') + '.');
  } else {
    primary.textContent = 'Pair...';
    unpair.hidden = true;
    _syncSay('Not paired. Turn on sync in the phone app for an address and code.');
  }
}

function initSyncSettings() {
  const primary = document.getElementById('syncPrimaryBtn');
  const unpair = document.getElementById('syncUnpairBtn');
  if (!primary || !unpair) return;

  primary.addEventListener('click', async () => {
    if (_syncBusy) return;

    if (await syncGetPeer()) { await syncBrowseDialog(); return; }

    const entered = await syncPairDialog();
    if (!entered) return;

    _syncBusy = true;
    primary.disabled = true;
    _syncSay('Pairing...');
    let err = null;
    try {
      const { device } = await syncPair(entered.address, entered.code);
      _syncBusy = false;
      await renderSyncRow();
      _syncSay('Paired with ' + device + '.');
    } catch (e) {
      err = (e && e.message) || String(e);
      _syncBusy = false;
      await renderSyncRow();
      _syncSay(err, true);
    }
    primary.disabled = false;
  });

  unpair.addEventListener('click', async () => {
    if (_syncBusy) return;
    _syncBusy = true;
    unpair.disabled = true;
    try { await syncUnpair(); } catch { /* forgetting is best effort */ }
    _syncBusy = false;
    unpair.disabled = false;
    await renderSyncRow();
  });

  renderSyncRow();
}
