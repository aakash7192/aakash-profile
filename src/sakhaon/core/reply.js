// Safe rendering of model replies. Pure: no DOM, no node:*.
// Rule: ALL input is HTML-escaped first; only an allowlisted Markdown subset is then
// turned into tags, so every emitted string is well-formed and contains no model-authored HTML.
import { getVerse, isValidRef } from './verses.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

// Placeholders use U+0000 delimiters, which are stripped from input first.
const PH = /\u0000(\d+)\u0000/g;

/** Inline Markdown on an already-escaped single block of text. */
function inline(escaped) {
  const store = [];
  const put = (html) => `\u0000${store.push(html) - 1}\u0000`;

  let s = escaped;
  // `code`
  s = s.replace(/`([^`\n]+)`/g, (_, c) => put(`<code>${c}</code>`));
  // [text](https://url) — https only; anything else stays literal (already escaped).
  s = s.replace(/\[([^\]\n\u0000]+)\]\((https:\/\/[^\s()<>\u0000]+)\)/g,
    (_, text, url) => put(`<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${emphasis(text)}</a>`));
  s = emphasis(s);

  // Restore (placeholders may nest).
  for (let i = 0; i < 5 && /\u0000\d+\u0000/.test(s); i++) s = s.replace(PH, (_, n) => store[Number(n)] ?? '');
  return s;

  function emphasis(t) {
    // **bold** (its content may itself contain *em*); em never spans placeholders.
    t = t.replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, (_, inner) => put(`<strong>${em(inner)}</strong>`));
    return em(t);
  }
  function em(t) {
    t = t.replace(/(^|[^*\w])\*(?=[^\s*])([^*\n\u0000]*?[^\s*])\*(?!\*)/g, (_, pre, inner) => `${pre}${put(`<em>${inner}</em>`)}`);
    t = t.replace(/(^|[^\w])_(?=[^\s_])([^_\n\u0000]*?[^\s_])_(?!\w)/g, (_, pre, inner) => `${pre}${put(`<em>${inner}</em>`)}`);
    return t;
  }
}

/**
 * Escape-first Markdown → HTML for the allowlisted subset:
 * paragraphs (single newline → <br>), **bold**, *em* / _em_, `code`, > blockquote,
 * - / * unordered lists, 1. ordered lists, #–### headings → <p><strong>…</strong></p>, https links.
 */
export function markdownToSafeHtml(md) {
  const src = String(md ?? '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const out = [];
  /** @type {{type:string, items:string[]}|null} */
  let block = null;

  const flush = () => {
    if (!block) return;
    const { type, items } = block;
    if (type === 'p') out.push(`<p>${items.map((l) => inline(escapeHtml(l))).join('<br>')}</p>`);
    else if (type === 'quote') out.push(`<blockquote><p>${items.map((l) => inline(escapeHtml(l))).join('<br>')}</p></blockquote>`);
    else if (type === 'ul' || type === 'ol') {
      const lis = items.map((l) => `<li>${l.split('\n').map((x) => inline(escapeHtml(x))).join('<br>')}</li>`).join('');
      out.push(`<${type}>${lis}</${type}>`);
    }
    block = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flush(); continue; }
    let m;
    if ((m = line.match(/^\s{0,3}#{1,3}\s+(.*)$/))) {
      flush();
      out.push(`<p><strong>${inline(escapeHtml(m[1].replace(/\s+#+$/, '')))}</strong></p>`);
      continue;
    }
    if ((m = line.match(/^\s{0,3}>\s?(.*)$/))) {
      if (block?.type !== 'quote') { flush(); block = { type: 'quote', items: [] }; }
      block.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\s{0,3}[-*+]\s+(.*)$/))) {
      if (block?.type !== 'ul') { flush(); block = { type: 'ul', items: [] }; }
      block.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\s{0,3}\d{1,3}[.)]\s+(.*)$/))) {
      if (block?.type !== 'ol') { flush(); block = { type: 'ol', items: [] }; }
      block.items.push(m[1]);
      continue;
    }
    if ((block?.type === 'ul' || block?.type === 'ol') && /^\s{2,}\S/.test(line)) {
      block.items[block.items.length - 1] += '\n' + line.trim(); // lazy continuation of a list item
      continue;
    }
    if (block?.type !== 'p') { flush(); block = { type: 'p', items: [] }; }
    block.items.push(line.trim());
  }
  flush();
  return out.join('');
}

const MARKER = /\[\[\s*BG\s+(\d{1,2})\.(\d{1,3})\s*\]\]/gi;

/**
 * Split a reply into safe HTML segments and verse markers.
 * @param {string} text
 * @param {{ streaming?: boolean }} [opts]
 */
export function parseReply(text, { streaming = false } = {}) {
  let src = String(text ?? '');
  if (streaming) {
    // Hold back a trailing, not-yet-closed marker or link: "[", "[[BG 2.4", "[[BG 2.47]".
    const m = src.match(/\[\[?[^\]\n]*$/) || src.match(/\[\[[^\]\n]*\]$/);
    if (m) src = src.slice(0, m.index);
  }
  const segments = [];
  const pushHtml = (chunk) => {
    if (!chunk.trim()) return;
    const html = markdownToSafeHtml(chunk);
    if (html) segments.push({ type: 'html', html });
  };
  let last = 0;
  MARKER.lastIndex = 0;
  let m;
  while ((m = MARKER.exec(src))) {
    pushHtml(src.slice(last, m.index));
    const chapter = Number(m[1]);
    const verse = Number(m[2]);
    const ref = `${chapter}.${verse}`;
    const data = getVerse(ref);
    const status = data ? 'resolved' : (isValidRef(chapter, verse) ? 'unverified' : 'invalid');
    segments.push({ type: 'verse', ref, chapter, verse, status, data: data || null });
    last = m.index + m[0].length;
  }
  pushHtml(src.slice(last));
  return segments;
}

/** Plain text for copy/export: markers → "BG c.v", Markdown stripped. */
export function plainText(text) {
  let s = String(text ?? '').replace(/\r\n?/g, '\n');
  s = s.replace(MARKER, (_, c, v) => `BG ${Number(c)}.${Number(v)}`);
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1 ($2)');
  s = s.replace(/^\s{0,3}#{1,3}\s+/gm, '');
  s = s.replace(/^\s{0,3}>\s?/gm, '');
  s = s.replace(/^(\s{0,3})[*+]\s+/gm, '$1- ');
  s = s.replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '$1');
  s = s.replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, '$1$2');
  s = s.replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, '$1$2');
  s = s.replace(/`([^`\n]+)`/g, '$1');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}
