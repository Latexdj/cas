'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface UnassignedClass {
  class_name: string;
  count: number;
}

interface AssignedYear {
  year_of_admission: number;
  count: number;
}

interface ReviewData {
  unassigned_by_class: UnassignedClass[];
  assigned_by_year:    AssignedYear[];
  total_unassigned:    number;
}

export default function BatchYearReviewPage() {
  const [data,    setData]    = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearMap, setYearMap] = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState<string | null>(null);
  const [msg,     setMsg]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<ReviewData>('/api/students/batch-year-review');
      setData(r.data);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function setYear(className: string, val: string) {
    setYearMap(prev => ({ ...prev, [className]: val }));
  }

  async function assignClass(className: string) {
    const year = parseInt(yearMap[className] ?? '');
    if (!year || isNaN(year)) { setMsg({ type: 'err', text: `Enter a 4-digit year for ${className}` }); return; }
    setSaving(className); setMsg(null);
    try {
      const r = await api.post<{ updated: number }>('/api/students/batch-year-assign', {
        year_of_admission: year,
        class_name: className,
      });
      setMsg({ type: 'ok', text: `Assigned ${r.data.updated} student(s) in ${className} to ${year}` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error ?? 'Failed to assign year' });
    }
    setSaving(null);
  }

  async function assignAll() {
    if (!data?.unassigned_by_class.length) return;
    const missing = data.unassigned_by_class.filter(r => !yearMap[r.class_name] || isNaN(parseInt(yearMap[r.class_name])));
    if (missing.length) {
      setMsg({ type: 'err', text: `Please enter a year for: ${missing.map(r => r.class_name).join(', ')}` });
      return;
    }
    setSaving('__all__'); setMsg(null);
    let totalUpdated = 0;
    for (const row of data.unassigned_by_class) {
      try {
        const r = await api.post<{ updated: number }>('/api/students/batch-year-assign', {
          year_of_admission: parseInt(yearMap[row.class_name]),
          class_name: row.class_name,
        });
        totalUpdated += r.data.updated;
      } catch { /* skip on error */ }
    }
    setMsg({ type: 'ok', text: `Done — assigned year to ${totalUpdated} students` });
    await load();
    setSaving(null);
  }

  const iCls = 'border rounded-lg px-3 py-1.5 text-sm w-28 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-green-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/students" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Year of Admission — Batch Review</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Assign the year of admission to students whose year is missing or incorrect</p>
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${msg.type === 'ok'
          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm py-8">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Unassigned */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">
                  Classes with Unassigned Students
                  {data && data.total_unassigned > 0 && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      {data.total_unassigned} student{data.total_unassigned !== 1 ? 's' : ''}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Enter the year students in each class were admitted, then click Assign</p>
              </div>
              {data && data.unassigned_by_class.length > 0 && (
                <button
                  onClick={assignAll}
                  disabled={saving === '__all__'}
                  className="text-sm font-semibold px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {saving === '__all__' ? 'Saving…' : 'Assign All'}
                </button>
              )}
            </div>

            {!data || data.unassigned_by_class.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <svg className="w-10 h-10 mx-auto mb-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">All students have a year of admission assigned</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Nothing to review right now</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/40">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Class</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Students</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Year of Admission</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {data.unassigned_by_class.map(row => (
                    <tr key={row.class_name} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-3 font-semibold text-slate-800 dark:text-slate-200">{row.class_name}</td>
                      <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400 tabular-nums">{row.count}</td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min={2000}
                          max={2100}
                          placeholder="e.g. 2024"
                          value={yearMap[row.class_name] ?? ''}
                          onChange={e => setYear(row.class_name, e.target.value)}
                          className={iCls + ' border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white'}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => assignClass(row.class_name)}
                          disabled={saving === row.class_name}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {saving === row.class_name ? 'Saving…' : 'Assign'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Already assigned summary */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">Already Assigned</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Active students with a year of admission</p>
            </div>
            {!data || data.assigned_by_year.length === 0 ? (
              <p className="px-6 py-6 text-sm text-slate-400 dark:text-slate-500 text-center">No assigned students yet</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.assigned_by_year.map(r => (
                  <div key={r.year_of_admission} className="flex items-center justify-between px-6 py-3">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{r.year_of_admission} Batch</span>
                    <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">{r.count} student{r.count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
