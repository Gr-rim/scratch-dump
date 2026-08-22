// panel.js — UI coordinator for ScratchDump
// Wires DOM events to extracted modules: noteStorage, settings, historyManager, imageStore.
// All shared state lives in ScratchDump.* (state.js).
'use strict';

// ─── DOM REFS ────────────────────────────────────────────────────────────────
const editor = document.getElementById('editor');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const siteName = document.getElementById('siteName');
const folderChevron = document.getElementById('folderChevron');
const folderMenu = document.getElementById('folderMenu');
const copyBtn = document.getElementById('copyBtn');
const pasteBtn = document.getElementById('pasteBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeBtn = document.getElementById('closeBtn');
const addPageBtn = document.getElementById('addPageBtn');
const pageIndicator = document.getElementById('pageIndicator');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const boldBtn = document.getElementById('boldBtn');
const underlineBtn = document.getElementById('underlineBtn');
const italicBtn = document.getElementById('italicBtn');
const fszUp = document.getElementById('fszUp');
const fszDown = document.getElementById('fszDown');
const confirmDialog = document.getElementById('confirmDialog');
const confirmOk = document.getElementById('confirmOk');
const confirmCancel = document.getElementById('confirmCancel');
const nameDialog = document.getElementById('nameDialog');
const nameInput = document.getElementById('nameInput');
const nameOk = document.getElementById('nameOk');
const nameCancel = document.getElementById('nameCancel');
const closeSettings = document.getElementById('closeSettings');
const sttBtn = document.getElementById('sttBtn');

// ─── UNDO/REDO WIRING ───────────────────────────────────────────────────────

function pushUndoState(html) {
  History.push(ScratchDump.currentFolderKey, ScratchDump.currentPageIdx, html);
  updateUndoButtons();
}

async function undo() {
  const snapshot = History.undo(ScratchDump.currentFolderKey, ScratchDump.currentPageIdx);
  if (snapshot === null) return;
  await setEditorHTML(snapshot, false);
  updateUndoButtons();
  saveCurrentPage();
}

async function redo() {
  const snapshot = History.redo(ScratchDump.currentFolderKey, ScratchDump.currentPageIdx);
  if (snapshot === null) return;
  await setEditorHTML(snapshot, false);
  updateUndoButtons();
  saveCurrentPage();
}

function updateUndoButtons() {
  const fk = ScratchDump.currentFolderKey;
  const pi = ScratchDump.currentPageIdx;
  undoBtn.disabled = !History.canUndo(fk, pi);
  redoBtn.disabled = !History.canRedo(fk, pi);
}

// ─── IMAGE COMPRESSION ──────────────────────────────────────────────────────
function compressImage(dataUrl, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

// ─── EDITOR ──────────────────────────────────────────────────────────────────
let saveTimer = null;
let lastHTML = '';
let dirty = false;

// Sanitize HTML to prevent stored XSS
const SAFE_TAGS = new Set([
  'div', 'span', 'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'a', 'img', 'hr', 'font', 'table', 'thead',
  'tbody', 'tr', 'td', 'th',
]);
const SAFE_ATTRS = new Set([
  'style', 'class', 'src', 'href', 'alt', 'title', 'width', 'height',
  'colspan', 'rowspan', 'target', 'data-placeholder', 'data-idb',
]);

function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}

function sanitizeNode(node) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();
      if (!SAFE_TAGS.has(tag)) { child.remove(); continue; }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || !SAFE_ATTRS.has(name)) {
          child.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src') &&
          attr.value.trim().toLowerCase().startsWith('javascript:')) {
          child.removeAttribute(attr.name);
        }
      }
      sanitizeNode(child);
    }
  }
}

async function setEditorHTML(html, pushToStack = true) {
  const resolved = await resolveIDBImages(html || '');
  editor.innerHTML = sanitizeHTML(resolved);
  if (pushToStack) pushUndoState(editor.innerHTML);
  lastHTML = editor.innerHTML;
  attachImageResizers();
}

// Every write goes through one serialized chain. clearTimeout can cancel a
// debounced save that has not fired yet, but it cannot stop one already
// running — awaiting the chain can, so a flush never races a save in flight.
let savePending = Promise.resolve();

