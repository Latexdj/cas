'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { AdminStats, ClassroomStatus } from '@/types/api';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function DashboardPage() {
  const [stats, setStats]       = useState<AdminStats | null>(null);
  const [classes, setClasses]   = useState<ClassroomStatus[]>([]);
  const [running, setRunning]   = useState(false);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api.get<AdminStats>('/api/admin/stats'),
        api.get<ClassroomStatus[]>('/api/admin/classroom-status'),
      ]);
      setStats(s.data);
      setClasses(c.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
        <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const today = DAYS[new Date().getDay()];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#0F172A' }}>Overview</h2>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{today} · live snapshot</p>
        </div>
        <Button variant="secondary" size="sm" loading={running} onClick={runAbsenceCheck}>
          Run Absence Check
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Today's Attendance" value={stats.today_attendance} color="green" />
          <StatCard label="Today's Absences"   value={stats.today_absences}   color="red"   />
          <StatCard label="Total Teachers"     value={stats.total_teachers}   color="blue"  />
          <StatCard label="Week Attendance"    value={stats.week_attendance}  color="purple"/>
          <StatCard label="Outstanding"        value={stats.outstanding_absences} color="yellow" />
          <StatCard label="Pending Remedials"  value={stats.pending_remedials}    color="yellow" />
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: '#64748B' }}>Today&apos;s Classroom Status</h2>
        {classes.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center" style={{ border: '1px solid #F1F5F9' }}>
            <p className="text-sm" style={{ color: '#94A3B8' }}>No timetable slots for today.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                    {['Time', 'Class', 'Subject', 'Teacher', 'Status', 'GPS'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {classes.map((row, i) => (
                    <tr key={row.slot_id} style={{ borderBottom: i < classes.length - 1 ? '1px solid #F8FAFC' : 'none' }}
                      className="transition-colors hover:bg-slate-50">
                      <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs" style={{ color: '#64748B' }}>{row.start_time}–{row.end_time}</td>
                      <td className="px-5 py-3.5 font-semibold text-sm" style={{ color: '#0F172A' }}>{row.class_name}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: '#475569' }}>{row.subject}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: '#475569' }}>{row.teacher_name}</td>
                      <td className="px-5 py-3.5"><Badge status={row.status} /></td>
                      <td className="px-5 py-3.5 text-xs font-medium" style={{ color: row.location_verified === true ? '#16A34A' : row.location_verified === false ? '#DC2626' : '#CBD5E1' }}>
                        {row.location_verified === true ? '✓ Verified' : row.location_verified === false ? '✗ Failed' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
