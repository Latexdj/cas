'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface ClassYearRow {
  class_name: string;
  year_of_admission: number | null;
  count: number;
}

interface AssignedYear {
  year_of_admission: number;
  count: number;
}

interface ReviewData {
  by_class_year:    ClassYearRow[];
  assigned_by_year: AssignedYear[];
  total_unassigned: number;
}

interface ClassGroup {
  class_name: string;
  total: number;
  unassigned: number;
  years: { year: number | null; count: number }[];
  dominantYear: number | null;
}

function buildGroups(rows: ClassYearRow[]): ClassGroup[] {
  const map = new Map<string, ClassGroup>();
  for (const r of rows) {
    if (!map.has(r.class_name)) {
      map.set(r.class_name, { class_name: r.class_name, total: 0, unassigned: 0, years: [], dominantYear: null });
    }
    const g = map.get(r.class_name)!;
    g.total += r.count;
    g.years.push({ year: r.year_of_admission, count: r.count });
    if (r.year_of_admission === null) g.unassigned += r.count;
  }
  for (const g of map.values()) {
    const assigned = g.years.filter(y => y.year !== null);
    if (assigned.length > 0) {
      g.dominantYear = assigned.reduce((a, b) => (b.count > a.count ? b : a)).year;
    }
  }
  return Array.from(map.values());
}

export default function BatchYearReviewPage() {
  const [data,     setData]     = useState<ReviewData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [yearMap,  setYearMap]  = useState<Record<string, string>>({});
  const [editingClass, setEditingClass] = useState<string | null>(null);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [msg,      setMsg]      = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<ReviewData>('/api/students/batch-year-review');
      setData(r.data);
      // pre-fill year inputs from dominant assigned years
      const groups = buildGroups(r.data.by_class_year);
      const defaults: Record<string, string> = {};
      for (const g of groups) {
        if (g.dominantYear) defaults[g.class_name] = String(g.dominantYear);
      }
      setYearMap(defaults);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const groups = useMemo(() => data ? buildGroups(data.by_class_year) : [], [data]);
  const totalClasses = groups.length;
  const classesFullyAssigned = groups.filter(g => g.unassigned === 0 && g.dominantYear !== null).length;

  function setYear(className: string, val: string) {
    setYearMap(prev => ({ ...prev, [className]: val }));
  }

  async function assignClass(g: ClassGroup) {
    const year = parseInt(yearMap[g.class_name] ?? '');
    if (!year || isNaN(year) || year < 2000 || year > 2100) {
      setMsg({ type: 'err', text: `Enter a valid 4-digit year (e.g. 2024) for ${g.class_name}` });
      return;
    }
    const overwrite = g.dominantYear !== null; // overwrite only if changing an already-set year
    setSaving(g.class_name); setMsg(null);
    try {
      const r = await api.post<{ updated: number }>('/api/students/batch-year-assign', {
        year_of_admission: year,
        class_name: g.class_name,
        overwrite,
      });
      setMsg({ type: 'ok', text: `Year ${year} assigned to ${r.data.updated} student(s) in ${g.class_name}` });
      setEditingClass(null);
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error ?? 'Failed to assign year' });
    }
    setSaving(null);
  }

  const iCls = 'border rounded-lg px-3 py-1.5 text-sm w-28 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-green-500 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/students" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Year of Admission — Review & Manage</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Years were auto-assigned from student codes. Verify each class is correct and change any that are wrong.
          </p>
        </div>
      </div>

      {/* Status message */}
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

          {/* Main class table */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">
                  All Classes
                  {data && data.total_unassigned > 0 && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      {data.total_unassigned} student{data.total_unassigned !== 1 ? 's' : ''} unassigned
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Click <span className="font-semibold">Change</span> on any class to correct its year of admission
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{classesFullyAssigned}/{totalClasses} verified</p>
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-400 dark:text-slate-500 text-center">No active students found</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/40">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Class</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Students</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Year Assigned</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {groups.map(g => {
                    const isEditing = editingClass === g.class_name;
                    const isSaving  = saving === g.class_name;
                    const hasNull   = g.unassigned > 0;
                    const multiYear = g.years.filter(y => y.year !== null).length > 1;

                    return (
                      <tr key={g.class_name} className={`transition-colors ${hasNull ? 'bg-amber-50/40 dark:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
                        <td className="px-6 py-3 font-semibold text-slate-800 dark:text-slate-200">{g.class_name}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-slate-600 dark:text-slate-400">{g.total}</td>
                        <td className="px-4 py-3 text-center">
                          {isEditing ? (
                            <input
                              type="number"
                              min={2000}
                              max={2100}
                              placeholder="e.g. 2024"
                              value={yearMap[g.class_name] ?? ''}
                              onChange={e => setYear(g.class_name, e.target.value)}
                              autoFocus
                              className={iCls}
                            />
                          ) : hasNull && g.dominantYear === null ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                              Not set
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
                                {g.dominantYear}
                              </span>
                              {multiYear && (
                                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">mixed</span>
                              )}
                              {hasNull && (
                                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">+{g.unassigned} unset</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => { setEditingClass(null); }}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => assignClass(g)}
                                disabled={isSaving}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                {isSaving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setMsg(null); setEditingClass(g.class_name); }}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                                hasNull && g.dominantYear === null
                                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                                  : 'border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                              }`}
                            >
                              {hasNull && g.dominantYear === null ? 'Assign' : 'Change'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Year batch summary */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">Year Batches</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Active students per admission year</p>
            </div>
            {!data || data.assigned_by_year.length === 0 ? (
              <p className="px-6 py-6 text-sm text-slate-400 dark:text-slate-500 text-center">No years assigned yet</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.assigned_by_year.map(r => (
                  <div key={r.year_of_admission} className="flex items-center justify-between px-6 py-3">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{r.year_of_admission} Batch</span>
                    <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">{r.count} student{r.count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
                {data.total_unassigned > 0 && (
                  <div className="flex items-center justify-between px-6 py-3">
                    <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">Unassigned</span>
                    <span className="text-sm tabular-nums text-amber-600 dark:text-amber-400">{data.total_unassigned} student{data.total_unassigned !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
