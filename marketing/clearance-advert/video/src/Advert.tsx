import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import data from './data.json';
import { Captions } from './Captions';
import { Cta } from './Cta';
import { Hook } from './Hook';
import { ScreenClip } from './ScreenClip';
import { C, FONT, FPS, clamp01, easeInOut, easeOut, loadFonts } from './theme';

loadFonts();

const TL = (data as any).timeline;
const scenes = TL.scenes as { id: string; start: number; end: number }[];
const byId = (id: string) => scenes.find(s => s.id === id)!;
export const DURATION = Math.ceil(TL.duration * FPS);

const XFADE = 0.5;
// Scene windows: each scene owns the time from just before its first word
// until just before the next scene's first word.
const windows = scenes.map((s, i) => ({
  id: s.id,
  start: s.start,
  from: i === 0 ? 0 : s.start - 0.25,
  to: i === scenes.length - 1 ? TL.duration + 1 : scenes[i + 1].start - 0.25,
}));

const LABELS: Record<string, string> = {
  setup: 'Offices & staff', initiate: 'Start clearance', office: 'Teacher portal', staff: 'Staff portal',
  student: 'Student portal', admin: 'Admin overview', principal: "Principal's portal",
};

const Scene: React.FC<{ id: string; time: number }> = ({ id, time }) => {
  if (id === 'hook') return <Hook time={time} />;
  if (id === 'cta') return <Cta time={time} />;
  return <ScreenClip name={id} t={time - byId(id).start} />;
};

const Chip: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderRadius: 999, background: 'rgba(7,42,32,0.92)', color: '#fff', fontFamily: FONT, fontWeight: 600, fontSize: 29, boxShadow: '0 10px 30px rgba(0,0,0,0.25)', ...style }}>{children}</div>
);

const ChapterLabel: React.FC<{ time: number }> = ({ time }) => {
  const w = windows.find(x => time >= x.from && time < x.to);
  if (!w || !LABELS[w.id]) return null;
  const o = Math.min(clamp01((time - w.from) / 0.35), clamp01((w.to - time) / 0.3));
  return (
    <div style={{ position: 'absolute', left: 48, top: 92, opacity: o, transform: `translateX(${(1 - easeOut(clamp01((time - w.from) / 0.4))) * -20}px)` }}>
      <Chip>
        <span style={{ width: 14, height: 14, borderRadius: 7, background: C.gold }} />
        <span style={{ letterSpacing: 0.3 }}>{LABELS[w.id]}</span>
      </Chip>
    </div>
  );
};

export const Advert: React.FC = () => {
  const frame = useCurrentFrame();
  const time = frame / FPS;
  const visible = windows.filter(w => time >= w.from - XFADE / 2 && time < w.to + XFADE / 2);
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      {visible.map(w => {
        const fadeIn = w.from === 0 ? 1 : easeInOut(clamp01((time - (w.from - XFADE / 2)) / XFADE));
        const scale = 1 + 0.035 * (1 - fadeIn);
        return (
          <AbsoluteFill key={w.id} style={{ opacity: fadeIn, transform: `scale(${scale})` }}>
            <Scene id={w.id} time={time} />
          </AbsoluteFill>
        );
      })}
      <ChapterLabel time={time} />
      <Captions time={time} />
      <Audio src={staticFile('audio/mix.wav')} />
    </AbsoluteFill>
  );
};
