'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Stats {
  total_students: number;
  active_students: number;
  total_classes: number;
  current_term: { id: string; name: string } | null;
  attendance_today: number;
  classes: { class_name: string; student_count: number }[];
}

export default function PrimaryAdminDashboard() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Stats>('/api/primary/dashboard-stats')
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        {stats?.current_term && (
          <p className="text-sm text-slate-500 mt-0.5">Current term: <span className="font-semibold text-slate-700">{stats.current_term.name}</span></p>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Students',    value: stats?.active_students ?? 0,   color: '#15803D', bg: '#F0FDF4' },
          { label: 'Classes',            value: stats?.total_classes ?? 0,     color: '#1D4ED8', bg: '#EFF6FF' },
          { label: 'Marked Today',       value: stats?.attendance_today ?? 0,  color: '#D97706', bg: '#FFFBEB' },
          { label: 'Total Students',     value: stats?.total_students ?? 0,    color: '#475569', bg: '#F8FAFC' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border p-4 text-center" style={{ backgroundColor: k.bg, borderColor: k.color + '30' }}>
            <p className="text-3xl font-black" style={{ color: k.color }}>{k.value}</p>
            <p className="text-xs font-medium text-slate-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Classes breakdown */}
      {stats?.classes && stats.classes.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900 text-sm">Students by Class</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.classes.map(c => (
              <div key={c.class_name} className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm font-medium text-slate-800">{c.class_name}</span>
                <span className="text-sm font-bold" style={{ color: '#15803D' }}>{c.student_count} students</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
