'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number; }
interface Teacher      { id: string; name: string; department: string | null; }

interface ModeBreakdown {
  mode_id:             string;
  mode_name:           string;
  max_instances:       number | null;
  assessments_created: number;
  students_scored:     number;
}

interface MonitorRow {
  teacher_id:            string;
  teacher_name:          string;
  department:            string | null;
  subject:               string;
  class_name:            string;
  total_students:        number;
  mode_breakdown:        ModeBreakdown[];
  total_modes:           number;
  complete_modes:        number;
  exam_students_scored:  number;
  exam_complete:         boolean;
  completion_pct:        number;
  submission_status:     string | null;
  status: 'not_started' | 'in_progress' | 'scores_complete' | 'submitted' | 'hod_approved' | 'final_approved' | 'published';
}

interface CaMode { id: string; name: string; }

interface MonitorData {
  summary: { total: number; not_started: number; in_progress: number; scores_complete: number; submitted: number; published: number; };
  rows:    MonitorRow[];
  modes:   CaMode[];
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  not_started:     { label: 'Not Started',    color: '#DC2626', bg: '#FEF2F2' },
  in_progress:     { label: 'In Progress',    color: '#D97706', bg: '#FFFBEB' },
  scores_complete: { label: 'Scores Complete',color: '#0369A1', bg: '#EFF6FF' },
  submitted:       { label: 'Submitted',      color: '#1D4ED8', bg: '#DBEAFE' },
  hod_approved:    { label: 'HOD Approved',   color: '#065F46', bg: '#D1FAE5' },
  final_approved:  { label: 'Final Approved', color: '#3730A3', bg: '#EDE9FE' },
  published:       { label: 'Published',      color: '#14532D', bg: '#F0FDF4' },
};

