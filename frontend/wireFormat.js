// wireFormat.js — the on-the-wire representation of a folder.
//
// This file is deliberately pure: no storage, no DOM, no chrome.* APIs. It is
// copied verbatim into the mobile client (scratch-bump), which is a separate
// project with a separate storage layer, and the two must agree byte for byte
// about what a folder looks like. Anything that reads or writes belongs in
// transfer.js on this side, not here.
//
// If you change the shape, bump WIRE_VERSION and handle the old one on import.
// A reader that silently accepts a shape it does not understand is how notes
// get corrupted.
//
// Every top-level name here is prefixed `wire`/`WIRE`. These files share one
// global scope with imageStore.js and panel.js — a bare `extractImageIds` here
// would collide with the one in imageStore.js and throw at load.
'use strict';

const WIRE_FORMAT  = 'scratchdump-folder';
const WIRE_VERSION = 1;
const WIRE_EXT     = '.scratch';

/**
 * Shape, version 1:
 * {
 *   format:     "scratchdump-folder",
 *   version:    1,
 *   exportedAt: <epoch ms>,
 *   folder: {
 *     key:   "site:claude.ai" | "scratch:Recipes",
 *     name:  "claude.ai",
 *     kind:  "site" | "scratch",
 *     pages: [ "<html>", ... ]        // idb: refs left intact
 *   },
 *   images: { "<uuid>": "data:image/jpeg;base64,..." },
 *   ocr:    { "<uuid>": { text, confidence, lang, engineVersion, ts } }
 * }
 *
 * Images keep their original UUIDs. They are random enough that a collision is
 * not a real concern, and reusing them means importing the same folder twice is
 * idempotent instead of duplicating every blob.
 */

/** Matches `idb:<uuid-v4>` refs as written by extractImagesToIDB(). */
const WIRE_REF_RE = /idb:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/**
 * Every image id referenced by a set of pages.
 *
 * Both sides extract with this exact function, so a page that renders on the
 * desktop cannot arrive on the phone missing an image because the two disagreed
 * about what a reference looks like.
 *
 * @param {string[]} pages
 * @returns {string[]} unique, lowercased
 */
function wireImageIds(pages) {
  const ids = new Set();
  for (const html of pages || []) {
    if (!html) continue;
    WIRE_REF_RE.lastIndex = 0;
    let m;
    while ((m = WIRE_REF_RE.exec(html)) !== null) ids.add(m[1].toLowerCase());
  }
  return Array.from(ids);
}

/**
 * Assemble an export object. Pure — the caller has already done the reading.
 *
 * @param {{key:string, name:string, pages:string[]}} folder
 * @param {Object<string,string>} images — uuid -> data URL
 * @param {Object<string,Object>} ocr — uuid -> recognition record
 * @returns {Object}
 */
function wirePack(folder, images, ocr) {
  return {
    format: WIRE_FORMAT,
    version: WIRE_VERSION,
    exportedAt: Date.now(),
    folder: {
      key:   folder.key,
      name:  folder.name,
      kind:  folder.key.startsWith('scratch:') ? 'scratch' : 'site',
      pages: folder.pages,
    },
    images: images || {},
    ocr: ocr || {},
  };
}

/**
 * Check an object really is an export we can read, and throw something the UI
 * can show verbatim if it isn't.
 *
 * Errors here are read by a person who picked the wrong file, so they say what
 * to do rather than what failed.
 *
 * @param {any} obj
 * @returns {Object} the same object, once it is known good
 */
function wireValidate(obj) {
  if (!obj || typeof obj !== 'object' || obj.format !== WIRE_FORMAT) {
    throw new Error("That doesn't look like a ScratchDump export.");
  }
  if (typeof obj.version !== 'number') {
    throw new Error("That export is missing its version and can't be opened.");
  }
  if (obj.version > WIRE_VERSION) {
    throw new Error('That file was made by a newer version of ScratchDump. Update the extension to open it.');
  }
  const f = obj.folder;
  if (!f || typeof f.key !== 'string' || !Array.isArray(f.pages)) {
    throw new Error("That export is incomplete and can't be opened.");
  }
  if (!f.key.startsWith('site:') && !f.key.startsWith('scratch:')) {
    throw new Error("That export names a folder ScratchDump doesn't recognise.");
  }
  for (const page of f.pages) {
    if (typeof page !== 'string') {
      throw new Error('That export has a damaged page and was not imported.');
    }
  }
  // Normalise the containers so callers never have to null-check them.
  if (!obj.images || typeof obj.images !== 'object') obj.images = {};
  if (!obj.ocr    || typeof obj.ocr    !== 'object') obj.ocr    = {};
  return obj;
}

/**
 * An export whose pages reference images the file does not carry would import
 * as a note full of broken pictures. Better to know before writing anything.
 *
 * @param {Object} obj — already validated
 * @returns {string[]} referenced ids with no image in the file
 */
function wireMissingImages(obj) {
  return wireImageIds(obj.folder.pages).filter(id => !obj.images[id]);
}

/**
 * Serialize to a Blob, gzipped where the platform allows it.
 *
 * Base64 data URLs inside JSON cost about a third in overhead, and screenshots
 * of text compress extremely well, so this is usually a large win rather than a
 * micro-optimisation. The format is self-describing either way: import sniffs
 * the gzip magic rather than trusting the extension on the filename.
 *
 * @param {Object} obj
 * @returns {Promise<Blob>}
 */
async function wireSerialize(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'undefined') {
    return new Blob([bytes], { type: 'application/octet-stream' });
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

/**
 * Read a Blob back, gzipped or not, and validate it.
 *
 * @param {Blob} blob
 * @returns {Promise<Object>}
 */
async function wireDeserialize(blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const gzipped = head[0] === 0x1f && head[1] === 0x8b;

  let text;
  if (gzipped) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error("This browser can't read compressed exports.");
    }
    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = await blob.text();
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is damaged and can't be opened.");
  }
  return wireValidate(parsed);
}

/**
 * A filename that survives every filesystem, derived from the folder name.
 * @param {string} name
 * @returns {string}
 */
function wireFilename(name) {
  const safe = String(name || 'scratchdump')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'scratchdump';
  return safe + WIRE_EXT;
}

/** Rough byte size of an export, for showing before a transfer starts. */
function wireEstimateBytes(obj) {
  let n = 0;
  for (const page of obj.folder.pages) n += page.length;
  for (const id in obj.images) n += obj.images[id].length;
  return n;
}

// Loadable both as a plain script (extension panel, mobile client) and by Node,
// which is what lets the reference server validate exports with this exact file
// rather than a second implementation that could disagree with it.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WIRE_FORMAT, WIRE_VERSION, WIRE_EXT,
    wireImageIds, wirePack, wireValidate, wireMissingImages,
    wireSerialize, wireDeserialize, wireFilename, wireEstimateBytes,
  };
}
