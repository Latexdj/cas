'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saApi } from '@/lib/super-admin-api';

interface School {
  id: string;
  name: string;
  code: string;
  email: string;
  phone: string | null;
  subscription_status: string;
  ends_at: string | null;
  plan_name: string | null;
  active_teachers: number;
  total_attendance: number;
  last_submission: string | null;
  created_at: string;
}

type Filter = 'all' | 'trial' | 'active' | 'expired';

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(status: string) {
  if (status === 'active') return { label: 'Paid',    bg: '#14532d', color: '#4ade80' };
  if (status === 'trial')  return { label: 'Trial',   bg: '#78350f', color: '#fbbf24' };
  return                          { label: 'Expired', bg: '#7f1d1d', color: '#f87171' };
}

function exportCSV(schools: School[]) {
  const header = ['Code', 'Name', 'Email', 'Phone', 'Status', 'Trial Ends', 'Teachers', 'Attendance', 'Last Submission', 'Created'];
  const rows = schools.map(s => [
    s.code, s.name, s.email, s.phone ?? '',
    s.subscription_status, fmtDate(s.ends_at),
    s.active_teachers, s.total_attendance,
    fmtDate(s.last_submission), fmtDate(s.created_at),
  ]);
  const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `schools-${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(url);
}

export default function SchoolsListPage() {
  const router = useRouter();
  const [schools,  setSchools]  = useState<School[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDays, setBulkDays] = useState('14');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMsg,  setBulkMsg]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await saApi.get('/api/schools');
      setSchools(Array.isArray(res.data) ? res.data : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = schools.filter(s => {
    if (filter === 'all')     return true;
    if (filter === 'trial')   return s.subscription_status === 'trial';
    if (filter === 'active')  return s.subscription_status === 'active';
    if (filter === 'expired') return !['active', 'trial'].includes(s.subscription_status);
    return true;
  });

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s.id)));
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function bulkExtendTrial() {
    const days = parseInt(bulkDays) || 14;
    setBulkLoading(true); setBulkMsg('');
    const ids = [...selected];
    await Promise.allSettled(ids.map(id => saApi.post(`/api/schools/${id}/extend-trial`, { days })));
    setBulkMsg(`Extended trial for ${ids.length} school(s) by ${days} days.`);
    setSelected(new Set());
    await load();
    setBulkLoading(false);
  }

  async function bulkActivate() {
    setBulkLoading(true); setBulkMsg('');
    const ids = [...selected];
    await Promise.allSettled(ids.map(id => saApi.post(`/api/schools/${id}/activate`)));
    setBulkMsg(`Activated paid plan for ${ids.length} school(s).`);
    setSelected(new Set());
    await load();
    setBulkLoading(false);
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',     label: `All (${schools.length})` },
    { key: 'trial',   label: `Trial (${schools.filter(s => s.subscription_status === 'trial').length})` },
    { key: 'active',  label: `Paid (${schools.filter(s => s.subscription_status === 'active').length})` },
    { key: 'expired', label: `Expired (${schools.filter(s => !['active','trial'].includes(s.subscription_status)).length})` },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Schools</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportCSV(filtered)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
          <button
            onClick={() => router.push('/super-admin/schools/new')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add School
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-slate-800 rounded-xl p-1 w-fit">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setSelected(new Set()); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="bg-indigo-900/40 border border-indigo-700 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-indigo-300 font-semibold">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <input
              type="number" value={bulkDays} onChange={e => setBulkDays(e.target.value)}
              min="1" max="365"
              className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none"
            />
            <span className="text-xs text-slate-400">days</span>
            <button onClick={bulkExtendTrial} disabled={bulkLoading}
              className="px-3 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold disabled:opacity-40 transition-colors">
              Extend Trial
            </button>
          </div>
          <button onClick={bulkActivate} disabled={bulkLoading}
            className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-semibold disabled:opacity-40 transition-colors">
            Activate Paid
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-400 hover:text-white">
            Clear
          </button>
        </div>
      )}

      {bulkMsg && (
        <p className="text-xs text-green-400 bg-green-900/30 border border-green-800 rounded-lg px-3 py-2 mb-4">{bulkMsg}</p>
      )}

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-slate-800 border-b border-slate-700/50 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">No schools found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll} className="rounded border-slate-600 bg-slate-700 accent-indigo-500" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">School</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Expires</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Teachers</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Attendance</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const badge = statusBadge(s.subscription_status);
                  return (
                    <tr key={s.id}
                      onClick={() => router.push(`/super-admin/schools/${s.id}`)}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)}
                          className="rounded border-slate-600 bg-slate-700 accent-indigo-500" />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.code} · {s.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {s.subscription_status === 'active' ? '∞ Never' : fmtDate(s.ends_at)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">{s.active_teachers}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{s.total_attendance.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{fmtDate(s.last_submission)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
