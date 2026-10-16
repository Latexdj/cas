'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Batch { id: string; year: number; candidate_count: number }
interface Candidate {
  indexNumber: string; name: string; gender: string;
  grades: Record<string, string>; bestSixAggregate: number; subjectsCounted: number;
}
interface Rankings {
  year: number; gradePoints: Record<string, number>; gradeRemarks: Record<string, string>;
  subjects: string[]; candidates: Candidate[];
}

type ExportRow = (string | number)[];

async function exportRankingsExcel(filename: string, headers: string[], rows: ExportRow[], summary: [string, string | number][]) {
  const XLSX = await import('xlsx');
  const aoa: ExportRow[] = [];
  if (summary.length) {
    aoa.push(['Summary']);
    summary.forEach(([label, value]) => aoa.push([label, value]));
    aoa.push([]);
  }
  aoa.push(headers, ...rows);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rankings');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

async function exportRankingsPdf(filename: string, title: string, subtitle: string, head: string[], body: ExportRow[], summaryLines: string[]) {
  const { default: jsPDF } = await import('jspdf');
  // jspdf-autotable v5 dropped the doc.autoTable() instance patch in favor
  // of a plain exported function called as autoTable(doc, options).
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(subtitle, 14, 23);
  let startY = 28;
  if (summaryLines.length) {
    doc.setFontSize(9);
    doc.setTextColor(60);
    summaryLines.forEach((line, i) => doc.text(line, 14, startY + i * 5));
    startY += summaryLines.length * 5 + 4;
  }
  autoTable(doc, {
    head: [head],
    body,
    startY,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [20, 92, 68], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  doc.save(`${filename}.pdf`);
}

export default function WaecRankingsPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [gender, setGender] = useState('');
  const [subject, setSubject] = useState('');
  const [data, setData] = useState<Rankings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);

  useEffect(() => {
    api.get<Batch[]>('/api/admin/exam-results/batches', { params: { exam_body: 'WAEC' } })
      .then(r => { setBatches(r.data); if (r.data.length) setYear(r.data[0].year); })
      .catch(() => setBatches([]));
  }, []);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get<Rankings>('/api/admin/exam-results/rankings', { params: { year: y } });
      setData(res);
    } catch {
      setError('Could not load rankings for this year.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (year !== null) load(year); }, [year, load]);

  // Gender filter always applies. When a subject is picked, candidates
  // without a scoreable grade in it drop out and ranking re-sorts by that
  // subject's grade (best first); otherwise ranking is by best-6 aggregate.
  const rows = useMemo(() => {
    if (!data) return [];
    let list = data.candidates.filter(c => !gender || c.gender === gender);
    if (subject) {
      list = list
        .filter(c => data.gradePoints[c.grades[subject]] != null)
        .sort((a, b) => data.gradePoints[a.grades[subject]] - data.gradePoints[b.grades[subject]] || a.bestSixAggregate - b.bestSixAggregate);
    } else {
      list = [...list].sort((a, b) => a.bestSixAggregate - b.bestSixAggregate);
    }
    return list;
  }, [data, gender, subject]);

  // Only meaningful once a single subject is picked — classifies each
  // candidate's grade using this school's own grade_boundaries remarks
  // (not the standard WAEC letters), so a school with custom boundaries
  // still gets an accurate pass/credit split.
  const subjectSummary = useMemo(() => {
    if (!data || !subject) return null;
    const remarks = data.gradeRemarks || {};
    const distribution: Record<string, number> = {};
    let passCount = 0, creditCount = 0;
    for (const c of rows) {
      const grade = c.grades[subject];
      distribution[grade] = (distribution[grade] || 0) + 1;
      const remark = (remarks[grade] || '').toUpperCase();
      if (remark !== 'FAIL') passCount++;
      if (remark === 'CREDIT') creditCount++;
    }
    const presented = rows.length;
    const pct = (n: number) => (presented > 0 ? Math.round((n / presented) * 1000) / 10 : 0);
    const failCount = presented - passCount;
    return {
      presented, passCount, passPct: pct(passCount), creditCount, creditPct: pct(creditCount),
      failCount, failPct: pct(failCount),
      distribution: Object.entries(distribution).sort(([a], [b]) => (data.gradePoints[a] ?? 99) - (data.gradePoints[b] ?? 99)),
    };
  }, [data, subject, rows]);

  function buildExportTable(): { headers: string[]; body: ExportRow[] } {
    const headers = ['#', 'Name', 'Index Number', 'Gender', ...(subject ? [subject] : []), 'Best-6 Aggregate'];
    const body: ExportRow[] = rows.map((c, i) => [
      i + 1, c.name, c.indexNumber, c.gender,
      ...(subject ? [c.grades[subject] ?? ''] : []),
      c.subjectsCounted < 6 ? `${c.bestSixAggregate} (${c.subjectsCounted} subj.)` : c.bestSixAggregate,
    ]);
    return { headers, body };
  }

  function buildSummaryPairs(): [string, string | number][] {
    if (!subjectSummary) return [];
    return [
      ['Subject', subject],
      ['Presented', subjectSummary.presented],
      ['Pass', `${subjectSummary.passCount} (${subjectSummary.passPct}%)`],
      ['Credit', `${subjectSummary.creditCount} (${subjectSummary.creditPct}%)`],
      ['Fail', `${subjectSummary.failCount} (${subjectSummary.failPct}%)`],
    ];
  }

  function buildSummaryLines(): string[] {
    return buildSummaryPairs().map(([label, value]) => `${label}: ${value}`);
  }

  async function handleExport(format: 'xlsx' | 'pdf') {
    if (!data) return;
    setExporting(format);
    try {
      const { headers, body } = buildExportTable();
      const filenameBase = `waec-rankings-${data.year}${subject ? `-${subject.replace(/\s+/g, '-')}` : ''}`;
      const subtitle = `${data.year} · ${subject || 'Best-6 aggregate (all subjects)'}${gender ? ` · ${gender}` : ''}`;
      if (format === 'xlsx') {
        await exportRankingsExcel(filenameBase, headers, body, buildSummaryPairs());
      } else {
        await exportRankingsPdf(filenameBase, 'WAEC Rankings', subtitle, headers, body, buildSummaryLines());
      }
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/waec-results" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; WAEC Results</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Rankings</h1>
          <p className="text-sm text-slate-400 mt-0.5">Best to worst performing students, by best-6 aggregate (or a single subject).</p>
        </div>
        {data && rows.length > 0 && (
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
        )}
      </div>

      {batches && batches.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center">
          <p className="text-sm text-slate-400">No results imported yet.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Year</label>
              <select value={year ?? ''} onChange={e => setYear(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                {batches?.map(b => <option key={b.id} value={b.year}>{b.year} ({b.candidate_count} candidates)</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Gender</label>
              <select value={gender} onChange={e => setGender(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">All</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Subject</label>
              <select value={subject} onChange={e => setSubject(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">Best-6 aggregate (all subjects)</option>
                {data?.subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {(gender || subject) && (
              <button onClick={() => { setGender(''); setSubject(''); }} className="text-xs font-semibold text-[#145C44] hover:underline">Clear filters</button>
            )}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

          {subjectSummary && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 mb-3">{subject} summary</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <SummaryStat label="Presented" value={String(subjectSummary.presented)} />
                <SummaryStat label="Pass" value={`${subjectSummary.passCount} (${subjectSummary.passPct}%)`} tone="success" />
                <SummaryStat label="Credit" value={`${subjectSummary.creditCount} (${subjectSummary.creditPct}%)`} tone="success" />
                <SummaryStat label="Fail" value={`${subjectSummary.failCount} (${subjectSummary.failPct}%)`} tone="danger" />
              </div>
              <div className="flex flex-wrap gap-2">
                {subjectSummary.distribution.map(([grade, count]) => (
                  <span key={grade} className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                    {grade}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center">
              <p className="text-sm text-slate-400">No candidates match this filter.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 font-semibold">
                  <tr>
                    <th className="text-left px-4 py-2.5">#</th>
                    <th className="text-left px-4 py-2.5">Name</th>
                    <th className="text-left px-4 py-2.5">Index Number</th>
                    <th className="text-left px-4 py-2.5">Gender</th>
                    {subject && <th className="text-left px-4 py-2.5">{subject}</th>}
                    <th className="text-left px-4 py-2.5">Best-6 Aggregate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c, i) => (
                    <tr key={c.indexNumber}>
                      <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{c.name}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{c.indexNumber}</td>
                      <td className="px-4 py-2.5 text-slate-500">{c.gender}</td>
                      {subject && <td className="px-4 py-2.5 font-semibold text-slate-800">{c.grades[subject]}</td>}
                      <td className="px-4 py-2.5 font-semibold text-[#145C44]">{c.bestSixAggregate}{c.subjectsCounted < 6 && <span className="text-slate-400 font-normal"> ({c.subjectsCounted} subj.)</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'danger' }) {
  const colors = {
    default: 'text-slate-800',
    success: 'text-[#145C44]',
    danger: 'text-red-600',
  }[tone];
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${colors}`}>{value}</p>
    </div>
  );
}
