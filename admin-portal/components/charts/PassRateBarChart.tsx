'use client';
import { useState } from 'react';

// Status palette is fixed/never themed (dataviz skill, references/palette.md) —
// thresholds chosen for a WASSCE pass-rate context, each always paired with
// its visible % label so the color never carries meaning alone.
const GOOD = '#0ca30c';
const WARNING = '#fab219';
const CRITICAL = '#d03b3b';
const GRIDLINE = '#e1e0d9';
const AXIS_TEXT = '#52514e';

function colorFor(pct: number) {
  if (pct >= 70) return GOOD;
  if (pct >= 40) return WARNING;
  return CRITICAL;
}

interface Bar { subject: string; pct: number }

export function PassRateBarChart({ bars }: { bars: Bar[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (!bars.length) return null;

  const rowHeight = 32;
  const chartHeight = bars.length * rowHeight + 24;
  const labelWidth = 160;
  const chartWidth = 560;
  const plotWidth = chartWidth - labelWidth - 48;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-slate-500 mb-1">Pass Rate by Subject</h2>
      <p className="text-xs text-slate-400 mb-4">Share of presented candidates graded A1–E8 (not F9).</p>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" role="img" aria-label="Pass rate by subject">
        {[0, 25, 50, 75, 100].map(tick => {
          const x = labelWidth + (tick / 100) * plotWidth;
          return (
            <g key={tick}>
              <line x1={x} y1={0} x2={x} y2={chartHeight - 20} stroke={GRIDLINE} strokeWidth={1} />
              <text x={x} y={chartHeight - 6} fontSize={10} fill={AXIS_TEXT} textAnchor="middle">{tick}%</text>
            </g>
          );
        })}
        {bars.map((bar, i) => {
          const y = i * rowHeight + 8;
          const barHeight = Math.min(20, rowHeight - 12);
          const barWidth = (bar.pct / 100) * plotWidth;
          const color = colorFor(bar.pct);
          return (
            <g key={bar.subject} onMouseEnter={() => setHovered(bar.subject)} onMouseLeave={() => setHovered(null)}>
              <text x={labelWidth - 10} y={y + barHeight / 2 + 4} fontSize={11} fill="#0b0b0b" textAnchor="end">{bar.subject}</text>
              <rect x={labelWidth} y={y} width={plotWidth} height={barHeight} fill={GRIDLINE} opacity={0.3} rx={4} />
              <rect x={labelWidth} y={y} width={Math.max(barWidth, 4)} height={barHeight} fill={color} rx={4} />
              <text x={labelWidth + Math.max(barWidth, 4) + 6} y={y + barHeight / 2 + 4} fontSize={11} fontWeight={600} fill="#0b0b0b">{bar.pct}%</text>
              {hovered === bar.subject && (
                <rect x={labelWidth} y={y - 2} width={plotWidth} height={barHeight + 4} fill="#000000" opacity={0.03} rx={4} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: GOOD }} /> 70%+</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: WARNING }} /> 40–69%</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: CRITICAL }} /> Under 40%</span>
      </div>
    </div>
  );
}
