// panel.js
'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────
let hostname = '';
let currentFolderKey = ''; // e.g. "site:claude.ai" or "scratch:MyNotes"
let currentPageIdx = 0;    // 0-based
let settings = {
  fixedSize: false,
  opacity: 100,
  textSize: 14,
  font: 'Calibri',
  theme: 'dark'
};

// Per-page undo/redo stacks  { [folderKey]: { [pageIdx]: { stack, pointer } } }
let undoStacks = {};

// In-memory cache for current folder data to avoid redundant storage reads
let folderCache = { key: '', data: null };

// ─── DOM ─────────────────────────────────────────────────────────────────────
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
const fixedSizeCheck = document.getElementById('fixedSizeCheck');
const opacityInput = document.getElementById('opacityInput');
const textSizeInput = document.getElementById('textSizeInput');
const fontSelect = document.getElementById('fontSelect');
const themeSelect = document.getElementById('themeSelect');
const closeSettings = document.getElementById('closeSettings');

// ─── STORAGE HELPERS ─────────────────────────────────────────────────────────
function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// Folder data shape: { pages: [htmlString, ...] }
async function getFolderData(folderKey) {
  if (folderCache.key === folderKey && folderCache.data) {
    return folderCache.data;
  }
  const data = await storageGet([folderKey]);
  const fd = data[folderKey] || { pages: [''] };
  folderCache = { key: folderKey, data: fd };
  return fd;
}
async function saveFolderData(folderKey, folderData) {
  folderCache = { key: folderKey, data: folderData };
  await storageSet({ [folderKey]: folderData });
}

// Scratch list: [{ key, name }]
async function getScratchList() {
  const data = await storageGet(['__scratchList__']);
  return data['__scratchList__'] || [];
}
async function saveScratchList(list) {
  await storageSet({ '__scratchList__': list });
}

// Settings
async function loadSettings() {
  const data = await storageGet(['__settings__']);
  if (data['__settings__']) {
    settings = { ...settings, ...data['__settings__'] };
  }
  applySettings();
}
async function saveSettings() {
  await storageSet({ '__settings__': settings });
}

// ─── UNDO/REDO ───────────────────────────────────────────────────────────────
function getUndoState() {
  if (!undoStacks[currentFolderKey]) undoStacks[currentFolderKey] = {};
  if (!undoStacks[currentFolderKey][currentPageIdx]) {
    undoStacks[currentFolderKey][currentPageIdx] = { stack: [], pointer: -1 };
  }
  return undoStacks[currentFolderKey][currentPageIdx];
}

const UNDO_LIMIT = 50;

function pushUndoState(html) {
  const state = getUndoState();
  // Truncate any forward history
  state.stack = state.stack.slice(0, state.pointer + 1);
  state.stack.push(html);
  // Trim oldest entries if over the limit
  if (state.stack.length > UNDO_LIMIT) {
    const excess = state.stack.length - UNDO_LIMIT;
    state.stack = state.stack.slice(excess);
  }
  state.pointer = state.stack.length - 1;
  updateUndoButtons();
}

function undo() {
  const state = getUndoState();
  if (state.pointer <= 0) return;
  state.pointer--;
  setEditorHTML(state.stack[state.pointer], false);
  updateUndoButtons();
  saveCurrentPage();
}

function redo() {
  const state = getUndoState();
  if (state.pointer >= state.stack.length - 1) return;
  state.pointer++;
  setEditorHTML(state.stack[state.pointer], false);
  updateUndoButtons();
  saveCurrentPage();
}

function updateUndoButtons() {
  const state = getUndoState();
  undoBtn.disabled = state.pointer <= 0;
  redoBtn.disabled = state.pointer >= state.stack.length - 1;
}

// ─── EDITOR ──────────────────────────────────────────────────────────────────
let saveTimer = null;
let lastHTML = '';

// Sanitize HTML to prevent stored XSS — strips dangerous tags and attributes
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
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();
      if (!SAFE_TAGS.has(tag)) {
        child.remove();
        continue;
      }
      // Strip dangerous attributes (event handlers, javascript: URIs)
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

function setEditorHTML(html, pushToStack = true) {
  editor.innerHTML = sanitizeHTML(html || '');
  if (pushToStack) pushUndoState(editor.innerHTML);
  lastHTML = editor.innerHTML;
  attachImageResizers();
}

function saveCurrentPage() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const fd = await getFolderData(currentFolderKey);
    while (fd.pages.length <= currentPageIdx) fd.pages.push('');
    fd.pages[currentPageIdx] = editor.innerHTML;
    await saveFolderData(currentFolderKey, fd);
  }, 300);
}