// Writes handed to the chain but not yet on disk. `dirty` goes false the moment
// a job is queued, so without this the window between queueing and landing
// looks quiet — another tab's change would be adopted there, and our own write
// would then come down on top of it.
let inFlight = 0;

function writeCurrentPage() {
  const folderKey = ScratchDump.currentFolderKey;
  if (!folderKey) return savePending;   // hostname handshake hasn't landed yet

  // Snapshot synchronously: by the time this job runs the editor may already
  // be showing a different page.
  const pageIdx = ScratchDump.currentPageIdx;
  const html = editor.innerHTML;
  dirty = false;                        // this write carries the current content

  if (loadFailed) return savePending;   // never overwrite notes we failed to read

  inFlight++;
  savePending = savePending.then(async () => {
    await storageReady;   // never write into a schema the worker is rewriting
    const fd = await getFolderData(folderKey);
    while (fd.pages.length <= pageIdx) fd.pages.push('');
    fd.pages[pageIdx] = await extractImagesToIDB(html);
    await saveFolderData(folderKey, fd);
    clearSaveError();
  }).catch(err => {
    dirty = true;                       // retried on the next edit or flush
    console.warn('ScratchDump: save failed', err);
    showSaveError(err);
  }).finally(() => { inFlight--; });

  return savePending;
}

function saveCurrentPage() {
  dirty = true;
  clearTimeout(saveTimer);
  // Drop the handle as the callback runs. A timer that has already fired still
  // holds a numeric id, and hasUnsavedEdits() reads that as an edit pending
  // forever — which left every cross-tab change looking like a conflict.
  saveTimer = setTimeout(() => { saveTimer = null; writeCurrentPage(); }, 300);
}

/** Write now, and resolve once the queue has drained. */
function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (dirty) writeCurrentPage();
  return savePending;
}

/** Edits the user has made that are not on disk yet. */
function hasUnsavedEdits() {
  return dirty || saveTimer !== null || inFlight > 0;
}

// ─── NOTICES ─────────────────────────────────────────────────────────────────
// Sync and save-failure messages share one strip above the editor, so a second
// message stacks under the first instead of covering it.

function noticeStack() {
  let stack = document.getElementById('noticeStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'noticeStack';
    document.querySelector('.editor-wrap').appendChild(stack);
  }
  return stack;
}

function describeStorageError(err) {
  const msg = String((err && err.message) || err || '');
  if (/context invalidated|Extension context/i.test(msg)) {
    return 'ScratchDump was reloaded. Reopen the panel to keep saving.';
  }
  if (/quota|QUOTA_BYTES/i.test(msg)) return 'This profile is out of storage space.';
  return msg || 'Storage did not respond.';
}

// A failed save is the one thing this panel must never do quietly — the user
// is still typing into an editor whose contents are no longer being kept.
function showSaveError(err) {
  let el = document.getElementById('saveError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'saveError';

    const msg = document.createElement('span');
    msg.className = 'sync-msg';
    el.appendChild(msg);

    const retry = document.createElement('button');
    retry.className = 'sync-action';
    retry.textContent = 'Retry';
    retry.title = 'Try saving again now';
    retry.addEventListener('click', () => { dirty = true; flushSave(); });
    el.appendChild(retry);

    noticeStack().appendChild(el);
  }
  el.firstChild.textContent = 'Not saving — ' + describeStorageError(err);
}

function clearSaveError() {
  const el = document.getElementById('saveError');
  if (el) el.remove();
}

// ─── LOAD FAILURES ───────────────────────────────────────────────────────────
// A folder that could not be read leaves an empty editor that looks exactly
// like an empty note. Typing into it and saving would replace notes that are
// still on disk, so the editor stays locked until the read succeeds.

let loadFailed = false;
let retryLoad = null;

function setEditorLocked(locked, reason) {
  editor.setAttribute('contenteditable', locked ? 'false' : 'true');
  editor.classList.toggle('locked', locked);
  if (locked && reason) editor.setAttribute('aria-label', reason);
  else editor.removeAttribute('aria-label');
}

