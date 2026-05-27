import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Colors as DefaultColors, DarkColors } from '@/constants/colors';
import { storage } from '@/lib/storage';

type ColorSet = typeof DefaultColors;

interface ThemeState {
  colors:      ColorSet;
  isDark:      boolean;
  updateTheme: (primary: string, accent: string) => Promise<void>;
  toggleDark:  () => Promise<void>;
}

function buildColors(primary?: string | null, accent?: string | null, dark = false): ColorSet {
  const base = dark ? DarkColors : DefaultColors;
  const p = primary?.trim() || base.primary;
  const a = accent?.trim()  || base.accent;
  if (p === base.primary && a === base.accent) return base;
  return {
    ...base,
    primary:      p,
    primaryMid:   p,
    primaryLight: dark ? p + '33' : p + '22',
    accent:       a,
    accentLight:  dark ? a + '33' : a + '22',
    tabActive:    p,
  };
}

const ThemeContext = createContext<ThemeState>({
  colors:      DefaultColors,
  isDark:      false,
  updateTheme: async () => {},
  toggleDark:  async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDark,   setIsDark]   = useState(false);
  const [primary,  setPrimary]  = useState<string | null>(null);
  const [accent,   setAccent]   = useState<string | null>(null);
  const [colors,   setColors]   = useState<ColorSet>(DefaultColors);
  const [loaded,   setLoaded]   = useState(false);

  useEffect(() => {
    Promise.all([
      storage.getPrimaryColor(),
      storage.getAccentColor(),
      storage.getDarkMode(),
    ]).then(([p, a, dm]) => {
      const dark = dm === null ? systemScheme === 'dark' : dm === '1';
      setPrimary(p);
      setAccent(a);
      setIsDark(dark);
      setColors(buildColors(p, a, dark));
      setLoaded(true);
    });
  }, [systemScheme]);

  const updateTheme = useCallback(async (newPrimary: string, newAccent: string) => {
    await storage.saveTheme(newPrimary, newAccent);
    setPrimary(newPrimary);
    setAccent(newAccent);
    setColors(buildColors(newPrimary, newAccent, isDark));
  }, [isDark]);

  const toggleDark = useCallback(async () => {
    const next = !isDark;
    await storage.saveDarkMode(next);
    setIsDark(next);
    setColors(buildColors(primary, accent, next));
  }, [isDark, primary, accent]);

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ colors, isDark, updateTheme, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme()       { return useContext(ThemeContext).colors; }
export function useIsDark()      { return useContext(ThemeContext).isDark; }
export function useToggleDark()  { return useContext(ThemeContext).toggleDark; }
export function useUpdateTheme() { return useContext(ThemeContext).updateTheme; }
