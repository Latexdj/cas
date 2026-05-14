'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { saApi } from '@/lib/super-admin-api';

interface School {
  id: string;
  name: string;
  code: string;
  email: string;
  subscription_status: string;
  ends_at: string | null;
  active_teachers: number;
  created_at: string;
}

interface AuditEntry {
  id: string;
  action: string;
  entity_name: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const end = new Date(iso); end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / 86400000);
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    school_created:  'School created',
    school_deleted:  'School deleted',
    school_activated:'School activated',
    school_updated:  'School updated',
    trial_extended:  'Trial extended',
    admin_pin_reset: 'Admin PIN reset',
    change_password: 'Password changed',
  };
  return map[action] ?? action.replace(/_/g, ' ');
}

function actionColor(action: string) {
  if (action === 'school_created')   return { bg: '#1e3a5f', text: '#60a5fa' };
  if (action === 'school_deleted')   return { bg: '#3b1f1f', text: '#f87171' };
  if (action === 'school_activated') return { bg: '#1e3a2a', text: '#4ade80' };
  if (action === 'trial_extended')   return { bg: '#3b2e0f', text: '#fbbf24' };
  return { bg: '#1e293b', text: '#94a3b8' };
}

export default function SuperAdminDashboard() {
  const [schools,  setSchools]  = useState<School[]>([]);
  const [logs,     setLogs]     = useState<AuditEntry[]>([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schoolsRes, logsRes] = await Promise.allSettled([
        saApi.get('/api/schools'),
        saApi.get('/api/super-admin/audit-log?limit=8'),
      ]);
      if (schoolsRes.status === 'fulfilled') setSchools(schoolsRes.value.data);
      if (logsRes.status === 'fulfilled')    setLogs(logsRes.value.data.logs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total    = schools.length;
  const active   = schools.filter(s => s.subscription_status === 'active').length;
  const trial    = schools.filter(s => s.subscription_status === 'trial').length;
  const expired  = schools.filter(s => !['active', 'trial'].includes(s.subscription_status)).length;

  const expiringSoon = schools.filter(s =>
    s.subscription_status === 'trial' && s.ends_at && daysUntil(s.ends_at) <= 7
  ).sort((a, b) => new Date(a.ends_at!).getTime() - new Date(b.ends_at!).getTime());

  const recentSchools = [...schools].slice(0, 5);

  const stats = [
    { label: 'Total Schools',  value: total,   color: '#818cf8' },
    { label: 'Paid / Active',  value: active,  color: '#4ade80' },
    { label: 'On Trial',       value: trial,   color: '#fbbf24' },
    { label: 'Expired',        value: expired, color: '#f87171' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <Link
          href="/super-admin/schools/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add School
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <p className="text-3xl font-bold" style={{ color: s.color }}>
              {loading ? '—' : s.value}
            </p>
            <p className="text-xs text-slate-400 mt-1 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Expiry alerts */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">
            Expiry Alerts
          </p>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 rounded-xl bg-slate-700 animate-pulse" />)}</div>
          ) : expiringSoon.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No trials expiring in the next 7 days</p>
          ) : expiringSoon.map(s => {
            const days = daysUntil(s.ends_at!);
            const urgent = days <= 0;
            return (
              <Link key={s.id} href={`/super-admin/schools/${s.id}`}>
                <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 mb-2 border cursor-pointer hover:opacity-80 ${
                  urgent ? 'bg-red-900/30 border-red-800' : 'bg-yellow-900/20 border-yellow-800/50'
                }`}>
                  <div>
                    <p className="text-sm font-semibold text-white">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.code}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    urgent ? 'bg-red-900 text-red-300' : 'bg-yellow-900/50 text-yellow-300'
                  }`}>
                    {urgent ? 'Expired' : `${days}d left`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Recent activity */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Recent Activity</p>
            <Link href="/super-admin/audit" className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
          </div>
          {loading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 rounded-xl bg-slate-700 animate-pulse" />)}</div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No activity yet</p>
          ) : logs.map(log => {
            const col = actionColor(log.action);
            return (
              <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-slate-700/50 last:border-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: col.bg, color: col.text }}>
                  {actionLabel(log.action)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-slate-300 truncate">{log.entity_name ?? '—'}</p>
                  <p className="text-[10px] text-slate-500">{new Date(log.created_at).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent schools */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Recent Schools</p>
          <Link href="/super-admin/schools" className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
        </div>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-xl bg-slate-700 animate-pulse" />)}</div>
        ) : recentSchools.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No schools yet</p>
        ) : (
          <div className="space-y-1">
            {recentSchools.map(s => (
              <Link key={s.id} href={`/super-admin/schools/${s.id}`}>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-700/50 transition-colors cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold text-white">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.code} · {s.active_teachers} teachers · Added {fmtDate(s.created_at)}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    s.subscription_status === 'active' ? 'bg-green-900/50 text-green-300' :
                    s.subscription_status === 'trial'  ? 'bg-yellow-900/40 text-yellow-300' :
                    'bg-red-900/40 text-red-300'
                  }`}>
                    {s.subscription_status === 'active' ? 'Paid' : s.subscription_status === 'trial' ? 'Trial' : 'Expired'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