function markLoadFailure(err, retry) {
  loadFailed = true;
  retryLoad = retry;
  setEditorLocked(true, 'Notes could not be loaded');
  console.warn('ScratchDump: could not load notes', err);

  let el = document.getElementById('loadError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loadError';

    const msg = document.createElement('span');
    msg.className = 'sync-msg';
    el.appendChild(msg);

    const retryBtn = document.createElement('button');
    retryBtn.className = 'sync-action';
    retryBtn.textContent = 'Retry';
    retryBtn.title = 'Try loading these notes again';
    retryBtn.addEventListener('click', () => {
      const again = retryLoad;
      clearLoadFailure();
      if (again) again();
    });
    el.appendChild(retryBtn);

    noticeStack().appendChild(el);
  }
  el.firstChild.textContent = 'Could not load these notes — ' + describeStorageError(err);
}

function clearLoadFailure() {
  loadFailed = false;
  retryLoad = null;
  setEditorLocked(false);
  const el = document.getElementById('loadError');
  if (el) el.remove();
}

// The 300 ms debounce is a data-loss window whenever the frame goes away.
// visibilitychange covers the common path — the user switches tabs, then
// closes the one they left. pagehide is best-effort only: chrome.storage has
// no synchronous write, so a frame torn down at once may not finish.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});
window.addEventListener('pagehide', () => { flushSave(); });

// ─── EDITOR EVENTS ───────────────────────────────────────────────────────────

editor.addEventListener('input', () => {
  const html = editor.innerHTML;
  if (html !== lastHTML) {
    pushUndoState(html);
    lastHTML = html;
    saveCurrentPage();
  }
});

editor.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault(); redo();
  }
});

// Paste: handle images, strip unsupported, normalise text
editor.addEventListener('paste', async (e) => {
  e.preventDefault();
  const items = e.clipboardData?.items || [];
  let handled = false;

  for (const item of items) {
    if (item.type.match(/^image\/(jpeg|jpg|png|gif|avif|svg\+xml|webp)$/)) {
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = (ev) => {
        compressImage(ev.target.result).then(async (compressed) => {
          const img = document.createElement('img');
          img.src = compressed;
          img.style.width = '200px';
          img.style.height = 'auto';
          insertNodeAtCursor(img);
          attachResizer(img);
          // Store the blob once, here, and carry its id on the element so every
          // later save reuses it instead of writing another copy.
          if (idbAvailable) {
            try { img.setAttribute('data-idb', await imgStorePut(compressed)); }
            catch (e) { console.warn('ScratchDump: could not store pasted image', e); }
          }
          pushUndoState(editor.innerHTML);
          saveCurrentPage();
        });
      };
      reader.readAsDataURL(file);
      handled = true;
      break;
    }
  }

  if (!handled) {
    const text = e.clipboardData.getData('text/plain');
    insertTextAtCursor(text);
  }
});

// ─── CURSOR / TEXT HELPERS ───────────────────────────────────────────────────

function insertNodeAtCursor(node) {
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    editor.appendChild(node);
  }
}

function insertTextAtCursor(text) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function toggleFormat(tagName) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  let node = sel.anchorNode;
  let existing = null;
  while (node && node !== editor) {
    if (node.nodeType === 1 && node.tagName.toLowerCase() === tagName) {
      existing = node; break;
    }
    node = node.parentNode;
  }

  if (existing) {
    const parent = existing.parentNode;
    while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
    parent.removeChild(existing);
  } else if (!sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    const wrapper = document.createElement(tagName);
    try { range.surroundContents(wrapper); } catch {
      const fragment = range.extractContents();
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
    }
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    sel.addRange(newRange);
  }
  pushUndoState(editor.innerHTML);
  saveCurrentPage();
}

function hasFormat(tagName) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  let node = sel.anchorNode;
  while (node && node !== editor) {
    if (node.nodeType === 1 && node.tagName.toLowerCase() === tagName) return true;
    node = node.parentNode;
  }
  return false;
}

// ─── IMAGE RESIZING ──────────────────────────────────────────────────────────

function attachImageResizers() {
  editor.querySelectorAll('img').forEach(img => attachResizer(img));
}

