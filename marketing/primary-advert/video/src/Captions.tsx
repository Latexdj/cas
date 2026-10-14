import React from 'react';
import { AbsoluteFill } from 'remotion';
import data from './data.json';
import { C, FONT, clamp01, easeOut } from './theme';

type Word = { word: string; start: number; end: number };
type Page = { words: Word[]; start: number; end: number };

const MAX_CHARS = 30;
// The opening and closing cards already show their lines as on-screen
// type, so they get no caption box.
const NO_CAPTION = new Set(['hook', 'cta']);

function buildPages(): Page[] {
  const pages: Page[] = [];
  for (const scene of (data as any).timeline.scenes) {
    if (NO_CAPTION.has(scene.id)) continue;
    for (const line of scene.lines) {
      const words: Word[] = line.words.map((w: Word) => ({ word: w.word, start: line.start + w.start, end: line.start + w.end }));
      let cur: Word[] = [];
      const flush = () => { if (cur.length) pages.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; };
      words.forEach((w, i) => {
        const len = cur.map(x => x.word).join(' ').length;
        if (cur.length && len + 1 + w.word.length > MAX_CHARS) flush();
        cur.push(w);
        // Prefer to break after punctuation once a page has some length.
        if (/[,.:;?!]$/.test(w.word) && cur.map(x => x.word).join(' ').length > 14 && i < words.length - 1) flush();
      });
      flush();
    }
  }
  // Each page stays up until the next one starts (or briefly after its last word).
  pages.forEach((p, i) => {
    const next = pages[i + 1];
    p.end = next ? Math.min(next.start, p.end + 0.6) : p.end + 0.6;
  });
  return pages;
}

const PAGES = buildPages();

export const Captions: React.FC<{ time: number }> = ({ time }) => {
  const page = PAGES.find(p => time >= p.start - 0.08 && time < p.end);
  if (!page) return null;
  const k = clamp01((time - (page.start - 0.08)) / 0.18);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 330 }}>
      <div style={{
        maxWidth: 860, padding: '20px 30px 22px', borderRadius: 26,
        background: 'rgba(7,42,32,0.9)', boxShadow: '0 18px 50px rgba(0,0,0,0.35)', border: '1.5px solid rgba(232,184,92,0.25)',
        fontFamily: FONT, fontWeight: 700, fontSize: 56, lineHeight: 1.22, letterSpacing: -0.5, textAlign: 'center',
        opacity: k, transform: `translateY(${(1 - easeOut(k)) * 18}px) scale(${0.96 + 0.04 * easeOut(k)})`,
      }}>
        {page.words.map((w, i) => {
          const active = time >= w.start && time < w.end + 0.05;
          const spoken = time >= w.start;
          return (
            <span key={i} style={{ color: active ? C.goldLight : spoken ? '#FFFFFF' : 'rgba(255,255,255,0.55)' }}>
              {w.word}{i < page.words.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
