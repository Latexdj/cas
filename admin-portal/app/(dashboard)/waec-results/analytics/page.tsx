'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface GenderCount { boys: number; girls: number; total: number }
interface AnalyticsRow {
  subject: string; year: number; isCore: boolean;
  presented: GenderCount; percentagePass: GenderCount; failRate: number;
  topGrade: string | null; gradeDistribution: Record<string, { boys: number; girls: number }>;
  performanceLabel: string;
}
interface Analytics {
  years: number[]; subjects: string[]; totalCandidates: number; overallPassRate: number;
  rows: AnalyticsRow[]; latestBySubject: AnalyticsRow[];
}

const WAEC_GRADE_ORDER = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];

// Six labels, three functional colors — Excellent/Very Good/Good all read
// as "passing well" (green), Average/Below Average as a caution (amber),
// Needs Improvement as the one that needs attention (red). Six distinct
// hues for six bands would be decoration, not signal.
const LABEL_COLOR: Record<string, string> = {
  Excellent: '#2D7A4F', 'Very Good': '#2D7A4F', Good: '#2D7A4F',
  Average: '#C8780A', 'Below Average': '#C8780A',
  'Needs Improvement': '#B83232',
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
        active ? 'bg-[#145C44] text-white border-[#145C44]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5 mb-3">{subtitle}</p>}
      {children}
    </div>
  );
}

const TREND_COLORS = ['#145C44', '#C8973A', '#B83232', '#2D7A4F', '#6B6358'];