function attachResizer(img) {
  if (img._resizerAttached) return;
  img._resizerAttached = true;
  img.addEventListener('mousemove', (e) => {
    const rect = img.getBoundingClientRect();
    img.style.cursor = e.clientX >= rect.left + rect.width * 0.65 ? 'ew-resize' : '';
  });
}

(function setupImageResize() {
  let isResizing = false;
  let resizeImg = null;
  let startX = 0, startW = 0;

  editor.addEventListener('mousedown', (e) => {
    const img = e.target.closest('img');
    if (!img || !editor.contains(img)) return;
    const rect = img.getBoundingClientRect();
    if (e.clientX < rect.left + rect.width * 0.65) return;
    e.preventDefault();
    isResizing = true;
    resizeImg = img;
    startX = e.clientX;
    startW = img.offsetWidth;
    img.classList.add('resizing');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing || !resizeImg) return;
    if (!editor.contains(resizeImg)) { cleanup(); return; }
    const dx = e.clientX - startX;
    resizeImg.style.width = Math.max(40, startW + dx) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    cleanup();
  });

  function cleanup() {
    if (resizeImg) {
      resizeImg.classList.remove('resizing');
      if (editor.contains(resizeImg)) {
        pushUndoState(editor.innerHTML);
        saveCurrentPage();
      }
    }
    isResizing = false;
    resizeImg = null;
  }
})();

// ─── HOSTNAME / FOLDER INIT ─────────────────────────────────────────────────

