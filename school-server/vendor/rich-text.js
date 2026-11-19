// Rich question text: a small, safe subset of HTML.
//
// Questions, options, explanations, marking schemes and shared information
// may be written with formatting (bold, italic, underline, sub/superscript),
// lists and tables. They are stored as HTML limited to the tags below, with
// pictures still placed by [image N] markers in the text. Plain text (every
// question written before this) is still valid and stays as it is.
//
// The same file is used by the CAS School Server (vendor/rich-text.js), so
// keep it free of dependencies.

const BLOCK = ['p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];
const INLINE = ['strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'br'];
const ALLOWED = new Set([...BLOCK, ...INLINE]);
const VOID = new Set(['br']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'head', 'title']);
const RENAME = { b: 'strong', i: 'em', div: 'p', h1: 'p', h2: 'p', h3: 'p', h4: 'p', h5: 'p', h6: 'p', blockquote: 'p' };

/** True when the text is rich (HTML) rather than plain text. */
function isRich(s) {
  return typeof s === 'string' && /^\s*<(p|ul|ol|table|div|h[1-6]|blockquote)[\s>]/i.test(s);
}

const escapeText = (s) => String(s).replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Keeps only the allowed tags (no attributes, except colspan/rowspan on
 * table cells); everything else is dropped, its text kept. Plain text is
 * returned unchanged.
 */
function sanitize(input) {
  if (input == null) return input;
  const s = String(input);
  if (!isRich(s)) return s;
  let out = '';
  let skip = null;   // inside a tag whose content is dropped
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(s))) {
    const [all, tagName, attrs, text] = m;
    if (all.startsWith('<!--')) continue;
    if (text !== undefined || all === '<') {
      if (!skip) out += escapeText(text ?? '&lt;');
      continue;
    }
    const closing = all.startsWith('</');
    let tag = tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) { if (!closing && !/\/>$/.test(all)) skip = skip || tag; else if (closing && skip === tag) skip = null; continue; }
    if (skip) continue;
    tag = RENAME[tag] || tag;
    if (!ALLOWED.has(tag)) continue;
    if (closing) { if (!VOID.has(tag)) out += `</${tag}>`; continue; }
    let keep = '';
    if (tag === 'td' || tag === 'th') {
      for (const a of ['colspan', 'rowspan']) {
        const v = (attrs || '').match(new RegExp(`${a}\\s*=\\s*["']?(\\d{1,2})`, 'i'));
        if (v && Number(v[1]) > 1) keep += ` ${a}="${Number(v[1])}"`;
      }
    }
    out += `<${tag}${keep}>`;
  }
  return out.trim();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', cent: '¢', pound: '£', euro: '€', times: '×', divide: '÷', deg: '°', plusmn: '±', micro: 'µ', middot: '·', frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³' };
const decode = (s) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (all, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : all; }
  return ENTITIES[e.toLowerCase()] ?? all;
});
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎' };
const script = (t, map, mark) => ([...t].every(c => map[c]) ? [...t].map(c => map[c]).join('') : `${mark}(${t})`);

/**
 * The same content as plain text, for apps that show text only: paragraphs
 * and list items on their own lines, table cells spaced out, H₂O and x²
 * written with Unicode where possible.
 */
function toPlain(input) {
  if (input == null) return input;
  const s = String(input);
  if (!isRich(s)) return s;
  // A table cell's own paragraphs (the editor puts one in each cell) stay on one line.
  let t = s.replace(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (_, tag, attrs, inner) => `<${tag}${attrs}>${inner.replace(/<\/?p>/gi, ' ').trim()}</${tag}>`)
    .replace(/<sup>([\s\S]*?)<\/sup>/gi, (_, x) => script(decode(x.replace(/<[^>]+>/g, '')), SUP, '^'))
    .replace(/<sub>([\s\S]*?)<\/sub>/gi, (_, x) => script(decode(x.replace(/<[^>]+>/g, '')), SUB, '_'));
  // Ordered lists: number their items.
  t = t.replace(/<ol>([\s\S]*?)<\/ol>/gi, (_, inner) => { let k = 0; return inner.replace(/<li>/gi, () => `\n${++k}. `); });
  t = t
    .replace(/<li>/gi, '\n• ')
    .replace(/<\/(td|th)>\s*(?=<(td|th)[ >])/gi, '    ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|ul|ol|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(t).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Text that is mostly plain but uses a few tags (a <table>, H<sub>2</sub>O,
 * <strong>), as the AI reader writes it, made into rich text: plain lines
 * become paragraphs, tables stay tables. Text with no tags is left plain.
 */
function asRich(input) {
  if (input == null) return input;
  const s = String(input).trim();
  if (isRich(s)) return sanitize(s);
  if (!/<(table|sub|sup|strong|em|b|i|u|ul|ol)\b/i.test(s)) return s;
  const parts = s.split(/(<table[\s\S]*?<\/table>|<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>)/i);
  const html = parts.map(p => (/^<(table|ul|ol)/i.test(p) ? p
    : p.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => `<p>${l}</p>`).join(''))).join('');
  return sanitize(html);
}

module.exports = { isRich, sanitize, toPlain, asRich };