export default function WaecAnalyticsPage() {
  const [full, setFull] = useState<Analytics | null>(null); // unfiltered, drives the chip lists
  const [data, setData] = useState<Analytics | null>(null); // filtered view
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'csv' | null>(null);

  useEffect(() => {
    api.get<Analytics>('/api/admin/exam-results/analytics')
      .then(r => { setFull(r.data); setData(r.data); })
      .catch(() => setError('Could not load analytics — check your connection and try again.'))
      .finally(() => setLoading(false));
  }, []);

  const load = useCallback(async (subjects: string[], years: number[]) => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get<Analytics>('/api/admin/exam-results/analytics', {
        params: {
          ...(subjects.length ? { subjects: subjects.join(',') } : {}),
          ...(years.length ? { years: years.join(',') } : {}),
        },
      });
      setData(res);
    } catch {
      setError('Could not load analytics — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  function toggleSubject(s: string) {
    const next = selectedSubjects.includes(s) ? selectedSubjects.filter(x => x !== s) : [...selectedSubjects, s];
    setSelectedSubjects(next);
    load(next, selectedYears);
  }
  function toggleYear(y: number) {
    const next = selectedYears.includes(y) ? selectedYears.filter(x => x !== y) : [...selectedYears, y];
    setSelectedYears(next);
    load(selectedSubjects, next);
  }
  function clearFilters() {
    setSelectedSubjects([]);
    setSelectedYears([]);
    load([], []);
  }

  async function exportCsv() {
    setExporting('csv');
    try {
      const token = localStorage.getItem('cas_token');
      const base = process.env.NEXT_PUBLIC_API_URL ?? '';
      const params = new URLSearchParams();
      if (selectedSubjects.length) params.set('subjects', selectedSubjects.join(','));
      if (selectedYears.length) params.set('years', selectedYears.join(','));
      const r = await fetch(`${base}/api/admin/exam-results/analytics/export.csv?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'WAEC_Analytics.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('CSV export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  }

  // Trend data: one point per year. When specific subjects are selected,
  // one line per subject; otherwise a single "Overall" line, weighted the
  // same way the summary tile's overallPassRate is (exact pass counts over
  // exact presented counts, not an average of the per-subject percentages).
  const trend = useMemo(() => {
    if (!data) return { lines: [] as string[], points: [] as Record<string, number | string>[] };
    const years = [...new Set(data.rows.map(r => r.year))].sort((a, b) => a - b);
    if (selectedSubjects.length > 0) {
      const points = years.map(year => {
        const point: Record<string, number | string> = { year };
        for (const subject of selectedSubjects) {
          const row = data.rows.find(r => r.year === year && r.subject === subject);
          if (row) point[subject] = row.percentagePass.total;
        }
        return point;
      });
      return { lines: selectedSubjects, points };
    }
    const points = years.map(year => {
      const yearRows = data.rows.filter(r => r.year === year);
      const presented = yearRows.reduce((s, r) => s + r.presented.total, 0);
      const passed = yearRows.reduce((s, r) => s + Math.round((r.percentagePass.total / 100) * r.presented.total), 0);
      return { year, Overall: presented > 0 ? Math.round((passed / presented) * 1000) / 10 : 0 };
    });
    return { lines: ['Overall'], points };
  }, [data, selectedSubjects]);

  // Grade-distribution charts only render for a focused selection (1-4
  // subjects) — rendering one per subject when "All" is in view (often
  // 9+ subjects) would turn the page into an unreadable wall of charts.
  const gradeDistCharts = useMemo(() => {
    if (!data || selectedSubjects.length === 0 || selectedSubjects.length > 4) return [];
    return selectedSubjects.map(subject => {
      const subjectRows = data.rows.filter(r => r.subject === subject);
      const grades = WAEC_GRADE_ORDER.map(grade => {
        const count = subjectRows.reduce((s, r) => s + (r.gradeDistribution[grade] ? r.gradeDistribution[grade].boys + r.gradeDistribution[grade].girls : 0), 0);
        return { grade, count };
      });
      return { subject, grades };
    });
  }, [data, selectedSubjects]);

  if (error && !data) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 max-w-xl">{error}</p>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/waec-results" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; WAEC Results</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">WASSCE Analytics</h1>
          <p className="text-sm text-slate-400 mt-0.5">Pass-rate trends and subject comparisons across every year on record.</p>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={exporting !== null || !data}>
          {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

      {full && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Subject</p>
            <div className="flex flex-wrap gap-1.5">
              {full.subjects.map(s => <Chip key={s} active={selectedSubjects.includes(s)} onClick={() => toggleSubject(s)}>{s}</Chip>)}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Year</p>
            <div className="flex flex-wrap gap-1.5">
              {full.years.map(y => <Chip key={y} active={selectedYears.includes(y)} onClick={() => toggleYear(y)}>{y}</Chip>)}
            </div>
          </div>
          {(selectedSubjects.length > 0 || selectedYears.length > 0) && (
            <button onClick={clearFilters} className="text-xs font-semibold text-[#145C44] hover:underline">Clear filters</button>
          )}
        </div>
      )}

      {!data ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-4 border-[#145C44] border-t-transparent animate-spin" />
        </div>
      ) : data.rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-sm text-slate-400">No results match this filter.</p>
        </div>
      ) : (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-start justify-center pt-24">
              <div className="w-8 h-8 rounded-full border-4 border-[#145C44] border-t-transparent animate-spin" />
            </div>
          )}
          <div className={loading ? 'opacity-40 pointer-events-none transition-opacity duration-200 space-y-6' : 'transition-opacity duration-200 space-y-6'}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Total candidates" value={String(data.totalCandidates)} />
              <StatTile label="Overall pass rate" value={`${data.overallPassRate}%`} />
              <StatTile label="Subjects" value={String(data.subjects.length)} />
              <StatTile label="Years analyzed" value={String(data.years.length)} />
            </div>

            <ChartCard title="Performance trend" subtitle={selectedSubjects.length > 0 ? 'Pass rate by year, per selected subject' : 'Overall pass rate by year, weighted by candidates'}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend.points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [`${v}%`, 'Pass rate']} />
                  {trend.lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                  {trend.lines.map((line, i) => (
                    <Line key={line} type="monotone" dataKey={line} name={line}
                      stroke={TREND_COLORS[i % TREND_COLORS.length]} strokeWidth={2}
                      dot={{ r: 4, fill: TREND_COLORS[i % TREND_COLORS.length], strokeWidth: 2, stroke: '#fff' }}
                      connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {gradeDistCharts.length > 0 && gradeDistCharts.map(({ subject, grades }) => (
              <ChartCard key={subject} title={`Grade distribution — ${subject}`} subtitle="Across the selected years">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={grades} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="grade" tick={{ fontSize: 12 }} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Students" fill="var(--chart-green)" radius={[4, 4, 0, 0]} maxBarSize={32}>
                      <LabelList dataKey="count" position="top" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            ))}

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Latest year, by subject</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.latestBySubject.map(r => (
                  <div key={r.subject} className="border border-slate-100 rounded-lg p-3">
                    <p className="text-sm font-semibold text-slate-800">{r.subject}</p>
                    <p className="text-xs text-slate-400">{r.year} · {r.presented.total} candidates</p>
                    <div className="flex items-center justify-between mt-2 mb-1">
                      <span className="text-lg font-bold text-slate-900">{r.percentagePass.total}%</span>
                      <span className="text-xs font-semibold" style={{ color: LABEL_COLOR[r.performanceLabel] }}>{r.performanceLabel}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${r.percentagePass.total}%`, background: LABEL_COLOR[r.performanceLabel] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <h3 className="text-sm font-semibold text-slate-700 px-5 pt-5">Subject performance by year</h3>
              <table className="w-full text-sm mt-3">
                <thead className="bg-slate-50 text-xs text-slate-500 font-semibold">
                  <tr>
                    <th className="text-left px-4 py-2.5">Subject</th>
                    <th className="text-left px-4 py-2.5">Year</th>
                    <th className="text-left px-4 py-2.5">Candidates</th>
                    <th className="text-left px-4 py-2.5">Pass rate</th>
                    <th className="text-left px-4 py-2.5">Fail rate</th>
                    <th className="text-left px-4 py-2.5">Top grade</th>
                    <th className="text-left px-4 py-2.5">Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...data.rows].sort((a, b) => a.subject.localeCompare(b.subject) || b.year - a.year).map(r => (
                    <tr key={`${r.subject}-${r.year}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{r.subject}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.year}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.presented.total}</td>
                      <td className="px-4 py-2.5 text-slate-700 font-semibold">{r.percentagePass.total}%</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.failRate}%</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.topGrade ?? '—'}</td>
                      <td className="px-4 py-2.5 font-semibold" style={{ color: LABEL_COLOR[r.performanceLabel] }}>{r.performanceLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
