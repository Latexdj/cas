'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface SummaryRow { item_name: string; type: string; total_quantity: number; }
interface ExportRow {
  created_at: string; item_name: string; type: string; quantity: number;
  patient_name: string | null; dispensed_by: string | null; notes: string | null;
}

export default function ClinicInventoryReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  function load() {
    setLoading(true);
    api.get<SummaryRow[]>('/api/clinic-inventory/report', { params: { date_from: dateFrom, date_to: dateTo } })
      .then(r => setSummary(r.data)).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, [dateFrom, dateTo]);

  async function exportCsv() {
    setExporting(true);
    try {
      const r = await api.get<ExportRow[]>('/api/clinic-inventory/report/export', { params: { date_from: dateFrom, date_to: dateTo } });
      const header = ['Date', 'Item', 'Type', 'Quantity', 'Patient', 'Dispensed By', 'Notes'];
      const rows = r.data.map(x => [new Date(x.created_at).toLocaleString(), x.item_name, x.type, x.quantity, x.patient_name ?? '', x.dispensed_by ?? '', x.notes ?? '']);
      const csv = [header, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clinic-inventory-${dateFrom}-to-${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const grouped = summary.reduce<Record<string, SummaryRow[]>>((acc, r) => {
    (acc[r.item_name] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dispensing report</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">What was restocked, dispensed, and written off, by item</p>
        </div>
        <Button variant="secondary" onClick={exportCsv} loading={exporting}>Export CSV (who used what, on whom)</Button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">From</label>
          <input type="date" className="rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">To</label>
          <input type="date" className="rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No stock movement in this range.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {Object.entries(grouped).map(([name, rows]) => (
              <div key={name} className="px-5 py-3">
                <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">{name}</p>
                <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                  {rows.map(r => (
                    <span key={r.type} className="capitalize">{r.type}: <span className="font-semibold text-slate-700 dark:text-slate-300">{r.total_quantity}</span></span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
