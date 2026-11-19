// Shows question text with its images where the text says [image 1],
// [image 2] ([image] = [image 1]). Images no marker places go at the end.

import type { CSSProperties } from 'react';
import { isRich } from '@/lib/richText';

const MARKER = /\[image(?:\s+(\d+))?\]/gi;

export type Part = { kind: 'text'; text: string } | { kind: 'image'; n: number };

export function splitMarkers(text: string, imageCount: number, elsewhere?: string | null): { parts: Part[]; unplaced: number[] } {
  const parts: Part[] = [];
  const used = new Set<number>();
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    const n = m[1] ? parseInt(m[1], 10) : 1;
    const before = text.slice(last, m.index).replace(/\n+$/, '');
    if (before.trim()) parts.push({ kind: 'text', text: before.replace(/^\n+/, '') });
    if (n >= 1 && n <= imageCount) { parts.push({ kind: 'image', n }); used.add(n); }
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = text.slice(last).replace(/^\n+/, '');
  if (rest.trim()) parts.push({ kind: 'text', text: rest });
  // Pictures placed in other text (the marking scheme) aren't "unplaced".
  for (const m of (elsewhere ?? '').matchAll(MARKER)) used.add(m[1] ? parseInt(m[1], 10) : 1);
  const unplaced = Array.from({ length: imageCount }, (_, i) => i + 1).filter(n => !used.has(n));
  return { parts, unplaced };
}

/** Puts "[image N]" on its own line at the cursor position. */
export function insertMarker(text: string, pos: number, n: number) {
  const before = text.slice(0, pos), after = text.slice(pos);
  const marker = `[image ${n}]`;
  const pre = before && !before.endsWith('\n') ? '\n' : '';
  const post = after && !after.startsWith('\n') ? '\n' : '';
  return { text: before + pre + marker + post + after, cursor: (before + pre + marker).length };
}

/** Mirror of the server's renumbering when image `removed` is deleted. */
export function renumberMarkers(text: string, removed: number) {
  return text.replace(MARKER, (_, n) => {
    const k = n ? parseInt(n, 10) : 1;
    if (k === removed) return '';
    return k > removed ? `[image ${k - 1}]` : `[image ${k}]`;
  }).replace(/\n{3,}/g, '\n\n').trim();
}

export function RichQuestion({ text, images, textStyle, imageStyle, className, textClassName, imageClassName, showUnplaced = true, placedElsewhere }: {
  text: string; images: string[];
  /** Other text whose [image N] markers also count as placed, e.g. the marking scheme. */
  placedElsewhere?: string | null;
  textStyle?: CSSProperties; imageStyle?: CSSProperties;
  className?: string; textClassName?: string; imageClassName?: string;
  showUnplaced?: boolean;
}) {
  // Rich text (HTML from the editor, cleaned by the server): pictures go where
  // its [image N] markers are, inside the formatted text.
  if (isRich(text)) {
    const { unplaced } = splitMarkers(text, images.length, placedElsewhere);
    const attr = (u: string) => u.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const html = text.replace(MARKER, (all, n) => {
      const k = n ? parseInt(n, 10) : 1;
      const url = images[k - 1];
      return url ? `<img src="${attr(url)}" alt="Figure ${k}" class="cas-fig" />` : '';
    });
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className={`cas-rich ${textClassName ?? ''}`} style={textStyle} dangerouslySetInnerHTML={{ __html: html }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {showUnplaced && unplaced.map(n => <img key={`u${n}`} src={images[n - 1]} alt={`Figure ${n}`} className={imageClassName}
          style={{ display: 'block', maxWidth: '100%', maxHeight: 320, objectFit: 'contain', background: '#fff', borderRadius: 8, ...imageStyle }} />)}
        <style>{RICH_CSS}</style>
      </div>
    );
  }
  const { parts, unplaced } = splitMarkers(text, images.length, placedElsewhere);
  const img = (n: number, key: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={key} src={images[n - 1]} alt={`Figure ${n}`} className={imageClassName}
      style={{ display: 'block', maxWidth: '100%', maxHeight: 320, objectFit: 'contain', background: '#fff', borderRadius: 8, ...imageStyle }} />
  );
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {parts.map((p, i) => p.kind === 'text'
        ? <p key={i} className={textClassName} style={{ margin: 0, whiteSpace: 'pre-wrap', ...textStyle }}>{p.text}</p>
        : img(p.n, `m${i}`))}
      {showUnplaced && unplaced.map(n => img(n, `u${n}`))}
    </div>
  );
}

// Formatted question text: tables with ruled cells, lists, pictures.
export const RICH_CSS = `
.cas-rich { line-height: 1.55; overflow-wrap: anywhere; }
.cas-rich p { margin: 0 0 6px; }
.cas-rich p:last-child { margin-bottom: 0; }
.cas-rich ul, .cas-rich ol { margin: 0 0 6px; padding-left: 22px; }
.cas-rich table { border-collapse: collapse; margin: 6px 0 8px; max-width: 100%; display: block; overflow-x: auto; }
.cas-rich th, .cas-rich td { border: 1px solid currentColor; border-color: rgba(127,127,127,0.5); padding: 5px 9px; vertical-align: top; text-align: left; }
.cas-rich th { font-weight: 700; background: rgba(127,127,127,0.12); }
.cas-rich img.cas-fig { display: block; max-width: 100%; max-height: 320px; object-fit: contain; background: #fff; border-radius: 8px; margin: 6px 0; }
`;
