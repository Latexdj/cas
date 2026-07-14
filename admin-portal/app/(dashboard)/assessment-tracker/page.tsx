'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number; }
interface Teacher      { id: string; name: string; department: string | null; }

interface MonitorRow {
  teacher_id: string;
  teacher_name: string;
  department: string | null;
  subject: string;
  class_name: string;
  total_students: number;
  assessments_created: number;
  assessment_names: string[];
  students_ca_scored: number;
  students_exam_scored: number;
  submission_status: string | null;
  status: 'not_started' | 'in_progress' | 'scores_complete' | 'submitted' | 'hod_approved' | 'final_approved' | 'published';
}

interface MonitorData {
  summary: { total: number; not_started: number; in_progress: number; scores_complete: number; submitted: number; published: number; };
  rows: MonitorRow[];
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  not_started:     { label: 'Not Started',      color: '#DC2626', bg: '#FEF2F2' },
  in_progress:     { label: 'In Progress',       color: '#D97706', bg: '#FFFBEB' },
  scores_complete: { label: 'Scores Complete',   color: '#0369A1', bg: '#EFF6FF' },
  submitted:       { label: 'Submitted',         color: '#1D4ED8', bg: '#DBEAFE' },
  hod_approved:    { label: 'HOD Approved',      color: '#065F46', bg: '#D1FAE5' },
  final_approved:  { label: 'Final Approved',    color: '#3730A3', bg: '#EDE9FE' },
  published:       { label: 'Published',         color: '#14532D', bg: '#F0FDF4' },
};

