#!/usr/bin/env node
// build.js — package ScratchDump for release. No dependencies.
//
//   node scripts/build.js store    → dist/scratch-dump-<version>-store.zip
//   node scripts/build.js github   → dist/scratch-dump-<version>.zip
//
// The two differ on purpose:
//
//   store   Files at the root of the zip, which is where the Chrome Web Store
//           looks for manifest.json. No "key": the store assigns its own ID.
//           Dormant code (phone sync) left out, so nothing ships that the
//           extension never runs.
//   github  Everything inside a scratch-dump/ folder, for unzip-and-load. The
//           key stays: it is what keeps an unpacked install's ID — and so its
//           notes — the same from one update to the next.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// What a release contains. Anything not listed — scripts/, store/, dotfiles,
// the private key if someone drops it in here — never reaches a zip.
const SHIPPED = ['manifest.json', 'LICENSE', 'backend', 'frontend', 'fonts', 'icons', 'vendor'];

// Not loaded by the extension until the phone app ships. See syncSettings.js.
const DORMANT = [
  'backend/syncTransport.js',
  'frontend/syncClient.js',
  'frontend/syncProtocol.js',
  'frontend/syncSettings.js',
];

function main() {
  const target = process.argv[2];
  if (target !== 'store' && target !== 'github') {
    console.error('usage: node scripts/build.js store|github');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const store = target === 'store';

  let files = SHIPPED.flatMap(p => walk(path.join(ROOT, p)))
    .map(f => path.relative(ROOT, f).split(path.sep).join('/'));
  if (store) files = files.filter(f => !DORMANT.includes(f));
  if (target === 'github') files.push('README.md');

  checkReferences(files);

  const entries = files.map((name) => {
    let data = fs.readFileSync(path.join(ROOT, name));
    if (name === 'manifest.json' && store) {
      const m = { ...manifest };
      delete m.key;
      data = Buffer.from(JSON.stringify(m, null, 2) + '\n');
    }
    return { name: store ? name : 'scratch-dump/' + name, data };
  });

  fs.mkdirSync(DIST, { recursive: true });
  const out = path.join(DIST, 'scratch-dump-' + manifest.version + (store ? '-store' : '') + '.zip');
  fs.writeFileSync(out, zip(entries));

  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`${path.relative(ROOT, out)} — ${entries.length} files, ${kb} KB`);
}

/** Every file under a path, skipping dotfiles. */
function walk(p) {
  const stat = fs.statSync(p);
  if (stat.isFile()) return [p];
  return fs.readdirSync(p)
    .filter(n => !n.startsWith('.'))
    .sort()
    .flatMap(n => walk(path.join(p, n)));
}

/**
 * Fail the build rather than ship a package that cannot load: every script the
 * panel and the worker reach for has to be in it.
 */
function checkReferences(files) {
  const have = new Set(files);
  const missing = [];

  const html = fs.readFileSync(path.join(ROOT, 'frontend/panel.html'), 'utf8');
  for (const [, src] of html.matchAll(/<script\s+src="([^"]+)"/g)) {
    if (!have.has('frontend/' + src)) missing.push('frontend/panel.html → ' + src);
  }
  const worker = fs.readFileSync(path.join(ROOT, 'backend/background.js'), 'utf8');
  for (const [, src] of worker.matchAll(/importScripts\(\s*'\/?([^']+)'/g)) {
    if (!have.has(src)) missing.push('backend/background.js → ' + src);
  }
  if (missing.length) {
    console.error('Referenced but not packaged:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
}

// ─── ZIP ─────────────────────────────────────────────────────────────────────
// Just enough of the format for a release: deflate, no zip64, a fixed
// timestamp so the same tree always builds the same bytes.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const DOS_TIME = 0;            // 00:00:00
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // UTF-8 names
    local.writeUInt16LE(8, 8);            // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + packed.length;
  }

  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

main();
