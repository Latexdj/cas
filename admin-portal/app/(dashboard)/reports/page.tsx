'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

// ── Report catalogue ──────────────────────────────────────────────────────────

type Scope = 'students' | 'teachers';

interface ReportDef {
  key:   string;
  label: string;
  scope: Scope;
}

const STUDENT_REPORTS: ReportDef[] = [
  { key: 'program_distribution',   label: 'Program Distribution',                       scope: 'students' },
  { key: 'program_residential',    label: 'Program Distribution by Residential Status', scope: 'students' },
  { key: 'class_distribution',     label: 'Class Distribution',                         scope: 'students' },
  { key: 'house_distribution',     label: 'House Distribution',                         scope: 'students' },
  { key: 'religion_distribution',      label: 'Religion Distribution',                      scope: 'students' },
  { key: 'denomination_distribution',  label: 'Religious Denomination Distribution',         scope: 'students' },
  { key: 'age_distribution',           label: 'Age Distribution',                           scope: 'students' },
  { key: 'aggregate_distribution', label: 'Aggregate Range Distribution',               scope: 'students' },
];

const TEACHER_REPORTS: ReportDef[] = [
  { key: 'gender_summary',             label: 'Gender Summary',              scope: 'teachers' },
  { key: 'department_distribution',    label: 'Department Distribution',     scope: 'teachers' },
  { key: 'rank_distribution',          label: 'GES Rank Distribution',       scope: 'teachers' },
  { key: 'qualification_distribution', label: 'Qualification Distribution',  scope: 'teachers' },
  { key: 'association_distribution',   label: 'Association Distribution',    scope: 'teachers' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportData {
  label:   string;
  columns: string[];
  keys:    string[];
  rows:    Record<string, string | number>[];
  totals:  Record<string, string | number>;
}

// ── Report table ──────────────────────────────────────────────────────────────

function ReportTable({ data }: { data: ReportData }) {
  const { label, columns, keys, rows, totals } = data;
  const isFirst = (i: number) => i === 0;

  return (
    <div className="print-table overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-sm">
        {/* title bar – shown in print, hidden on screen (screen has its own heading) */}
        <caption className="hidden print:table-caption text-left font-bold text-base py-2 px-4 bg-[#0F4C35] text-white">
          {label}
        </caption>
        <thead>
          <tr style={{ backgroundColor: '#0F4C35' }}>
            {columns.map((col, ci) => (
              <th
                key={ci}
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                style={{ color: '#D1FAE5', textAlign: isFirst(ci) ? 'left' : 'center' }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-400">
                No data found for the selected filters.
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              <tr
                key={ri}
                className="hover:bg-green-50 transition-colors"
                style={{ backgroundColor: ri % 2 === 0 ? '#FFFFFF' : '#F2F8F5', borderBottom: '1px solid #F1F5F9' }}
              >
                {keys.map((key, ci) => (
                  <td
                    key={ci}
                    className="px-4 py-2.5 text-sm"
                    style={{ color: isFirst(ci) ? '#0F172A' : '#475569', textAlign: isFirst(ci) ? 'left' : 'center', fontWeight: isFirst(ci) ? 500 : 400 }}
                  >
                    {row[key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ backgroundColor: '#0F4C35' }}>
              {keys.map((key, ci) => (
                <td
                  key={ci}
                  className="px-4 py-2.5 text-sm font-bold"
                  style={{ color: '#D1FAE5', textAlign: isFirst(ci) ? 'left' : 'center' }}
                >
                  {totals[key] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [selected, setSelected] = useState<ReportDef>(STUDENT_REPORTS[0]);
  const [status,   setStatus]   = useState<'active' | 'all'>('active');
  const [data,     setData]     = useState<ReportData | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: res } = await api.get<ReportData>(
        `/api/reports/${selected.scope}?type=${selected.key}&status=${status}`
      );
      setData(res);
    } catch {
      setError('Failed to load report. Please try again.');
    } finally {
      setLoading(false); }
  }, [selected, status]);

  useEffect(() => { load(); }, [load]);

  function handleExcel() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('cas_token') : null;
    const base  = process.env.NEXT_PUBLIC_API_URL ?? '';
    const url   = `${base}/api/reports/${selected.scope}/excel?type=${selected.key}&status=${status}`;
    const a     = document.createElement('a');
    a.href      = url;
    // Attach auth header via a fetch-and-blob approach
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        a.href       = objUrl;
        a.download   = `${selected.label}.xlsx`;
        a.click();
        URL.revokeObjectURL(objUrl);
      });
  }

  function handlePrint() {
    window.print();
  }

  const allReports = [...STUDENT_REPORTS, ...TEACHER_REPORTS];

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: fixed; top: 0; left: 0; width: 100%; padding: 24px; }
          .print-table thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-table tfoot tr  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-table tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="flex h-full min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>

        {/* Left panel – report list */}
        <aside className="w-56 flex-shrink-0 border-r border-slate-200 bg-white py-6 px-3 overflow-y-auto print:hidden">
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Student Reports</p>
          {STUDENT_REPORTS.map(r => (
            <button
              key={r.key}
              onClick={() => setSelected(r)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors font-medium"
              style={{
                backgroundColor: selected.key === r.key ? 'rgba(21,128,61,0.1)' : 'transparent',
                color:           selected.key === r.key ? '#15803D' : '#475569',
              }}
            >
              {r.label}
            </button>
          ))}

          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-5 mb-2">Teacher Reports</p>
          {TEACHER_REPORTS.map(r => (
            <button
              key={r.key}
              onClick={() => setSelected(r)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors font-medium"
              style={{
                backgroundColor: selected.key === r.key ? 'rgba(21,128,61,0.1)' : 'transparent',
                color:           selected.key === r.key ? '#15803D' : '#475569',
              }}
            >
              {r.label}
            </button>
          ))}
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Top bar */}
          <div className="border-b border-slate-200 bg-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{selected.label}</h1>
              <p className="text-xs text-slate-400 mt-0.5 capitalize">{selected.scope}</p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Status toggle */}
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-sm">
                {(['active', 'all'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className="px-4 py-1.5 font-semibold transition-colors"
                    style={{
                      backgroundColor: status === s ? '#15803D' : '#FFFFFF',
                      color:           status === s ? '#FFFFFF' : '#64748B',
                    }}
                  >
                    {s === 'active' ? 'Active only' : 'All statuses'}
                  </button>
                ))}
              </div>

              {/* Export Excel */}
              <button
                onClick={handleExcel}
                disabled={loading || !data}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-colors"
                style={{ backgroundColor: '#15803D' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 8l-3-3m3 3l3-3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
                Excel
              </button>

              {/* Print / PDF */}
              <button
                onClick={handlePrint}
                disabled={loading || !data}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors border border-slate-200 text-slate-700 bg-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.38-4.171l.36 4.171m0 0a48.111 48.111 0 01-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Print / PDF
              </button>
            </div>
          </div>

          {/* Report area */}
          <div className="flex-1 overflow-auto p-6">
            <div className="print-area" ref={printRef}>
              {/* Print heading (visible only when printing) */}
              <div className="hidden print:block mb-4">
                <p className="text-xs text-slate-500">{selected.scope === 'students' ? 'Student Report' : 'Staff Report'} · {status === 'active' ? 'Active only' : 'All statuses'}</p>
              </div>

              {loading ? (
                <div className="flex justify-center items-center py-20 print:hidden">
                  <div className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                </div>
              ) : error ? (
                <div className="text-center py-20 print:hidden">
                  <p className="text-red-600 text-sm">{error}</p>
                  <button onClick={load} className="mt-3 text-sm text-slate-500 underline">Retry</button>
                </div>
              ) : data ? (
                <ReportTable data={data} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
