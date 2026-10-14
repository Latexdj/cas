import React from 'react';
import { AbsoluteFill } from 'remotion';
import data from './data.json';
import { C, FONT, MONO, clamp01, easeInOut, easeOut } from './theme';

type Line = { start: number; duration: number; text: string; words: { word: string; start: number }[] };
const scene = (data as any).timeline.scenes.find((s: any) => s.id === 'hook');
const lines = scene.lines as Line[];
const wordAt = (li: number, w: string) => {
  const l = lines[li];
  const x = l.words.find(x => x.word.toLowerCase().startsWith(w.toLowerCase()));
  return l.start + (x ? x.start : 0);
};

const ACCENT: Record<number, string[]> = { 0: ['week.'], 1: ['every', 'office'], 3: ['lost', 'forms,'] };
const ROWS = ['Library', 'Science Laboratory', 'Sports Department', 'Dining Hall', 'Stores', 'Housemaster', 'Senior Housemaster', 'Head of Department'];
// Rows signed on the paper form as line 3 names them.
const SIGNED: Record<string, string> = { Library: 'Library.', 'Science Laboratory': 'Labs.', 'Dining Hall': 'Dining', Housemaster: 'Housemaster.' };

const Headline: React.FC<{ idx: number; time: number }> = ({ idx, time }) => {
  const line = lines[idx];
  const next = lines[idx + 1];
  const exit = next ? clamp01((time - (next.start - 0.2)) / 0.3) : 0;
  const size = idx === 1 ? 74 : 108;
  return (
    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: -size * 0.035, color: C.forest, opacity: 1 - exit, transform: `translateY(${-exit * 30}px)` }}>
      {line.words.map((w, i) => {
        const k = clamp01((time - (line.start + w.start - 0.06)) / 0.3);
        const accent = ACCENT[idx]?.includes(w.word.toLowerCase()) || ACCENT[idx]?.includes(w.word);
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: size * 0.08, marginRight: size * 0.24 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - easeOut(k)) * 105}%)`, color: accent ? C.gold : C.forest }}>{w.word}</span>
          </span>
        );
      })}
    </div>
  );
};

// A quick scrawled signature, drawn on as it's "signed".
const Signature: React.FC<{ k: number; seed: number }> = ({ k, seed }) => {
  const pts: string[] = [];
  for (let i = 0; i <= 14; i++) {
    const x = i * 13;
    const y = 18 + Math.sin(i * 1.7 + seed) * 11 + (i % 3 === 0 ? -6 : 4);
    pts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y.toFixed(1)}`);
  }
  pts.push('M 4 30 L 176 24');
  const len = 520;
  return (
    <svg width={190} height={40} viewBox="0 0 190 40" style={{ position: 'absolute', left: 300, top: -6 }}>
      <path d={pts.join(' ')} fill="none" stroke="#1F3F8F" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - k)} />
    </svg>
  );
};

const Form: React.FC<{ time: number; depth: number; blank?: boolean }> = ({ time, depth, blank }) => (
  <div style={{ width: 800, padding: '38px 44px 34px', background: '#FFFEFA', borderRadius: 6, boxShadow: '0 22px 60px rgba(28,18,8,0.22), 0 2px 0 rgba(0,0,0,0.04)', fontFamily: MONO, color: C.ink }}>
    <div style={{ textAlign: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 24, letterSpacing: 3, color: C.forest }}>AKWAABA SENIOR HIGH SCHOOL</div>
    <div style={{ textAlign: 'center', fontFamily: FONT, fontWeight: 600, fontSize: 21, letterSpacing: 4, color: C.muted, marginTop: 6 }}>STUDENT CLEARANCE FORM</div>
    <div style={{ display: 'flex', gap: 30, marginTop: 26, fontSize: 21 }}>
      <span>Name: ____________________</span><span>Class: ______</span>
    </div>
    <div style={{ marginTop: 22, borderTop: `2px solid ${C.ink}` }}>
      {ROWS.map((r, i) => {
        const word = SIGNED[r];
        const k = !blank && word && depth === 0 ? easeInOut(clamp01((time - (wordAt(2, word) + 0.05)) / 0.45)) : 0;
        const q = blank && !word ? easeOut(clamp01((time - (wordAt(3, 'nobody') + i * 0.08)) / 0.3)) : 0;
        return (
          <div key={r} style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 62, borderBottom: '1.5px solid #D9CFBF', fontSize: 22 }}>
            <span style={{ width: 290 }}>{r}</span>
            <span style={{ flex: 1, borderBottom: '1.5px dashed #B9AE9C', height: 26, marginRight: 24 }} />
            <span style={{ width: 90, color: C.muted, fontSize: 18 }}>Date</span>
            {k > 0 && <Signature k={k} seed={i * 1.3} />}
            {blank && (word || q > 0) && (
              word ? <Signature k={1} seed={i * 1.3} />
                : <span style={{ position: 'absolute', left: 360, top: 6, width: 48, height: 48, borderRadius: 24, border: '4px solid #B83232', color: '#B83232', fontFamily: FONT, fontWeight: 900, fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.4 + 0.6 * q}) rotate(-8deg)`, opacity: q }}>?</span>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

export const Hook: React.FC<{ time: number }> = ({ time }) => {
  const idx = lines.reduce((a, l, i) => (time >= l.start - 0.1 ? i : a), 0);
  const formIn = easeOut(clamp01((time - (lines[1].start + 0.4)) / 0.7));
  const pile = easeInOut(clamp01((time - (wordAt(3, 'queues') - 0.2)) / 0.6));
  const lost = easeInOut(clamp01((time - (wordAt(3, 'lost') - 0.05)) / 0.8));
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <div style={{ position: 'absolute', top: 210, left: 84, fontFamily: FONT, fontWeight: 600, fontSize: 28, letterSpacing: 5, color: C.gold, opacity: clamp01(time / 0.6) }}>
        STUDENT CLEARANCE
      </div>
      <div style={{ position: 'absolute', top: 280, left: 84, right: 84 }}>
        <Headline idx={idx} time={time} />
      </div>

      {/* The paper form, then a pile of them, then one gone missing. */}
      <div style={{ position: 'absolute', left: 140, top: 820, opacity: formIn, transform: `translateY(${(1 - formIn) * 160}px)` }}>
        {[2, 1].map(d => (
          <div key={d} style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${pile * d * 26}px, ${pile * d * -22}px) rotate(${-2.5 + pile * d * 3.2}deg)`, opacity: pile }}>
            <Form time={time} depth={d} blank />
          </div>
        ))}
        <div style={{ position: 'relative', transform: `translate(${lost * 980}px, ${lost * -120}px) rotate(${-2.5 + lost * 24}deg)`, opacity: 1 - lost * 0.9 }}>
          <Form time={time} depth={0} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
