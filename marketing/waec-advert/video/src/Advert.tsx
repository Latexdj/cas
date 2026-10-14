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
  import: 'Import', report: 'Analysis report', export: 'Export', analytics: 'Analytics',
  rankings: 'Rankings', lookup: 'Student lookup', principal: "Principal's portal",
};

const ev = (clip: string, pred: (e: any) => boolean) => clipData[clip].events.filter(pred);
// Stopwatch: real on-screen time from clicking "Import New Year" to the
// finished report appearing.
const importDowns = ev('import', e => e.type === 'down');
const SW_START = byId('import').start + importDowns[1].t;
const SW_END = byId('import').start + ev('import', e => e.type === 'mark' && e.name === 'report-visible')[0].t;
const exportStart = byId('export').start;
const XLSX_AT = exportStart + ev('export', e => e.type === 'down')[0].t + 0.5;
const PDF_AT = exportStart + ev('export', e => e.type === 'mark' && e.name === 'pdf-downloaded')[0].t;

const Scene: React.FC<{ id: string; time: number }> = ({ id, time }) => {
  if (id === 'hook') return <Hook time={time} />;
  if (id === 'cta') return <Cta time={time} />;
  return <ScreenClip name={id} t={time - byId(id).start} />;
};

const Chip: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderRadius: 999, background: 'rgba(7,42,32,0.92)', color: '#fff', fontFamily: FONT, fontWeight: 600, fontSize: 29, boxShadow: '0 10px 30px rgba(0,0,0,0.25)', ...style }}>{children}</div>
);

const Stopwatch: React.FC<{ time: number }> = ({ time }) => {
  if (time < SW_START - 0.3 || time > byId('report').start + 3) return null;
  const elapsed = Math.max(0, Math.min(time, SW_END) - SW_START);
  const done = time >= SW_END;
  const fadeIn = clamp01((time - (SW_START - 0.3)) / 0.3);
  const fadeOut = clamp01((byId('report').start + 3 - time) / 0.4);
  const s = Math.floor(elapsed);
  return (
    <div style={{ position: 'absolute', right: 48, top: 92, opacity: Math.min(fadeIn, fadeOut) }}>
      <Chip style={{ background: done ? C.gold : 'rgba(7,42,32,0.92)', color: done ? C.forestDeep : '#fff', transition: 'none' }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9.5 2.5h5" strokeLinecap="round" /></svg>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>0:{String(s).padStart(2, '0')}</span>
        <span style={{ fontSize: 26, fontWeight: 600, opacity: 0.8 }}>{done ? 'report ready' : 'import to report'}</span>
      </Chip>
    </div>
  );
};

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

const ExportOverlay: React.FC<{ time: number }> = ({ time }) => {
  const end = byId('analytics').start - 0.25;
  if (time < XLSX_AT || time > end) return null;
  const out = clamp01((end - time) / 0.35);
  const card = easeOut(clamp01((time - (PDF_AT + 0.25)) / 0.6));
  const push = clamp01((time - (PDF_AT + 0.9)) / 4);
  const file = (name: string, at: number, color: string) => {
    const k = easeOut(clamp01((time - at) / 0.4));
    return (
      <Chip style={{ opacity: k, transform: `translateY(${(1 - k) * 30}px)`, background: '#fff', color: C.ink, fontSize: 30 }}>
        <span style={{ width: 44, height: 52, borderRadius: 8, background: color, color: '#fff', fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{name.endsWith('pdf') ? 'PDF' : 'XLS'}</span>
        {name}
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.6"><path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </Chip>
    );
  };
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <AbsoluteFill style={{ background: `rgba(7,42,32,${0.55 * card})` }} />
      <div style={{ position: 'absolute', left: 50, right: 50, top: 1500, display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
        {file('WAEC_2025_Analysis_Report.xlsx', XLSX_AT, '#1D6F42')}
        {time >= PDF_AT && file('WAEC_2025_Analysis_Report.pdf', PDF_AT, '#B83232')}
      </div>
      {card > 0 && (
        <div style={{ position: 'absolute', left: 40, right: 40, top: 300, height: 1120, borderRadius: 22, overflow: 'hidden', background: '#fff', boxShadow: '0 30px 80px rgba(0,0,0,0.45)', opacity: card, transform: `translateY(${(1 - card) * 120}px) scale(${0.94 + 0.06 * card})` }}>
          {/* The real exported PDF: first the whole page, then a push into the grade table. */}
          <Img src={staticFile('assets/report_pdf.png')} style={{
            position: 'absolute', width: 1000 * (1 + 1.15 * easeInOut(push)), left: -560 * easeInOut(push), top: 24 - 150 * easeInOut(push),
          }} />
        </div>
      )}
    </AbsoluteFill>
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
      <ExportOverlay time={time} />
      <ChapterLabel time={time} />
      <Stopwatch time={time} />
      <Captions time={time} />
      <Audio src={staticFile('audio/mix.wav')} />
    </AbsoluteFill>
  );
};
