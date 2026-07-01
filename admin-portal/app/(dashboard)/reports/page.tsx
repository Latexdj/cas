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

interface AcademicReportDef {
  key:        string;
  label:      string;
  needsClass: boolean;
}

const STUDENT_REPORTS: ReportDef[] = [
  { key: 'program_distribution',      label: 'Program Distribution',                       scope: 'students' },
  { key: 'program_residential',       label: 'Program Distribution by Residential Status', scope: 'students' },
  { key: 'class_distribution',        label: 'Class Distribution',                         scope: 'students' },
  { key: 'house_distribution',        label: 'House Distribution',                         scope: 'students' },
  { key: 'religion_distribution',     label: 'Religion Distribution',                      scope: 'students' },
  { key: 'denomination_distribution', label: 'Religious Denomination Distribution',        scope: 'students' },
  { key: 'age_distribution',          label: 'Age Distribution',                           scope: 'students' },
  { key: 'aggregate_distribution',    label: 'Aggregate Range Distribution',               scope: 'students' },
];

const TEACHER_REPORTS: ReportDef[] = [
  { key: 'gender_summary',             label: 'Gender Summary',             scope: 'teachers' },
  { key: 'department_distribution',    label: 'Department Distribution',    scope: 'teachers' },
  { key: 'rank_distribution',          label: 'GES Rank Distribution',      scope: 'teachers' },
  { key: 'qualification_distribution', label: 'Qualification Distribution', scope: 'teachers' },
  { key: 'association_distribution',   label: 'Association Distribution',   scope: 'teachers' },
];

