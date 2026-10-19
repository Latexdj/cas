'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/Card';

interface Summary {
  total: number;
  by_severity: { severity: string; count: number }[];
  by_outcome: { outcome: string; count: number }[];
  by_patient_type: { patient_type: string; count: number }[];
}

interface ExportRow {
  visit_date: string; patient_type: string; patient_name: string;
  student_code: string | null; class_name: string | null; complaint: string; severity: string; outcome: string | null; status: string;
}

export default function ClinicReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  function load() {
    setLoading(true);
    api.get<Summary>('/api/clinic-admin/reports/summary', { params: { date_from: dateFrom, date_to: dateTo } })
      .then(r => setSummary(r.data)).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, [dateFrom, dateTo]);

  async function exportCsv() {
    setExporting(true);
    try {
      const r = await api.get<ExportRow[]>('/api/clinic-admin/reports/export', { params: { date_from: dateFrom, date_to: dateTo } });
      const header = ['Date', 'Patient Type', 'Name', 'Student Code', 'Class', 'Complaint', 'Severity', 'Outcome', 'Status'];
      const rows = r.data.map(v => [v.visit_date, v.patient_type, v.patient_name, v.student_code ?? '', v.class_name ?? '', v.complaint, v.severity, v.outcome ?? '', v.status]);
      const csv = [header, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clinic-visits-${dateFrom}-to-${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Clinic reports</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Visit counts for a date range</p>
        </div>
        <Button variant="secondary" onClick={exportCsv} loading={exporting}>Export CSV</Button>
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

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total visits" value={summary.total} color="blue" />
            <StatCard label="Minor" value={summary.by_severity.find(s => s.severity === 'minor')?.count ?? 0} color="green" />
            <StatCard label="Moderate" value={summary.by_severity.find(s => s.severity === 'moderate')?.count ?? 0} color="yellow" />
            <StatCard label="Serious" value={summary.by_severity.find(s => s.severity === 'serious')?.count ?? 0} color="red" />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">By outcome</h2>
            {summary.by_outcome.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No closed visits with an outcome in this range.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {summary.by_outcome.map(o => (
                  <div key={o.outcome} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700 dark:text-slate-300 capitalize">{o.outcome.replace(/_/g, ' ')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{o.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">By patient type</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {summary.by_patient_type.map(p => (
                <div key={p.patient_type} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-300 capitalize">{p.patient_type}</span>
                  <span className="font-medium text-slate-900 dark:text-white">{p.count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-red-500">Could not load the report, try again</p>
      )}
    </div>
  );
}
