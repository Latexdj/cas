import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Colors as DefaultColors } from '@/constants/colors';
import { storage } from '@/lib/storage';

type ColorSet = typeof DefaultColors;

interface ThemeState {
  colors: ColorSet;
  updateTheme: (primary: string, accent: string) => Promise<void>;
}

function buildColors(primary?: string | null, accent?: string | null): ColorSet {
  const p = primary?.trim() || DefaultColors.primary;
  const a = accent?.trim()  || DefaultColors.accent;
  if (p === DefaultColors.primary && a === DefaultColors.accent) return DefaultColors;
  return {
    ...DefaultColors,
    primary:      p,
    primaryMid:   p,
    primaryLight: p + '22',
    accent:       a,
    accentLight:  a + '22',
    tabActive:    p,
  };
}

const ThemeContext = createContext<ThemeState>({
  colors: DefaultColors,
  updateTheme: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colors, setColors] = useState<ColorSet>(DefaultColors);

  useEffect(() => {
    Promise.all([storage.getPrimaryColor(), storage.getAccentColor()]).then(([p, a]) => {
      setColors(buildColors(p, a));
    });
  }, []);

  const updateTheme = useCallback(async (primary: string, accent: string) => {
    await storage.saveTheme(primary, accent);
    setColors(buildColors(primary, accent));
  }, []);

  return (
    <ThemeContext.Provider value={{ colors, updateTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme()       { return useContext(ThemeContext).colors; }
export function useUpdateTheme() { return useContext(ThemeContext).updateTheme; }