editor.addEventListener('input', () => {
  const html = editor.innerHTML;
  if (html !== lastHTML) {
    pushUndoState(html);
    lastHTML = html;
    saveCurrentPage();
  }
});

// Keyboard shortcuts
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
        const img = document.createElement('img');
        img.src = ev.target.result;
        img.style.width = '200px';
        img.style.height = 'auto';
        insertNodeAtCursor(img);
        attachResizer(img);
        pushUndoState(editor.innerHTML);
        saveCurrentPage();
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

// ─── TEXT HELPERS (replaces deprecated execCommand) ─────────────────────────
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

  // Check if cursor/selection is already inside this tag
  let node = sel.anchorNode;
  let existing = null;
  while (node && node !== editor) {
    if (node.nodeType === 1 && node.tagName.toLowerCase() === tagName) {
      existing = node;
      break;
    }
    node = node.parentNode;
  }

  if (existing) {
    // Unwrap: replace the tag with its children
    const parent = existing.parentNode;
    while (existing.firstChild) {
      parent.insertBefore(existing.firstChild, existing);
    }
    parent.removeChild(existing);
  } else if (!sel.isCollapsed) {
    // Wrap selection in the formatting tag
    const range = sel.getRangeAt(0);
    const wrapper = document.createElement(tagName);
    try {
      range.surroundContents(wrapper);
    } catch {
      // surroundContents fails on partial element selections — extract and re-wrap
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

// ─── IMAGE RESIZING ───────────────────────────────────────────────────────────
function attachImageResizers() {
  editor.querySelectorAll('img').forEach(img => attachResizer(img));
}

function attachResizer(img) {
  if (img._resizerAttached) return;
  img._resizerAttached = true;
  // Cursor hint for right-edge resize zone
  img.addEventListener('mousemove', (e) => {
    const rect = img.getBoundingClientRect();
    img.style.cursor = e.clientX >= rect.left + rect.width * 0.65 ? 'ew-resize' : '';
  });
}

// Single document-level listener handles all image resizing — no per-mousedown leaks
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
    // Guard: if the image was removed from DOM mid-resize, abort
    if (!editor.contains(resizeImg)) { cleanup(); return; }
    const dx = e.clientX - startX;
    const newW = Math.max(40, startW + dx);
    resizeImg.style.width = newW + 'px';
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

// ─── HOSTNAME / FOLDER INIT ───────────────────────────────────────────────────
function prettyName(host) {
  // Remove www. prefix, then extract the main domain word
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
  _hostnameReceived = true;
  clearInterval(_hostnameRetry);
  hostname = host;
  currentFolderKey = 'site:' + host;
  const display = host ? truncate(prettyName(host)) : 'Scratchpad';
  siteName.textContent = display;
  await loadFolder(currentFolderKey);
  // Now that the link is established, send deferred settings
  window.parent.postMessage({ source: 'scratchpad', type: 'setOpacity', payload: settings.opacity }, '*');
  window.parent.postMessage({ source: 'scratchpad', type: 'setFixedSize', payload: settings.fixedSize }, '*');
}

window.addEventListener('message', (e) => {
  // Security: validate message structure (origin can't be checked here —
  // content script messages arrive with the host page's origin, which varies).
  // The content script side validates e.origin === extOrigin for messages FROM this iframe.
  if (!e.data || e.data.source !== 'scratchpad-host') return;
  if (e.data.type === 'hostname') {
    initWithHostname(e.data.payload);
  }
});

// Request hostname — retry until we get a response
let _hostnameReceived = false;
function requestHostname() {
  if (_hostnameReceived) return;
  window.parent.postMessage({ source: 'scratchpad', type: 'getHostname' }, '*');
}
// Fire immediately and keep retrying until answered
requestHostname();
const _hostnameRetry = setInterval(requestHostname, 300);

// ─── LOAD FOLDER ─────────────────────────────────────────────────────────────
async function loadFolder(folderKey) {
  currentFolderKey = folderKey;
  currentPageIdx = 0;
  // Invalidate cache so we get fresh data
  folderCache = { key: '', data: null };
  undoStacks[folderKey] = undoStacks[folderKey] || {};
  const fd = await getFolderData(folderKey);
  setEditorHTML(fd.pages[0] || '');
  updatePageUI(fd);
  updateUndoButtons();
  editor.focus();
}

async function loadPage(idx) {
  // Save current first
  await flushSave();
  const fd = await getFolderData(currentFolderKey);
  currentPageIdx = idx;
  setEditorHTML(fd.pages[idx] || '');
  updatePageUI(fd);
  updateUndoButtons();
  editor.focus();
}

async function flushSave() {
  clearTimeout(saveTimer);
  const fd = await getFolderData(currentFolderKey);
  while (fd.pages.length <= currentPageIdx) fd.pages.push('');
  fd.pages[currentPageIdx] = editor.innerHTML;
  await saveFolderData(currentFolderKey, fd);
}

function updatePageUI(fd) {
  const total = fd.pages.length;
  pageIndicator.textContent = `Pg. ${currentPageIdx + 1}`;
  prevPageBtn.classList.toggle('hidden', currentPageIdx === 0);
  nextPageBtn.classList.toggle('hidden', currentPageIdx >= total - 1);
}

// ─── PAGE NAVIGATION ─────────────────────────────────────────────────────────
prevPageBtn.addEventListener('click', () => {
  if (currentPageIdx > 0) loadPage(currentPageIdx - 1);
});
nextPageBtn.addEventListener('click', async () => {
  const fd = await getFolderData(currentFolderKey);
  if (currentPageIdx < fd.pages.length - 1) loadPage(currentPageIdx + 1);
});
addPageBtn.addEventListener('click', async () => {
  await flushSave();
  const fd = await getFolderData(currentFolderKey);
  fd.pages.push('');
  await saveFolderData(currentFolderKey, fd);
  currentPageIdx = fd.pages.length - 1;
  setEditorHTML('');
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
  if (!e.target.closest('#folderDropdownWrap')) {
    folderMenu.classList.add('hidden');
  }
  if (!e.target.closest('#settingsPanel') && !e.target.closest('#settingsBtn')) {
    settingsPanel.classList.add('hidden');
  }
});

async function renderFolderMenu() {
  folderMenu.innerHTML = '';
  const scratchList = await getScratchList();

  // Get all storage keys to find every saved site
  const allKeys = await new Promise(resolve => chrome.storage.local.get(null, resolve));
  const currentSiteKey = hostname ? 'site:' + hostname : null;

  // Collect all site keys that have at least one non-empty page
  const siteEntries = [];
  for (const [key, val] of Object.entries(allKeys)) {
    if (!key.startsWith('site:')) continue;
    const hasContent = val && val.pages && val.pages.some(p => p && p.trim() !== '' && p !== '<br>');
    if (!hasContent && key !== currentSiteKey) continue; // skip empty non-current sites
    const host = key.slice(5); // strip "site:"
    siteEntries.push({ key, host });
  }

  // Always include current site even if empty
  if (currentSiteKey && !siteEntries.find(s => s.key === currentSiteKey)) {
    siteEntries.unshift({ key: currentSiteKey, host: hostname });
  }

  // Sort: current site first, then alphabetically
  siteEntries.sort((a, b) => {
    if (a.key === currentSiteKey) return -1;
    if (b.key === currentSiteKey) return 1;
    return a.host.localeCompare(b.host);
  });

  // Render site entries
  siteEntries.forEach(({ key, host }) => {
    const label = prettyName(host);
    const el = menuItem(label, key === currentFolderKey, () => {
      switchFolder(key, label);
    });
    // Show hostname as subtitle if different from pretty name
    if (host !== label.toLowerCase()) {
      el.title = host;
    }
    folderMenu.appendChild(el);
  });

  // Divider before scratch spaces if there are any
  if (scratchList.length > 0) {
    const div = document.createElement('div');
    div.style.cssText = 'height:1px;background:var(--border);margin:3px 0;';
    folderMenu.appendChild(div);
  }

  // Scratch spaces
  scratchList.forEach(({ key, name }) => {
    const el = menuItem(name, key === currentFolderKey, () => {
      switchFolder(key, name);
    });
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

  // Add Scratch
  const addEl = document.createElement('div');
  addEl.className = 'dropdown-item add-scratch';
  addEl.textContent = '+ Add Scratch';
  addEl.addEventListener('click', () => {
    folderMenu.classList.add('hidden');
    openNameDialog();
  });
  folderMenu.appendChild(addEl);
}

function menuItem(label, isActive, onClick) {
  const el = document.createElement('div');
  el.className = 'dropdown-item' + (isActive ? ' active' : '');
  el.textContent = truncate(label, 20);
  el.title = label;
  el.addEventListener('click', () => {
    folderMenu.classList.add('hidden');
    onClick();
  });
  return el;
}

async function switchFolder(key, displayName) {
  await flushSave();
  currentFolderKey = key;
  siteName.textContent = truncate(displayName);
  await loadFolder(key);
}

async function deleteScratch(key, name) {
  showConfirm(`Delete "${name}"? This cannot be undone.`, async () => {
    // Remove from scratch list
    let list = await getScratchList();
    list = list.filter(s => s.key !== key);
    await saveScratchList(list);
    // Remove data
    await new Promise(r => chrome.storage.local.remove(key, r));
    // If we were on it, go back to site
    if (currentFolderKey === key) {
      const siteKey = 'site:' + hostname;
      await switchFolder(siteKey, prettyName(hostname));
    }
  });
}

// ─── ADD SCRATCH DIALOG ───────────────────────────────────────────────────────
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

// ─── CONFIRM DIALOG ───────────────────────────────────────────────────────────
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

// ─── UNDO/REDO BUTTONS ────────────────────────────────────────────────────────
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

// ─── FORMAT BUTTONS ───────────────────────────────────────────────────────────
boldBtn.addEventListener('click', () => { toggleFormat('b'); editor.focus(); });
underlineBtn.addEventListener('click', () => { toggleFormat('u'); editor.focus(); });
italicBtn.addEventListener('click', () => { toggleFormat('i'); editor.focus(); });

fszUp.addEventListener('click', () => changeFontSize(1));
fszDown.addEventListener('click', () => changeFontSize(-1));

function changeFontSize(delta) {
  settings.textSize = Math.max(8, Math.min(48, settings.textSize + delta));
  editor.style.fontSize = settings.textSize + 'px';
  textSizeInput.value = settings.textSize;
  saveSettings();
}

// Update format button active states on selection change
document.addEventListener('selectionchange', () => {
  boldBtn.classList.toggle('active', hasFormat('b'));
  underlineBtn.classList.toggle('active', hasFormat('u'));
  italicBtn.classList.toggle('active', hasFormat('i'));
});

// ─── COPY / PASTE ─────────────────────────────────────────────────────────────
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
    void copyBtn.offsetWidth; // reflow
    copyBtn.classList.add('flash-copy');
  });
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    editor.focus();
    insertTextAtCursor(text);
  } catch {
    editor.focus();
  }
});

