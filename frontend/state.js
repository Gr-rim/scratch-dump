// state.js — Shared namespace for ScratchDump panel
// Loaded first. Every other file reads/writes through ScratchDump.*
'use strict';

const ScratchDump = {
  // Current context
  hostname: '',
  currentFolderKey: '',   // e.g. "site:claude.ai" or "scratch:MyNotes"
  currentPageIdx: 0,      // 0-based

  // Settings (defaults)
  settings: {
    fixedSize: false,
    opacity: 100,
    textSize: 14,
    font: 'Calibri',
    theme: 'dark',
    sttLang: 'en-US'
  },

  // STT state
  sttActive: false,

  // In-memory cache for current folder data
  folderCache: { key: '', data: null },

  // Cross-tab sync.
  // Every panel iframe is its own context with its own folderCache, and
  // chrome.storage.onChanged fires in the writing context too — so writes are
  // stamped with this id to tell "another tab did that" from our own echo.
  instanceId: crypto.randomUUID(),

  // Set by panel.js. Called as (folderKey, folderData|null) when a *different*
  // panel writes the folder this one is showing.
  onExternalChange: null,

  // Origin of the page hosting this panel, as reported by the service worker.
  // Null until resolved. While it is null the panel accepts no message from the
  // host and opens no notes — the worker is the only source of identity.
  hostOrigin: null,
};
