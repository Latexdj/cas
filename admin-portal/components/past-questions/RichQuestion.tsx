// Shows question text with its images where the text says [image 1],
// [image 2] ([image] = [image 1]). Images no marker places go at the end.

import type { CSSProperties } from 'react';

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