function prettyName(host) {
  host = host.replace(/^www\./, '');
  const parts = host.split('.');
  if (parts.length >= 2) {
    const name = parts[parts.length - 2];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return host || 'Scratchpad';
}

function truncate(str, max = 14) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/**
 * Send to the host page, addressed to its real origin once the worker has
 * resolved it. The wildcard covers only the window before that: these messages
 * are panel chrome — close, opacity, size lock — and carry no note content,
 * and content.js rejects anything that is not from the extension origin.
 */
function postToHost(type, payload) {
  window.parent.postMessage({ source: 'scratchpad', type, payload },
    ScratchDump.hostOrigin || '*');
}

async function initWithHostname(host) {
  ScratchDump.hostname = host;
  ScratchDump.currentFolderKey = 'site:' + host;
  const display = host ? truncate(prettyName(host)) : 'Scratchpad';
  siteName.textContent = display;

  // Reading before the worker has confirmed the schema renders idb: refs as
  // broken images, and a save in that window writes base64 straight back into
  // chrome.storage.local — the thing the v2 schema exists to avoid.
  setEditorLocked(true, 'Preparing notes');
  try { await storageReady; } finally { setEditorLocked(false); }

  await loadFolder(ScratchDump.currentFolderKey);
  const s = ScratchDump.settings;
  postToHost('setOpacity', s.opacity);
  postToHost('setFixedSize', s.fixedSize);
}

window.addEventListener('message', (e) => {
  // Identity is settled before any message here matters, so the host origin is
  // always known: nothing is accepted before it is, nothing from anywhere else
  // after.
  if (!ScratchDump.hostOrigin || e.origin !== ScratchDump.hostOrigin) return;
  if (!e.data || e.data.source !== 'scratchpad-host') return;

  if (e.data.type === 'panelHidden') stopDictation();
});

// Which site's notes this panel opens is decided by the service worker, which
// reads the tab's own URL from the browser.
//
// The panel never asks the page, not even as a fallback. The page and our
// content script share one window and one origin, so a hostname the page
// invented is indistinguishable at this end from a real one — which means any
// window in which the page is allowed to answer is a window in which it can
// point this panel at another site's notes. No check separates the two; only a
// source that cannot be forged does. A worker that does not answer therefore
// locks the editor rather than falling back to one that can be.
(async function resolveHost() {
  let info = null;
  try {
    info = await chrome.runtime.sendMessage({ action: 'getHostInfo' });
  } catch (e) {
    info = { ok: false, reason: String((e && e.message) || e) };
  }

  if (info && info.ok && info.hostname) {
    ScratchDump.hostOrigin = info.origin;
    try {
      await initWithHostname(info.hostname);
    } catch (err) {
      markLoadFailure(err, () => initWithHostname(info.hostname));
    }
    return;
  }

  markLoadFailure(
    new Error('this site could not be identified (' +
      ((info && info.reason) || 'no answer from the service worker') + ')'),
    resolveHost);
})();

// ─── LOAD FOLDER / PAGE ─────────────────────────────────────────────────────

async function loadFolder(folderKey) {
  dismissSync();
  ScratchDump.currentFolderKey = folderKey;
  ScratchDump.currentPageIdx = 0;
  ScratchDump.folderCache = { key: '', data: null };
  History.ensureFolder(folderKey);
  try {
    const fd = await getFolderData(folderKey);
    await setEditorHTML(fd.pages[0] || '');
    updatePageUI(fd);
  } catch (err) {
    markLoadFailure(err, () => loadFolder(folderKey));
    return;
  }
  clearLoadFailure();
  updateUndoButtons();
  editor.focus();
}

async function loadPage(idx) {
  dismissSync();
  await flushSave();
  try {
    const fd = await getFolderData(ScratchDump.currentFolderKey);
    ScratchDump.currentPageIdx = idx;
    await setEditorHTML(fd.pages[idx] || '');
    updatePageUI(fd);
  } catch (err) {
    markLoadFailure(err, () => loadPage(idx));
    return;
  }
  clearLoadFailure();
  updateUndoButtons();
  editor.focus();
}

function updatePageUI(fd) {
  const total = fd.pages.length;
  pageIndicator.textContent = `Pg. ${ScratchDump.currentPageIdx + 1}`;
  prevPageBtn.classList.toggle('hidden', ScratchDump.currentPageIdx === 0);
  nextPageBtn.classList.toggle('hidden', ScratchDump.currentPageIdx >= total - 1);
}

// ─── CROSS-TAB SYNC ──────────────────────────────────────────────────────────
// Another panel wrote the folder this one is showing. With nothing unsaved
// here, adopt their version silently. With local edits pending, say so instead
// of silently picking a winner.

let pendingExternal = null;   // newest version seen from another tab while dirty

async function handleExternalFolderChange(folderKey, folderData) {
  if (folderKey !== ScratchDump.currentFolderKey) return;

  // The folder was deleted in another tab.
  if (!folderData || !Array.isArray(folderData.pages)) {
    if (hasUnsavedEdits()) { pendingExternal = null; showSyncNotice(true); return; }
    const siteKey = 'site:' + ScratchDump.hostname;
    if (folderKey !== siteKey) {
      await switchFolder(siteKey, prettyName(ScratchDump.hostname));
    }
    return;
  }

  if (hasUnsavedEdits()) {
    pendingExternal = folderData;   // offer it, don't force it
    showSyncNotice(false);
    return;
  }

  await adoptFolderData(folderData);
}

/** Render a folder version that came from another tab. Saves nothing. */
async function adoptFolderData(fd) {
  const idx = Math.min(ScratchDump.currentPageIdx, Math.max(0, fd.pages.length - 1));
  ScratchDump.currentPageIdx = idx;
  await setEditorHTML(fd.pages[idx] || '');   // pushed onto the undo stack
  updatePageUI(fd);
  updateUndoButtons();
}

function showSyncNotice(deleted) {
  clearSyncNotice();

  const el = document.createElement('div');
  el.id = 'syncNotice';

  const msg = document.createElement('span');
  msg.className = 'sync-msg';
  msg.textContent = deleted ? 'Deleted in another tab.' : 'Changed in another tab.';
  el.appendChild(msg);

  if (!deleted && pendingExternal) {
    const load = document.createElement('button');
    load.className = 'sync-action';
    load.textContent = 'Load theirs';
    load.title = 'Discard the edits made here and load the other tab’s version';
    load.addEventListener('click', async () => {
      const fd = pendingExternal;
      clearTimeout(saveTimer);
      saveTimer = null;
      dirty = false;
      dismissSync();
      if (fd) await adoptFolderData(fd);
    });
    el.appendChild(load);
  }

  const keep = document.createElement('button');
  keep.className = 'sync-action';
  keep.textContent = deleted ? 'Dismiss' : 'Keep mine';
  keep.title = deleted
    ? 'Dismiss this message'
    : 'Write this tab’s version now, replacing theirs';
  keep.addEventListener('click', () => {
    dismissSync();
    // Assert the choice rather than wait for the next keystroke. Dismissing
    // alone left the other tab's version on disk for anyone who stopped typing
    // here — the opposite of what the button offers.
    if (!deleted) { dirty = true; flushSave(); }
  });
  el.appendChild(keep);

  noticeStack().appendChild(el);
}

function clearSyncNotice() {
  const el = document.getElementById('syncNotice');
  if (el) el.remove();
}

function dismissSync() {
  pendingExternal = null;
  clearSyncNotice();
}

ScratchDump.onExternalChange = handleExternalFolderChange;

// ─── PAGE NAVIGATION ─────────────────────────────────────────────────────────

prevPageBtn.addEventListener('click', () => {
  if (ScratchDump.currentPageIdx > 0) loadPage(ScratchDump.currentPageIdx - 1);
});

nextPageBtn.addEventListener('click', async () => {
  const fd = await getFolderData(ScratchDump.currentFolderKey);
  if (ScratchDump.currentPageIdx < fd.pages.length - 1) loadPage(ScratchDump.currentPageIdx + 1);
});

addPageBtn.addEventListener('click', async () => {
  await flushSave();
  const fd = await getFolderData(ScratchDump.currentFolderKey);
  fd.pages.push('');
  await saveFolderData(ScratchDump.currentFolderKey, fd);
  ScratchDump.currentPageIdx = fd.pages.length - 1;
  await setEditorHTML('');
  updatePageUI(fd);
  updateUndoButtons();
  editor.focus();
});

// ─── FOLDER DROPDOWN ─────────────────────────────────────────────────────────

folderChevron.addEventListener('click', async (e) => {
  e.stopPropagation();
  const isOpen = !folderMenu.classList.contains('hidden');
  if (isOpen) { folderMenu.classList.add('hidden'); return; }
  await renderFolderMenu();
  folderMenu.classList.remove('hidden');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#folderDropdownWrap')) folderMenu.classList.add('hidden');
  if (!e.target.closest('#settingsPanel') && !e.target.closest('#settingsBtn')) {
    settingsPanel.classList.add('hidden');
  }
});

async function renderFolderMenu() {
  folderMenu.innerHTML = '';
  const scratchList = await getScratchList();
  const allKeys = await getAllStorageData();
  const currentSiteKey = ScratchDump.hostname ? 'site:' + ScratchDump.hostname : null;

  const siteEntries = [];
  for (const [key, val] of Object.entries(allKeys)) {
    if (!key.startsWith('site:')) continue;
    const hasContent = val && val.pages && val.pages.some(p => p && p.trim() !== '' && p !== '<br>');
    if (!hasContent && key !== currentSiteKey) continue;
    siteEntries.push({ key, host: key.slice(5) });
  }

  if (currentSiteKey && !siteEntries.find(s => s.key === currentSiteKey)) {
    siteEntries.unshift({ key: currentSiteKey, host: ScratchDump.hostname });
  }

  siteEntries.sort((a, b) => {
    if (a.key === currentSiteKey) return -1;
    if (b.key === currentSiteKey) return 1;
    return a.host.localeCompare(b.host);
  });

  siteEntries.forEach(({ key, host }) => {
    const label = prettyName(host);
    const el = menuItem(label, key === ScratchDump.currentFolderKey, () => switchFolder(key, label));
    if (host !== label.toLowerCase()) el.title = host;
    folderMenu.appendChild(el);
  });

  if (scratchList.length > 0) {
    const div = document.createElement('div');
    div.style.cssText = 'height:1px;background:var(--border);margin:3px 0;';
    folderMenu.appendChild(div);
  }

  scratchList.forEach(({ key, name }) => {
    const el = menuItem(name, key === ScratchDump.currentFolderKey, () => switchFolder(key, name));
    const del = document.createElement('span');
    del.textContent = '×';
    del.style.cssText = 'margin-left:auto;padding-left:8px;color:var(--text3);font-size:13px;';
    del.title = 'Delete this scratch';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteScratch(key, name);
      folderMenu.classList.add('hidden');
    });
    el.appendChild(del);
    folderMenu.appendChild(el);
  });

  const addEl = document.createElement('div');
  addEl.className = 'dropdown-item add-scratch';
  addEl.textContent = '+ Add Scratch';
  addEl.addEventListener('click', () => { folderMenu.classList.add('hidden'); openNameDialog(); });
  folderMenu.appendChild(addEl);
}

