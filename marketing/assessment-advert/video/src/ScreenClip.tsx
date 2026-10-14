import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import data from './data.json';
import { C, FONT, H, W, clamp01, easeInOut, easeOut } from './theme';

type Ev = { t: number; type: string; [k: string]: any };
type View = { w: number; h: number };
type Clip = { frames: [number, string][]; moves: [number, number, number][]; events: Ev[]; end: number; viewport: { width: number; height: number } };
const clips = (data as any).clips as Record<string, Clip>;

type Cam = { x: number; y: number; zoom: number };
// Each clip was captured at its own CSS-pixel viewport (desktop portrait
// 864x1536, or phone 432x768); both are 9:16 and fill the frame at zoom 1.
function clampCam(c: Cam, v: View): Cam {
  const zoom = Math.max(1, c.zoom);
  const hw = v.w / 2 / zoom, hh = v.h / 2 / zoom;
  return { zoom, x: Math.min(v.w - hw, Math.max(hw, c.x)), y: Math.min(v.h - hh, Math.max(hh, c.y)) };
}

// Camera state at clip time t: each cue eases from wherever the camera is
// at that moment to its target. Zoom eases in log space so push-ins feel even.
export function cameraAt(events: Ev[], t: number, v: View): Cam {
  const FULL: Cam = { x: v.w / 2, y: v.h / 2, zoom: 1 };
  let from = FULL, to = FULL, start = -Infinity, dur = 0;
  const at = (time: number): Cam => {
    const p = dur <= 0 ? 1 : easeInOut(clamp01((time - start) / dur));
    return {
      x: from.x + (to.x - from.x) * p,
      y: from.y + (to.y - from.y) * p,
      zoom: Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * p),
    };
  };
  for (const e of events) {
    if (e.type !== 'cam' || e.t > t) continue;
    from = start === -Infinity ? FULL : at(e.t);
    if (e.dur === 0) from = clampCam({ x: e.x, y: e.y, zoom: e.zoom }, v);
    to = clampCam({ x: e.x, y: e.y, zoom: e.zoom }, v);
    start = e.t;
    dur = e.dur;
  }
  return clampCam(at(t), v);
}

function frameAt(clip: Clip, t: number) {
  const f = clip.frames;
  let lo = 0, hi = f.length - 1;
  if (t <= f[0][0]) return f[0][1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (f[mid][0] <= t) lo = mid; else hi = mid - 1;
  }
  return f[lo][1];
}

function cursorAt(clip: Clip, t: number) {
  const m = clip.moves;
  if (!m.length) return { x: clip.viewport.width / 2, y: clip.viewport.height / 2 };
  if (t <= m[0][0]) return { x: m[0][1], y: m[0][2] };
  for (let i = 1; i < m.length; i++) {
    if (m[i][0] >= t) {
      const [t0, x0, y0] = m[i - 1], [t1, x1, y1] = m[i];
      const p = (t - t0) / Math.max(1e-6, t1 - t0);
      return { x: x0 + (x1 - x0) * p, y: y0 + (y1 - y0) * p };
    }
  }
  const l = m[m.length - 1];
  return { x: l[1], y: l[2] };
}

// Maps a viewport CSS-pixel point to output pixels for a camera.
export function project(cam: Cam, x: number, y: number, px: number) {
  const s = px * cam.zoom;
  return { x: W / 2 + (x - cam.x) * s, y: H / 2 + (y - cam.y) * s, s };
}

const Cursor: React.FC<{ size: number; pressed: number }> = ({ size, pressed }) => (
  <svg width={size} height={size * 1.5} viewBox="0 0 20 30" style={{ overflow: 'visible', transform: `scale(${1 - 0.12 * pressed})`, transformOrigin: '2px 2px', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.35))' }}>
    <path d="M2 2 L2 23.5 L7.2 18.6 L10.6 26.6 L14.2 25.1 L10.9 17.3 L17.8 17.3 Z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);

const Keycap: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 40, color: C.ink, background: 'linear-gradient(#fff, #EDE7DC)', borderRadius: 14, padding: '10px 22px', minWidth: 46, textAlign: 'center', boxShadow: '0 5px 0 #CFC5B4, 0 10px 26px rgba(0,0,0,0.28)' }}>{label}</div>
);

