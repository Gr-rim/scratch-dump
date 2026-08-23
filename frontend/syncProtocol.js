// syncProtocol.js — how the extension and the phone talk.
//
// Pure, like wireFormat.js: no storage, no DOM, no chrome.*, no node builtins.
// It runs unchanged in the extension panel, in the phone app, and in Node —
// which is what lets one implementation be tested without a device.
//
// The shape of the thing:
//
//   GET  /hello   unauthenticated. Returns the protocol version, a salt, and a
//                 device name. Harmless to serve to anyone: the salt is public
//                 by design and useless without the pairing code.
//   POST /rpc     everything else. The body is an encrypted envelope; the
//                 method is inside it, so the URL leaks nothing — not even
//                 which folders exist.
//
// Authentication is a consequence rather than a separate mechanism. AES-GCM is
// authenticated encryption, so a peer with the wrong pairing code produces a
// payload whose tag does not verify, and decryption fails. There is no password
// to compare and no token to leak in a log.
'use strict';

const SYNC_PROTOCOL_VERSION = 1;

// The pairing code is typed by a person, so it is short and drawn from an
// alphabet with no characters that can be misread — no 0/O, no 1/I/L.
const PAIR_ALPHABET   = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PAIR_CODE_LEN   = 8;

// ~41 bits of entropy in the code itself, which is not much. PBKDF2 at this
// cost makes an offline guess expensive, and the server is only listening while
// the user has sync switched on — the two together are what make a
// hand-typeable code defensible.
const PBKDF2_ITERATIONS = 250000;

// A message older than this is refused, so a captured envelope cannot be
// replayed later. Both machines are on the same LAN, so a minute is generous.
const MAX_SKEW_MS = 60000;

// ─── ENCODING ────────────────────────────────────────────────────────────────

function _b64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function _unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function _utf8(str)   { return new TextEncoder().encode(str); }
function _unutf8(buf) { return new TextDecoder().decode(buf); }

// ─── PAIRING ─────────────────────────────────────────────────────────────────

/**
 * A fresh pairing code, for the phone to display.
 * @returns {string} e.g. "K7RM2XPH"
 */
function syncNewPairingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(PAIR_CODE_LEN));
  let out = '';
  // Modulo bias is negligible here: 256 % 31 leaves a skew far below what
  // matters against a code that lives for minutes behind a 250k-round KDF.
  for (let i = 0; i < PAIR_CODE_LEN; i++) out += PAIR_ALPHABET[bytes[i] % PAIR_ALPHABET.length];
  return out;
}

/** A fresh salt, for the phone to generate once per pairing. */
function syncNewSalt() {
  return _b64(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Normalise what a person typed: lowercase, and pasted with spaces or dashes.
 *
 * Anything outside the alphabet is dropped rather than guessed at. The
 * alphabet already excludes every character pair that gets misread — 0/O,
 * 1/I/L — so a stray one of those means the code was read wrong, and there is
 * no honest way to recover which character was intended. Guessing would
 * produce a key that fails to decrypt anyway, with a worse error.
 *
 * @param {string} code
 * @returns {string} only characters from PAIR_ALPHABET
 */
function syncNormalizeCode(code) {
  const up = String(code || '').toUpperCase();
  let out = '';
  for (const ch of up) if (PAIR_ALPHABET.includes(ch)) out += ch;
  return out;
}

/**
 * Derive the shared key from a pairing code and the salt from /hello.
 *
 * @param {string} code — as typed
 * @param {string} saltB64 — from the peer's /hello
 * @returns {Promise<CryptoKey>}
 */
async function syncDeriveKey(code, saltB64) {
  const normalized = syncNormalizeCode(code);
  if (!normalized) throw new Error('Enter the pairing code shown on your phone.');
  // A wrong length is not rejected here on purpose: a short code simply
  // derives a key that fails to decrypt, and that path already produces the
  // right message. One way to be wrong is easier to reason about than two.

  const material = await crypto.subtle.importKey(
    'raw', _utf8(normalized), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: _unb64(saltB64), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── ENVELOPES ───────────────────────────────────────────────────────────────

/**
 * Wrap a message for the wire.
 *
 * @param {CryptoKey} key
 * @param {Object} payload — { method, params } or { ok, result }
 * @returns {Promise<{v:number, iv:string, ct:string}>}
 */
async function syncSeal(key, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = JSON.stringify({ ...payload, ts: Date.now() });
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, _utf8(body)
  );
  return { v: SYNC_PROTOCOL_VERSION, iv: _b64(iv), ct: _b64(ct) };
}

/**
 * Unwrap a message, or throw something a person can act on.
 *
 * A failed tag check is overwhelmingly "wrong pairing code" rather than
 * tampering, so that is what it says.
 *
 * @param {CryptoKey} key
 * @param {{v:number, iv:string, ct:string}} env
 * @returns {Promise<Object>}
 */
async function syncOpen(key, env) {
  if (!env || typeof env !== 'object') throw new Error('The other device sent something unreadable.');
  if (env.v !== SYNC_PROTOCOL_VERSION) {
    throw new Error('The two devices are running different versions of ScratchDump. Update both.');
  }
  if (typeof env.iv !== 'string' || typeof env.ct !== 'string') {
    throw new Error('The other device sent something unreadable.');
  }

  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: _unb64(env.iv) }, key, _unb64(env.ct)
    );
  } catch {
    throw new Error('Wrong pairing code, or the code has changed. Check the phone and try again.');
  }

  let msg;
  try { msg = JSON.parse(_unutf8(plain)); }
  catch { throw new Error('The other device sent something unreadable.'); }

  // Decryption already proves the sender had the key. This only limits how long
  // a captured envelope stays useful.
  if (typeof msg.ts !== 'number' || Math.abs(Date.now() - msg.ts) > MAX_SKEW_MS) {
    throw new Error('That message was too old to trust. Check both devices agree on the time.');
  }
  return msg;
}

