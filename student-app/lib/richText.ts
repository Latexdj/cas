// Rich question text: the small HTML subset the CAS editors write (see the
// backend's utils/rich-text.js), parsed into a tree the app renders with
// native views (components/RichText.tsx). Plain text is not rich.

export type RichNode =
  | { kind: 'text'; text: string }
  | { kind: 'image'; n: number }
  | { kind: 'el'; tag: string; colspan: number; children: RichNode[] };

export function isRich(s: string | null | undefined): s is string {
  return typeof s === 'string' && /^\s*<(p|ul|ol|table|div|h[1-6]|blockquote)[\s>]/i.test(s);
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', cent: '¢', pound: '£', euro: '€',
  times: '×', divide: '÷', deg: '°', plusmn: '±', micro: 'µ', middot: '·', frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³',
};
export const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (all, e: string) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : all;
  }
  return ENTITIES[e.toLowerCase()] ?? all;
});

const KNOWN = new Set(['p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'br']);
const RENAME: Record<string, string> = { b: 'strong', i: 'em', div: 'p' };
const MARKER = /\[image(?:\s+(\d+))?\]/gi;

/** Parses rich text into a tree; [image N] markers become image nodes. */
export function parseRich(html: string): RichNode[] {
  const root: RichNode & { kind: 'el' } = { kind: 'el', tag: 'root', colspan: 1, children: [] };
  const stack: (RichNode & { kind: 'el' })[] = [root];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  const top = () => stack[stack.length - 1];
  const addText = (t: string) => {
    let last = 0;
    for (const mm of t.matchAll(MARKER)) {
      if ((mm.index ?? 0) > last) top().children.push({ kind: 'text', text: decode(t.slice(last, mm.index)) });
      top().children.push({ kind: 'image', n: mm[1] ? parseInt(mm[1], 10) : 1 });
      last = (mm.index ?? 0) + mm[0].length;
    }
    if (last < t.length) top().children.push({ kind: 'text', text: decode(t.slice(last)) });
  };
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) { addText(m[4]); continue; }
    const closing = m[1] === '/';
    let tag = m[2].toLowerCase();
    tag = RENAME[tag] ?? tag;
    if (!KNOWN.has(tag)) continue;
    if (tag === 'br') { top().children.push({ kind: 'text', text: '\n' }); continue; }
    if (closing) {
      // Close up to the matching open tag (tolerates sloppy nesting).
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === tag) { stack.length = k; break; }
      continue;
    }
    const span = Number((m[3] || '').match(/colspan\s*=\s*["']?(\d+)/i)?.[1] || 1);
    const el: RichNode & { kind: 'el' } = { kind: 'el', tag, colspan: Math.max(1, Math.min(10, span)), children: [] };
    top().children.push(el);
    stack.push(el);
  }
  return root.children;
}

/** Image numbers placed by markers in rich text. */
export function placedImages(nodes: RichNode[], out = new Set<number>()): Set<number> {
  for (const n of nodes) {
    if (n.kind === 'image') out.add(n.n);
    else if (n.kind === 'el') placedImages(n.children, out);
  }
  return out;
}

/** All the text, for widths and screen readers. */
export function textOf(nodes: RichNode[]): string {
  return nodes.map(n => (n.kind === 'text' ? n.text : n.kind === 'el' ? textOf(n.children) : '')).join('');
}

const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
const SUB: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎' };
/** x² and H₂O as single characters when every character has one; null otherwise. */
export function scriptChars(text: string, kind: 'sup' | 'sub'): string | null {
  const map = kind === 'sup' ? SUP : SUB;
  const chars = [...text];
  return chars.length && chars.every(c => map[c]) ? chars.map(c => map[c]).join('') : null;
}
