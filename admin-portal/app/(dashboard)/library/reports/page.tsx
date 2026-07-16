'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface CirculationSummary {
  total_issues: number; total_returns: number; currently_active: number;
  currently_overdue: number; total_fines_assessed: string; total_fines_collected: string;
}
interface PopularTitle {
  title: string; author: string | null; borrow_count: number;
}
interface OverdueAging {
  mild: number; moderate: number; severe: number;
}
interface CirculationReport {
  summary: CirculationSummary;
  popular_titles: PopularTitle[];
  overdue_aging: OverdueAging;
}
interface OverdueLoan {
  id: string; book_title: string; author: string | null; copy_number: string;
  student_name: string; student_code: string; class_name: string;
  issued_at: string; due_date: string; days_overdue: number;
  fine_amount: number; fine_paid: boolean; fine_waived: boolean;
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  );
}

function AgingBar({ aging }: { aging: OverdueAging }) {
  const total = aging.mild + aging.moderate + aging.severe;
  if (!total) return <p className="text-sm text-slate-400 text-center py-4">No overdue loans.</p>;
  const pct = (n: number) => total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-500 w-24 shrink-0">Mild (1–7 days)</span>
        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct(aging.mild)}%` }} />
        </div>
        <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-8 text-right">{aging.mild}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-500 w-24 shrink-0">Moderate (8–21d)</span>
        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
          <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct(aging.moderate)}%` }} />
        </div>
        <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-8 text-right">{aging.moderate}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-500 w-24 shrink-0">Severe (&gt;21 days)</span>
        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
          <div className="h-full bg-red-600 rounded-full transition-all" style={{ width: `${pct(aging.severe)}%` }} />
        </div>
        <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-8 text-right">{aging.severe}</span>
      </div>
    </div>
  );
}

export default function LibraryReportsPage() {
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');

  const [report,      setReport]      = useState<CirculationReport | null>(null);
  const [overdue,     setOverdue]     = useState<OverdueLoan[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [overdueLoad, setOverdueLoad] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to)   params.to   = to;
      const { data } = await api.get<CirculationReport>('/api/library/reports/circulation', { params });
      setReport(data);
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => {
    loadReport();
    api.get<OverdueLoan[]>('/api/library/reports/overdue').then(r => setOverdue(r.data)).finally(() => setOverdueLoad(false));
  }, []);

  const totalFinesAssessed  = report ? parseFloat(report.summary.total_fines_assessed) : 0;
  const totalFinesCollected = report ? parseFloat(report.summary.total_fines_collected) : 0;
  const totalFinesOutstanding = totalFinesAssessed - totalFinesCollected;

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Library Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Circulation statistics, popular titles, and overdue tracking</p>
      </div>

      {/* Date filter */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <button onClick={loadReport} disabled={loading}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: '#15803D' }}>
          {loading ? 'Loading…' : 'Apply Filter'}
        </button>
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo(''); setTimeout(loadReport, 0); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
            Clear
          </button>
        )}
      </div>

      {/* Summary stats */}
      {report && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Circulation Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Total Issues"     value={report.summary.total_issues}      color="#3B82F6" />
            <StatCard label="Total Returns"    value={report.summary.total_returns}     color="#10B981" />
            <StatCard label="Currently Out"    value={report.summary.currently_active}  color="#F59E0B" />
            <StatCard label="Currently Overdue" value={report.summary.currently_overdue} color="#EF4444" />
            <StatCard label="Fines Assessed"   value={`GH₵ ${totalFinesAssessed.toFixed(2)}`}     color="#8B5CF6" />
            <StatCard label="Fines Collected"  value={`GH₵ ${totalFinesCollected.toFixed(2)}`}    color="#10B981" />
          </div>
          {totalFinesOutstanding > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm font-semibold text-amber-700 dark:text-amber-400">
              GH₵ {totalFinesOutstanding.toFixed(2)} in fines outstanding
            </div>
          )}
        </section>
      )}

      {/* Overdue aging */}
      {report && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Overdue Aging</h2>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5">
            <AgingBar aging={report.overdue_aging} />
          </div>
        </section>
      )}

      {/* Popular titles */}
      {report && report.popular_titles.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Most Borrowed Titles{from || to ? ' (filtered period)' : ' (all time)'}
          </h2>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Author</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Borrows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {report.popular_titles.map((t, i) => {
                  const maxCount = report.popular_titles[0].borrow_count;
                  const barWidth = maxCount ? Math.round((t.borrow_count / maxCount) * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3 text-xs font-bold text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{t.title}</p>
                        <div className="mt-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden w-full max-w-xs">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${barWidth}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{t.author ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300 tabular-nums">{t.borrow_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Full overdue list */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Current Overdue Loans ({overdueLoad ? '…' : overdue.length})
        </h2>
        {overdueLoad ? (
          <div className="flex justify-center py-6"><div className="w-6 h-6 rounded-full border-4 border-red-500 border-t-transparent animate-spin" /></div>
        ) : overdue.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 text-center text-sm text-slate-400">
            No overdue loans. Great job!
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Book</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Days Overdue</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Fine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {overdue.map(l => (
                    <tr key={l.id} className={l.days_overdue > 21 ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{l.book_title}</p>
                        <p className="text-xs text-slate-400">Copy #{l.copy_number}{l.author ? ` · ${l.author}` : ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-white">{l.student_name}</p>
                        <p className="text-xs text-slate-400">{l.student_code} · {l.class_name}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">
                        {new Date(l.due_date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                          l.days_overdue > 21 ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' :
                          l.days_overdue > 7  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                          'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        }`}>
                          {l.days_overdue}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {l.fine_amount > 0 ? (
                          <span className={`text-xs font-semibold ${l.fine_waived ? 'text-green-600' : l.fine_paid ? 'text-slate-400' : 'text-red-600 dark:text-red-400'}`}>
                            GH₵ {parseFloat(String(l.fine_amount)).toFixed(2)}
                            {l.fine_waived ? ' (waived)' : l.fine_paid ? ' (paid)' : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 text-right">Total fines outstanding</td>
                    <td className="px-4 py-2.5 text-right text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
                      GH₵ {overdue.filter(l => !l.fine_paid && !l.fine_waived).reduce((s, l) => s + parseFloat(String(l.fine_amount)), 0).toFixed(2)}
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
