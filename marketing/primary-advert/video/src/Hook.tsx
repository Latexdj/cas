import React from 'react';
import { AbsoluteFill } from 'remotion';
import data from './data.json';
import { C, FONT, MONO, clamp01, easeOut } from './theme';

type Line = { start: number; duration: number; text: string; words: { word: string; start: number }[] };
const scene = (data as any).timeline.scenes.find((s: any) => s.id === 'hook');
const lines = scene.lines as Line[];
const wordAt = (li: number, w: string) => {
  const l = lines[li];
  const x = l.words.find(x => x.word.toLowerCase().startsWith(w.toLowerCase()));
  return l.start + (x ? x.start : 0);
};

const ACCENT: Record<number, string[]> = { 0: ['paper.'], 1: ['hand.'], 2: ['every', 'child.'] };
const INK = '#1F3F8F';
const RED = '#B83232';
const DAYS = ['M', 'T', 'W', 'T', 'F'];
// A page of a class register and mark book. Every name and mark is made up.
const ROWS: [string, string, number[], number][] = [
  ['Ama Mensah', 'vvvvv', [8, 7, 9], 24],
  ['Kofi Boateng', 'vvavv', [6, 7, 5], 18],
  ['Esi Appiah', 'vvvvv', [9, 9, 8], 26],
  ['Yaw Darko', 'vvvlv', [5, 6, 7], 18],
  ['Abena Owusu', 'vvvvv', [7, 8, 8], 23],
  ['Kwame Addo', 'avvvv', [6, 5, 6], 17],
];
const SUBJECTS: [string, number, string][] = [
  ['English Language', 68, 'B3'], ['Mathematics', 74, 'B2'], ['Science', 81, 'A1'],
  ['Creative Arts', 77, 'B2'], ['OWOP', 63, 'B3'], ['History', 59, 'C4'],
];

