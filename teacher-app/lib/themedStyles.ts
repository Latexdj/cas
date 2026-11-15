/**
 * Dark mode for screens whose styles were written with literal light colours.
 *
 * createThemedStyles(def) is a drop-in for StyleSheet.create(def). It builds
 * the light sheet as written plus a dark copy in which every literal colour is
 * mapped onto the CAS warm dark palette by the job it does (background, text
 * or border), and hands out whichever matches the current appearance. The
 * ThemeProvider tells it the appearance on every render.
 *
 * tc(hex, role) does the same for a single colour written inline in JSX.
 *
 * The same mapping drives the web portals (admin-portal/scripts/gen-dark-theme.py);
 * keep the two in step. Prefer the theme tokens (useTheme()) in new code.
 */
import { StyleSheet } from 'react-native';

let dark = false;
export function setStylesDark(value: boolean) { dark = value; }

export const DARK = {
  canvas:     '#0E1A0C',
  sunken:     '#122013',
  surface:    '#16241A',
  elevated:   '#1F3024',
  ink:        '#EEE8DF',
  ink2:       '#B8B0A2',
  muted:      '#A8A091',
  line:       '#2E4230',
  lineStrong: '#3E5440',
  brand:      '#4FBF8F',
  gold:       '#D6A64E',
  ok:         '#6CC48F',
  bad:        '#F08B7E',
  warn:       '#E8A63C',
};

type Role = 'bg' | 'text' | 'border';
type RGB = readonly [number, number, number, ...unknown[]];

function parse(hex: string): [number, number, number, string] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.slice(6)];
}

function lum([r, g, b]: RGB) {
  const ch = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function hue([r, g, b]: RGB) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function sat([r, g, b]: RGB) {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
  return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
}

function contrast(a: RGB, b: RGB) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A dark background with the same hue, for pale tinted badges and panels. */
function tint(c: RGB) {
  const h = hue(c) / 360, s = Math.min(sat(c), 0.45), l = 0.15;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return '#' + [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const SURFACE = parse(DARK.surface)!;

function mapColor(hex: string, role: Role): string | null {
  const c = parse(hex);
  if (!c) return null;
  const L = lum(c), H = hue(c), C = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
  const coldDark = L < 0.08 && H >= 195 && H <= 235 && C < 60;
  let out: string | null = null;

  if (role === 'bg') {
    if (L >= 0.5) {
      const neutral = C <= 10 || (H >= 20 && H <= 50 && C < 24) || (H >= 195 && H <= 235 && C < 20);
      if (neutral) out = L > 0.93 ? DARK.surface : (L > 0.84 ? DARK.canvas : DARK.sunken);
      else out = tint(c);
    } else if (coldDark) {
      out = L < 0.012 ? DARK.canvas : L < 0.03 ? DARK.surface : DARK.elevated;
    }
  } else if (role === 'border') {
    if (L >= 0.5) out = DARK.line;
    else if (coldDark) out = L < 0.03 ? DARK.line : DARK.lineStrong;
  } else {
    if (/^#fff(fff)?$/i.test(hex)) return null;               // white on buttons stays
    if (C < 45) out = L < 0.035 ? DARK.ink : L < 0.12 ? DARK.ink2 : L < 0.45 ? DARK.muted : L < 0.7 ? DARK.ink2 : DARK.ink;
    else if (H >= 330 || H < 15) out = DARK.bad;
    else if (H < 65) out = contrast(c, SURFACE) >= 4.5 ? null : DARK.warn;
    else if (H < 175) out = hex.toUpperCase() === '#2D7A4F' ? DARK.ok : DARK.brand;
    else if (H < 250) out = DARK.brand;
    else out = DARK.gold;
  }
  return out ? out + c[3] : null;                              // keep any alpha suffix
}

function roleOf(key: string): Role | null {
  if (key === 'backgroundColor') return 'bg';
  if (key === 'color' || key === 'textDecorationColor') return 'text';
  if (/^border\w*Color$/.test(key)) return 'border';
  return null;
}

function darkStyle(style: Record<string, unknown>) {
  // Text on a solid brand, gold or red background keeps its colour: the
  // background does not change in dark mode, so neither should the text.
  const bg = style.backgroundColor;
  const solidBg = typeof bg === 'string' && mapColor(bg, 'bg') === null && parse(bg) !== null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) {
    const role = roleOf(k);
    out[k] = role && typeof v === 'string' && !(solidBg && role === 'text') ? (mapColor(v, role) ?? v) : v;
  }
  return out;
}

/** Drop-in for StyleSheet.create that also serves a dark-mode copy. */
export function createThemedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  def: T & StyleSheet.NamedStyles<any>,
): T {
  const light = StyleSheet.create(def);
  const darkDef: Record<string, unknown> = {};
  for (const [name, style] of Object.entries(def)) darkDef[name] = darkStyle(style as Record<string, unknown>);
  const darkSheet = StyleSheet.create(darkDef as T & StyleSheet.NamedStyles<any>);
  return new Proxy(light as object, {
    get: (_t, key) => (dark ? (darkSheet as any) : (light as any))[key],
  }) as T;
}

/** A literal colour written inline in JSX, adjusted for dark mode. */
export function tc(hex: string, role: Role = 'text'): string {
  return dark ? (mapColor(hex, role) ?? hex) : hex;
}
