export interface ThemePreset {
  name: string;
  primary: string;
  accent: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { name: 'CAS Classic',        primary: '#0B3D2E', accent: '#C8973A' },
  { name: 'Winter Chill',       primary: '#1E3A4A', accent: '#5FA8C7' },
  { name: 'Mountain Mist',      primary: '#2F3D36', accent: '#A3C2A8' },
  { name: 'Emerald Odyssey',    primary: '#0E5C3F', accent: '#D4AF37' },
  { name: 'Under the Moonlight', primary: '#1B1F3B', accent: '#B8C9E0' },
  { name: 'Graphite & Sky',     primary: '#1D1D1F', accent: '#007AFF' },
  { name: 'Meeting Blue',       primary: '#113F67', accent: '#2D8CFF' },
  { name: 'Office Blue',        primary: '#1B3A57', accent: '#0078D4' },
];