const Headline: React.FC<{ idx: number; time: number }> = ({ idx, time }) => {
  const line = lines[idx];
  const next = lines[idx + 1];
  const exit = next ? clamp01((time - (next.start - 0.2)) / 0.3) : 0;
  const size = idx === 0 ? 112 : 76;
  return (
    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: -size * 0.035, color: C.forest, opacity: 1 - exit, transform: `translateY(${-exit * 30}px)` }}>
      {line.words.map((w, i) => {
        const k = clamp01((time - (line.start + w.start - 0.06)) / 0.3);
        const accent = ACCENT[idx]?.includes(w.word.toLowerCase());
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: size * 0.08, marginRight: size * 0.24 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - easeOut(k)) * 105}%)`, color: accent ? C.gold : C.forest }}>{w.word}</span>
          </span>
        );
      })}
    </div>
  );
};

const Mark: React.FC<{ c: string; k: number }> = ({ c, k }) => (
  <span style={{ display: 'inline-block', width: 52, textAlign: 'center', fontFamily: MONO, fontSize: 30, fontWeight: 700,
    color: c === 'v' ? INK : RED, opacity: k, transform: `scale(${0.6 + 0.4 * easeOut(k)})` }}>
    {c === 'v' ? '✓' : c === 'a' ? 'A' : 'L'}
  </span>
);

export const Hook: React.FC<{ time: number }> = ({ time }) => {
  const idx = lines.reduce((a, l, i) => (time >= l.start - 0.1 ? i : a), 0);
  const bookIn = easeOut(clamp01((time - (lines[0].start + 0.5)) / 0.8));
  const tickStart = wordAt(1, 'Registers');
  const markStart = wordAt(1, 'Exercises');
  const sumStart = wordAt(1, 'added');
  const cardIn = easeOut(clamp01((time - (wordAt(2, 'report') - 0.15)) / 0.7));
  const writeStart = wordAt(2, 'written');
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <div style={{ position: 'absolute', top: 210, left: 84, fontFamily: FONT, fontWeight: 600, fontSize: 28, letterSpacing: 5, color: C.gold, opacity: clamp01(time / 0.6) }}>
        PRIMARY SCHOOL PORTAL
      </div>
      <div style={{ position: 'absolute', top: 280, left: 84, right: 84 }}>
        <Headline idx={idx} time={time} />
      </div>

      {/* The register and mark book. */}
      <div style={{ position: 'absolute', left: 66, right: 66, top: 800, opacity: bookIn * (1 - 0.35 * cardIn), transform: `translateY(${(1 - bookIn) * 140}px) rotate(-1.2deg)` }}>
        <div style={{ position: 'relative', background: '#FFFEF8', borderRadius: 8, padding: '30px 26px 34px 26px', boxShadow: '0 22px 60px rgba(28,18,8,0.2)',
          backgroundImage: 'repeating-linear-gradient(180deg, transparent 0 69px, #C9D7EA 69px 71px)', backgroundPosition: '0 96px' }}>
          <div style={{ position: 'absolute', left: 256, top: 0, bottom: 0, width: 2, background: '#E4A3A3' }} />
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: C.muted, letterSpacing: 2, marginBottom: 14 }}>BASIC 4 · REGISTER &amp; MARK BOOK · TERM 1</div>
          <div style={{ display: 'flex', fontFamily: FONT, fontWeight: 800, fontSize: 24, color: C.ink, height: 52, alignItems: 'center' }}>
            <span style={{ width: 240 }}>Name</span>
            {DAYS.map((d, i) => <span key={i} style={{ width: 52, textAlign: 'center' }}>{d}</span>)}
            <span style={{ width: 18 }} />
            {['Ex1', 'Ex2', 'Test'].map(h => <span key={h} style={{ width: 66, textAlign: 'center' }}>{h}</span>)}
            <span style={{ width: 76, textAlign: 'center' }}>Total</span>
          </div>
          {ROWS.map(([name, att, marks, total], r) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', height: 71 }}>
              <span style={{ width: 240, fontFamily: FONT, fontSize: 26, color: C.ink }}>{name}</span>
              {att.split('').map((c, d) => <Mark key={d} c={c} k={clamp01((time - (tickStart + (d * ROWS.length + r) * 0.035)) / 0.12)} />)}
              <span style={{ width: 18 }} />
              {marks.map((m, c) => (
                <span key={c} style={{ width: 66, textAlign: 'center', fontFamily: MONO, fontSize: 29, color: INK, opacity: clamp01((time - (markStart + r * 0.12 + c * 0.05)) / 0.15) }}>{m}</span>
              ))}
              <span style={{ width: 76, textAlign: 'center', fontFamily: MONO, fontSize: 29, fontWeight: 700, color: INK, opacity: clamp01((time - (sumStart + r * 0.13)) / 0.15) }}>{total}</span>
            </div>
          ))}
        </div>
      </div>

      {/* A terminal report, written out by hand. */}
      {cardIn > 0 && (
        <div style={{ position: 'absolute', left: 130, right: 110, top: 760, opacity: cardIn, transform: `translateY(${(1 - cardIn) * 260}px) rotate(2.2deg)` }}>
          {[2, 1].map(i => (
            <div key={i} style={{ position: 'absolute', inset: 0, background: '#FBF7EC', borderRadius: 8, transform: `translate(${i * 12}px, ${i * 10}px) rotate(${i * 1.4}deg)`, boxShadow: '0 10px 30px rgba(28,18,8,0.15)' }} />
          ))}
          <div style={{ position: 'relative', background: '#FFFDF6', borderRadius: 8, padding: '34px 40px', boxShadow: '0 26px 70px rgba(28,18,8,0.28)', border: '1px solid #E8DFC9' }}>
            <div style={{ textAlign: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 30, letterSpacing: 4, color: C.forest }}>TERMINAL REPORT</div>
            <div style={{ textAlign: 'center', fontFamily: FONT, fontSize: 22, color: C.muted, marginTop: 4 }}>Basic 4 · Term 1</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 26, fontFamily: FONT, fontSize: 26, color: C.ink, alignItems: 'baseline' }}>
              Name:
              <span style={{ flex: 1, borderBottom: '2px dotted #B9AE96', fontFamily: MONO, fontSize: 30, color: INK, minHeight: 38 }}>
                {'Ama Mensah'.slice(0, Math.max(0, Math.floor((time - writeStart) / 0.06)))}
              </span>
            </div>
            <div style={{ marginTop: 18 }}>
              {SUBJECTS.map(([sub, score, g], i) => {
                const k = clamp01((time - (writeStart + 0.7 + i * 0.22)) / 0.15);
                return (
                  <div key={sub} style={{ display: 'flex', alignItems: 'baseline', height: 52, borderBottom: '1px solid #EDE5D2', fontFamily: FONT, fontSize: 25, color: C.ink }}>
                    <span style={{ flex: 1 }}>{sub}</span>
                    <span style={{ width: 90, textAlign: 'center', fontFamily: MONO, fontSize: 29, color: INK, opacity: k }}>{score}</span>
                    <span style={{ width: 70, textAlign: 'center', fontFamily: MONO, fontSize: 29, color: INK, opacity: k }}>{g}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 22, fontFamily: FONT, fontSize: 24, color: C.muted }}>Class teacher's remark:</div>
            <div style={{ fontFamily: MONO, fontSize: 26, color: INK, minHeight: 36, marginTop: 4 }}>
              {'A good term. Keep it up.'.slice(0, Math.max(0, Math.floor((time - (writeStart + 2.2)) / 0.05)))}
            </div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
