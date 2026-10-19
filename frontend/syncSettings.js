// syncSettings.js — the Sync with Phone settings row and its dialogs.
'use strict';

// ─── SYNC WITH PHONE ─────────────────────────────────────────────────────────
// Dormant until the phone app ships. This file, syncProtocol.js, syncClient.js
// and backend/syncTransport.js are not loaded, and the store package leaves all
// four out. Turning sync back on:
//   1. panel.html — the settings row, and script tags for syncProtocol.js,
//      syncClient.js and this file (after settings.js).
//   2. panel.js — call initSyncSettings() from init().
//   3. background.js — importScripts('/backend/syncTransport.js').
//   4. manifest.json — "http://*/*" back in optional_host_permissions.
//   5. scripts/build.js — drop these files from the store exclusion list.
//
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