export const ScreenClip: React.FC<{ name: string; t: number; showCursor?: boolean }> = ({ name, t, showCursor = true }) => {
  const clip = clips[name];
  const view = { w: clip.viewport.width, h: clip.viewport.height };
  const PX = W / view.w;
  const cam = cameraAt(clip.events, t, view);
  const src = frameAt(clip, t);
  const s = PX * cam.zoom;
  const cur = cursorAt(clip, t);
  const cp = project(cam, cur.x, cur.y, PX);

  const downs = clip.events.filter(e => e.type === 'down' && e.t <= t && t - e.t < 0.6);
  const lastDown = clip.events.filter(e => e.type === 'down' && e.t <= t).pop();
  const lastUp = clip.events.filter(e => e.type === 'up' && e.t <= t).pop();
  const pressed = lastDown && (!lastUp || lastUp.t < lastDown.t) ? 1 : lastUp ? clamp01(1 - (t - lastUp.t) / 0.12) : 0;
  const shortcut = clip.events.filter(e => e.type === 'shortcut' && e.t <= t && t - e.t < 1.3).pop();
  // A phone gets a fingertip, not an arrow; size stays readable at any zoom.
  const touch = view.w < 600;
  const cursorSize = Math.max(30, Math.min(46, 19 * 1.25 * cam.zoom * 0.8));

  return (
    <AbsoluteFill style={{ background: C.cream, overflow: 'hidden' }}>
      <Img
        src={staticFile(src)}
        style={{ position: 'absolute', left: W / 2 - cam.x * s, top: H / 2 - cam.y * s, width: view.w * s, height: view.h * s }}
      />
      {downs.map((d, i) => {
        const p = project(cam, d.x, d.y, PX);
        const k = clamp01((t - d.t) / 0.55);
        return (
          <div key={i} style={{
            position: 'absolute', left: p.x, top: p.y, width: 0, height: 0,
          }}>
            <div style={{
              position: 'absolute', left: -60 * easeOut(k), top: -60 * easeOut(k), width: 120 * easeOut(k), height: 120 * easeOut(k),
              borderRadius: '50%', border: `${5 * (1 - k) + 1}px solid ${C.gold}`, opacity: 0.9 * (1 - k), background: `rgba(200,151,58,${0.18 * (1 - k)})`,
            }} />
          </div>
        );
      })}
      {showCursor && !touch && (
        <div style={{ position: 'absolute', left: cp.x - 2 * (cursorSize / 20), top: cp.y - 2 * (cursorSize / 20) }}>
          <Cursor size={cursorSize} pressed={pressed} />
        </div>
      )}
      {showCursor && touch && (
        <div style={{ position: 'absolute', left: cp.x - 34, top: cp.y - 34, width: 68, height: 68, borderRadius: 34,
          background: 'rgba(255,255,255,0.35)', border: '3px solid rgba(255,255,255,0.9)', boxShadow: '0 4px 18px rgba(0,0,0,0.25)',
          transform: `scale(${1 - 0.15 * pressed})` }} />
      )}
      {shortcut && (() => {
        const k = t - shortcut.t;
        const o = Math.min(clamp01(k / 0.15), clamp01((1.3 - k) / 0.25));
        return (
          <div style={{ position: 'absolute', left: 0, right: 0, top: 1230, display: 'flex', justifyContent: 'center', gap: 16, alignItems: 'center', opacity: o, transform: `translateY(${(1 - easeOut(clamp01(k / 0.25))) * 30}px)` }}>
            {shortcut.keys.map((key: string, i: number) => (
              <React.Fragment key={key}>
                {i > 0 && <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 40, color: C.forest }}>+</span>}
                <Keycap label={key} />
              </React.Fragment>
            ))}
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};

export const clipData = clips;
