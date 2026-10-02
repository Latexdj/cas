'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { api } from '@/lib/api';

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

const fmtPct = (n: number | null) => (n === null || n === undefined ? '—' : `${n}%`);

export default function ExamPerformancePage() {
  const [years, setYears]           = useState<AcademicYear[]>([]);
  const [yearId, setYearId]         = useState('');
  const [semester, setSemester]     = useState<1 | 2>(1);
  const [status, setStatus]         = useState<EnrollmentStatus>('Active');
  const [data, setData]             = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading]       = useState(true);
  const [yearsLoaded, setYearsLoaded] = useState(false);

  useEffect(() => {
    api.get<AcademicYear[]>('/api/academic-years').then(r => {
      setYears(r.data);
      const current = r.data.find(y => y.is_current) ?? r.data[0];
      if (current) {
        setYearId(current.id);
        setSemester((current.current_semester === 2 ? 2 : 1));
      }
      setYearsLoaded(true);
    }).catch(() => setYearsLoaded(true));
  }, []);

  const load = useCallback(async () => {
    if (!yearId) return;
    setLoading(true);
    try {
      const r = await api.get<AnalyticsResponse>('/api/results/analytics', {
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Exam Performance</h1>
          <p className="text-sm text-slate-400 mt-0.5">Internal exam results, blended with continuous assessment and graded against your configured boundaries.</p>
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Academic Year</label>
            <select className="text-sm border border-slate-200 rounded-lg px-3 py-1.5" value={yearId} onChange={e => setYearId(e.target.value)}>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Semester</label>
            <select className="text-sm border border-slate-200 rounded-lg px-3 py-1.5" value={semester} onChange={e => setSemester(Number(e.target.value) as 1 | 2)}>
              <option value={1}>Semester 1</option>
              <option value={2}>Semester 2</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Enrollment</label>
            <select className="text-sm border border-slate-200 rounded-lg px-3 py-1.5" value={status} onChange={e => setStatus(e.target.value as EnrollmentStatus)}>
              <option value="Active">Active</option>
              <option value="Graduated">Graduated</option>
              <option value="all">All Students</option>
            </select>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-4 border-[#145C44] border-t-transparent animate-spin" />
        </div>
      ) : !data ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-sm text-slate-400">Could not load exam performance data.</p>
        </div>
      ) : (
        <>
          {data.by_term.length > 0 && (
            <ChartCard title="Performance trend" subtitle="Terminal exam average by term, across every term on record — not blended with CA like the charts below">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.by_term} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [`${v}%`, 'Average']} />
                  <Line
                    type="monotone"
                    dataKey="avg_pct"
                    name="Average"
                    stroke="var(--chart-green)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'var(--chart-green)', strokeWidth: 2, stroke: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {data.summary.total_students === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center">
              <p className="text-sm text-slate-400">No results recorded for this term yet.</p>
            </div>
          ) : (
          <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatTile label="Students scored" value={String(data.summary.total_students)} />
            <StatTile label="School average" value={fmtPct(data.summary.average)} />
            <StatTile label="Pass rate" value={fmtPct(data.summary.pass_rate)} />
            <StatTile label="Highest class average" value={fmtPct(data.summary.highest_class_avg)} />
            <StatTile label="Lowest class average" value={fmtPct(data.summary.lowest_class_avg)} />
          </div>

          <ChartCard title="Class performance" subtitle="Average score by class, best to worst">
            {data.by_class.length === 0 ? (
              <EmptyState message="No class data for this filter." />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(260, data.by_class.length * 36)}>
                <BarChart data={data.by_class} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="class_name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip formatter={(v, name) => [`${v}%`, String(name)]} />
                  <Bar dataKey="avg" name="Average" fill="var(--chart-gold)" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    <LabelList dataKey="avg" position="right" fontSize={11} formatter={(v) => `${v}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Subject performance" subtitle="Average score by subject, best to worst">
            {data.by_subject.length === 0 ? (
              <EmptyState message="No subject data for this filter." />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(260, data.by_subject.length * 32)}>
                <BarChart data={data.by_subject} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="subject" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={150} />
                  <Tooltip formatter={(v, name) => [`${v}%`, String(name)]} />
                  <Bar dataKey="avg" name="Average" fill="var(--chart-gold)" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    <LabelList dataKey="avg" position="right" fontSize={11} formatter={(v) => `${v}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {data.grade_distribution.length === 0 ? (
            <ChartCard title="Grade distribution" subtitle="Number of students by overall grade, this term">
              <EmptyState message="No grade data for this filter." />
            </ChartCard>
          ) : (
            data.grade_distribution.map(group => (
              <ChartCard
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
            ))
          )}
          </>
          )}
        </>
      )}
    </div>
  );
}
