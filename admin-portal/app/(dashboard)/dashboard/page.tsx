'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { AdminStats, AcademicYear, ClassroomStatus, TeacherAttendanceSummary, PlcAttendanceSummary } from '@/types/api';

// ── Absence Conflicts Modal ───────────────────────────────────────────────────

interface AbsenceConflict {
  id: string;
  date: string;
  teacher_id: string;
  teacher_name: string;
  subject: string;
  class_name: string;
  scheduled_period: string | null;
  is_auto_generated: boolean;
  recorded_reason: string | null;
  flags: string[];
}

const FLAG_COLORS: Record<string, { bg: string; text: string }> = {
  'Attendance submitted': { bg: '#DCFCE7', text: '#15803D' },
  'School event':         { bg: '#DBEAFE', text: '#1D4ED8' },
  'Teacher excused':      { bg: '#FEF9C3', text: '#A16207' },
};

function flagStyle(flag: string) {
  const key = Object.keys(FLAG_COLORS).find(k => flag.startsWith(k));
  return key ? FLAG_COLORS[key] : { bg: '#F1F5F9', text: '#475569' };
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T12:00:00');
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ConflictsModal({ onClose, onCleared }: { onClose: () => void; onCleared: () => void }) {
  const [conflicts,  setConflicts]  = useState<AbsenceConflict[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [clearing,   setClearing]   = useState(false);
  const [doneCount,  setDoneCount]  = useState<number | null>(null);
  const [error,      setError]      = useState('');
  const [from,       setFrom]       = useState('');
  const [to,         setTo]         = useState('');

  const load = useCallback(() => {
    setLoading(true); setError(''); setSelected(new Set()); setDoneCount(null);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    api.get<AbsenceConflict[]>(`/api/admin/absence-conflicts?${params}`)
      .then(r => setConflicts(r.data))
      .catch(() => setError('Failed to load conflicts'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAll = () => {
    setSelected(prev => prev.size === conflicts.length ? new Set() : new Set(conflicts.map(c => c.id)));
  };

  const toggle = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  async function clearSelected() {
    if (!selected.size) return;
    setClearing(true); setError('');
    try {
      const r = await api.post<{ cleared: number }>('/api/admin/absence-conflicts/clear', { ids: [...selected] });
      setDoneCount(r.data.cleared);
      setConflicts(prev => prev.filter(c => !selected.has(c.id)));
      setSelected(new Set());
      onCleared();
    } catch {
      setError('Failed to clear selected absences. Please try again.');
    } finally { setClearing(false); }
  }

  // Group by date for display
  const grouped = useMemo(() => {
    const map = new Map<string, AbsenceConflict[]>();
    for (const c of conflicts) {
      const list = map.get(c.date) ?? [];
      list.push(c);
      map.set(c.date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [conflicts]);

  const allSelected = conflicts.length > 0 && selected.size === conflicts.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-lg">Review False Absences</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Absences flagged because attendance was submitted, a school event existed, or the teacher was excused.
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 text-sm shrink-0">
            ✕
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-700 flex flex-wrap gap-3 items-end">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <button onClick={load}
            className="px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-80">
            Apply
          </button>
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo(''); }}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              Clear dates
            </button>
          )}
        </div>

        {/* Success / error banners */}
        {doneCount !== null && (
          <div className="mx-6 mt-3 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-sm text-green-700 dark:text-green-400 font-medium">
            ✓ {doneCount} false absence{doneCount !== 1 ? 's' : ''} cleared successfully.
          </div>
        )}
        {error && (
          <div className="mx-6 mt-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
              <p className="text-sm text-slate-400">Scanning for conflicts…</p>
            </div>
          ) : conflicts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="font-semibold text-slate-700 dark:text-slate-300">No conflicts found</p>
              <p className="text-sm text-slate-400 max-w-xs">All absence records look correct for the selected date range.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Select-all row */}
              <div className="flex items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-700">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="w-4 h-4 accent-green-600 rounded" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {conflicts.length} false absence{conflicts.length !== 1 ? 's' : ''} detected
                  {selected.size > 0 && ` · ${selected.size} selected`}
                </span>
              </div>

              {/* Grouped by date */}
              {grouped.map(([date, rows]) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 sticky top-0 bg-white dark:bg-slate-800 py-1">
                    {fmtDate(date)}
                  </p>
                  {rows.map(c => (
                    <label key={c.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors"
                      style={selected.has(c.id) ? { borderColor: '#16A34A', background: '#F0FDF4' } : {}}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)}
                        className="w-4 h-4 accent-green-600 rounded mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.teacher_name}</p>
                          <span className="text-xs text-slate-400">·</span>
                          <p className="text-xs text-slate-600 dark:text-slate-300">{c.subject}</p>
                          <span className="text-xs text-slate-400">·</span>
                          <p className="text-xs text-slate-600 dark:text-slate-300">{c.class_name}</p>
                          {c.scheduled_period && (
                            <>
                              <span className="text-xs text-slate-400">·</span>
                              <p className="text-xs text-slate-400 font-mono">{c.scheduled_period}</p>
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {c.flags.map(flag => {
                            const style = flagStyle(flag);
                            return (
                              <span key={flag}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: style.bg, color: style.text }}>
                                {flag}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
            Close
          </button>
          <button
            onClick={clearSelected}
            disabled={selected.size === 0 || clearing}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: '#15803D' }}>
            {clearing ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Clearing…
              </>
            ) : (
              `Clear ${selected.size > 0 ? `${selected.size} ` : ''}Selected`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

type OccupancyFilter = 'all' | 'occupied' | 'vacant' | 'current';

function attendanceStatus(pct: number | null): { label: string; color: string; bg: string } {
  if (pct === null) return { label: 'No Data',         color: '#94A3B8', bg: '#F8FAFC' };
  if (pct >= 90)   return { label: 'Excellent',        color: '#16A34A', bg: '#F0FDF4' };
  if (pct >= 75)   return { label: 'Good',             color: '#2563EB', bg: '#EFF6FF' };
  if (pct >= 60)   return { label: 'Needs Attention',  color: '#D97706', bg: '#FFFBEB' };
  return               { label: 'Critical',        color: '#DC2626', bg: '#FEF2F2' };
}

function cardCfg(row: ClassroomStatus) {
  if (row.status === 'occupied')
    return { bg: '#F0FDF4', border: '#16A34A', dot: '#16A34A', label: 'OCCUPIED' };
  if (row.in_current_period)
    return { bg: '#FFFBEB', border: '#F59E0B', dot: '#D97706', label: 'SCHEDULED' };
  return   { bg: '#F8FAFC', border: '#E2E8F0', dot: '#CBD5E1', label: 'FREE' };
}

// ── sub-components ───────────────────────────────────────────────────────────

function ClassroomCard({ row }: { row: ClassroomStatus }) {
  const cfg = cardCfg(row);
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, borderLeft: `4px solid ${cfg.border}` }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: cfg.dot }}>
          {cfg.label}
        </span>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: cfg.dot,
            boxShadow: row.status === 'occupied' ? `0 0 0 3px ${cfg.dot}30` : undefined,
          }}
        />
      </div>

      <p className="text-base font-bold mb-1 leading-tight" style={{ color: '#0F172A' }}>{row.class_name}</p>
      <p className="text-sm" style={{ color: '#475569' }}>{row.subject ?? '—'}</p>
      <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>{row.teacher_name ?? '—'}</p>
      {row.teacher_phone && (
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs" style={{ color: '#94A3B8' }}>{row.teacher_phone}</span>
          <a
            href={`tel:${row.teacher_phone}`}
            title={`Call ${row.teacher_phone}`}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              background: `${cfg.border}22`, color: cfg.dot, textDecoration: 'none',
              border: `1.5px solid ${cfg.border}55`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 .82h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
          </a>
        </div>
      )}
      {row.start_time && row.end_time && (
        <p className="text-xs font-mono mt-0.5" style={{ color: '#94A3B8' }}>
          {row.start_time}–{row.end_time}
        </p>
      )}
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats,          setStats]          = useState<AdminStats | null>(null);
  const [classes,        setClasses]        = useState<ClassroomStatus[]>([]);
  const [summary,        setSummary]        = useState<TeacherAttendanceSummary[]>([]);
  const [plcSummary,     setPlcSummary]     = useState<PlcAttendanceSummary[]>([]);
  const [academicYears,  setAcademicYears]  = useState<AcademicYear[]>([]);
  const [filterYear,     setFilterYear]     = useState<string>('');
  const [filterSem,      setFilterSem]      = useState<string>('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [plcSummaryLoading, setPlcSummaryLoading] = useState(false);
  const [running,        setRunning]        = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [filter,         setFilter]         = useState<OccupancyFilter>('all');
  const [showConflicts,  setShowConflicts]  = useState(false);

  // Load academic years once and set defaults to current year + current semester
  useEffect(() => {
    api.get<AcademicYear[]>('/api/academic-years').then(r => {
      setAcademicYears(r.data);
      const current = r.data.find(y => y.is_current);
      if (current) {
        setFilterYear(current.id);
        setFilterSem(current.current_semester ? String(current.current_semester) : '');
      }
    }).catch(() => {});
  }, []);

  const loadSummary = useCallback(async (yearId: string, sem: string) => {
    setSummaryLoading(true);
    setPlcSummaryLoading(true);
    try {
      const params: Record<string, string> = {};
      if (yearId) params.academic_year_id = yearId;
      if (sem)    params.semester = sem;
      const [t, p] = await Promise.allSettled([
        api.get<TeacherAttendanceSummary[]>('/api/admin/reports/teacher-summary', { params }),
        api.get<PlcAttendanceSummary[]>('/api/plc/summary', { params }),
      ]);
      if (t.status === 'fulfilled') setSummary(t.value.data);
      if (p.status === 'fulfilled') setPlcSummary(p.value.data);
    } finally {
      setSummaryLoading(false);
      setPlcSummaryLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.allSettled([
        api.get<AdminStats>('/api/admin/stats'),
        api.get<ClassroomStatus[]>('/api/admin/classroom-status'),
      ]);
      if (s.status === 'fulfilled') setStats(s.value.data);
      if (c.status === 'fulfilled') setClasses(c.value.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Re-fetch summary whenever filters change
  useEffect(() => {
    loadSummary(filterYear, filterSem);
  }, [filterYear, filterSem, loadSummary]);

  async function runAbsenceCheck() {
    setRunning(true);
    try {
      await api.post('/api/admin/run-absence-check');
      await load();
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const today = DAYS[new Date().getDay()];

  // classroom occupancy stats
  const totalClassrooms   = classes.length;
  const occupiedCount     = classes.filter(r => r.status === 'occupied').length;
  const vacantCount       = classes.filter(r => r.status === 'vacant').length;
  const currentPeriodCount = classes.filter(r => r.in_current_period).length;

  const filteredClasses = classes.filter(r => {
    if (filter === 'occupied') return r.status === 'occupied';
    if (filter === 'vacant')   return r.status === 'vacant';
    if (filter === 'current')  return r.in_current_period;
    return true;
  });

  // school-wide totals for the summary footer
  const totals = summary.reduce(
    (acc, r) => ({
      present:   acc.present   + r.present_periods,
      absent:    acc.absent    + r.absent_periods,
      excused:   acc.excused   + (r.excused_periods ?? 0),
      scheduled: acc.scheduled + r.total_scheduled,
    }),
    { present: 0, absent: 0, excused: 0, scheduled: 0 }
  );
  const schoolPct = totals.scheduled > 0
    ? Math.round(100 * totals.present / totals.scheduled)
    : null;

  // PLC school-wide totals
  const plcTotals = plcSummary.reduce(
    (acc, r) => ({
      present:   acc.present   + r.present_count,
      absent:    acc.absent    + r.absent_count,
      scheduled: acc.scheduled + r.total_scheduled,
    }),
    { present: 0, absent: 0, scheduled: 0 }
  );
  const plcSchoolPct = plcTotals.scheduled > 0
    ? Math.round(100 * plcTotals.present / plcTotals.scheduled)
    : null;

  const filterLabels: Record<OccupancyFilter, string> = {
    all: 'All', occupied: 'Occupied', vacant: 'Vacant', current: 'Current Period',
  };

  return (
    <div className="space-y-8">

      {showConflicts && (
        <ConflictsModal
          onClose={() => setShowConflicts(false)}
          onCleared={load}
        />
      )}

      {/* ── header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#0F172A' }}>Overview</h2>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{today} · live snapshot · auto-refreshes every 60 s</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConflicts(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Review Conflicts
          </button>
          <Button variant="secondary" size="sm" loading={running} onClick={runAbsenceCheck}>
            Run Absence Check
          </Button>
        </div>
      </div>

      {/* ── stat cards ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Today's Attendance" value={stats.today_attendance}     color="green"  />
          <StatCard label="Today's Absences"   value={stats.today_absences}       color="red"    />
          <StatCard label="Total Teachers"     value={stats.total_teachers}       color="blue"   />
          <StatCard label="Week Attendance"    value={stats.week_attendance}      color="purple" />
          <StatCard label="Outstanding"        value={stats.outstanding_absences} color="yellow" />
          <StatCard label="Pending Remedials"  value={stats.pending_remedials}    color="yellow" />
        </div>
      )}

      {/* ── classroom occupancy ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
            Classroom Occupancy
          </h2>
          <p className="text-xs" style={{ color: '#94A3B8' }}>Live · updates every 60 s</p>
        </div>

        {/* occupancy stats bar */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl p-4 text-center bg-white" style={{ border: '1px solid #F1F5F9' }}>
            <p className="text-2xl font-bold" style={{ color: '#0F172A' }}>{totalClassrooms}</p>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Total</p>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ border: '1px solid #BBF7D0', backgroundColor: '#F0FDF4' }}>
            <p className="text-2xl font-bold" style={{ color: '#16A34A' }}>{occupiedCount}</p>
            <p className="text-xs mt-0.5" style={{ color: '#16A34A' }}>Occupied</p>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ border: '1px solid #FCA5A5', backgroundColor: '#FEF2F2' }}>
            <p className="text-2xl font-bold" style={{ color: '#DC2626' }}>{vacantCount}</p>
            <p className="text-xs mt-0.5" style={{ color: '#DC2626' }}>Vacant</p>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ border: '1px solid #BFDBFE', backgroundColor: '#EFF6FF' }}>
            <p className="text-2xl font-bold" style={{ color: '#2563EB' }}>{currentPeriodCount}</p>
            <p className="text-xs mt-0.5" style={{ color: '#2563EB' }}>Current Period</p>
          </div>
        </div>

        {/* filter buttons */}
        <div className="flex gap-2 mb-4">
          {(['all', 'occupied', 'vacant', 'current'] as OccupancyFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={{
                backgroundColor: filter === f ? '#0F172A' : '#F1F5F9',
                color:           filter === f ? '#FFFFFF' : '#64748B',
              }}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>

        {/* card grid */}
        {classes.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center" style={{ border: '1px solid #F1F5F9' }}>
            <p className="text-sm" style={{ color: '#94A3B8' }}>No classrooms found in the timetable.</p>
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center" style={{ border: '1px solid #F1F5F9' }}>
            <p className="text-sm" style={{ color: '#94A3B8' }}>No classrooms match this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredClasses.map(row => (
              <ClassroomCard key={row.class_name} row={row} />
            ))}
          </div>
        )}
      </section>

      {/* ── teacher attendance summary ── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
            Teacher Attendance Summary
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* Academic year selector */}
            <select
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              className="text-sm rounded-lg px-3 py-1.5 font-medium"
              style={{ border: '1px solid #E2E8F0', color: '#0F172A', backgroundColor: '#fff' }}
            >
              {academicYears.map(y => (
                <option key={y.id} value={y.id}>
                  {y.name}{y.is_current ? ' (Current)' : ''}
                </option>
              ))}
            </select>
            {/* Semester selector */}
            <select
              value={filterSem}
              onChange={e => setFilterSem(e.target.value)}
              className="text-sm rounded-lg px-3 py-1.5 font-medium"
              style={{ border: '1px solid #E2E8F0', color: '#0F172A', backgroundColor: '#fff' }}
            >
              <option value="">All Semesters</option>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
        </div>

        {summaryLoading ? (
          <div className="bg-white rounded-xl p-8 flex justify-center" style={{ border: '1px solid #F1F5F9' }}>
            <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin"
              style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
          </div>
        ) : summary.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center" style={{ border: '1px solid #F1F5F9' }}>
            <p className="text-sm" style={{ color: '#94A3B8' }}>No data for the selected period.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                    {['Teacher','Department','Scheduled','Present','Absent','Excused','Attendance %','Status'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row, i) => {
                    const st = attendanceStatus(row.attendance_pct);
                    return (
                      <tr key={row.id}
                        className="transition-colors hover:bg-slate-50"
                        style={{ borderBottom: i < summary.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                        <td className="px-5 py-3.5 font-semibold" style={{ color: '#0F172A' }}>{row.name}</td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: '#64748B' }}>{row.department}</td>
                        <td className="px-5 py-3.5 font-mono text-center" style={{ color: '#475569' }}>{row.total_scheduled}</td>
                        <td className="px-5 py-3.5 font-mono text-center font-semibold" style={{ color: '#16A34A' }}>{row.present_periods}</td>
                        <td className="px-5 py-3.5 font-mono text-center font-semibold" style={{ color: row.absent_periods > 0 ? '#DC2626' : '#94A3B8' }}>{row.absent_periods}</td>
                        <td className="px-5 py-3.5 font-mono text-center font-semibold" style={{ color: (row.excused_periods ?? 0) > 0 ? '#7C3AED' : '#94A3B8' }}>{row.excused_periods ?? 0}</td>
                        <td className="px-5 py-3.5 min-w-36">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: '#F1F5F9' }}>
                              <div className="h-1.5 rounded-full" style={{
                                width: `${Math.min(row.attendance_pct ?? 0, 100)}%`,
                                backgroundColor: st.color,
                              }} />
                            </div>
                            <span className="text-xs font-bold w-10 text-right" style={{ color: st.color }}>
                              {row.attendance_pct !== null ? `${row.attendance_pct}%` : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* school-wide totals footer */}
                <tfoot>
                  <tr style={{ borderTop: '2px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                    <td className="px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>School Total</td>
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3 font-mono text-center font-bold" style={{ color: '#0F172A' }}>{totals.scheduled}</td>
                    <td className="px-5 py-3 font-mono text-center font-bold" style={{ color: '#16A34A' }}>{totals.present}</td>
                    <td className="px-5 py-3 font-mono text-center font-bold" style={{ color: totals.absent > 0 ? '#DC2626' : '#94A3B8' }}>{totals.absent}</td>
                    <td className="px-5 py-3 font-mono text-center font-bold" style={{ color: totals.excused > 0 ? '#7C3AED' : '#94A3B8' }}>{totals.excused}</td>
                    <td className="px-5 py-3">
                      {schoolPct !== null && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: '#F1F5F9' }}>
                            <div className="h-1.5 rounded-full" style={{
                              width: `${Math.min(schoolPct, 100)}%`,
                              backgroundColor: attendanceStatus(schoolPct).color,
                            }} />
                          </div>
                          <span className="text-xs font-bold w-10 text-right" style={{ color: attendanceStatus(schoolPct).color }}>
                            {schoolPct}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {schoolPct !== null && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: attendanceStatus(schoolPct).bg, color: attendanceStatus(schoolPct).color }}>
                          {attendanceStatus(schoolPct).label}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── PLC attendance summary ── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
            PLC Attendance Summary
          </h2>
          <p className="text-xs" style={{ color: '#94A3B8' }}>Same period as above</p>
        </div>

        {plcSummaryLoading ? (
          <div className="bg-white rounded-xl p-8 flex justify-center" style={{ border: '1px solid #F1F5F9' }}>
            <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin"
              style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
          </div>
        ) : plcSummary.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center" style={{ border: '1px solid #F1F5F9' }}>
            <p className="text-sm" style={{ color: '#94A3B8' }}>No PLC data for the selected period.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
            <div className="overflow-x-auto">
              <table className="min-w-[800px] w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                    {['Teacher','Department','Sessions','Present','Absent','Attendance %','Status'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plcSummary.map((row, i) => {
                    const st = attendanceStatus(row.attendance_pct);
                    return (
                      <tr key={row.id}
                        className="transition-colors hover:bg-slate-50"
                        style={{ borderBottom: i < plcSummary.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                        <td className="px-5 py-3.5 font-semibold" style={{ color: '#0F172A' }}>{row.name}</td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: '#64748B' }}>{row.department}</td>
                        <td className="px-5 py-3.5 font-mono text-center" style={{ color: '#475569' }}>{row.total_scheduled}</td>
                        <td className="px-5 py-3.5 font-mono text-center font-semibold" style={{ color: '#16A34A' }}>{row.present_count}</td>
                        <td className="px-5 py-3.5 font-mono text-center font-semibold" style={{ color: row.absent_count > 0 ? '#DC2626' : '#94A3B8' }}>{row.absent_count}</td>
                        <td className="px-5 py-3.5 min-w-36">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: '#F1F5F9' }}>
                              <div className="h-1.5 rounded-full" style={{
                                width: `${Math.min(row.attendance_pct ?? 0, 100)}%`,
                                backgroundColor: st.color,
                              }} />
                            </div>
                            <span className="text-xs font-bold w-10 text-right" style={{ color: st.color }}>
                              {row.attendance_pct !== null ? `${row.attendance_pct}%` : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                    <td className="px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>School Total</td>
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3 font-mono text-center font-bold" style={{ color: '#0F172A' }}>{plcTotals.scheduled}</td>
                    <td className="px-5 py-3 font-mono text-center font-bold" style={{ color: '#16A34A' }}>{plcTotals.present}</td>
                    <td className="px-5 py-3 font-mono text-center font-bold" style={{ color: plcTotals.absent > 0 ? '#DC2626' : '#94A3B8' }}>{plcTotals.absent}</td>
                    <td className="px-5 py-3">
                      {plcSchoolPct !== null && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: '#F1F5F9' }}>
                            <div className="h-1.5 rounded-full" style={{
                              width: `${Math.min(plcSchoolPct, 100)}%`,
                              backgroundColor: attendanceStatus(plcSchoolPct).color,
                            }} />
                          </div>
                          <span className="text-xs font-bold w-10 text-right" style={{ color: attendanceStatus(plcSchoolPct).color }}>
                            {plcSchoolPct}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {plcSchoolPct !== null && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: attendanceStatus(plcSchoolPct).bg, color: attendanceStatus(plcSchoolPct).color }}>
                          {attendanceStatus(plcSchoolPct).label}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
