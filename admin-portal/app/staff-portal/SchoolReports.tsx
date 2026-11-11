'use client';
import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';

type Scope = 'students' | 'teachers';

// Same catalogue as the principal portal's Records > Reports page.
const STUDENT_TYPES = [
  { value: 'program_distribution',      label: 'Program Distribution' },
  { value: 'program_residential',       label: 'Program by Residential Status' },
  { value: 'class_distribution',        label: 'Class Distribution' },
  { value: 'level_residential',         label: 'Level Distribution by Gender and Residential Status' },
  { value: 'house_distribution',        label: 'House Distribution' },
  { value: 'religion_distribution',     label: 'Religion Distribution' },
  { value: 'denomination_distribution', label: 'Religious Denomination Distribution' },
  { value: 'age_distribution',          label: 'Age Distribution' },
  { value: 'aggregate_distribution',    label: 'Aggregate Range Distribution' },
];
const TEACHER_TYPES = [
  { value: 'gender_summary',             label: 'Gender Summary' },
  { value: 'department_distribution',    label: 'Department Distribution' },
  { value: 'rank_distribution',          label: 'GES Rank Distribution' },
  { value: 'qualification_distribution', label: 'Qualification Distribution' },
  { value: 'association_distribution',   label: 'Association Distribution' },
];

interface ReportData {
  label: string; columns: string[]; keys: string[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, string | number | null>;
}

const selectCls = 'border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';

export function SchoolReports({ api, primary }: { api: AxiosInstance; primary: string }) {
  const [scope,  setScope]  = useState<Scope>('students');
  const [type,   setType]   = useState(STUDENT_TYPES[0].value);
  const [status, setStatus] = useState<'active' | 'all'>('active');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [downloading, setDownloading] = useState(false);

  const types = scope === 'students' ? STUDENT_TYPES : TEACHER_TYPES;

  function changeScope(s: Scope) {
    setScope(s);
    setType((s === 'students' ? STUDENT_TYPES : TEACHER_TYPES)[0].value);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    api.get<ReportData>(`/api/reports/${scope}`, { params: { type, status } })
      .then(r => { if (alive) setReport(r.data); })
      .catch(() => { if (alive) { setReport(null); setError('Could not load this report. Check your connection and try again.'); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, scope, type, status]);

  async function downloadExcel() {
    setDownloading(true); setError('');
    try {
      const r = await api.get(`/api/reports/${scope}/excel`, { params: { type, status }, responseType: 'blob', timeout: 60000 });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(report?.label ?? 'Report').replace(/[^a-z0-9]+/gi, '_')}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download the Excel file. Check your connection and try again.');
    } finally { setDownloading(false); }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">School Reports</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Read-only student and staff figures, the same reports the principal sees under Records.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {(['students', 'teachers'] as const).map(s => (
            <button key={s} type="button" onClick={() => changeScope(s)}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${scope === s ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}
              style={scope === s ? { background: primary } : {}}>
              {s === 'students' ? 'Students' : 'Teachers'}
            </button>
          ))}
        </div>
        <select className={selectCls} value={type} onChange={e => setType(e.target.value)}>
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className={selectCls} value={status} onChange={e => setStatus(e.target.value as 'active' | 'all')}>
          <option value="active">Active only</option>
          <option value="all">All statuses</option>
        </select>
        <button type="button" onClick={downloadExcel} disabled={downloading || !report}
          className="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40">
          {downloading ? 'Downloading…' : 'Download Excel'}
        </button>
      </div>

      {error && <p className="text-sm text-[#B83232]">{error}</p>}

      {loading ? (
        <div className="py-10 flex">
          <div className="w-6 h-6 rounded-full border-2 border-b-transparent animate-spin" style={{ borderColor: primary, borderBottomColor: 'transparent' }} />
        </div>
      ) : report && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-sm font-bold text-slate-800 dark:text-white">{report.label}</p>
            <p className="text-xs text-slate-400">
              {report.rows.length} group{report.rows.length === 1 ? '' : 's'}, {status === 'all' ? 'all statuses' : 'active only'}
            </p>
          </div>
          {report.rows.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
              No records to report for this selection. Try All statuses, or check that the records have this information filled in.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                    {report.columns.map(c => (
                      <th key={c} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {report.rows.map((row, i) => (
                    <tr key={i}>
                      {report.keys.map((k, ki) => (
                        <td key={k} className={`px-4 py-2 whitespace-nowrap ${ki === 0 ? 'font-medium text-slate-800 dark:text-white' : 'tabular-nums text-slate-600 dark:text-slate-300'}`}>
                          {row[k] ?? '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40">
                    {report.keys.map((k, ki) => (
                      <td key={k} className={`px-4 py-2.5 font-bold whitespace-nowrap ${ki === 0 ? 'text-slate-800 dark:text-white' : 'tabular-nums text-slate-800 dark:text-white'}`}>
                        {report.totals[k] ?? '-'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
