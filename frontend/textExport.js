// textExport.js — a folder as Markdown or plain text, for reading anywhere.
//
// One way only. These files are for people, not for importing back; the
// .scratch format in wireFormat.js is the one that round-trips.
//
// No storage and no chrome.* — transfer.js reads the folder and hands the pages
// over. DOMParser is the one browser API used: a stored page is the editor's
// HTML, and walking the parsed tree is the only honest way to read it.
'use strict';

const READABLE_REF_RE = /^idb:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// Everything else the editor can hold is inline. These start on a line of
// their own and end one.
const READABLE_BLOCKS = new Set([
  'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr',
  'ul', 'ol', 'li', 'table',
]);

// Blocks that need a blank line on each side. In Markdown a line straight
// after a list or a quote is read as part of its last item — the note's next
// line would land inside the list. A div is just a line, and keeps to one.
const READABLE_SEPARATE = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr', 'ul', 'ol', 'table',
]);

/**
 * Render one stored page.
 * @param {string} html — stored page HTML, idb: refs intact
 * @param {'md'|'txt'} mode
 * @param {Object<string,string>} ocrText — blob id -> recognized text
 * @returns {string} trimmed; '' for an empty page
 */
function readablePage(html, mode, ocrText) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const out = _readChildren(doc.body, { mode, ocrText: ocrText || {} });
  const text = out.replace(/\n{3,}/g, '\n\n').replace(/^\s*\n|\s+$/g, '');
  return mode === 'md' ? _hardBreaks(text) : text;
}

/**
 * A whole folder as one file.
 *
 * Page headings carry the number the panel shows, so "Page 3" here is Pg. 3
 * there even when an empty page in between is left out. A one-page folder gets
 * no page heading at all.
 *
 * @param {string} title
 * @param {string[]} pages
 * @param {'md'|'txt'} mode
 * @param {Object<string,string>} ocrText
 * @returns {string} '' when every page is empty
 */
function readableFolder(title, pages, mode, ocrText) {
  const parts = [];
  pages.forEach((html, i) => {
    const body = readablePage(html, mode, ocrText);
    if (!body) return;
    if (pages.length === 1) { parts.push(body); return; }
    const heading = 'Page ' + (i + 1);
    parts.push((mode === 'md' ? '## ' + heading : heading + '\n' + '-'.repeat(heading.length)) + '\n\n' + body);
  });
  if (!parts.length) return '';

  const date = new Date().toISOString().slice(0, 10);
  const head = mode === 'md'
    ? '# ' + title + '\n\n_Exported from ScratchDump on ' + date + '_'
    : title + '\n' + '='.repeat(title.length) + '\nExported from ScratchDump on ' + date;
  return head + '\n\n' + parts.join('\n\n') + '\n';
}

// ─── WALKER ──────────────────────────────────────────────────────────────────

function _readChildren(parent, ctx) {
  let out = '';
  const newline = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  const blankLine = () => { if (out) { newline(); if (!out.endsWith('\n\n')) out += '\n'; } };
  // Inside a list item a nested list stays tight: a blank line there would
  // turn the whole list loose and space every item apart.
  const block = (text, separate) => {
    const gap = separate && !ctx.inItem ? blankLine : newline;
    gap();
    out += text;
    gap();
  };

  for (const child of parent.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += _readText(child.nodeValue, ctx);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName.toLowerCase();

    if (tag === 'br') {
      // A <br> closing a line that already has content draws nothing. Only
      // one on an otherwise empty line — Chrome's <div><br></div> — is a line.
      if (!(child.previousSibling && !child.nextSibling)) out += '\n';
    } else if (tag === 'img') {
      block(_readImage(child, ctx), true);
    } else if (READABLE_BLOCKS.has(tag)) {
      block(_readBlock(child, tag, ctx), READABLE_SEPARATE.has(tag));
    } else {
      out += _readInline(child, tag, ctx);
    }
  }
  return out;
}

function _readText(text, ctx) {
  // The editor is white-space: pre-wrap, so newlines in text are real lines,
  // and runs of spaces arrive as no-break spaces.
  const s = text.replace(/ /g, ' ');
  // Raw HTML passes straight through Markdown, so a note about <div> would
  // lose the tag when rendered. Everything else is left as typed: people write
  // "- " and "**" into a scratchpad on purpose.
  return ctx.mode === 'md' ? s.replace(/</g, '\\<') : s;
}