function menuItem(label, isActive, onClick) {
  const el = document.createElement('div');
  el.className = 'dropdown-item' + (isActive ? ' active' : '');
  el.textContent = truncate(label, 20);
  el.title = label;
  el.addEventListener('click', () => { folderMenu.classList.add('hidden'); onClick(); });
  return el;
}

async function switchFolder(key, displayName) {
  await flushSave();
  ScratchDump.currentFolderKey = key;
  siteName.textContent = truncate(displayName);
  await loadFolder(key);
}

async function deleteScratch(key, name) {
  showConfirm('Delete Scratch Space?', `Delete "${name}"? This cannot be undone.`, async () => {
    // Settle the save chain before removing anything. A debounced save still
    // pending, or a write already travelling, lands after the delete and puts
    // the key straight back — pointing at blobs the cleanup below just
    // reclaimed.
    clearTimeout(saveTimer);
    saveTimer = null;
    if (ScratchDump.currentFolderKey === key) dirty = false;
    await savePending;

    // Note which blobs this scratch referenced before the note itself goes.
    // Read past the cache so the current folder's cached copy is left alone.
    const raw = await storageGet([key]);
    const doomed = ((raw[key] && raw[key].pages) || []).flatMap(extractImageIds);

    let list = await getScratchList();
    list = list.filter(s => s.key !== key);
    await saveScratchList(list);
    await removeStorageKey(key);

    // The note is gone from storage, so any id still referenced belongs to
    // another note and is left alone.
    releaseUnreferencedImages(doomed).catch(err =>
      console.warn('ScratchDump: image cleanup failed', err));

    if (ScratchDump.currentFolderKey === key) {
      const siteKey = 'site:' + ScratchDump.hostname;
      await switchFolder(siteKey, prettyName(ScratchDump.hostname));
    }
  });
}

