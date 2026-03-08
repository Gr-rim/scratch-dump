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
    theme: 'dark'
  },

  // In-memory cache for current folder data
  folderCache: { key: '', data: null },

  // Hostname handshake flag
  hostnameReceived: false,
  hostnameRetry: null,
};
