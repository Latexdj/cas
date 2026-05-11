'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { AdminStats, ClassroomStatus, TeacherAttendanceSummary } from '@/types/api';

// ── helpers ──────────────────────────────────────────────────────────────────

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const statusCfg: Record<ClassroomStatus['status'], { bg: string; border: string; dot: string; label: string }> = {
  present:    { bg: '#F0FDF4', border: '#16A34A', dot: '#16A34A', label: 'Present'    },
  in_session: { bg: '#FFFBEB', border: '#D97706', dot: '#D97706', label: 'In Session' },
  absent:     { bg: '#FEF2F2', border: '#DC2626', dot: '#DC2626', label: 'Absent'     },
  upcoming:   { bg: '#F8FAFC', border: '#CBD5E1', dot: '#94A3B8', label: 'Upcoming'   },
};

function attendanceStatus(pct: number | null): { label: string; color: string; bg: string } {
  if (pct === null) return { label: 'No Data',         color: '#94A3B8', bg: '#F8FAFC' };
  if (pct >= 90)   return { label: 'Excellent',        color: '#16A34A', bg: '#F0FDF4' };
  if (pct >= 75)   return { label: 'Good',             color: '#2563EB', bg: '#EFF6FF' };
  if (pct >= 60)   return { label: 'Needs Attention',  color: '#D97706', bg: '#FFFBEB' };
  return               { label: 'Critical',        color: '#DC2626', bg: '#FEF2F2' };
}

// ── sub-components ───────────────────────────────────────────────────────────

function ClassroomCard({ row }: { row: ClassroomStatus }) {
  const cfg = statusCfg[row.status];
  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden"
      style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, borderLeft: `4px solid ${cfg.border}` }}
    >
      {/* status dot */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: cfg.dot }}>
          {cfg.label}
        </span>
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{
            backgroundColor: cfg.dot,
            boxShadow: row.status === 'in_session' ? `0 0 0 3px ${cfg.dot}30` : undefined,
          }}
        />
      </div>

      <p className="text-base font-bold mb-0.5" style={{ color: '#0F172A' }}>{row.class_name}</p>
      <p className="text-sm font-medium" style={{ color: '#475569' }}>{row.subject}</p>
      <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>{row.teacher_name}</p>
      <p className="text-xs font-mono mt-0.5" style={{ color: '#94A3B8' }}>
        {row.start_time}–{row.end_time}
      </p>

      {row.status === 'present' && row.location_verified !== null && (
        <span
          className="absolute bottom-3 right-3 text-xs font-semibold"
          style={{ color: row.location_verified ? '#16A34A' : '#DC2626' }}
        >
          {row.location_verified ? '✓ GPS' : '✗ GPS'}
        </span>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 mb-4">
      {Object.entries(statusCfg).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
          <span className="text-xs font-medium" style={{ color: '#64748B' }}>{cfg.label}</span>
        </div>
      ))}
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

  const load = useCallback(async () => {
    try {
      const [s, c, t] = await Promise.all([
        api.get<AdminStats>('/api/admin/stats'),
        api.get<ClassroomStatus[]>('/api/admin/classroom-status'),
        api.get<TeacherAttendanceSummary[]>('/api/admin/reports/teacher-summary'),
      ]);
      setStats(s.data);
      setClasses(c.data);
      setSummary(t.data);
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

  // counts by status for the grid header
  const counts = classes.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  // school-wide totals for the summary footer
  const totals = summary.reduce(
    (acc, r) => ({
      present:   acc.present   + r.present_periods,
      absent:    acc.absent    + r.absent_periods,
      scheduled: acc.scheduled + r.total_scheduled,
    }),
    { present: 0, absent: 0, scheduled: 0 }
  );
  const schoolPct = totals.scheduled > 0
    ? Math.round(100 * totals.present / totals.scheduled)
    : null;

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

      {/* ── classroom status visualization ── */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
            Today&apos;s Classroom Status
          </h2>
          <div className="flex gap-3 text-xs" style={{ color: '#94A3B8' }}>
            {counts.present    ? <span><strong style={{ color: '#16A34A' }}>{counts.present}</strong> present</span>    : null}
            {counts.in_session ? <span><strong style={{ color: '#D97706' }}>{counts.in_session}</strong> in session</span> : null}
            {counts.absent     ? <span><strong style={{ color: '#DC2626' }}>{counts.absent}</strong> absent</span>     : null}
            {counts.upcoming   ? <span><strong style={{ color: '#94A3B8' }}>{counts.upcoming}</strong> upcoming</span>  : null}
          </div>
        </div>

        <Legend />

        {classes.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center" style={{ border: '1px solid #F1F5F9' }}>
            <p className="text-sm" style={{ color: '#94A3B8' }}>No timetable slots for today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {/* absent first so they're most visible */}
            {[...classes]
              .sort((a, b) => {
                const order = { absent: 0, in_session: 1, present: 2, upcoming: 3 };
                return (order[a.status] ?? 9) - (order[b.status] ?? 9);
              })
              .map(row => <ClassroomCard key={row.slot_id} row={row} />)
            }
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
                    {['Teacher','Department','Scheduled','Present','Absent','Attendance %','Status'].map(h => (
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