// ── Details modal ─────────────────────────────────────────────────────────────
function DetailsModal({ row, onClose }: { row: MonitorRow; onClose: () => void }) {
  const total = row.total_students;
  const denom = row.total_modes + 1;
  const numer = row.complete_modes + (row.exam_complete ? 1 : 0);
  const pct   = denom === 0 ? 0 : Math.round((numer / denom) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h2 className="font-bold text-slate-900">{row.subject} · {row.class_name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{row.teacher_name} · {total} student{total !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors mt-0.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-4">
          <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-2 rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#15803D' : pct > 50 ? '#D97706' : '#DC2626' }} />
          </div>
          <span className="text-sm font-bold text-slate-700 whitespace-nowrap">{numer} / {denom} complete · {pct}%</span>
        </div>

        {/* Mode table */}
        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                {['Mode', 'Created', 'Scored', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {row.mode_breakdown.map(m => {
                const done    = m.assessments_created >= 1 && total > 0 && m.students_scored >= total;
                const started = m.assessments_created >= 1 || m.students_scored > 0;
                const statusLabel = done ? '✓ Done' : started ? '⚠ Incomplete' : '✗ Not Started';
                const statusColor = done ? '#15803D' : started ? '#D97706' : '#DC2626';
                return (
                  <tr key={m.mode_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{m.mode_name}</td>
                    <td className="px-4 py-2.5 text-center text-slate-600 tabular-nums">{m.assessments_created}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums">
                      <span className={m.students_scored > 0 ? 'font-semibold text-slate-800' : 'text-slate-300'}>
                        {m.students_scored}
                      </span>
                      <span className="text-slate-400"> / {total}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
                    </td>
                  </tr>
                );
              })}
              {/* Exam row */}
              <tr className="bg-slate-50/60 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-700 italic">Exam Scores</td>
                <td className="px-4 py-2.5 text-center text-slate-400">—</td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  <span className={row.exam_students_scored > 0 ? 'font-semibold text-slate-800' : 'text-slate-300'}>
                    {row.exam_students_scored}
                  </span>
                  <span className="text-slate-400"> / {total}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs font-semibold" style={{ color: row.exam_complete ? '#15803D' : row.exam_students_scored > 0 ? '#D97706' : '#DC2626' }}>
                    {row.exam_complete ? '✓ Done' : row.exam_students_scored > 0 ? '⚠ Incomplete' : '✗ Not Started'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Outstanding mode description ───────────────────────────────────────────────
function outstandingModes(row: MonitorRow): string {
  const total = row.total_students;
  const incomplete = row.mode_breakdown.filter(
    m => !(m.assessments_created >= 1 && total > 0 && m.students_scored >= total)
  );
  if (incomplete.length === 0) return 'All CA modes complete';
  return incomplete.map(m => {
    if (m.assessments_created === 0) return `${m.mode_name} (not started)`;
    return `${m.mode_name} (${m.students_scored}/${total} students)`;
  }).join(', ');
}

// ── Main page ─────────────────────────────────────────────────────────────────
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
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [detailRow,  setDetailRow]  = useState<MonitorRow | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

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

  // Group rows by teacher
  const byTeacher = (data?.rows ?? []).reduce<Record<string, MonitorRow[]>>((acc, r) => {
    (acc[r.teacher_id] ??= []).push(r);
    return acc;
  }, {});

  const teacherList = Object.entries(byTeacher).map(([tid, rows]) => {
    const pct = rows.length === 0 ? 0
      : Math.round(rows.reduce((s, r) => s + r.completion_pct, 0) / rows.length);
    return {
      teacher_id:   tid,
      teacher_name: rows[0].teacher_name,
      department:   rows[0].department,
      rows,
      pct,
      worstStatus: rows.some(r => r.status === 'not_started')    ? 'not_started'
                 : rows.some(r => r.status === 'in_progress')     ? 'in_progress'
                 : rows.some(r => r.status === 'scores_complete') ? 'scores_complete'
                 : rows[0].status,
    };
  });

  const filtered = teacherList.filter(t =>
    !filterStat || t.rows.some(r => r.status === filterStat)
  );

  const depts = [...new Set(teachers.map(t => t.department).filter(Boolean))].sort() as string[];
  const s = data?.summary;

  // Printable year/semester label
  const yearLabel = years.find(y => y.id === yearId)?.name ?? '';

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-5">
      {/* Print styles injected via a style tag */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-report { display: block !important; visibility: visible !important; position: fixed; top: 0; left: 0; width: 100%; padding: 20px; background: white; }
          #print-report * { visibility: visible !important; }
          @page { margin: 15mm; size: A4 landscape; }
        }
      `}</style>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Assessment Tracker</h1>
        <p className="text-sm text-slate-500 mt-0.5">Monitor score entry completion across all teachers, subjects, and assessment modes.</p>
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
        <button onClick={() => load()} disabled={!yearId || loading}
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
            { label: 'Total Assignments', value: s.total,            color: '#475569', bg: '#F8FAFC' },
            { label: 'Not Started',       value: s.not_started,      color: '#DC2626', bg: '#FEF2F2' },
            { label: 'In Progress',       value: s.in_progress,      color: '#D97706', bg: '#FFFBEB' },
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
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-slate-400 text-sm">Select a year and semester above to load data.</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No timetable assignments found for the selected filters.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(teacher => {
            const cfg        = STATUS_CFG[teacher.worstStatus] ?? STATUS_CFG.not_started;
            const isExpanded = expanded === teacher.teacher_id;
            const notStarted = teacher.rows.filter(r => r.status === 'not_started').length;
            const { pct }    = teacher;

            return (
              <div key={teacher.teacher_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Teacher header row */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : teacher.teacher_id)}
                  className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{teacher.teacher_name}</p>
                    <p className="text-xs text-slate-400">
                      {teacher.department ?? 'No Department'} · {teacher.rows.length} subject{teacher.rows.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="hidden sm:flex items-center gap-2 w-40">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#15803D' : pct > 50 ? '#D97706' : '#DC2626' }} />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
                  </div>

                  {notStarted > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ color: '#DC2626', background: '#FEF2F2' }}>
                      {notStarted} not started
                    </span>
                  )}

                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: cfg.color, background: cfg.bg }}>
                    {cfg.label}
                  </span>

                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded subject rows */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          {['Subject', 'Class', 'Students', 'CA Modes', 'Exam Scores', 'Completion', 'Status', ''].map(h => (
                            <th key={h} className="px-4 py-2 text-left font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {teacher.rows.map((r, i) => {
                          const rcfg = STATUS_CFG[r.status] ?? STATUS_CFG.not_started;
                          const rowPctColor = r.completion_pct === 100 ? '#15803D'
                            : r.completion_pct > 50 ? '#D97706' : '#DC2626';
                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-2.5 font-medium text-slate-800">{r.subject}</td>
                              <td className="px-4 py-2.5 text-slate-600">{r.class_name}</td>
                              <td className="px-4 py-2.5 text-center text-slate-500">{r.total_students}</td>
                              {/* CA Modes */}
                              <td className="px-4 py-2.5 text-center">
                                <span className="font-semibold tabular-nums"
                                  style={{ color: r.complete_modes === r.total_modes ? '#15803D' : r.complete_modes > 0 ? '#D97706' : '#DC2626' }}>
                                  {r.complete_modes}
                                </span>
                                <span className="text-slate-300"> / {r.total_modes}</span>
                              </td>
                              {/* Exam */}
                              <td className="px-4 py-2.5 text-center">
                                <span className="font-semibold tabular-nums"
                                  style={{ color: r.exam_complete ? '#15803D' : r.exam_students_scored > 0 ? '#D97706' : '#DC2626' }}>
                                  {r.exam_students_scored}
                                </span>
                                <span className="text-slate-300"> / {r.total_students}</span>
                              </td>
                              {/* Completion % */}
                              <td className="px-4 py-2.5 text-center">
                                <span className="font-bold tabular-nums" style={{ color: rowPctColor }}>
                                  {r.completion_pct}%
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                                  style={{ color: rcfg.color, background: rcfg.bg }}>
                                  {rcfg.label}
                                </span>
                              </td>
                              {/* Details button */}
                              <td className="px-4 py-2.5">
                                <button
                                  onClick={e => { e.stopPropagation(); setDetailRow(r); }}
                                  className="text-[11px] px-2.5 py-1 rounded-md font-semibold border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors whitespace-nowrap">
                                  Details
                                </button>
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

      {/* Print Report button */}
      {data && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Completion Report</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Print a full report showing outstanding scores per teacher for {yearLabel} · Semester {semester}.
            </p>
          </div>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#15803D' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print Report
          </button>
        </div>
      )}

      {/* ── Hidden print-only report ──────────────────────────────────────────── */}
      {data && (() => {
        const incomplete = filtered.filter(t => t.rows.some(r => r.completion_pct < 100));
        const allDone    = filtered.filter(t => t.rows.every(r => r.completion_pct === 100));
        return (
          <div id="print-report" ref={printRef} style={{ display: 'none' }}>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '10pt', color: '#1a1a1a' }}>

              {/* Report header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2.5px solid #1a5c38', paddingBottom: '8px', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '15pt', fontWeight: 900, color: '#1a5c38', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Assessment Score Entry Report
                  </div>
                  <div style={{ fontSize: '9pt', color: '#555', marginTop: '3px' }}>
                    {yearLabel} &nbsp;·&nbsp; Semester {semester} &nbsp;·&nbsp; Outstanding entries as at {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '8pt', color: '#888' }}>
                  {incomplete.length} teacher{incomplete.length !== 1 ? 's' : ''} with outstanding entries
                </div>
              </div>

              {/* Summary strip */}
              <div style={{ display: 'flex', gap: '0', marginBottom: '18px', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  { label: 'Total Assignments', value: s?.total ?? 0,           bg: '#f8fafc', color: '#475569' },
                  { label: 'Not Started',        value: s?.not_started ?? 0,    bg: '#fef2f2', color: '#DC2626' },
                  { label: 'In Progress',        value: s?.in_progress ?? 0,    bg: '#fffbeb', color: '#D97706' },
                  { label: 'Scores Complete',    value: s?.scores_complete ?? 0,bg: '#eff6ff', color: '#0369A1' },
                  { label: 'Submitted',          value: s?.submitted ?? 0,      bg: '#dbeafe', color: '#1D4ED8' },
                ].map((k, idx, arr) => (
                  <div key={k.label} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', background: k.bg, borderRight: idx < arr.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                    <div style={{ fontSize: '14pt', fontWeight: 900, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: '6.5pt', color: '#666', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: '2px' }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Outstanding teachers — main body */}
              {incomplete.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#15803D', fontWeight: 700, fontSize: '11pt', border: '2px solid #15803D', borderRadius: '8px' }}>
                  All teachers have completed their score entries.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '9pt', fontWeight: 700, color: '#1a5c38', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px' }}>
                    Teachers with Outstanding Entries
                  </div>

                  {incomplete.map((teacher, ti) => {
                    const incompleteRows = teacher.rows.filter(r => r.completion_pct < 100);
                    return (
                      <div key={teacher.teacher_id} style={{ marginBottom: '14px', breakInside: 'avoid' }}>
                        {/* Teacher header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '6px 10px', borderLeft: '4px solid #DC2626', marginBottom: '4px' }}>
                          <div>
                            <span style={{ fontWeight: 800, fontSize: '10pt' }}>{teacher.teacher_name}</span>
                            {teacher.department && (
                              <span style={{ fontSize: '8.5pt', color: '#555', marginLeft: '8px' }}>{teacher.department}</span>
                            )}
                          </div>
                          <div style={{ fontSize: '8.5pt', fontWeight: 700, color: teacher.pct > 50 ? '#D97706' : '#DC2626' }}>
                            Overall: {teacher.pct}% complete
                          </div>
                        </div>

                        {/* Incomplete subject rows */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt', marginBottom: '2px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              {['Subject', 'Class', 'Students', 'Outstanding CA Modes', 'Exam Scores', 'Completion'].map(h => (
                                <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '7.5pt', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {incompleteRows.map((r, ri) => {
                              const outstanding = outstandingModes(r);
                              const examLabel = r.exam_complete
                                ? 'Complete'
                                : r.exam_students_scored > 0
                                  ? `${r.exam_students_scored} / ${r.total_students} entered`
                                  : 'Not started';
                              const examColor = r.exam_complete ? '#15803D' : r.exam_students_scored > 0 ? '#B45309' : '#DC2626';
                              return (
                                <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#fafafa' }}>
                                  <td style={{ padding: '5px 8px', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>{r.subject}</td>
                                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>{r.class_name}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{r.total_students}</td>
                                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', color: outstanding === 'All CA modes complete' ? '#15803D' : '#B45309' }}>
                                    {outstanding}
                                  </td>
                                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', color: examColor }}>
                                    {examLabel}
                                  </td>
                                  <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid #f1f5f9',
                                    color: r.completion_pct > 50 ? '#D97706' : '#DC2626' }}>
                                    {r.completion_pct}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </>
              )}

              {/* All-done teachers — brief list at bottom */}
              {allDone.length > 0 && (
                <div style={{ marginTop: '18px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '8.5pt', color: '#15803D' }}>
                    All entries complete ({allDone.length} teacher{allDone.length !== 1 ? 's' : ''}):&nbsp;
                  </span>
                  <span style={{ fontSize: '8.5pt', color: '#166534' }}>
                    {allDone.map(t => t.teacher_name).join(' · ')}
                  </span>
                </div>
              )}

              <div style={{ marginTop: '16px', fontSize: '7.5pt', color: '#aaa', borderTop: '1px solid #e2e8f0', paddingTop: '5px' }}>
                Generated by CAS &nbsp;·&nbsp; {new Date().toLocaleString('en-GB')}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Details modal */}
      {detailRow && <DetailsModal row={detailRow} onClose={() => setDetailRow(null)} />}
    </div>
  );
}
