'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from 'recharts';
import { api } from '@/lib/api';

interface Summary {
  total: number;
  with_aggregate: number;
  avg: number | null;
  best: number | null;
  worst: number | null;
}
interface DistributionRow { range: string; male: number; female: number; total: number; }
interface ProgramRow { program_name: string; avg_aggregate: number; count: number; }
interface YearRow { year_of_admission: number; avg_aggregate: number; count: number; }
interface StatsResponse {
  summary: Summary;
  distribution: DistributionRow[];
  by_program: ProgramRow[];
  by_year: YearRow[];
}

type EnrollmentStatus = 'Active' | 'Graduated' | 'all';

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

function EmptyState({ message }: { message: string }) {
  return <p className="text-xs text-slate-400 text-center py-12">{message}</p>;
}

const fmt = (n: number | null) => (n === null || n === undefined ? '—' : String(n));

export default function EntryGradesPage() {
  const [status, setStatus] = useState<EnrollmentStatus>('Active');
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<StatsResponse>('/api/students/entry-grades-stats', { params: { status } });
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Entry Grades</h1>
          <p className="text-sm text-slate-400 mt-0.5">BECE aggregate scores at admission.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Enrollment</label>
          <select
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5"
            value={status}
            onChange={e => setStatus(e.target.value as EnrollmentStatus)}
          >
            <option value="Active">Active</option>
            <option value="Graduated">Graduated</option>
            <option value="all">All Students</option>
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-4 border-[#145C44] border-t-transparent animate-spin" />
        </div>
      ) : !data || data.summary.with_aggregate === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-sm text-slate-400">No entry-grade data recorded yet for this filter.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Total recorded" value={String(data.summary.with_aggregate)} />
            <StatTile label="Average aggregate" value={fmt(data.summary.avg)} />
            <StatTile label="Best aggregate" value={fmt(data.summary.best)} />
            <StatTile label="Worst aggregate" value={fmt(data.summary.worst)} />
          </div>

          <ChartCard title="Aggregate distribution" subtitle="Number of students by BECE aggregate range">
            {data.distribution.every(d => d.total === 0) ? (
              <EmptyState message="No distribution data for this filter." />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.distribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="range" tick={{ fontSize: 12 }} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="male" name="Male" fill="var(--chart-green)" radius={[4, 4, 0, 0]} maxBarSize={24}>
                    <LabelList dataKey="male" position="top" fontSize={11} />
                  </Bar>
                  <Bar dataKey="female" name="Female" fill="var(--chart-gold)" radius={[4, 4, 0, 0]} maxBarSize={24}>
                    <LabelList dataKey="female" position="top" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard title="Average aggregate by entry year" subtitle="Lower aggregate is better">
              {data.by_year.length === 0 ? (
                <EmptyState message="No year-of-admission data for this filter." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.by_year} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="year_of_admission" tick={{ fontSize: 12 }} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="avg_aggregate"
                      name="Average aggregate"
                      stroke="var(--chart-green)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: 'var(--chart-green)', strokeWidth: 2, stroke: '#fff' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Average aggregate by program" subtitle="Best to worst">
              {data.by_program.length === 0 ? (
                <EmptyState message="No program data for this filter." />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(260, data.by_program.length * 36)}>
                  <BarChart data={data.by_program} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                    <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="program_name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={150} />
                    <Tooltip />
                    <Bar dataKey="avg_aggregate" name="Average aggregate" fill="var(--chart-gold)" radius={[0, 4, 4, 0]} maxBarSize={20}>
                      <LabelList dataKey="avg_aggregate" position="right" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
