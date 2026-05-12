'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { AdminStats, ClassroomStatus, TeacherAttendanceSummary } from '@/types/api';

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
  const [stats,   setStats]   = useState<AdminStats | null>(null);
  const [classes, setClasses] = useState<ClassroomStatus[]>([]);
  const [summary, setSummary] = useState<TeacherAttendanceSummary[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<OccupancyFilter>('all');

  const load = useCallback(async () => {
    try {
      const [s, c, t] = await Promise.allSettled([
        api.get<AdminStats>('/api/admin/stats'),
        api.get<ClassroomStatus[]>('/api/admin/classroom-status'),
        api.get<TeacherAttendanceSummary[]>('/api/admin/reports/teacher-summary'),
      ]);
      if (s.status === 'fulfilled') setStats(s.value.data);
      if (c.status === 'fulfilled') setClasses(c.value.data);
      if (t.status === 'fulfilled') setSummary(t.value.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

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

  const filterLabels: Record<OccupancyFilter, string> = {
    all: 'All', occupied: 'Occupied', vacant: 'Vacant', current: 'Current Period',
  };

  return (
    <div className="space-y-8">

      {/* ── header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#0F172A' }}>Overview</h2>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{today} · live snapshot · auto-refreshes every 60 s</p>
        </div>
        <Button variant="secondary" size="sm" loading={running} onClick={runAbsenceCheck}>
          Run Absence Check
        </Button>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: '#64748B' }}>
          Teacher Attendance Summary — Current Academic Year
        </h2>

        {summary.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center" style={{ border: '1px solid #F1F5F9' }}>
            <p className="text-sm" style={{ color: '#94A3B8' }}>No data yet for the current academic year.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
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

    </div>
  );
}
