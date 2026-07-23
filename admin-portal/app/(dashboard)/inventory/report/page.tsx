'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface SummaryRow {
  ownership_type: string;
  department_name: string | null;
  item_count: number;
  total_units: number;
  available_units: number;
  units_issued: number;
  good_count: number;
  damaged_count: number;
  written_off_count: number;
}

interface Totals {
  total_items: number;
  total_units: number;
  available_units: number;
  good_count: number;
  damaged_count: number;
  written_off_count: number;
}

interface ReportData { summary: SummaryRow[]; totals: Totals; }

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function InventoryReportPage() {
  const [data,    setData]    = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get<ReportData>('/api/inventory/report')
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error ?? 'Failed to load report'))
      .finally(() => setLoading(false));
  }, []);

  const generalRows      = data?.summary.filter(r => r.ownership_type === 'general') ?? [];
  const departmentRows   = data?.summary.filter(r => r.ownership_type === 'departmental') ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Inventory Report</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Asset summary by ownership type and department</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error   && <p className="text-sm text-red-500">{error}</p>}

      {data && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
            <Stat label="Total Items"   value={data.totals.total_items} />
            <Stat label="Total Units"   value={data.totals.total_units} />
            <Stat label="Available"     value={data.totals.available_units} />
            <Stat label="Good"          value={data.totals.good_count} />
            <Stat label="Damaged"       value={data.totals.damaged_count} />
            <Stat label="Written Off"   value={data.totals.written_off_count} />
          </div>

          {/* General assets */}
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-white mb-3">General Assets</h2>
            {generalRows.length === 0 ? (
              <p className="text-sm text-slate-400">No general items.</p>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Group</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Items</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Total Units</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Available</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Issued</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Good</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Damaged</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Written Off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generalRows.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 border-slate-50 dark:border-slate-700/50">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">General</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">{row.item_count}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">{row.total_units}</td>
                        <td className="px-4 py-3 text-right text-green-700 dark:text-green-400 font-semibold tabular-nums">{row.available_units}</td>
                        <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-400 tabular-nums">{row.units_issued}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 tabular-nums">{row.good_count}</td>
                        <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400 tabular-nums">{row.damaged_count}</td>
                        <td className="px-4 py-3 text-right text-red-600 dark:text-red-400 tabular-nums">{row.written_off_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Departmental assets */}
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-white mb-3">Departmental Assets</h2>
            {departmentRows.length === 0 ? (
              <p className="text-sm text-slate-400">No departmental items.</p>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Department</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Items</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Total Units</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Available</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Issued</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Good</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Damaged</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Written Off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentRows.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 border-slate-50 dark:border-slate-700/50">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{row.department_name ?? 'Unassigned'}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">{row.item_count}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">{row.total_units}</td>
                        <td className="px-4 py-3 text-right text-green-700 dark:text-green-400 font-semibold tabular-nums">{row.available_units}</td>
                        <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-400 tabular-nums">{row.units_issued}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 tabular-nums">{row.good_count}</td>
                        <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400 tabular-nums">{row.damaged_count}</td>
                        <td className="px-4 py-3 text-right text-red-600 dark:text-red-400 tabular-nums">{row.written_off_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