const ACADEMIC_REPORTS: AcademicReportDef[] = [
  { key: 'class_performance',  label: 'Class Performance Summary',     needsClass: false },
  { key: 'subject_pass_rate',  label: 'Subject Pass Rate',             needsClass: false },
  { key: 'teacher_completion', label: 'Assessment Submission Tracker', needsClass: false },
  { key: 'at_risk_students',   label: 'At-Risk Students',              needsClass: false },
  { key: 'grade_distribution', label: 'Grade Distribution',            needsClass: true  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportData {
  label:   string;
  columns: string[];
  keys:    string[];
  rows:    Record<string, string | number>[];
  totals:  Record<string, string | number>;
}

interface AcademicYear {
  id:               string;
  name:             string;
  is_current:       boolean;
  current_semester: number;
}

// ── Report table ──────────────────────────────────────────────────────────────

function ReportTable({ data }: { data: ReportData }) {
  const { label, columns, keys, rows, totals } = data;
  const isFirst = (i: number) => i === 0;

  return (
    <div className="print-table overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-sm">
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

// ── Sidebar content (shared between desktop panel & mobile drawer) ─────────────

function SidebarContent({
  reportMode, selected, academicType,
  onSelectStudent, onSelectTeacher, onSelectAcademic,
}: {
  reportMode:    'students' | 'teachers' | 'academic';
  selected:      ReportDef;
  academicType:  AcademicReportDef;
  onSelectStudent:  (r: ReportDef)         => void;
  onSelectTeacher:  (r: ReportDef)         => void;
  onSelectAcademic: (r: AcademicReportDef) => void;
}) {
  return (
    <nav className="py-5 px-3">
      <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Student Reports</p>
      {STUDENT_REPORTS.map(r => (
        <button
          key={r.key}
          onClick={() => onSelectStudent(r)}
          className="w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors font-medium"
          style={{
            backgroundColor: reportMode !== 'academic' && selected.key === r.key && selected.scope === 'students' ? 'rgba(21,128,61,0.1)' : 'transparent',
            color:           reportMode !== 'academic' && selected.key === r.key && selected.scope === 'students' ? '#15803D' : '#475569',
          }}
        >
          {r.label}
        </button>
      ))}

      <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-5 mb-2">Teacher Reports</p>
      {TEACHER_REPORTS.map(r => (
        <button
          key={r.key}
          onClick={() => onSelectTeacher(r)}
          className="w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors font-medium"
          style={{
            backgroundColor: reportMode !== 'academic' && selected.key === r.key && selected.scope === 'teachers' ? 'rgba(21,128,61,0.1)' : 'transparent',
            color:           reportMode !== 'academic' && selected.key === r.key && selected.scope === 'teachers' ? '#15803D' : '#475569',
          }}
        >
          {r.label}
        </button>
      ))}

      <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-5 mb-2">Academic Reports</p>
      {ACADEMIC_REPORTS.map(r => (
        <button
          key={r.key}
          onClick={() => onSelectAcademic(r)}
          className="w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors font-medium"
          style={{
            backgroundColor: reportMode === 'academic' && academicType.key === r.key ? 'rgba(21,128,61,0.1)' : 'transparent',
            color:           reportMode === 'academic' && academicType.key === r.key ? '#15803D' : '#475569',
          }}
        >
          {r.label}
        </button>
      ))}
    </nav>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [reportMode,    setReportMode]    = useState<'students' | 'teachers' | 'academic'>('students');
  const [selected,      setSelected]      = useState<ReportDef>(STUDENT_REPORTS[0]);
  const [academicType,  setAcademicType]  = useState<AcademicReportDef>(ACADEMIC_REPORTS[0]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [acadYearId,    setAcadYearId]    = useState('');
  const [acadSem,       setAcadSem]       = useState<1 | 2>(1);
  const [acadClass,     setAcadClass]     = useState('');
  const [classInput,    setClassInput]    = useState('');
  const [status,        setStatus]        = useState<'active' | 'all'>('active');
  const [data,          setData]          = useState<ReportData | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<AcademicYear[]>('/api/academic-years')
      .then(r => {
        setAcademicYears(r.data);
        const cur = r.data.find(y => y.is_current);
        if (cur) { setAcadYearId(cur.id); setAcadSem(cur.current_semester as 1 | 2); }
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (reportMode === 'academic') {
      if (!acadYearId) return;
      if (academicType.needsClass && !acadClass) {
        setData(null); setError(''); setLoading(false);
        return;
      }
    }
    setLoading(true); setError('');
    try {
      if (reportMode === 'academic') {
        const params = new URLSearchParams({
          type:             academicType.key,
          academic_year_id: acadYearId,
          semester:         String(acadSem),
          status,
        });
        if (academicType.needsClass && acadClass) params.set('class_name', acadClass);
        const { data: res } = await api.get<ReportData>(`/api/reports/academic?${params}`);
        setData(res);
      } else {
        const { data: res } = await api.get<ReportData>(
          `/api/reports/${selected.scope}?type=${selected.key}&status=${status}`
        );
        setData(res);
      }
    } catch {
      setError('Failed to load report. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [reportMode, selected, status, academicType, acadYearId, acadSem, acadClass]);

  useEffect(() => { load(); }, [load]);

  function handleExcel() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('cas_token') : null;
    const base  = process.env.NEXT_PUBLIC_API_URL ?? '';
    let url: string;
    if (reportMode === 'academic') {
      const params = new URLSearchParams({ type: academicType.key, academic_year_id: acadYearId, semester: String(acadSem), status });
      if (academicType.needsClass && acadClass) params.set('class_name', acadClass);
      url = `${base}/api/reports/academic/excel?${params}`;
    } else {
      url = `${base}/api/reports/${selected.scope}/excel?type=${selected.key}&status=${status}`;
    }
    const label = reportMode === 'academic' ? academicType.label : selected.label;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl; a.download = `${label}.xlsx`; a.click();
        URL.revokeObjectURL(objUrl);
      });
  }

  function handleSelectStudent(r: ReportDef) {
    setReportMode('students'); setSelected(r); setSidebarOpen(false);
  }
  function handleSelectTeacher(r: ReportDef) {
    setReportMode('teachers'); setSelected(r); setSidebarOpen(false);
  }
  function handleSelectAcademic(r: AcademicReportDef) {
    setReportMode('academic'); setAcademicType(r); setAcadClass(''); setClassInput(''); setSidebarOpen(false);
  }

  const currentLabel = reportMode === 'academic' ? academicType.label : selected.label;
  const currentScope = reportMode === 'academic' ? 'Academic' : (selected.scope === 'students' ? 'Students' : 'Teachers');

  return (
    <>
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

        {/* ── Mobile drawer backdrop ── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 overflow-y-auto transform transition-transform duration-200 print:hidden
            lg:relative lg:translate-x-0 lg:w-56 lg:flex-shrink-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          {/* Mobile close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 lg:hidden">
            <span className="text-sm font-bold text-slate-700">Select Report</span>
            <button onClick={() => setSidebarOpen(false)} className="p-1 rounded text-slate-400 hover:text-slate-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <SidebarContent
            reportMode={reportMode}
            selected={selected}
            academicType={academicType}
            onSelectStudent={handleSelectStudent}
            onSelectTeacher={handleSelectTeacher}
            onSelectAcademic={handleSelectAcademic}
          />
        </aside>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Top bar */}
          <div className="border-b border-slate-200 bg-white px-4 py-3 print:hidden">

            {/* Row 1: hamburger + title */}
            <div className="flex items-center gap-3 mb-2 lg:mb-0">
              {/* Mobile menu button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex-shrink-0 p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 lg:hidden"
                aria-label="Open report list"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <div className="min-w-0 flex-1">
                <h1 className="text-base font-bold text-slate-900 truncate lg:text-lg">{currentLabel}</h1>
                <p className="text-xs text-slate-400 capitalize">{currentScope}</p>
              </div>

              {/* Export buttons — icon-only on small screens, labelled on large */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleExcel}
                  disabled={loading || !data}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-colors"
                  style={{ backgroundColor: '#15803D' }}
                  title="Export to Excel"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 8l-3-3m3 3l3-3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                  </svg>
                  <span className="hidden sm:inline">Excel</span>
                </button>
                <button
                  onClick={() => window.print()}
                  disabled={loading || !data}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors border border-slate-200 text-slate-700 bg-white"
                  title="Print / Save as PDF"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span className="hidden sm:inline">Print</span>
                </button>
              </div>
            </div>

            {/* Row 2: filters (academic) + status toggle */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {reportMode === 'academic' && (
                <>
                  <select
                    value={acadYearId}
                    onChange={e => setAcadYearId(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700 flex-1 min-w-[120px]"
                  >
                    <option value="">Select year…</option>
                    {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                  </select>
                  <select
                    value={acadSem}
                    onChange={e => setAcadSem(Number(e.target.value) as 1 | 2)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700"
                  >
                    <option value={1}>Semester 1</option>
                    <option value={2}>Semester 2</option>
                  </select>
                  {academicType.needsClass && (
                    <input
                      value={classInput}
                      onChange={e => setClassInput(e.target.value)}
                      onBlur={e => setAcadClass(e.target.value.trim())}
                      onKeyDown={e => { if (e.key === 'Enter') setAcadClass(classInput.trim()); }}
                      placeholder="Class name…"
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700 w-32"
                    />
                  )}
                </>
              )}

              {/* Status toggle */}
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-sm ml-auto">
                {(['active', 'all'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className="px-3 py-1.5 font-semibold transition-colors whitespace-nowrap"
                    style={{ backgroundColor: status === s ? '#15803D' : '#FFFFFF', color: status === s ? '#FFFFFF' : '#64748B' }}
                  >
                    {s === 'active' ? 'Active' : 'All'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Report area */}
          <div className="flex-1 overflow-auto p-4 lg:p-6">
            <div className="print-area" ref={printRef}>
              <div className="hidden print:block mb-4">
                <p className="text-xs text-slate-500">{currentScope} Report · {status === 'active' ? 'Active only' : 'All statuses'}</p>
              </div>

              {loading ? (
                <div className="flex justify-center items-center py-20 print:hidden">
                  <div className="w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                </div>
              ) : error ? (
                <div className="text-center py-20 print:hidden">
                  <p className="text-red-600 text-sm">{error}</p>
                  <button onClick={load} className="mt-3 text-sm text-slate-500 underline">Retry</button>
                </div>
              ) : reportMode === 'academic' && academicType.needsClass && !acadClass ? (
                <div className="text-center py-20 print:hidden">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10 mx-auto text-slate-300 mb-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <p className="text-slate-500 text-sm">Enter a class name in the filter bar above,<br />then press Enter to load the report.</p>
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
