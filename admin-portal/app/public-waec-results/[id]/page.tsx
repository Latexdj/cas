'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';

interface SubjectSummary {
  name: string;
  isCore: boolean;
  percentagePass: { boys: number; girls: number; total: number };
  gradeDistribution: Record<string, { boys: number; girls: number }>; 
  registered: { boys: number; girls: number; total: number };
  presented: { boys: number; girls: number; total: number };
  absent: { boys: number; girls: number; total: number };
  cancelled: { boys: number; girls: number; total: number };
}

interface PublicReport {
  year: number;
  schoolName: string;
  schoolNumber: string | null;
  examBody: string;
  totalCandidates: number;
  subjects: SubjectSummary[];
  summaryOfPasses: { buckets: Record<string, number>; failures: number; noResultCandidates: number };
  officialSummary: Record<string, any> | null;
  warnings: string[];
  summaryMismatches: string[];
}

export default function PublicWaecReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<PublicReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await publicApi.get(`/api/public/waec-results/${id}/report`);
      setReport(data.report ?? null);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'This WAEC report could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#145C44] border-t-transparent" />
          <p className="mt-4 text-sm text-slate-500">Loading your WAEC analysis report…</p>
        </div>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xl font-bold text-slate-900">Report unavailable</p>
          <p className="mt-3 text-sm text-slate-500">{error || 'No analysis report was found for this payment.'}</p>
          <Link href="/public-waec-results" className="mt-6 inline-block text-sm font-semibold text-[#145C44] hover:underline">
            Try another WAEC analysis
          </Link>
        </div>
      </main>
    );
  }

  const overallPass = report.subjects.length
    ? Math.round((report.subjects.reduce((total, subject) => total + subject.percentagePass.total, 0) / report.subjects.length) * 10) / 10
    : 0;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link href="/public-waec-results" className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 hover:text-slate-600">← WAEC checkout</Link>
            <h1 className="mt-2 text-3xl font-black text-slate-900">{report.schoolName || 'WAEC'} {report.year} Analysis</h1>
            <p className="mt-1 text-sm text-slate-500">{report.examBody} • {report.totalCandidates} candidates</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Average pass rate</p>
            <p className="text-2xl font-black text-emerald-800">{overallPass}%</p>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Candidates" value={String(report.totalCandidates)} />
          <StatCard label="Failures" value={String(report.summaryOfPasses.failures || 0)} tone="amber" />
          <StatCard label="No result" value={String(report.summaryOfPasses.noResultCandidates || 0)} tone="slate" />
          <StatCard label="School no." value={report.schoolNumber || '—'} tone="green" />
        </section>

        {report.warnings?.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {report.warnings.map((warning, idx) => <p key={idx}>{warning}</p>)}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Subject summary</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Subject</th>
                  <th className="px-3 py-2 font-semibold">Registered</th>
                  <th className="px-3 py-2 font-semibold">Presented</th>
                  <th className="px-3 py-2 font-semibold">Pass%</th>
                  <th className="px-3 py-2 font-semibold">A1–C6</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.subjects.map((subject) => {
                  const gradeTotal = Object.values(subject.gradeDistribution).reduce((sum, item) => sum + (item?.boys || 0) + (item?.girls || 0), 0);
                  return (
                    <tr key={subject.name} className="align-top">
                      <td className="px-3 py-2 font-medium text-slate-700">{subject.name}</td>
                      <td className="px-3 py-2 text-slate-600">{subject.registered.total}</td>
                      <td className="px-3 py-2 text-slate-600">{subject.presented.total}</td>
                      <td className="px-3 py-2 text-slate-600">{subject.percentagePass.total}%</td>
                      <td className="px-3 py-2 text-slate-600">{gradeTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-slate-500">Summary of passes</h2>
            <div className="space-y-2 text-sm text-slate-600">
              {Object.entries(report.summaryOfPasses.buckets)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([count, value]) => (
                  <div key={count} className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span>{count} pass{Number(count) === 1 ? '' : 'es'}</span>
                    <strong className="text-slate-800">{value}</strong>
                  </div>
                ))}
              <div className="flex items-center justify-between pt-2">
                <span>Failures</span>
                <strong className="text-slate-800">{report.summaryOfPasses.failures}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>No result</span>
                <strong className="text-slate-800">{report.summaryOfPasses.noResultCandidates}</strong>
              </div>
            </div>
          </div>

          {report.officialSummary && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-slate-500">WAEC summary</h2>
              <div className="space-y-2 text-sm text-slate-600">
                {Object.entries(report.officialSummary)
                  .filter(([key]) => key !== 'buckets' && key !== 'totalCandidates')
                  .map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span>{key}</span>
                      <strong className="text-slate-800">{String(value ?? 0)}</strong>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'amber' | 'slate' | 'green' }) {
  const tones = {
    default: 'border-slate-200 bg-white text-slate-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    slate: 'border-slate-200 bg-slate-100 text-slate-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}