export default function AssessmentTrackerPage() {
  const [years,      setYears]      = useState<AcademicYear[]>([]);
  const [teachers,   setTeachers]   = useState<Teacher[]>([]);
  const [yearId,     setYearId]     = useState('');
  const [semester,   setSemester]   = useState<1|2>(1);
  const [filterDept, setFilterDept] = useState('');
  const [filterTch,  setFilterTch]  = useState('');
  const [filterStat, setFilterStat] = useState('');
  const [data,       setData]       = useState<MonitorData | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [expanded,   setExpanded]   = useState<string | null>(null); // expanded teacher_id

  useEffect(() => {
    Promise.all([
      api.get<AcademicYear[]>('/api/academic-years'),
      api.get<Teacher[]>('/api/teachers'),
    ]).then(([yr, tch]) => {
      setYears(yr.data);
      setTeachers(tch.data);
      const cur = yr.data.find(y => y.is_current);
      if (cur) { setYearId(cur.id); setSemester(cur.current_semester as 1|2); }
    }).catch(() => {});
  }, []);

  const load = useCallback(async (yId = yearId, sem = semester) => {
    if (!yId) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ academic_year_id: yId, semester: String(sem) });
      if (filterDept) params.set('department', filterDept);
      if (filterTch)  params.set('teacher_id', filterTch);
      const { data: res } = await api.get<MonitorData>(`/api/assessment-monitoring?${params}`);
      setData(res);
    } catch {
      setError('Failed to load monitoring data.');
    } finally { setLoading(false); }
  }, [yearId, semester, filterDept, filterTch]);

  useEffect(() => { if (yearId) load(); }, [yearId, semester, load]);

  // Group rows by teacher for the expanded view
  const byTeacher = (data?.rows ?? []).reduce<Record<string, MonitorRow[]>>((acc, r) => {
    (acc[r.teacher_id] ??= []).push(r);
    return acc;
  }, {});

  // Get unique teachers in display order
  const teacherList = Object.entries(byTeacher).map(([tid, rows]) => ({
    teacher_id:   tid,
    teacher_name: rows[0].teacher_name,
    department:   rows[0].department,
    rows,
    // Worst status for the teacher (for sorting/highlighting)
    worstStatus: rows.some(r => r.status === 'not_started') ? 'not_started'
                : rows.some(r => r.status === 'in_progress') ? 'in_progress'
                : rows.some(r => r.status === 'scores_complete') ? 'scores_complete'
                : rows[0].status,
  }));

  // Apply status filter
  const filtered = teacherList.filter(t => {
    if (filterStat && !t.rows.some(r => r.status === filterStat)) return false;
    return true;
  });

  // Unique departments for filter
  const depts = [...new Set(teachers.map(t => t.department).filter(Boolean))].sort() as string[];

  const s = data?.summary;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Assessment Tracker</h1>
        <p className="text-sm text-slate-500 mt-0.5">Monitor which teachers have entered assessments based on their timetable assignments.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-3 items-center shadow-sm">
        <select value={yearId} onChange={e => { setYearId(e.target.value); setData(null); }}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900">
          <option value="">Select year…</option>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select value={semester} onChange={e => { setSemester(Number(e.target.value) as 1|2); setData(null); }}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900">
          <option value={1}>Semester 1</option>
          <option value={2}>Semester 2</option>
        </select>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900">
          <option value="">All Departments</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterTch} onChange={e => setFilterTch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900">
          <option value="">All Teachers</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterStat} onChange={e => setFilterStat(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={() => load()}
          disabled={!yearId || loading}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          style={{ backgroundColor: '#15803D' }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      {/* Summary KPIs */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Assignments', value: s.total,           color: '#475569', bg: '#F8FAFC' },
            { label: 'Not Started',       value: s.not_started,     color: '#DC2626', bg: '#FEF2F2' },
            { label: 'In Progress',       value: s.in_progress,     color: '#D97706', bg: '#FFFBEB' },
            { label: 'Scores Complete',   value: s.scores_complete,  color: '#0369A1', bg: '#EFF6FF' },
            { label: 'Submitted',         value: s.submitted,        color: '#1D4ED8', bg: '#DBEAFE' },
            { label: 'Published',         value: s.published,        color: '#14532D', bg: '#F0FDF4' },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-xl border p-4 text-center"
              style={{ backgroundColor: kpi.bg, borderColor: kpi.color + '30' }}>
              <p className="text-2xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
              <p className="text-xs font-medium text-slate-500 mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Teacher list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-slate-400 text-sm">Select a year and semester above to load data.</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No timetable assignments found for the selected filters.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(teacher => {
            const cfg = STATUS_CFG[teacher.worstStatus] ?? STATUS_CFG.not_started;
            const isExpanded = expanded === teacher.teacher_id;
            const notStarted = teacher.rows.filter(r => r.status === 'not_started').length;
            const pct = teacher.rows.length === 0 ? 0 : Math.round(
              teacher.rows.reduce((sum, r) => {
                if (['scores_complete','submitted','hod_approved','final_approved','published'].includes(r.status)) return sum + 1;
                if (r.total_students === 0) return sum;
                const caRatio = Math.min(r.students_ca_scored / r.total_students, 1);
                const exRatio = Math.min(r.students_exam_scored / r.total_students, 1);
                return sum + (caRatio + exRatio) / 2;
              }, 0) / teacher.rows.length * 100
            );

            return (
              <div key={teacher.teacher_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Teacher row */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : teacher.teacher_id)}
                  className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{teacher.teacher_name}</p>
                    <p className="text-xs text-slate-400">{teacher.department ?? 'No Department'} · {teacher.rows.length} subject{teacher.rows.length !== 1 ? 's' : ''}</p>
                  </div>

                  {/* Progress bar */}
                  <div className="hidden sm:flex items-center gap-2 w-40">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#15803D' : pct > 50 ? '#D97706' : '#DC2626' }} />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
                  </div>

                  {notStarted > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: '#DC2626', background: '#FEF2F2' }}>
                      {notStarted} not started
                    </span>
                  )}

                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>
                    {cfg.label}
                  </span>

                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          {['Subject', 'Class', 'Students', 'CA Scored', 'Exam Scored', 'Assessment Modes', 'Status'].map(h => (
                            <th key={h} className="px-4 py-2 text-left font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {teacher.rows.map((r, i) => {
                          const rcfg = STATUS_CFG[r.status] ?? STATUS_CFG.not_started;
                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-2.5 font-medium text-slate-800">{r.subject}</td>
                              <td className="px-4 py-2.5 text-slate-600">{r.class_name}</td>
                              <td className="px-4 py-2.5 text-center text-slate-500">{r.total_students}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={r.students_ca_scored > 0 ? 'text-green-700 font-semibold' : 'text-slate-300'}>
                                  {r.students_ca_scored}
                                </span>
                                <span className="text-slate-300">/{r.total_students}</span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={r.students_exam_scored > 0 ? 'text-green-700 font-semibold' : 'text-slate-300'}>
                                  {r.students_exam_scored}
                                </span>
                                <span className="text-slate-300">/{r.total_students}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                {r.assessment_names.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {r.assessment_names.map(name => (
                                      <span key={name} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 whitespace-nowrap">
                                        {name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 text-[11px]">None</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                                  style={{ color: rcfg.color, background: rcfg.bg }}>
                                  {rcfg.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
