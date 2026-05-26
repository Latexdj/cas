'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { AcademicYear, StudentResult } from '@/types/api';

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ScoreBadge({ value, max = 100 }: { value: number | null; max?: number }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const pct = (value / max) * 100;
  const color = pct >= 70 ? '#15803D' : pct >= 50 ? '#D97706' : '#DC2626';
  return <span style={{ color }} className="font-bold">{value}</span>;
}

function GradeBadge({ grade, remark }: { grade: string; remark: string }) {
  const isGood = ['A1', 'B2', 'B3', 'A', 'B+', 'B'].includes(grade);
  const isFail = ['F9', 'F', 'E8', 'E'].includes(grade);
  const bg    = isGood ? '#DCFCE7' : isFail ? '#FEE2E2' : '#FEF3C7';
  const color = isGood ? '#15803D' : isFail ? '#DC2626' : '#D97706';
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold" style={{ background: bg, color }}>
      {grade}
      {remark && remark !== '-' && <span className="font-normal opacity-75">· {remark}</span>}
    </span>
  );
}

// ── CSV column names (case-insensitive) accepted from the Google Sheet ──
const COL_MAP: Record<string, string> = {
  'student id':        'student_code',
  'student_id':        'student_code',
  'student_code':      'student_code',
  'academic year':     'academic_year_name',
  'academic_year':     'academic_year_name',
  'academic year name':'academic_year_name',
  'semester':          'semester',
  'subject':           'subject',
  'class score':       'class_score',
  'class_score':       'class_score',
  'exam score':        'exam_score',
  'exam_score':        'exam_score',
  'total score':       'total_score',
  'total_score':       'total_score',
  'grade':             'grade',
  'remarks':           'remarks',
  'remark':            'remarks',
  'category':          '_ignore',
  'student name':      '_ignore',
  'student_name':      '_ignore',
  'timestamp':         '_ignore',
};

interface ImportRow {
  student_code: string;
  academic_year_name: string;
  semester: string;
  subject: string;
  class_score: string;
  exam_score: string;
  total_score: string;
  grade: string;
  remarks: string;
  [k: string]: string;
}

function parseCsv(text: string): ImportRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const colKeys  = headers.map(h => COL_MAP[h.toLowerCase()] ?? null);

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cells = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    const row: ImportRow = {
      student_code: '', academic_year_name: '', semester: '', subject: '',
      class_score: '', exam_score: '', total_score: '', grade: '', remarks: '',
    };
    headers.forEach((_, i) => {
      const key = colKeys[i];
      if (key && key !== '_ignore') row[key] = cells[i] ?? '';
    });
    return row;
  });
}