// ─── METHODS ─────────────────────────────────────────────────────────────────
// Named here so both ends fail loudly on a typo rather than silently 404ing.

const SYNC_METHODS = Object.freeze({
  LIST: 'list',    // params: {}            -> { folders: [{key,name,kind,pages,updatedAt}] }
  PULL: 'pull',    // params: { key }       -> { export: <wireFormat object> }
  PUSH: 'push',    // params: { export }    -> { key, pages, images }
});

/**
 * Validate an inbound request before acting on it. The sender is authenticated
 * by this point, but authenticated is not the same as correct.
 *
 * @param {Object} msg — from syncOpen()
 * @returns {{method:string, params:Object}}
 */
function syncValidateRequest(msg) {
  const method = msg && msg.method;
  if (!Object.values(SYNC_METHODS).includes(method)) {
    throw new Error('Unknown request: ' + String(method));
  }
  const params = (msg.params && typeof msg.params === 'object') ? msg.params : {};

  if (method === SYNC_METHODS.PULL && typeof params.key !== 'string') {
    throw new Error('pull needs a folder key.');
  }
  if (method === SYNC_METHODS.PUSH && (!params.export || typeof params.export !== 'object')) {
    throw new Error('push needs a folder.');
  }
  return { method, params };
}

/**
 * Shape of /hello. Unauthenticated, so it says as little as possible — a
 * version, a salt that is useless alone, and a name for the user to recognise.
 *
 * @param {string} saltB64 @param {string} device
 */
function syncHello(saltB64, device) {
  return { v: SYNC_PROTOCOL_VERSION, salt: saltB64, device: String(device || 'Phone').slice(0, 40) };
}

/**
 * @param {any} hello
 * @returns {{v:number, salt:string, device:string}}
 */
function syncValidateHello(hello) {
  if (!hello || typeof hello !== 'object' || typeof hello.salt !== 'string') {
    throw new Error("That address answered, but it isn't ScratchDump.");
  }
  if (hello.v !== SYNC_PROTOCOL_VERSION) {
    throw new Error('The two devices are running different versions of ScratchDump. Update both.');
  }
  return { v: hello.v, salt: hello.salt, device: String(hello.device || 'Phone') };
}

// Loadable both as a plain script (extension panel, phone app) and by Node,
// which is what lets the reference server and the tests share this exact file.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SYNC_PROTOCOL_VERSION, SYNC_METHODS, PAIR_ALPHABET, PAIR_CODE_LEN,
    syncNewPairingCode, syncNewSalt, syncNormalizeCode, syncDeriveKey,
    syncSeal, syncOpen, syncValidateRequest, syncHello, syncValidateHello,
  };
}
