'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { saApi } from '@/lib/super-admin-api';

interface Stats {
  total_schools: number;
  trial_schools: number;
  active_schools: number;
  expired_schools: number;
  total_teachers: number;
  attendance_this_month: number;
  total_attendance: number;
  most_active_school: { name: string; code: string; attendance_count: number } | null;
  inactive_schools: { id: string; name: string; code: string; last_submission: string | null }[];
}

function fmtDate(iso: string | null) {
  if (!iso) return 'Never';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StatsPage() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await saApi.get('/api/super-admin/stats');
      setStats(res.data);
    } catch {
      setError('Failed to load statistics.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Statistics</h1>
          <p className="text-sm text-slate-400 mt-0.5">System-wide platform metrics</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 mb-6">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-24 bg-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : stats ? (
        <>
          {/* School breakdown */}
          <div className="mb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Schools</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total',    value: stats.total_schools,   color: '#818cf8' },
                { label: 'Paid',     value: stats.active_schools,  color: '#4ade80' },
                { label: 'On Trial', value: stats.trial_schools,   color: '#fbbf24' },
                { label: 'Expired',  value: stats.expired_schools, color: '#f87171' },
              ].map(s => (
                <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-2xl p-5 text-center">
                  <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Attendance + teachers */}
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3 mt-6">Usage</p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[
                { label: 'Active Teachers (all schools)',   value: stats.total_teachers.toLocaleString(),            color: '#a78bfa' },
                { label: 'Attendance Records This Month',   value: stats.attendance_this_month.toLocaleString(),     color: '#34d399' },
                { label: 'Total Attendance (all time)',     value: stats.total_attendance.toLocaleString(),          color: '#94a3b8' },
              ].map(s => (
                <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                  <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Most active school */}
          {stats.most_active_school && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 mb-6">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Most Active This Month</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-bold text-white">{stats.most_active_school.name}</p>
                  <p className="text-xs text-slate-400">{stats.most_active_school.code}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-400">{stats.most_active_school.attendance_count.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">attendance records</p>
                </div>
              </div>
            </div>
          )}

          {/* Inactive schools */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">
              Inactive Schools (no activity in 7+ days)
            </p>
            {stats.inactive_schools.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">All schools are active</p>
            ) : (
              <div className="space-y-1">
                {stats.inactive_schools.map(s => (
                  <Link key={s.id} href={`/super-admin/schools/${s.id}`}>
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-700/50 transition-colors cursor-pointer">
                      <div>
                        <p className="text-sm font-semibold text-white">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.code}</p>
                      </div>
                      <span className="text-xs text-slate-400">Last: {fmtDate(s.last_submission)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
