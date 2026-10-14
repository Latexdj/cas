import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import data from './data.json';
import { C, FONT, clamp01, easeOut } from './theme';

const scene = (data as any).timeline.scenes.find((s: any) => s.id === 'cta');
const [l0, l1, l2] = scene.lines as { start: number; words: { word: string; start: number }[] }[];
const reportFrames = (data as any).clips.reports.frames as [number, string][];
const backdrop = reportFrames[Math.min(reportFrames.length - 1, 30)][1];

const rise = (time: number, at: number, d = 0.5) => {
  const k = easeOut(clamp01((time - at) / d));
  return { opacity: k, transform: `translateY(${(1 - k) * 36}px)` };
};

const Phone: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={C.goldLight} strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
  </svg>
);

export const Cta: React.FC<{ time: number }> = ({ time }) => {
  const t0 = l0.start;
  const drift = (time - t0) * 6;
  return (
    <AbsoluteFill style={{ background: C.forest, fontFamily: FONT }}>
      <Img src={staticFile(backdrop)} style={{ position: 'absolute', left: -120, top: -160 - drift, width: 1320, height: 2346, objectFit: 'cover', filter: 'blur(22px) saturate(0.6)', opacity: 0.22 }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(11,61,46,0.55) 0%, rgba(7,42,32,0.92) 55%, #072A20 100%)' }} />

      <AbsoluteFill style={{ padding: '0 90px', justifyContent: 'center' }}>
        <div style={{ marginTop: -260 }}>
          <div style={{ ...rise(time, t0 - 0.05, 0.6), fontWeight: 900, fontSize: 290, lineHeight: 0.9, letterSpacing: -14, color: '#fff' }}>CAS</div>
          <div style={{ ...rise(time, l0.start + l0.words[1].start - 0.1), marginTop: 26, fontWeight: 700, fontSize: 33, letterSpacing: 6, color: 'rgba(255,255,255,0.72)' }}>
            COMPREHENSIVE ACADEMIC <span style={{ color: C.gold }}>SUITE</span>
          </div>
          <div style={{ ...rise(time, l1.start - 0.05), marginTop: 90, height: 2, width: 140, background: C.gold }} />
          <div style={{ ...rise(time, l1.start), marginTop: 40, fontWeight: 700, fontSize: 68, lineHeight: 1.1, letterSpacing: -2, color: '#fff' }}>
            Your whole primary school.<br /><span style={{ color: C.goldLight }}>In one place.</span>
          </div>
        </div>
      </AbsoluteFill>

      {/* Contact block: the same details as the app's sidebar footer. */}
      <div style={{ position: 'absolute', left: 90, right: 90, top: 1300 }}>
        <div style={{ ...rise(time, l2.start + l2.words[1].start - 0.15), display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ width: 92, height: 92, borderRadius: '50%', background: 'linear-gradient(135deg, #E8B85C, #C8973A)', color: C.forest, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 34, letterSpacing: -1, boxShadow: '0 8px 24px rgba(200,151,58,0.35)' }}>LT</div>
          <div style={{ width: 2, height: 78, background: 'linear-gradient(180deg, transparent, rgba(200,151,58,0.5), transparent)' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 24, letterSpacing: 4, color: 'rgba(200,151,58,0.75)' }}>DESIGNED BY</div>
            <div style={{ fontWeight: 800, fontSize: 52, color: C.gold, marginTop: 2 }}>LatexTech</div>
          </div>
        </div>
        <div style={{ ...rise(time, l2.start + l2.words[3].start - 0.2), marginTop: 44, display: 'inline-flex', alignItems: 'center', gap: 22, padding: '24px 34px', borderRadius: 24, background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(232,184,92,0.35)' }}>
          <Phone size={58} />
          <span style={{ fontWeight: 800, fontSize: 70, letterSpacing: -1, color: '#fff' }}>+233 24 8234 649</span>
        </div>
        <div style={{ ...rise(time, l2.start + l2.words[l2.words.length - 3].start - 0.1), marginTop: 30, fontWeight: 500, fontSize: 38, color: 'rgba(255,255,255,0.75)' }}>
          Call for a free walkthrough for your school.
        </div>
      </div>
    </AbsoluteFill>
  );
};
