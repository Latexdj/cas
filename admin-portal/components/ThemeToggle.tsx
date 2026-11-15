'use client';
import { useTheme } from 'next-themes';
import { useEffect, useState, type CSSProperties } from 'react';

// Appearance control: Device (follows the phone or computer's own setting,
// the default), Light, Dark. Each tap moves to the next option, so someone on
// a shared school computer can pick an appearance and still get back to
// following the device.
const ORDER = ['system', 'light', 'dark'] as const;
type Mode = typeof ORDER[number];
const LABEL: Record<Mode, string> = { system: 'Device', light: 'Light', dark: 'Dark' };

function Icon({ mode }: { mode: Mode }) {
  const p = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'w-5 h-5', 'aria-hidden': true };
  if (mode === 'light') return (
    <svg {...p}><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  );
  if (mode === 'dark') return (
    <svg {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
  );
  return (
    <svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
  );
}

export function ThemeToggle({ className, style }: { className?: string; style?: CSSProperties }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-9 h-9" />;

  const mode: Mode = (ORDER as readonly string[]).includes(theme ?? '') ? (theme as Mode) : 'system';
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors text-[#8C7E6E] hover:bg-[#F0EBE1] dark:text-[#D6A64E] dark:hover:bg-white/5 ${className ?? ''}`}
      style={style}
      aria-label={`Appearance: ${LABEL[mode]}. Switch to ${LABEL[next]}`}
      title={`Appearance: ${LABEL[mode]}`}
    >
      <Icon mode={mode} />
    </button>
  );
}
