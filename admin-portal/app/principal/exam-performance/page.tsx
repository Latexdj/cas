'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { principalApi } from '@/lib/principal-api';

interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number | null; }

interface Summary {
  total_students: number;
  average: number | null;
  pass_rate: number | null;
  highest_class_avg: number | null;
  lowest_class_avg: number | null;
}
interface ClassRow { class_name: string; avg: number; pass_rate: number; count: number; }
interface SubjectRow { subject: string; avg: number; pass_rate: number; count: number; }
interface GradeRow { grade: string; count: number; }
interface GradeDistributionGroup { exam_body: string; grades: GradeRow[]; }
interface TermRow { label: string; academic_year_id: string; semester: number; avg_pct: number; count: number; }
interface AnalyticsResponse {
  summary: Summary;
  by_class: ClassRow[];
  by_subject: SubjectRow[];
  grade_distribution: GradeDistributionGroup[];
  by_term: TermRow[];
}

type EnrollmentStatus = 'Active' | 'Graduated' | 'all';

const fmtPct = (n: number | null) => (n === null || n === undefined ? '—' : `${n}%`);

export default function PrincipalExamPerformancePage() {
  const { theme }               = useTheme();
  const [mounted, setMounted]   = useState(false);
  const [years, setYears]       = useState<AcademicYear[]>([]);
  const [yearId, setYearId]     = useState('');
  const [semester, setSemester] = useState<1 | 2>(1);
  const [status, setStatus]     = useState<EnrollmentStatus>('Active');
  const [data, setData]         = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [yearsLoaded, setYearsLoaded] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  const dark = mounted && theme === 'dark';

  useEffect(() => {
    principalApi.get<AcademicYear[]>('/api/academic-years').then(r => {
      setYears(r.data);
      const current = r.data.find(y => y.is_current) ?? r.data[0];
      if (current) {
        setYearId(current.id);
        setSemester(current.current_semester === 2 ? 2 : 1);
      }
      setYearsLoaded(true);
    }).catch(() => setYearsLoaded(true));
  }, []);

  const load = useCallback(async () => {
    if (!yearId) return;
    setLoading(true);
    try {
      const r = await principalApi.get<AnalyticsResponse>('/api/principal/results/analytics', {
        params: { academic_year_id: yearId, semester, status },
      });
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [yearId, semester, status]);

  useEffect(() => { if (yearsLoaded) load(); }, [yearsLoaded, load]);

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

  const selectStyle = { border: `1px solid ${border}`, background: cardBg, color: textStrong, borderRadius: 8, padding: '7px 12px', fontSize: 13 };
  const labelStyle  = { display: 'block' as const, fontSize: 11, fontWeight: 600, color: textMuted, marginBottom: 4 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: textStrong }}>Exam Performance</h2>
          <p style={{ fontSize: 13, color: textMuted, marginTop: 2 }}>Internal exam results, blended with continuous assessment and graded against your configured boundaries.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Academic Year</label>
            <select value={yearId} onChange={e => setYearId(e.target.value)} style={selectStyle}>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Semester</label>
            <select value={semester} onChange={e => setSemester(Number(e.target.value) as 1 | 2)} style={selectStyle}>
              <option value={1}>Semester 1</option>
              <option value={2}>Semester 2</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Enrollment</label>
            <select value={status} onChange={e => setStatus(e.target.value as EnrollmentStatus)} style={selectStyle}>
              <option value="Active">Active</option>
              <option value="Graduated">Graduated</option>
              <option value="all">All Students</option>
            </select>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: 60, color: textMuted }}>Loading…</div>
      ) : !data ? (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: textMuted }}>Could not load exam performance data.</p>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', justifyContent: 'center', paddingTop: 96 }}>
            <div className="w-8 h-8 rounded-full border-4 border-[#145C44] border-t-transparent animate-spin" />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, opacity: loading ? 0.4 : 1, pointerEvents: loading ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
          {data.by_term.length > 0 && (
            <Card title="Performance trend" subtitle="Terminal exam average by term, across every term on record — not blended with CA like the charts below">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.by_term} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: textMuted }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: textMuted }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: textStrong }} formatter={(v) => [`${v}%`, 'Average']} />
                  <Line type="monotone" dataKey="avg_pct" name="Average" stroke={green} strokeWidth={2} dot={{ r: 4, fill: green, strokeWidth: 2, stroke: cardBg }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {data.summary.total_students === 0 ? (
            <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 48, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: textMuted }}>No results recorded for this term yet.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <StatTile label="Students scored" value={String(data.summary.total_students)} />
                <StatTile label="School average" value={fmtPct(data.summary.average)} />
                <StatTile label="Pass rate" value={fmtPct(data.summary.pass_rate)} />
                <StatTile label="Highest class average" value={fmtPct(data.summary.highest_class_avg)} />
                <StatTile label="Lowest class average" value={fmtPct(data.summary.lowest_class_avg)} />
              </div>

              <Card title="Class performance" subtitle="Average score by class, best to worst">
                {data.by_class.length === 0 ? (
                  <EmptyState message="No class data for this filter." />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(260, data.by_class.length * 36)}>
                    <BarChart data={data.by_class} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 0 }}>
                      <CartesianGrid horizontal={false} stroke={gridColor} />
                      <XAxis type="number" tick={{ fontSize: 12, fill: textMuted }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="class_name" tick={{ fontSize: 11, fill: textMuted }} axisLine={false} tickLine={false} width={120} />
                      <Tooltip contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: textStrong }} formatter={(v, name) => [`${v}%`, String(name)]} />
                      <Bar dataKey="avg" name="Average" fill={gold} radius={[0, 4, 4, 0]} maxBarSize={20}>
                        <LabelList dataKey="avg" position="right" fontSize={11} fill={textMuted} formatter={(v) => `${v}%`} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card title="Subject performance" subtitle="Average score by subject, best to worst">
                {data.by_subject.length === 0 ? (
                  <EmptyState message="No subject data for this filter." />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(260, data.by_subject.length * 32)}>
                    <BarChart data={data.by_subject} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 0 }}>
                      <CartesianGrid horizontal={false} stroke={gridColor} />
                      <XAxis type="number" tick={{ fontSize: 12, fill: textMuted }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="subject" tick={{ fontSize: 11, fill: textMuted }} axisLine={false} tickLine={false} width={150} />
                      <Tooltip contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: textStrong }} formatter={(v, name) => [`${v}%`, String(name)]} />
                      <Bar dataKey="avg" name="Average" fill={gold} radius={[0, 4, 4, 0]} maxBarSize={20}>
                        <LabelList dataKey="avg" position="right" fontSize={11} fill={textMuted} formatter={(v) => `${v}%`} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              {data.grade_distribution.length === 0 ? (
                <Card title="Grade distribution" subtitle="Number of students by overall grade, this term">
                  <EmptyState message="No grade data for this filter." />
                </Card>
              ) : (
                data.grade_distribution.map(group => (
                  <Card
                    key={group.exam_body}
                    title="Grade distribution"
                    subtitle={
                      data.grade_distribution.length > 1
                        ? `Number of students by overall grade, this term (${group.exam_body})`
                        : 'Number of students by overall grade, this term'
                    }
                  >
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={group.grades} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={gridColor} />
                        <XAxis dataKey="grade" tick={{ fontSize: 12, fill: textMuted }} axisLine={{ stroke: gridColor }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: textMuted }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: textStrong }} />
                        <Bar dataKey="count" name="Students" fill={green} radius={[4, 4, 0, 0]} maxBarSize={32}>
                          <LabelList dataKey="count" position="top" fontSize={11} fill={textMuted} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                ))
              )}
            </>
          )}
        </div>
        </div>
      )}
    </div>
  );
}
