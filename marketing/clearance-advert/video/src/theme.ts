import { continueRender, delayRender, staticFile } from 'remotion';

// CAS brand colours, taken from the app (sidebar, buttons, footer).
export const C = {
  forest: '#0B3D2E',
  forestDeep: '#072A20',
  green: '#145C44',
  gold: '#C8973A',
  goldLight: '#E8B85C',
  cream: '#F5F0E8',
  ink: '#1C1208',
  muted: '#8C7E6E',
};

export const FPS = 30;
export const W = 1080;
export const H = 1920;
// The UI was captured at an 864x1536 CSS-pixel viewport; at zoom 1 it
// fills the 1080x1920 frame exactly.
export const VIEW = { w: 864, h: 1536 };
export const PX = W / VIEW.w;

export const FONT = 'Geist';
export const MONO = 'Geist Mono';

const faces: [string, string, number][] = [
  [FONT, 'fonts/Geist-Regular.woff2', 400],
  [FONT, 'fonts/Geist-Medium.woff2', 500],
  [FONT, 'fonts/Geist-SemiBold.woff2', 600],
  [FONT, 'fonts/Geist-Bold.woff2', 700],
  [FONT, 'fonts/Geist-Black.woff2', 900],
  [MONO, 'fonts/GeistMono-Regular.woff2', 400],
];

let loaded = false;
export function loadFonts() {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;
  const handle = delayRender('fonts');
  Promise.all(
    faces.map(([family, file, weight]) => {
      const f = new FontFace(family, `url(${staticFile(file)})`, { weight: String(weight) });
      return f.load().then(ff => document.fonts.add(ff));
    }),
  ).then(() => continueRender(handle));
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
