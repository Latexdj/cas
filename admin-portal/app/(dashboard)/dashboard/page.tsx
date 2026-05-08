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
        <div className="w-8 h-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  const today = DAYS[new Date().getDay()];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{today}, {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
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
        <h2 className="text-base font-semibold text-gray-900 mb-3">Today's Classroom Status</h2>
        {classes.length === 0 ? (
          <p className="text-sm text-gray-500">No timetable slots for today.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Time', 'Class', 'Subject', 'Teacher', 'Status', 'Photo'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {classes.map((row) => (
                  <tr key={row.slot_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.start_time}–{row.end_time}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.class_name}</td>
                    <td className="px-4 py-3 text-gray-700">{row.subject}</td>
                    <td className="px-4 py-3 text-gray-700">{row.teacher_name}</td>
                    <td className="px-4 py-3"><Badge status={row.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {row.location_verified === true && '✓ GPS'}
                      {row.location_verified === false && '✗ GPS'}
                      {row.location_verified === null && '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
