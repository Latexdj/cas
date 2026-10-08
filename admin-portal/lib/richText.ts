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
