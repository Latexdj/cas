import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Colors as DefaultColors, DarkColors } from '@/constants/colors';
import { storage } from '@/lib/storage';
import { setStylesDark } from '@/lib/themedStyles';

type ColorSet = typeof DefaultColors;

/** Device = follow the phone's own setting (the default). */
export type Appearance = 'system' | 'light' | 'dark';

interface ThemeState {
  colors:        ColorSet;
  isDark:        boolean;
  appearance:    Appearance;
  setAppearance: (mode: Appearance) => Promise<void>;
  updateTheme:   (primary: string, accent: string) => Promise<void>;
}

function luminance(hex: string) {
  const h = hex.replace('#', '').slice(0, 6);
  const ch = (i: number) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

function buildColors(primary?: string | null, accent?: string | null, dark = false): ColorSet {
  const base = dark ? DarkColors : DefaultColors;
  const p = primary?.trim() || base.primary;
  const a = accent?.trim()  || base.accent;
  if (p === base.primary && a === base.accent) return base;
  // A school's own brand colour is usually dark; as text on a dark surface it
  // needs the light brand green instead (contrast below 4.5:1 otherwise).
  const pText = dark ? ((luminance(p) + 0.05) / (luminance(DarkColors.surface) + 0.05) >= 4.5 ? p : DarkColors.primaryText) : p;
  return {
    ...base,
    primary:      p,
    primaryMid:   p,
    primaryText:  pText,
    primaryLight: dark ? p + '33' : p + '22',
    accent:       a,
    accentLight:  dark ? a + '33' : a + '22',
    tabActive:    dark ? pText : p,
  };
}

const ThemeContext = createContext<ThemeState>({
  colors:        DefaultColors,
  isDark:        false,
  appearance:    'system',
  setAppearance: async () => {},
  updateTheme:   async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>('system');
  const [primary,    setPrimary]         = useState<string | null>(null);
  const [accent,     setAccent]          = useState<string | null>(null);
  const [loaded,     setLoaded]          = useState(false);

  useEffect(() => {
    Promise.all([
      storage.getPrimaryColor(),
      storage.getAccentColor(),
      storage.getDarkMode(),
    ]).then(([p, a, dm]) => {
      setPrimary(p);
      setAccent(a);
      setAppearanceState(dm === '1' ? 'dark' : dm === '0' ? 'light' : 'system');
      setLoaded(true);
    });
  }, []);

  const isDark = appearance === 'system' ? systemScheme === 'dark' : appearance === 'dark';
  const colors = useMemo(() => buildColors(primary, accent, isDark), [primary, accent, isDark]);
  // Screens styled with createThemedStyles read this on their next render.
  setStylesDark(isDark);

  const setAppearance = useCallback(async (mode: Appearance) => {
    await storage.saveDarkMode(mode === 'system' ? null : mode === 'dark');
    setAppearanceState(mode);
  }, []);

  const updateTheme = useCallback(async (newPrimary: string, newAccent: string) => {
    await storage.saveTheme(newPrimary, newAccent);
    setPrimary(newPrimary);
    setAccent(newAccent);
  }, []);

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ colors, isDark, appearance, setAppearance, updateTheme }}>
      {/* Status bar icons follow the app's appearance, not only the phone's.
          Not translucent: the app is not edge-to-edge (app.json), so screen
          headers don't leave room for a status bar drawn over them. */}
      <StatusBar style={isDark ? 'light' : 'dark'} translucent={false} backgroundColor={colors.surface} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme()         { return useContext(ThemeContext).colors; }
export function useIsDark()        { return useContext(ThemeContext).isDark; }
export function useAppearance()    { const c = useContext(ThemeContext); return [c.appearance, c.setAppearance] as const; }
export function useUpdateTheme()   { return useContext(ThemeContext).updateTheme; }