// ─── CLOSE ───────────────────────────────────────────────────────────────────
closeBtn.addEventListener('click', () => {
  window.parent.postMessage({ source: 'scratchpad', type: 'close' }, '*');
});

// ─── SETTINGS ────────────────────────────────────────────────────────────────
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle('hidden');
});
closeSettings.addEventListener('click', () => settingsPanel.classList.add('hidden'));

fixedSizeCheck.addEventListener('change', () => {
  settings.fixedSize = fixedSizeCheck.checked;
  saveSettings();
  window.parent.postMessage({ source: 'scratchpad', type: 'setFixedSize', payload: settings.fixedSize }, '*');
});

opacityInput.addEventListener('input', () => {
  let v = parseInt(opacityInput.value) || 100;
  v = Math.max(40, Math.min(100, v));
  settings.opacity = v;
  saveSettings();
  window.parent.postMessage({ source: 'scratchpad', type: 'setOpacity', payload: v }, '*');
});

textSizeInput.addEventListener('input', () => {
  let v = parseInt(textSizeInput.value) || 14;
  v = Math.max(8, Math.min(48, v));
  settings.textSize = v;
  editor.style.fontSize = v + 'px';
  saveSettings();
});

fontSelect.addEventListener('change', () => {
  settings.font = fontSelect.value;
  editor.style.fontFamily = settings.font + ', sans-serif';
  saveSettings();
});

themeSelect.addEventListener('change', () => {
  settings.theme = themeSelect.value;
  applyTheme(settings.theme);
  saveSettings();
});

function applyTheme(theme) {
  document.body.classList.remove("theme-light", "theme-dark");
  document.body.classList.add("theme-" + theme);
}

function applySettings() {
  fixedSizeCheck.checked = settings.fixedSize;
  opacityInput.value = settings.opacity;
  textSizeInput.value = settings.textSize;
  fontSelect.value = settings.font;
  themeSelect.value = settings.theme;
  editor.style.fontSize = settings.textSize + 'px';
  editor.style.fontFamily = settings.font + ', sans-serif';
  applyTheme(settings.theme);
  // Only send to parent once the iframe-to-content-script link is established;
  // at init time the content script isn't listening yet, so messages would be lost.
  if (_hostnameReceived) {
    window.parent.postMessage({ source: 'scratchpad', type: 'setOpacity', payload: settings.opacity }, '*');
    window.parent.postMessage({ source: 'scratchpad', type: 'setFixedSize', payload: settings.fixedSize }, '*');
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
(async function init() {
  await loadSettings();
  updateUndoButtons();
})();