// ─── DIALOGS ─────────────────────────────────────────────────────────────────

function openNameDialog() {
  nameInput.value = '';
  nameDialog.classList.remove('hidden');
  nameInput.focus();
}

nameCancel.addEventListener('click', () => nameDialog.classList.add('hidden'));
nameOk.addEventListener('click', createScratch);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') createScratch(); });

async function createScratch() {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  nameDialog.classList.add('hidden');
  const key = 'scratch:' + name + ':' + Date.now();
  const list = await getScratchList();
  list.push({ key, name });
  await saveScratchList(list);
  await saveFolderData(key, { pages: [''] });
  await switchFolder(key, name);
}

let confirmCallback = null;
function showConfirm(title, msg, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  confirmCallback = cb;
  confirmDialog.classList.remove('hidden');
}
confirmOk.addEventListener('click', () => {
  confirmDialog.classList.add('hidden');
  if (confirmCallback) { confirmCallback(); confirmCallback = null; }
});
confirmCancel.addEventListener('click', () => {
  confirmDialog.classList.add('hidden');
  confirmCallback = null;
});

// ─── TOOLBAR BUTTONS ─────────────────────────────────────────────────────────

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

boldBtn.addEventListener('click', () => { toggleFormat('b'); editor.focus(); });
underlineBtn.addEventListener('click', () => { toggleFormat('u'); editor.focus(); });
italicBtn.addEventListener('click', () => { toggleFormat('i'); editor.focus(); });

fszUp.addEventListener('click', () => changeFontSize(1));
fszDown.addEventListener('click', () => changeFontSize(-1));

function changeFontSize(delta) {
  ScratchDump.settings.textSize = Math.max(8, Math.min(48, ScratchDump.settings.textSize + delta));
  editor.style.fontSize = ScratchDump.settings.textSize + 'px';
  document.getElementById('textSizeInput').value = ScratchDump.settings.textSize;
  saveSettings();
}

document.addEventListener('selectionchange', () => {
  boldBtn.classList.toggle('active', hasFormat('b'));
  underlineBtn.classList.toggle('active', hasFormat('u'));
  italicBtn.classList.toggle('active', hasFormat('i'));
});

