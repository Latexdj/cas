import React from 'react';
import { AbsoluteFill } from 'remotion';
import data from './data.json';
import { C, FONT, MONO, clamp01, easeOut, easeInOut } from './theme';

const scene = (data as any).timeline.scenes.find((s: any) => s.id === 'hook');
const lines = scene.lines as { start: number; duration: number; text: string; words: { word: string; start: number }[] }[];
const listing = (data as any).listing as string[];

// Words drawn in gold, per line.
const ACCENT: Record<number, string[]> = { 0: ['out.'], 1: ['analysis', 'report.'], 2: ['A1', 'F9.'], 3: ['days'] };
const GRADES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];

const Line: React.FC<{ idx: number; time: number; size: number }> = ({ idx, time, size }) => {
  const line = lines[idx];
  const next = lines[idx + 1];
  const exitAt = next ? next.start - 0.2 : Infinity;
  const exit = clamp01((time - exitAt) / 0.3);
  return (
    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.04, letterSpacing: -size * 0.035, color: C.forest, opacity: 1 - exit, transform: `translateY(${-exit * 40}px)` }}>
      {line.words.map((w, i) => {
        const k = clamp01((time - (line.start + w.start - 0.06)) / 0.32);
        const accent = ACCENT[idx]?.includes(w.word);
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: size * 0.08, marginRight: size * 0.24 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - easeOut(k)) * 105}%)`, color: accent ? C.gold : C.forest }}>{w.word}</span>
          </span>
        );
      })}
    </div>
  );
};

export const Hook: React.FC<{ time: number }> = ({ time }) => {
  const idx = lines.reduce((a, l, i) => (time >= l.start - 0.1 ? i : a), 0);
  const scroll = time * 46;
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      {/* The raw listing, exactly as WAEC prints it: the job everyone starts with. */}
      <AbsoluteFill style={{ overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)' }}>
        <div style={{ position: 'absolute', left: 64, top: 120 - scroll, fontFamily: MONO, fontSize: 25, lineHeight: 1.55, color: C.forest, opacity: 0.11, whiteSpace: 'pre' }}>
          {listing.slice(0, 200).join('\n')}
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ padding: '0 84px', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', top: 250, left: 84, fontFamily: FONT, fontWeight: 600, fontSize: 28, letterSpacing: 5, color: C.gold, opacity: clamp01(time / 0.6) }}>
          WAEC RESULTS ANALYSIS
        </div>
        <div style={{ marginTop: -120 }}>
          <Line idx={idx} time={time} size={idx === 0 ? 138 : 104} />
        </div>
      </AbsoluteFill>

      {/* Line 3: the grades and the boys / girls / total split. */}
      {idx === 2 && (
        <div style={{ position: 'absolute', left: 84, right: 84, top: 1250, display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 12 }}>
          {GRADES.map((g, i) => {
            const k = clamp01((time - (lines[2].start + 2.1 + i * 0.07)) / 0.35);
            const exit = clamp01((time - (lines[3].start - 0.2)) / 0.3);
            return (
              <div key={g} style={{ opacity: easeOut(k) * (1 - exit), transform: `translateY(${(1 - easeOut(k)) * 40}px)` }}>
                <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 38, textAlign: 'center', padding: '16px 0', borderRadius: 14, background: i < 6 ? C.forest : i < 8 ? C.green : '#B83232', color: '#fff' }}>{g}</div>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 10, fontFamily: FONT, fontWeight: 700, fontSize: 21, color: C.muted }}>
                  <span>B</span><span>G</span><span>T</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Line 4: tally marks, drawn by hand. */}
      {idx === 3 && (
        <svg style={{ position: 'absolute', left: 104, top: 1210, overflow: 'visible' }} width={912} height={270} viewBox="0 0 912 270">
          {Array.from({ length: 24 }).map((_, i) => {
            const group = Math.floor(i / 5), pos = i % 5;
            const row = Math.floor(group / 3), col = group % 3;
            const gx = col * 310, y0 = row * 135;
            const k = easeInOut(clamp01((time - (lines[3].start + 0.2 + i * 0.1)) / 0.18));
            if (k <= 0) return null;
            const d = pos === 4 ? `M ${gx - 18} ${y0 + 86} L ${gx + 150} ${y0 + 18}` : `M ${gx + pos * 44} ${y0} L ${gx + pos * 44 + 4} ${y0 + 104}`;
            const len = pos === 4 ? 182 : 104;
            return <path key={i} d={d} stroke={pos === 4 ? C.gold : C.forest} strokeWidth={10} strokeLinecap="round" fill="none" strokeDasharray={len} strokeDashoffset={len * (1 - k)} />;
          })}
        </svg>
      )}
    </AbsoluteFill>
  );
};
