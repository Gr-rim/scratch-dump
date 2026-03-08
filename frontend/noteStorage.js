// noteStorage.js — chrome.storage.local helpers + migration for ScratchDump
// No DOM, no events. Only touches chrome.storage and IndexedDB (via imageStore).
'use strict';

// ─── LOW-LEVEL HELPERS ───────────────────────────────────────────────────────
function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// ─── FOLDER DATA ─────────────────────────────────────────────────────────────
// Shape: { pages: [htmlString, ...] }

async function getFolderData(folderKey) {
  const cache = ScratchDump.folderCache;
  if (cache.key === folderKey && cache.data) return cache.data;
  const data = await storageGet([folderKey]);
  const fd = data[folderKey] || { pages: [''] };
  ScratchDump.folderCache = { key: folderKey, data: fd };
  return fd;
}

async function saveFolderData(folderKey, folderData) {
  ScratchDump.folderCache = { key: folderKey, data: folderData };
  await storageSet({ [folderKey]: folderData });
}

// ─── SCRATCH LIST ────────────────────────────────────────────────────────────
// Shape: [{ key, name }]

async function getScratchList() {
  const data = await storageGet(['__scratchList__']);
  return data['__scratchList__'] || [];
}

async function saveScratchList(list) {
  await storageSet({ '__scratchList__': list });
}

// ─── ALL FOLDER KEYS (for dropdown) ──────────────────────────────────────────

async function getAllStorageData() {
  return new Promise(resolve => chrome.storage.local.get(null, resolve));
}

async function removeStorageKey(key) {
  return new Promise(r => chrome.storage.local.remove(key, r));
}

// ─── MIGRATION v1 → v2 ───────────────────────────────────────────────────────
// Extract inline base64 images from chrome.storage.local into IndexedDB.
// Uses granular _migrationStatus for crash-safe resume.

async function migrateV1toV2() {
  // Mark in-progress so a crash mid-migration will resume on next load
  await storageSet({ _migrationStatus: 'in_progress' });

  const allData = await getAllStorageData();
  let migrated = 0;

  for (const [key, val] of Object.entries(allData)) {
    if (!key.startsWith('site:') && !key.startsWith('scratch:')) continue;
    if (!val || !val.pages) continue;

    let changed = false;
    for (let i = 0; i < val.pages.length; i++) {
      const page = val.pages[i];
      if (!page || !page.includes('data:image')) continue;
      val.pages[i] = await extractImagesToIDB(page);
      changed = true;
    }
    if (changed) {
      await storageSet({ [key]: val });
      migrated++;
    }
  }

  // Verify: spot-check that idb refs resolve
  let verified = true;
  for (const [key, val] of Object.entries(allData)) {
    if (!key.startsWith('site:') && !key.startsWith('scratch:')) continue;
    if (!val || !val.pages) continue;
    for (const page of val.pages) {
      // Match idb:<uuid> refs (UUID v4 format)
      const idbRefs = (page || '').match(/idb:[0-9a-f-]{36}/g) || [];
      for (const ref of idbRefs.slice(0, 2)) {
        const id = ref.slice(4);
        if (!(await imgStoreHas(id))) { verified = false; break; }
      }
      if (!verified) break;
    }
    if (!verified) break;
  }

  if (verified) {
    await storageSet({
      _schemaVersion: 2,
      _migrationStatus: 'complete',
      _migratedAt: Date.now()
    });
    console.log(`ScratchDump: migration v1→v2 complete (${migrated} folders updated)`);
  } else {
    await storageSet({ _migrationStatus: 'failed' });
    console.warn('ScratchDump: migration v1→v2 verification failed — will retry next load');
  }
}

// ─── INIT STORAGE ────────────────────────────────────────────────────────────
// Called once from panel.js init(). Sets up schema version and runs migrations.

async function initStorage() {
  const meta = await storageGet(['_schemaVersion', '_migrationStatus']);
  if (!meta._schemaVersion) {
    await storageSet({ _schemaVersion: 1, _migrationStatus: 'pending' });
  }

  // Initialise IndexedDB — if unavailable, images stay as compressed base64
  await initImageStore();

  // Run pending migrations (only if IndexedDB is available)
  const status = meta._migrationStatus || 'pending';
  if (idbAvailable && (meta._schemaVersion || 1) < 2 && status !== 'complete') {
    try {
      await migrateV1toV2();
    } catch (e) {
      await storageSet({ _migrationStatus: 'failed' });
      console.warn('ScratchDump: migration error', e);
    }
  }
}
