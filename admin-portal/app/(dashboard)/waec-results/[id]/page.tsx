'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { PassRateBarChart } from '@/components/charts/PassRateBarChart';

const WAEC_GRADE_ORDER = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];

interface GenderCount { boys: number; girls: number; total: number }
interface Subject {
  name: string; isCore: boolean;
  registered: GenderCount; presented: GenderCount; absent: GenderCount; cancelled: GenderCount;
  gradeDistribution: Record<string, { boys: number; girls: number }>;
  percentagePass: { boys: number; girls: number; total: number };
}
interface Report {
  year: number; examBody: string; totalCandidates: number; subjects: Subject[];
  summaryOfPasses: { buckets: Record<string, number>; failures: number; entireResultsCancelled: number };
}

const cellCls = 'px-2 py-1.5 text-center whitespace-nowrap';

function SubjectTable({ title, subjects }: { title: string; subjects: Subject[] }) {
  if (!subjects.length) return null;
  return (
    <div className="overflow-x-auto">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mt-4 mb-2">{title}</h3>
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr className="bg-slate-50 text-slate-500">
            <th className="px-2 py-1.5 text-left sticky left-0 bg-slate-50">Subject</th>
            <th className={cellCls} colSpan={3}>Registered</th>
            <th className={cellCls} colSpan={3}>Presented</th>
            <th className={cellCls} colSpan={3}>Absent</th>
            {WAEC_GRADE_ORDER.map(g => <th key={g} className={cellCls} colSpan={3}>{g}</th>)}
            <th className={cellCls} colSpan={3}>% Pass</th>
          </tr>
          <tr className="bg-slate-50 text-slate-400">
            <th className="sticky left-0 bg-slate-50" />
            {Array.from({ length: 3 + 3 + 3 + WAEC_GRADE_ORDER.length * 3 + 3 }).map((_, i) => (
              <th key={i} className={cellCls}>{['B', 'G', 'T'][i % 3]}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {subjects.map(s => (
            <tr key={s.name}>
              <td className="px-2 py-1.5 font-medium text-slate-700 sticky left-0 bg-white whitespace-nowrap">{s.name}</td>
              <td className={cellCls}>{s.registered.boys}</td><td className={cellCls}>{s.registered.girls}</td><td className={cellCls}>{s.registered.total}</td>
              <td className={cellCls}>{s.presented.boys}</td><td className={cellCls}>{s.presented.girls}</td><td className={cellCls}>{s.presented.total}</td>
              <td className={cellCls}>{s.absent.boys}</td><td className={cellCls}>{s.absent.girls}</td><td className={cellCls}>{s.absent.total}</td>
              {WAEC_GRADE_ORDER.map(g => {
                const d = s.gradeDistribution[g];
                return (
                  <Fragment key={g}>
                    <td className={cellCls}>{d?.boys || ''}</td>
                    <td className={cellCls}>{d?.girls || ''}</td>
                    <td className={cellCls}>{d ? d.boys + d.girls : ''}</td>
                  </Fragment>
                );
              })}
              <td className={cellCls}>{s.percentagePass.boys}%</td><td className={cellCls}>{s.percentagePass.girls}%</td><td className={`${cellCls} font-semibold`}>{s.percentagePass.total}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function WaecReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/admin/exam-results/batches/${id}/report`);
      setReport(data);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not load report');
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Export endpoints require the same Bearer auth as every other API call —
  // a plain <a href> to the backend URL sends no Authorization header at
  // all (the browser only auto-attaches cookies, not localStorage tokens),
  // so it always hit "Authentication required" instead of downloading.
  async function handleExport(format: 'xlsx' | 'pdf') {
    setExporting(format); setExportError('');
    try {
      const token = localStorage.getItem('cas_token');
      const base = process.env.NEXT_PUBLIC_API_URL ?? '';
      const r = await fetch(`${base}/api/admin/exam-results/batches/${id}/export.${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report?.examBody ?? 'WAEC'}_${report?.year ?? ''}_Analysis_Report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(`${format.toUpperCase()} export failed. Please try again.`);
    } finally {
      setExporting(null);
    }
  }

  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 max-w-xl">{error}</p>;
  if (!report) return <p className="text-sm text-slate-400">Loading…</p>;

  const overallPass = report.subjects.length
    ? Math.round((report.subjects.reduce((s, x) => s + x.percentagePass.total, 0) / report.subjects.length) * 10) / 10
    : 0;
  const coreSubjects = report.subjects.filter(s => s.isCore);
  const electiveSubjects = report.subjects.filter(s => !s.isCore);
  const maxBucket = Math.max(0, ...Object.keys(report.summaryOfPasses.buckets).map(Number));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/waec-results" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; WAEC Results</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{report.examBody} {report.year} Analysis Report</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport('xlsx')} disabled={exporting !== null}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#145C44] hover:bg-[#0f4a36] disabled:opacity-50">
            {exporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}
          </button>
          <button onClick={() => handleExport('pdf')} disabled={exporting !== null}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {exportError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{exportError}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-400">Candidates</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{report.totalCandidates}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-400">Avg. Pass Rate</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{overallPass}%</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-400">Failures</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{report.summaryOfPasses.failures}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-400">Entire Results Cancelled</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{report.summaryOfPasses.entireResultsCancelled}</p>
        </div>
      </div>

      <PassRateBarChart bars={report.subjects.map(s => ({ subject: s.name, pct: s.percentagePass.total }))} />

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-500">Grade Distribution</h2>
        <SubjectTable title="Core" subjects={coreSubjects} />
        <SubjectTable title="Electives" subjects={electiveSubjects} />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-500 mb-3">Summary of Subjects Passed</h2>
        <table className="text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-1.5 pr-6 text-slate-500">Total Number of Candidates</td><td className="py-1.5 font-semibold">{report.totalCandidates}</td></tr>
            {Array.from({ length: maxBucket }, (_, i) => maxBucket - i).map(n => (
              <tr key={n}><td className="py-1.5 pr-6 text-slate-500">{n} {n === 1 ? 'Pass' : 'Passes'}</td><td className="py-1.5 font-semibold">{report.summaryOfPasses.buckets[n] || 0}</td></tr>
            ))}
            <tr><td className="py-1.5 pr-6 text-slate-500">Failures</td><td className="py-1.5 font-semibold">{report.summaryOfPasses.failures}</td></tr>
            <tr><td className="py-1.5 pr-6 text-slate-500">Entire Results Cancelled</td><td className="py-1.5 font-semibold">{report.summaryOfPasses.entireResultsCancelled}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