function _readImage(img, ctx) {
  const m = READABLE_REF_RE.exec(img.getAttribute('src') || '');
  const text = m && ctx.ocrText[m[1].toLowerCase()];
  if (!text) return '[image]';
  return '[image]\n' + text.trim().split('\n').map(l => '> ' + l).join('\n');
}

function _readBlock(el, tag, ctx) {
  const md = ctx.mode === 'md';

  if (/^h[1-6]$/.test(tag)) {
    const text = _oneLine(_readChildren(el, ctx));
    if (!text) return '';
    return md ? '#'.repeat(Number(tag[1])) + ' ' + text : text;
  }
  if (tag === 'hr') return md ? '***' : '----------';
  if (tag === 'pre') {
    const code = el.textContent.replace(/ /g, ' ').replace(/\n+$/, '');
    return md ? '```\n' + code + '\n```' : code;
  }
  if (tag === 'blockquote') {
    return _trimEnd(_readChildren(el, ctx)).split('\n').map(l => '> ' + l).join('\n');
  }
  if (tag === 'ul' || tag === 'ol') return _readList(el, tag === 'ol', ctx);
  if (tag === 'li') return _readItem(el, '- ', ctx);
  if (tag === 'table') return _readTable(el, ctx);
  return _readChildren(el, ctx);   // div, p
}

function _readList(list, ordered, ctx) {
  const lines = [];
  let n = 1;
  for (const item of list.children) {
    lines.push(_readItem(item, ordered ? (n++) + '. ' : '- ', ctx));
  }
  return lines.join('\n');
}

/** A list item, with its continuation lines — nested lists included — indented under the marker. */
function _readItem(item, marker, ctx) {
  const pad = ' '.repeat(marker.length);
  return _trimEnd(_readChildren(item, { ...ctx, inItem: true })).split('\n')
    .map((l, i) => (i === 0 ? marker + l : (l ? pad + l : '')))
    .join('\n');
}

function _readTable(table, ctx) {
  const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
    Array.from(tr.children).map(cell => _oneLine(_readChildren(cell, ctx))));
  if (!rows.length) return '';

  if (ctx.mode !== 'md') return rows.map(r => r.join(' | ')).join('\n');

  const width = Math.max(...rows.map(r => r.length));
  const line = (r) => '| ' + Array.from({ length: width }, (_, i) =>
    (r[i] || '').replace(/\|/g, '\\|')).join(' | ') + ' |';
  return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n');
}

function _readInline(el, tag, ctx) {
  const inner = _readChildren(el, ctx);

  if (tag === 'a') {
    const href = (el.getAttribute('href') || '').trim();
    const linkable = /^(https?:|mailto:)/i.test(href);
    if (!linkable) return inner;
    if (ctx.mode !== 'md') return inner && inner !== href ? inner + ' (' + href + ')' : href;
    return '[' + (_oneLine(inner) || href) + '](' + href.replace(/\)/g, '%29') + ')';
  }
  if (ctx.mode !== 'md') return inner;

  if (tag === 'b' || tag === 'strong') return _wrapLines(inner, '**');
  if (tag === 'i' || tag === 'em') return _wrapLines(inner, '*');
  if (tag === 'code') {
    const code = el.textContent;
    const fence = code.includes('`') ? '``' : '`';
    return code ? fence + code + fence : '';
  }
  return inner;   // u, span, font, sub, sup — no Markdown for these
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Wrap each line in an emphasis marker. Emphasis cannot open on a space or
 * span a line, so the whitespace goes outside the markers and every line of
 * a bold run gets its own pair.
 */
function _wrapLines(text, mark) {
  return text.split('\n').map((line) => {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(line);
    return m[2] ? m[1] + mark + m[2] + mark + m[3] : line;
  }).join('\n');
}

function _oneLine(text) { return text.replace(/\s*\n\s*/g, ' ').trim(); }

function _trimEnd(text) { return text.replace(/\n+$/, ''); }

/**
 * Keep the note's line breaks. Markdown joins consecutive lines into one
 * paragraph, which would run a list of notes together into a single line; two
 * trailing spaces make each break a hard one. Fenced code is left as it is.
 */
function _hardBreaks(text) {
  const lines = text.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    const next = lines[i + 1];
    if (lines[i].trim() && next !== undefined && next.trim() && !next.startsWith('```')) {
      lines[i] += '  ';
    }
  }
  return lines.join('\n');
}
