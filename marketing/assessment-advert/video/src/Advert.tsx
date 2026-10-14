import React from 'react';
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from 'remotion';
import data from './data.json';
import { Captions } from './Captions';
import { Cta } from './Cta';
import { Hook } from './Hook';
import { ScreenClip, clipData } from './ScreenClip';
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
  setup: 'CA setup', teacher: 'Teacher portal', submit: 'Teacher portal', hod: 'HOD review',
  approvals: 'Result approvals', tracker: 'Admin monitoring', results: 'Report cards',
  student: 'Student portal', transcript: 'Transcript',
};

const evAt = (clip: string, pred: (e: any) => boolean) => {
  const e = clipData[clip].events.find(pred);
  return e ? byId(clip).start + e.t : null;
};
const UPLOAD_AT = evAt('teacher', e => e.type === 'file');
const PRINT_AT = evAt('results', e => e.type === 'mark' && e.name === 'printed');

// The Excel sheet the teacher uploads.
const UploadChip: React.FC<{ time: number }> = ({ time }) => {
  if (UPLOAD_AT == null || time < UPLOAD_AT || time > UPLOAD_AT + 2.6) return null;
  const k = easeOut(clamp01((time - UPLOAD_AT) / 0.35));
  const out = clamp01((UPLOAD_AT + 2.6 - time) / 0.3);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 1180, display: 'flex', justifyContent: 'center', opacity: Math.min(k, out), transform: `translateY(${(1 - k) * 30}px)` }}>
      <Chip style={{ background: '#fff', color: C.ink, fontSize: 30 }}>
        <span style={{ width: 44, height: 52, borderRadius: 8, background: '#1D6F42', color: '#fff', fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>XLS</span>
        Project_Work_2_Science.xlsx
      </Chip>
    </div>
  );
};

// What "Print All" sends to the printer: the class's report cards.
const PrintOverlay: React.FC<{ time: number }> = ({ time }) => {
  const end = byId('student').start - 0.25;
  if (PRINT_AT == null || time < PRINT_AT + 0.2 || time > end) return null;
  const k = easeOut(clamp01((time - (PRINT_AT + 0.2)) / 0.7));
  const out = clamp01((end - time) / 0.35);
  const fan = easeInOut(clamp01((time - (PRINT_AT + 0.8)) / 0.9));
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <AbsoluteFill style={{ background: `rgba(7,42,32,${0.6 * k})` }} />
      {[2, 1, 0].map(i => (
        <div key={i} style={{ position: 'absolute', left: 150, top: 330, width: 780, height: 1103, background: '#fff', borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.4)', opacity: k,
          transform: `translate(${fan * i * 34}px, ${(1 - k) * 160 - fan * i * 24}px) rotate(${fan * i * 4.5}deg)` }}>
          <Img src={staticFile(`assets/card_${i + 1}.png`)} style={{ width: '100%', height: '100%' }} />
        </div>
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1480, display: 'flex', justifyContent: 'center', opacity: fan }}>
        <Chip style={{ background: '#fff', color: C.ink, fontSize: 30 }}>
          <span style={{ width: 44, height: 52, borderRadius: 8, background: '#B83232', color: '#fff', fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>PDF</span>
          2 Science report cards · 40 pages
        </Chip>
      </div>
    </AbsoluteFill>
  );
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
      <UploadChip time={time} />
      <PrintOverlay time={time} />
      <ChapterLabel time={time} />
      <Captions time={time} />
      <Audio src={staticFile('audio/mix.wav')} />
    </AbsoluteFill>
  );
};