// ─── COPY / PASTE BUTTONS ────────────────────────────────────────────────────

copyBtn.addEventListener('click', () => {
  const sel = window.getSelection();
  let text = '';
  if (sel && !sel.isCollapsed && editor.contains(sel.anchorNode)) {
    text = sel.toString();
  } else {
    text = editor.innerText;
  }
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.classList.remove('flash-copy');
    void copyBtn.offsetWidth;
    copyBtn.classList.add('flash-copy');
  });
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    editor.focus();
    insertTextAtCursor(text);
  } catch { editor.focus(); }
});

// ─── STT WIRING ──────────────────────────────────────────────────────────────

if (!STT.isSTTSupported()) {
  sttBtn.style.display = 'none';
  document.getElementById('sttLangSelect').closest('.setting-row').style.display = 'none';
}

sttBtn.addEventListener('click', () => {
  STT.toggle(
    (final, interim) => {
      if (final) {
        editor.focus();
        insertTextAtCursor(final + ' ');
        pushUndoState(editor.innerHTML);
        saveCurrentPage();
      }
      updateSTTOverlay(interim);
    },
    () => {
      sttBtn.classList.remove('recording');
      clearSTTOverlay();
    },
    (err) => {
      sttBtn.classList.remove('recording');
      clearSTTOverlay();
      console.warn('STT error:', err);
    }
  );
  sttBtn.classList.toggle('recording', STT.isListening);
});

function updateSTTOverlay(text) {
  if (!text) { clearSTTOverlay(); return; }
  let overlay = document.getElementById('sttOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sttOverlay';
    document.querySelector('.editor-wrap').appendChild(overlay);
  }
  overlay.textContent = text;
}

function clearSTTOverlay() {
  const overlay = document.getElementById('sttOverlay');
  if (overlay) overlay.remove();
}

/** Stop dictation and put the button back. Safe to call when not recording. */
function stopDictation() {
  if (!STT.isListening) return;
  STT.stop();
  sttBtn.classList.remove('recording');
  clearSTTOverlay();
}

// ─── CLOSE ───────────────────────────────────────────────────────────────────

closeBtn.addEventListener('click', () => {
  stopDictation();
  postToHost('close');
});

// ─── SETTINGS UI ─────────────────────────────────────────────────────────────

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle('hidden');
});

closeSettings.addEventListener('click', () => settingsPanel.classList.add('hidden'));

document.getElementById('fixedSizeCheck').addEventListener('change', () => {
  ScratchDump.settings.fixedSize = document.getElementById('fixedSizeCheck').checked;
  saveSettings();
  postToHost('setFixedSize', ScratchDump.settings.fixedSize);
});

document.getElementById('opacityInput').addEventListener('input', () => {
  let v = parseInt(document.getElementById('opacityInput').value) || 100;
  v = Math.max(40, Math.min(100, v));
  ScratchDump.settings.opacity = v;
  saveSettings();
  postToHost('setOpacity', v);
});

document.getElementById('textSizeInput').addEventListener('input', () => {
  let v = parseInt(document.getElementById('textSizeInput').value) || 14;
  v = Math.max(8, Math.min(48, v));
  ScratchDump.settings.textSize = v;
  editor.style.fontSize = v + 'px';
  saveSettings();
});

document.getElementById('fontSelect').addEventListener('change', () => {
  ScratchDump.settings.font = document.getElementById('fontSelect').value;
  editor.style.fontFamily = ScratchDump.settings.font + ', sans-serif';
  saveSettings();
});

document.getElementById('themeSelect').addEventListener('change', () => {
  ScratchDump.settings.theme = document.getElementById('themeSelect').value;
  applyTheme(ScratchDump.settings.theme);
  saveSettings();
});

document.getElementById('sttLangSelect').addEventListener('change', () => {
  ScratchDump.settings.sttLang = document.getElementById('sttLangSelect').value;
  saveSettings();
});

// ─── INIT ────────────────────────────────────────────────────────────────────

(async function init() {
  await initStorage();
  await loadSettings();
  updateUndoButtons();
})();