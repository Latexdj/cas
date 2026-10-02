'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from 'recharts';
import { principalApi } from '@/lib/principal-api';

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

const fmt = (n: number | null) => (n === null || n === undefined ? '—' : String(n));

export default function PrincipalEntryGradesPage() {
  const { theme }             = useTheme();
  const [mounted, setMounted] = useState(false);
  const [status, setStatus]   = useState<EnrollmentStatus>('Active');
  const [data, setData]       = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);
  const dark = mounted && theme === 'dark';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await principalApi.get<StatsResponse>('/api/principal/entry-grades-stats', { params: { status } });
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const cardBg     = dark ? '#1E293B' : '#FFFFFF';
  const border     = dark ? '#334155' : '#E2E8F0';
  const textStrong = dark ? '#F1F5F9' : '#1C1208';
  const textMuted  = dark ? '#64748B' : '#94A3B8';
  const gridColor  = dark ? '#334155' : '#E2D9CC';
  const green      = '#1C8A62';
  const gold       = dark ? '#B8842E' : '#C8973A';

  function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20 }}>
        <p style={{ fontWeight: 700, fontSize: 14, color: textStrong }}>{title}</p>
        {subtitle && <p style={{ fontSize: 12, color: textMuted, marginTop: 2, marginBottom: 12 }}>{subtitle}</p>}
        {children}
      </div>
    );
  }

  function StatTile({ label, value }: { label: string; value: string }) {
    return (
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: '14px 18px' }}>
        <p style={{ fontSize: 12, color: textMuted }}>{label}</p>
        <p style={{ fontSize: 24, fontWeight: 700, color: textStrong, marginTop: 4 }}>{value}</p>
      </div>
    );
  }

  function EmptyState({ message }: { message: string }) {
    return <p style={{ fontSize: 12, color: textMuted, textAlign: 'center', padding: '48px 0' }}>{message}</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: textStrong }}>Entry Grades</h2>
          <p style={{ fontSize: 13, color: textMuted, marginTop: 2 }}>BECE aggregate scores at admission.</p>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: textMuted, marginBottom: 4 }}>Enrollment</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as EnrollmentStatus)}
            style={{ border: `1px solid ${border}`, background: cardBg, color: textStrong, borderRadius: 8, padding: '7px 12px', fontSize: 13 }}
          >
            <option value="Active">Active</option>
            <option value="Graduated">Graduated</option>
            <option value="all">All Students</option>
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: 60, color: textMuted }}>Loading…</div>
      ) : !data || data.summary.with_aggregate === 0 ? (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: textMuted }}>No entry-grade data recorded yet for this filter.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <StatTile label="Total recorded" value={String(data.summary.with_aggregate)} />
            <StatTile label="Average aggregate" value={fmt(data.summary.avg)} />
            <StatTile label="Best aggregate" value={fmt(data.summary.best)} />
            <StatTile label="Worst aggregate" value={fmt(data.summary.worst)} />
          </div>

          <Card title="Aggregate distribution" subtitle="Number of students by BECE aggregate range">
            {data.distribution.every(d => d.total === 0) ? (
              <EmptyState message="No distribution data for this filter." />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.distribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke={gridColor} />
                  <XAxis dataKey="range" tick={{ fontSize: 12, fill: textMuted }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: textMuted }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: textStrong }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: textMuted }} />
                  <Bar dataKey="male" name="Male" fill={green} radius={[4, 4, 0, 0]} maxBarSize={24}>
                    <LabelList dataKey="male" position="top" fontSize={11} fill={textMuted} />
                  </Bar>
                  <Bar dataKey="female" name="Female" fill={gold} radius={[4, 4, 0, 0]} maxBarSize={24}>
                    <LabelList dataKey="female" position="top" fontSize={11} fill={textMuted} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            <Card title="Average aggregate by entry year" subtitle="Lower aggregate is better">
              {data.by_year.length === 0 ? (
                <EmptyState message="No year-of-admission data for this filter." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.by_year} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={gridColor} />
                    <XAxis dataKey="year_of_admission" tick={{ fontSize: 12, fill: textMuted }} axisLine={{ stroke: gridColor }} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: textMuted }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: textStrong }} />
                    <Line
                      type="monotone"
                      dataKey="avg_aggregate"
                      name="Average aggregate"
                      stroke={green}
                      strokeWidth={2}
                      dot={{ r: 4, fill: green, strokeWidth: 2, stroke: cardBg }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Average aggregate by program" subtitle="Best to worst">
              {data.by_program.length === 0 ? (
                <EmptyState message="No program data for this filter." />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(260, data.by_program.length * 36)}>
                  <BarChart data={data.by_program} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke={gridColor} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: textMuted }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="program_name" tick={{ fontSize: 11, fill: textMuted }} axisLine={false} tickLine={false} width={150} />
                    <Tooltip contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: textStrong }} />
                    <Bar dataKey="avg_aggregate" name="Average aggregate" fill={gold} radius={[0, 4, 4, 0]} maxBarSize={20}>
                      <LabelList dataKey="avg_aggregate" position="right" fontSize={11} fill={textMuted} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
