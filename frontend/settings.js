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