interface ImportResult {
  total: number; inserted: number; updated: number; skipped: number;
  errors: { row: number; student_code: string; error: string }[];
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText,   setCsvText]   = useState('');
  const [preview,   setPreview]   = useState<ImportRow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const [error,     setError]     = useState('');

  function handleText(text: string) {
    setCsvText(text);
    setPreview(parseCsv(text).slice(0, 10));
    setResult(null);
    setError('');
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => handleText(String(ev.target?.result ?? ''));
    reader.readAsText(file);
  }

  async function handleImport() {
    const rows = parseCsv(csvText);
    if (rows.length === 0) { setError('No valid rows parsed. Check your CSV format.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const { data } = await api.post<ImportResult>('/api/results/import', { rows });
      setResult(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Import failed. Please try again.');
    } finally { setLoading(false); }
  }

  const allRows = parseCsv(csvText);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex-1">
            <p className="font-bold text-slate-800">Import Historical Results</p>
            <p className="text-xs text-slate-500 mt-0.5">Upload a CSV exported from Google Sheets</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Expected columns note */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
            <p className="font-semibold mb-1">Expected CSV columns (Google Sheets export)</p>
            <p className="opacity-80">Timestamp · Student ID · Student Name · Academic Year · Semester · Subject · Category · Class Score · Exam Score · Total Score · Grade · Remarks</p>
          </div>

          {/* File upload */}
          {!result && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Upload CSV file</label>
              <div className="flex gap-3 items-center">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Choose file…
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
                <span className="text-xs text-slate-400">or paste CSV text below</span>
              </div>
            </div>
          )}

          {/* Paste area */}
          {!result && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                Paste CSV text
              </label>
              <textarea
                value={csvText}
                onChange={e => handleText(e.target.value)}
                rows={6}
                placeholder={"Timestamp,Student ID,Student Name,Academic Year,Semester,Subject,...\n6/10/2025,SASHTS001424,DUMA RICHARD,2024_2025,1,Math,..."}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
          )}

          {/* Preview */}
          {!result && preview.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Preview — {allRows.length} rows total{allRows.length > 10 ? ' (showing first 10)' : ''}
              </p>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-3 py-2 text-left">Student ID</th>
                      <th className="px-3 py-2 text-left">Year</th>
                      <th className="px-3 py-2 text-center">Sem</th>
                      <th className="px-3 py-2 text-left">Subject</th>
                      <th className="px-3 py-2 text-center">CA</th>
                      <th className="px-3 py-2 text-center">Exam</th>
                      <th className="px-3 py-2 text-center">Total</th>
                      <th className="px-3 py-2 text-center">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-mono">{r.student_code}</td>
                        <td className="px-3 py-1.5">{r.academic_year_name}</td>
                        <td className="px-3 py-1.5 text-center">{r.semester}</td>
                        <td className="px-3 py-1.5 max-w-[180px] truncate">{r.subject}</td>
                        <td className="px-3 py-1.5 text-center">{r.class_score}</td>
                        <td className="px-3 py-1.5 text-center">{r.exam_score}</td>
                        <td className="px-3 py-1.5 text-center font-bold">{r.total_score}</td>
                        <td className="px-3 py-1.5 text-center">{r.grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

          {/* Result summary */}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total rows',  value: result.total,    color: 'text-slate-800' },
                  { label: 'Inserted',    value: result.inserted, color: 'text-green-700' },
                  { label: 'Updated',     value: result.updated,  color: 'text-blue-700'  },
                  { label: 'Skipped',     value: result.skipped,  color: 'text-amber-700' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                    <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {result.errors.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Errors ({result.errors.length}{result.errors.length === 100 ? '+' : ''})
                  </p>
                  <div className="border border-red-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-red-700 font-semibold">Row</th>
                          <th className="px-3 py-2 text-left text-red-700 font-semibold">Student ID</th>
                          <th className="px-3 py-2 text-left text-red-700 font-semibold">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {result.errors.map((e, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 text-slate-600">{e.row}</td>
                            <td className="px-3 py-1.5 font-mono text-slate-700">{e.student_code}</td>
                            <td className="px-3 py-1.5 text-red-700">{e.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {result.skipped === 0 && result.errors.length === 0 && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center font-semibold">
                  All rows imported successfully!
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          {result ? (
            <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={loading || allRows.length === 0}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                {loading ? 'Importing…' : `Import ${allRows.length} rows`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const [years,      setYears]      = useState<AcademicYear[]>([]);
  const [classes,    setClasses]    = useState<string[]>([]);
  const [yearId,     setYearId]     = useState('');
  const [semester,   setSemester]   = useState('1');
  const [className,  setClassName]  = useState('');
  const [results,    setResults]    = useState<StudentResult[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error,      setError]      = useState('');
  const [selected,   setSelected]   = useState<StudentResult | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<AcademicYear[]>('/api/academic-years'),
      api.get<string[]>('/api/students/classes'),
    ]).then(([yRes, cRes]) => {
      setYears(yRes.data);
      const current = yRes.data.find(y => y.is_current);
      if (current) {
        setYearId(current.id);
        setSemester(String(current.current_semester ?? 1));
      } else if (yRes.data[0]) {
        setYearId(yRes.data[0].id);
      }
      setClasses(cRes.data);
    }).catch(() => setError('Failed to load filters.')).finally(() => setLoadingMeta(false));
  }, []);

  const load = useCallback(async () => {
    if (!yearId || !semester || !className) return;
    setLoading(true); setError(''); setSelected(null);
    try {
      const { data } = await api.get<StudentResult[]>('/api/results', {
        params: { academic_year_id: yearId, semester, class_name: className },
      });
      setResults(data);
    } catch {
      setError('Failed to load results.');
    } finally { setLoading(false); }
  }, [yearId, semester, className]);

  useEffect(() => { load(); }, [load]);

  const yearName = years.find(y => y.id === yearId)?.name ?? '';
  const caLabel  = results[0] ? `CA (${results[0].ca_percentage}%)` : 'CA';
  const exLabel  = results[0] ? `Exam (${results[0].exam_percentage}%)` : 'Exam';

  const selectStyle = 'border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Academic Year</label>
          <select value={yearId} onChange={e => setYearId(e.target.value)} className={selectStyle} disabled={loadingMeta}>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Semester</label>
          <select value={semester} onChange={e => setSemester(e.target.value)} className={selectStyle}>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</label>
          <select value={className} onChange={e => setClassName(e.target.value)} className={selectStyle} disabled={loadingMeta}>
            <option value="">— Select class —</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-white hover:bg-slate-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 8l-4-4-4 4M12 4v12" />
            </svg>
            Import Historical
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

      {!className ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10 text-slate-300 mx-auto mb-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-slate-500 text-sm">Select a class to view results</p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
        </div>
      ) : results.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500 text-sm">No results found for {className} — {yearName} Semester {semester}.</p>
          <p className="text-slate-400 text-xs mt-1">Make sure assessments and exam scores have been entered.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Table header */}
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">{className}</p>
              <p className="text-xs text-slate-500">{yearName} · Semester {semester} · {results.length} students</p>
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 print:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Pos</th>
                  <th className="px-4 py-3 text-left">Student</th>
                  <th className="px-4 py-3 text-center">Subjects</th>
                  <th className="px-4 py-3 text-center">Average</th>
                  <th className="px-4 py-3 text-center">Grade</th>
                  <th className="px-4 py-3 text-left print:hidden"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results
                  .slice()
                  .sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999))
                  .map(r => (
                  <tr key={r.student_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-700">
                      {r.class_position ? ordinal(r.class_position) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{r.name}</p>
                      <p className="text-xs text-slate-400">{r.student_code}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{r.subjects.length}</td>
                    <td className="px-4 py-3 text-center">
                      <ScoreBadge value={r.average} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <GradeBadge grade={r.overall_grade} remark="" />
                    </td>
                    <td className="px-4 py-3 print:hidden">
                      <button
                        onClick={() => setSelected(r)}
                        className="text-xs font-semibold text-green-700 hover:text-green-900 transition-colors"
                      >
                        View Report Card →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report card panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40 print:static print:bg-transparent print:inset-auto" onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto print:shadow-none print:max-w-none print:h-auto">
            {/* Report card header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center gap-3 print:static print:border-b-2 print:border-slate-800">
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 print:hidden">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <div className="flex-1">
                <p className="font-bold text-slate-800 text-base">{selected.name}</p>
                <p className="text-xs text-slate-500">{selected.student_code} · {className} · {yearName} · Semester {semester}</p>
              </div>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 print:hidden"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print
              </button>
            </div>

            {/* Summary row */}
            <div className="px-6 py-4 grid grid-cols-3 gap-4 border-b border-slate-100">
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Average</p>
                <p className="text-2xl font-bold" style={{ color: '#15803D' }}>{selected.average ?? '—'}</p>
              </div>
              <div className="text-center border-x border-slate-100">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Class Position</p>
                <p className="text-2xl font-bold text-slate-800">
                  {selected.class_position ? ordinal(selected.class_position) : '—'}
                  {selected.class_total ? <span className="text-sm font-normal text-slate-400"> / {selected.class_total}</span> : null}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Overall Grade</p>
                <div className="flex justify-center mt-1">
                  <GradeBadge grade={selected.overall_grade} remark="" />
                </div>
              </div>
            </div>

            {/* Subject table */}
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Subject Breakdown</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-3 py-2.5 text-left">Subject</th>
                      <th className="px-3 py-2.5 text-center">{caLabel}</th>
                      <th className="px-3 py-2.5 text-center">{exLabel}</th>
                      <th className="px-3 py-2.5 text-center">Total</th>
                      <th className="px-3 py-2.5 text-center">Grade</th>
                      <th className="px-3 py-2.5 text-center">Position</th>
                      <th className="px-3 py-2.5 text-left">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selected.subjects.map(s => (
                      <tr key={s.subject} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-medium text-slate-800">
                          {s.subject}
                          {s.is_imported && (
                            <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 align-middle">IMPORTED</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center"><ScoreBadge value={s.ca_score} /></td>
                        <td className="px-3 py-2.5 text-center"><ScoreBadge value={s.exam_score} /></td>
                        <td className="px-3 py-2.5 text-center"><ScoreBadge value={s.total} /></td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="font-bold text-slate-700">{s.grade}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-500 text-xs">
                          {s.subject_position ? `${ordinal(s.subject_position)} / ${s.class_size}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs">{s.remark && s.remark !== '-' ? s.remark : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
