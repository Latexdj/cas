import { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

const statConfig: Record<string, { color: string; bg: string }> = {
  green:  { color: '#2D7A4F', bg: '#E4F4EB' },
  red:    { color: '#B83232', bg: '#FBEAEA' },
  blue:   { color: '#1D4ED8', bg: '#DBEAFE' },
  purple: { color: '#6D28D9', bg: '#EDE9FE' },
  yellow: { color: '#C8780A', bg: '#FEF3DC' },
};

export function StatCard({ label, value, color = 'blue' }: { label: string; value: number | string; color?: string }) {
  const cfg = statConfig[color] ?? statConfig.blue;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl px-5 pt-4 pb-5 border border-slate-100 dark:border-slate-700 shadow-sm">
      <div
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg mb-3"
        style={{ backgroundColor: cfg.bg }}
      >
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
      <p className="text-xs font-medium mt-1" style={{ color: '#8C7E6E' }}>{label}</p>
    </div>
  );
}
