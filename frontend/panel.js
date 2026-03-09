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

// Sanitize HTML to prevent stored XSS
const SAFE_TAGS = new Set([
  'div', 'span', 'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'a', 'img', 'hr', 'font', 'table', 'thead',
  'tbody', 'tr', 'td', 'th',
]);
const SAFE_ATTRS = new Set([
  'style', 'class', 'src', 'href', 'alt', 'title', 'width', 'height',
  'colspan', 'rowspan', 'target', 'data-placeholder',
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

function saveCurrentPage() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const fd = await getFolderData(ScratchDump.currentFolderKey);
    while (fd.pages.length <= ScratchDump.currentPageIdx) fd.pages.push('');
    fd.pages[ScratchDump.currentPageIdx] = await extractImagesToIDB(editor.innerHTML);
    await saveFolderData(ScratchDump.currentFolderKey, fd);
  }, 300);
}

async function flushSave() {
  clearTimeout(saveTimer);
  const fd = await getFolderData(ScratchDump.currentFolderKey);
  while (fd.pages.length <= ScratchDump.currentPageIdx) fd.pages.push('');
  fd.pages[ScratchDump.currentPageIdx] = await extractImagesToIDB(editor.innerHTML);
  await saveFolderData(ScratchDump.currentFolderKey, fd);
}

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
        compressImage(ev.target.result).then(compressed => {
          const img = document.createElement('img');
          img.src = compressed;
          img.style.width = '200px';
          img.style.height = 'auto';
          insertNodeAtCursor(img);
          attachResizer(img);
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

async function initWithHostname(host) {
  ScratchDump.hostnameReceived = true;
  clearInterval(ScratchDump.hostnameRetry);
  ScratchDump.hostname = host;
  ScratchDump.currentFolderKey = 'site:' + host;
  const display = host ? truncate(prettyName(host)) : 'Scratchpad';
  siteName.textContent = display;
  await loadFolder(ScratchDump.currentFolderKey);
  const s = ScratchDump.settings;
  window.parent.postMessage({ source: 'scratchpad', type: 'setOpacity', payload: s.opacity }, '*');
  window.parent.postMessage({ source: 'scratchpad', type: 'setFixedSize', payload: s.fixedSize }, '*');
}

window.addEventListener('message', (e) => {
  if (!e.data || e.data.source !== 'scratchpad-host') return;
  if (e.data.type === 'hostname') initWithHostname(e.data.payload);
});

function requestHostname() {
  if (ScratchDump.hostnameReceived) return;
  window.parent.postMessage({ source: 'scratchpad', type: 'getHostname' }, '*');
}
requestHostname();
ScratchDump.hostnameRetry = setInterval(requestHostname, 300);

// ─── LOAD FOLDER / PAGE ─────────────────────────────────────────────────────

async function loadFolder(folderKey) {
  ScratchDump.currentFolderKey = folderKey;
  ScratchDump.currentPageIdx = 0;
  ScratchDump.folderCache = { key: '', data: null };
  History.ensureFolder(folderKey);
  const fd = await getFolderData(folderKey);
  await setEditorHTML(fd.pages[0] || '');
  updatePageUI(fd);
  updateUndoButtons();
  editor.focus();
}

async function loadPage(idx) {
  await flushSave();
  const fd = await getFolderData(ScratchDump.currentFolderKey);
  ScratchDump.currentPageIdx = idx;
  await setEditorHTML(fd.pages[idx] || '');
  updatePageUI(fd);
  updateUndoButtons();
  editor.focus();
}

function updatePageUI(fd) {
  const total = fd.pages.length;
  pageIndicator.textContent = `Pg. ${ScratchDump.currentPageIdx + 1}`;
  prevPageBtn.classList.toggle('hidden', ScratchDump.currentPageIdx === 0);
  nextPageBtn.classList.toggle('hidden', ScratchDump.currentPageIdx >= total - 1);
}

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
  showConfirm(`Delete "${name}"? This cannot be undone.`, async () => {
    let list = await getScratchList();
    list = list.filter(s => s.key !== key);
    await saveScratchList(list);
    await removeStorageKey(key);
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
function showConfirm(msg, cb) {
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

// ─── CLOSE ───────────────────────────────────────────────────────────────────

closeBtn.addEventListener('click', () => {
  window.parent.postMessage({ source: 'scratchpad', type: 'close' }, '*');
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
  window.parent.postMessage({ source: 'scratchpad', type: 'setFixedSize', payload: ScratchDump.settings.fixedSize }, '*');
});

document.getElementById('opacityInput').addEventListener('input', () => {
  let v = parseInt(document.getElementById('opacityInput').value) || 100;
  v = Math.max(40, Math.min(100, v));
  ScratchDump.settings.opacity = v;
  saveSettings();
  window.parent.postMessage({ source: 'scratchpad', type: 'setOpacity', payload: v }, '*');
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