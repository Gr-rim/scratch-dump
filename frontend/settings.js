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

  // Only send to parent once the iframe-to-content-script link is established;
  // at init time the content script isn't listening yet, so messages would be lost.
  if (ScratchDump.hostnameReceived) {
    window.parent.postMessage({ source: 'scratchpad', type: 'setOpacity', payload: s.opacity }, '*');
    window.parent.postMessage({ source: 'scratchpad', type: 'setFixedSize', payload: s.fixedSize }, '*');
  }
}
