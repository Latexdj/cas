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

const ACCENT: Record<number, string[]> = { 0: ['semester.'], 2: ['hand.'], 3: ['wrong.'] };
const COLS = ['Test', 'Assign.', 'Project', 'Exam', 'Total', 'Pos.'];
const COL_WORD = ['tests,', 'assignments,', 'project', 'exam'];
// A page of a mark book. Every name and mark is made up.
const ROWS: [string, number[], number, string][] = [
  ['Adjoa Danso', [15, 8, 14, 52], 89, '3rd'],
  ['Kwaku Quaye', [19, 9.5, 18, 66], 113, '1st'],
  ['Yaw Gyamfi', [17, 9, 16, 61], 103, '2nd'],
  ['Efua Mensah', [12, 7, 13, 47], 79, '5th'],
  ['Ibrahim Badu', [14, 8.5, 15, 50], 87, '4th'],
  ['Nana Ofori', [10, 6, 11, 41], 68, '6th'],
];
const WRONG_ROW = 4; // 14 + 8.5 + 15 + 50 is 87.5, not 87

const Headline: React.FC<{ idx: number; time: number }> = ({ idx, time }) => {
  const line = lines[idx];
  const next = lines[idx + 1];
  const exit = next ? clamp01((time - (next.start - 0.2)) / 0.3) : 0;
  const size = idx === 0 ? 120 : idx === 2 ? 76 : 92;
  return (
    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: -size * 0.035, color: C.forest, opacity: 1 - exit, transform: `translateY(${-exit * 30}px)` }}>
      {line.words.map((w, i) => {
        const k = clamp01((time - (line.start + w.start - 0.06)) / 0.3);
        const accent = ACCENT[idx]?.includes(w.word.toLowerCase());
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: size * 0.08, marginRight: size * 0.24 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - easeOut(k)) * 105}%)`, color: accent ? (idx === 3 ? '#B83232' : C.gold) : C.forest }}>{w.word}</span>
          </span>
        );
      })}
    </div>
  );
};

export const Hook: React.FC<{ time: number }> = ({ time }) => {
  const idx = lines.reduce((a, l, i) => (time >= l.start - 0.1 ? i : a), 0);
  const bookIn = easeOut(clamp01((time - (lines[0].start + 0.5)) / 0.8));
  const copyStart = wordAt(2, 'copied') - 0.1;
  const sumStart = wordAt(2, 'added');
  const rankStart = wordAt(2, 'ranked');
  const slip = clamp01((time - (wordAt(3, 'slip') - 0.05)) / 0.4);
  const ink = '#1F3F8F';
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <div style={{ position: 'absolute', top: 210, left: 84, fontFamily: FONT, fontWeight: 600, fontSize: 28, letterSpacing: 5, color: C.gold, opacity: clamp01(time / 0.6) }}>
        ASSESSMENT &amp; RESULTS
      </div>
      <div style={{ position: 'absolute', top: 280, left: 84, right: 84 }}>
        <Headline idx={idx} time={time} />
      </div>

      {/* The mark book. */}
      <div style={{ position: 'absolute', left: 70, right: 70, top: 790, opacity: bookIn, transform: `translateY(${(1 - bookIn) * 140}px) rotate(-1.2deg)` }}>
        <div style={{ background: '#FFFEF8', borderRadius: 8, padding: '30px 30px 34px 30px', boxShadow: '0 22px 60px rgba(28,18,8,0.2)',
          backgroundImage: 'repeating-linear-gradient(180deg, transparent 0 69px, #C9D7EA 69px 71px)', backgroundPosition: '0 96px' }}>
          <div style={{ position: 'absolute', left: 278, top: 0, bottom: 0, width: 2, background: '#E4A3A3' }} />
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: C.muted, letterSpacing: 2, marginBottom: 14 }}>MATHEMATICS · 2 SCIENCE · SEMESTER 1</div>
          <div style={{ display: 'flex', fontFamily: FONT, fontWeight: 800, fontSize: 26, color: C.ink, height: 52, alignItems: 'center' }}>
            <span style={{ width: 250 }}>Name</span>
            {COLS.map((c, i) => {
              const lit = i < 4 && time >= wordAt(1, COL_WORD[i]) - 0.05 && idx === 1;
              return <span key={c} style={{ width: 100, textAlign: 'center', borderRadius: 8, background: lit ? C.gold : 'transparent', color: lit ? '#fff' : C.ink }}>{c}</span>;
            })}
          </div>
          {ROWS.map(([name, marks, total, pos], r) => {
            const rowT = copyStart + r * 0.28;
            return (
              <div key={name} style={{ display: 'flex', alignItems: 'center', height: 71, fontFamily: MONO, fontSize: 30, color: ink }}>
                <span style={{ width: 250, fontFamily: FONT, fontSize: 26, color: C.ink, opacity: bookIn }}>{name}</span>
                {marks.map((m, c) => {
                  const k = clamp01((time - (rowT + c * 0.06)) / 0.15);
                  return <span key={c} style={{ width: 100, textAlign: 'center', opacity: k }}>{m}</span>;
                })}
                <span style={{ width: 100, textAlign: 'center', position: 'relative', fontWeight: 700, opacity: clamp01((time - (sumStart + r * 0.12)) / 0.15) }}>
                  {total}
                  {r === WRONG_ROW && slip > 0 && (
                    <svg width={110} height={74} viewBox="0 0 110 74" style={{ position: 'absolute', left: -5, top: -17, overflow: 'visible' }}>
                      <ellipse cx={55} cy={37} rx={50} ry={30} fill="none" stroke="#B83232" strokeWidth={5} strokeDasharray={260} strokeDashoffset={260 * (1 - easeInOut(slip))} transform="rotate(-6 55 37)" />
                    </svg>
                  )}
                </span>
                <span style={{ width: 100, textAlign: 'center', opacity: clamp01((time - (rankStart + r * 0.12)) / 0.15) }}>{pos}</span>
              </div>
            );
          })}
        </div>
        {slip > 0 && (
          <div style={{ position: 'absolute', right: 26, bottom: -64, fontFamily: FONT, fontWeight: 800, fontSize: 34, color: '#B83232', opacity: slip, transform: `rotate(-3deg) translateY(${(1 - easeOut(slip)) * 20}px)` }}>
            14 + 8.5 + 15 + 50 = 87.5
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
