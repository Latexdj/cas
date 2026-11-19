// The AI drafting assistant (letter-chat) returns plain text, but letter
// bodies are now rich HTML edited in RichTextEditor — convert a draft into
// basic paragraphs before it lands in the editor, so blank-line-separated
// paragraphs survive as real <p> breaks instead of collapsing into one run
// of text the way raw newlines do in HTML.
// TipTap's getHTML() on an empty editor returns "<p></p>", not "" — a
// plain .trim() check on that string is truthy, so "is the body empty"
// validation needs to look at the text after stripping tags, not the raw
// HTML string.
export function isHtmlEmpty(html: string): boolean {
  return !html || html.replace(/<[^>]*>/g, '').trim().length === 0;
}

export function plainTextToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// Rich question text in the browser: the same rules as the backend's
// utils/rich-text.js (rich text is HTML starting with a block tag; anything
// else is plain text).
export function isRich(s: string | null | undefined): boolean {
  return typeof s === 'string' && /^\s*<(p|ul|ol|table|div|h[1-6]|blockquote)[\s>]/i.test(s);
}

/** Text without formatting, for short labels and search. */
export function plainOf(s: string | null | undefined): string {
  if (!s) return '';
  if (!isRich(s)) return s;
  const el = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (!el) return s.replace(/<[^>]+>/g, ' ');
  el.innerHTML = s.replace(/<\/(p|li|tr)>/gi, '</$1>\n').replace(/<\/(td|th)>/gi, '</$1> ');
  return (el.textContent || '').replace(/[ \t]+\n/g, '\n').trim();
}
