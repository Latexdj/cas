'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number; }
interface SubjectResult { subject: string; ca_score: number | null; exam_score: number | null; total: number | null; grade: string; remark: string; subject_remark?: string | null; }
interface FormTeacherRemarks {
  attitude: string | null;
  conduct: string | null;
  general_remarks: string | null;
}
interface SemesterResult {
  student: { id: string; name: string; student_code: string; class_name: string; program_name: string | null; picture_url: string | null };
  subjects: SubjectResult[];
  average: number | null;
  overall_grade: string;
  class_position: number | null;
  class_total: number | null;
  remarks: { attitude: string | null; conduct: string | null; general_remarks: string | null; interest: string | null } | null;
  form_teacher_remarks?: FormTeacherRemarks | null;
}
interface HistoryPoint { label: string; academic_year: string; semester: number; average: number; grade: string; subject_count: number; }
interface SchoolProfile { name: string; address: string | null; logo_url: string | null; }

interface ClassStats {
  class_name: string;
  class_avg: number | null;
  subjects: Array<{ subject: string; class_avg: number | null; scored_count: number }>;
}

const GRADE_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#9333ea', E: '#64748b', F: '#dc2626',
};
function gradeColor(g: string) { return GRADE_COLORS[g?.[0]?.toUpperCase()] ?? '#64748b'; }
function scoreColor(t: number | null) {
  if (t === null) return 'text-slate-400';
  if (t >= 70) return 'text-green-700'; if (t >= 50) return 'text-amber-600'; return 'text-red-600';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── A4 Report Card ────────────────────────────────────────────────────────────

function ReportCard({ result, yearName, semester, schoolName, schoolAddress, schoolLogo }: {
  result: SemesterResult;
  yearName: string;
  semester: string;
  schoolName: string;
  schoolAddress: string;
  schoolLogo: string | null;
}) {
  const subjects = result.subjects.filter(s => s.total != null);
  const GREEN  = '#1a5c38';
  const LGREEN = '#f0faf5';

  const gradeCol = (g: string) =>
    ['A1','B2','B3','A','B+','B-'].includes(g) ? '#15803D' :
    ['F9','F','E8'].includes(g) ? '#DC2626' : '#D97706';

  const barColor = (t: number | null) =>
    t == null ? '#e5e7eb' : t >= 70 ? '#15803D' : t >= 50 ? '#D97706' : '#DC2626';

  const page: React.CSSProperties = {
    width: '210mm', minHeight: '297mm', padding: '12mm 13mm 10mm',
    boxSizing: 'border-box',
    fontFamily: "'Arial', 'Helvetica', sans-serif",
    fontSize: '9pt', color: '#1a1a1a',
    background: '#fff',
    display: 'flex', flexDirection: 'column', gap: '7px',
  };

  // Prefer form_teacher_remarks if present, fall back to remarks
  const teacherRemarks = result.form_teacher_remarks ?? result.remarks;

  return (
    <div style={page}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `3px solid ${GREEN}`, paddingBottom: '8px' }}>
        <div style={{ width: '60px', height: '60px', flexShrink: 0, border: `1px solid #e5e7eb`, borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
          {schoolLogo
            ? <img src={schoolLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '36px', height: '36px' }}>
                <rect width="48" height="48" rx="8" fill={GREEN} />
                <path d="M24 10L36 18V30L24 38L12 30V18L24 10Z" fill="white" fillOpacity=".9" />
                <path d="M24 14L32 20V28L24 34L16 28V20L24 14Z" fill={GREEN} />
                <circle cx="24" cy="24" r="4" fill="white" />
              </svg>
          }
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '15pt', fontWeight: 900, color: GREEN, letterSpacing: '0.5px', textTransform: 'uppercase', lineHeight: 1.2 }}>
            {schoolName || 'SCHOOL NAME'}
          </div>
          {schoolAddress && <div style={{ fontSize: '8pt', color: '#555', marginTop: '2px' }}>{schoolAddress}</div>}
          <div style={{ marginTop: '4px', fontSize: '10pt', fontWeight: 700, letterSpacing: '1.5px', color: '#333', textTransform: 'uppercase' }}>
            Student Academic Report Card
          </div>
          <div style={{ fontSize: '8.5pt', color: '#555', marginTop: '2px' }}>
            {yearName} &nbsp;·&nbsp; Semester {semester}
          </div>
        </div>
        <div style={{ width: '60px', height: '72px', flexShrink: 0, border: `2px solid ${GREEN}`, borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
          {result.student.picture_url
            ? <img src={result.student.picture_url} alt="student" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <svg viewBox="0 0 48 48" fill="none" style={{ width: '36px', height: '36px' }}>
                <circle cx="24" cy="18" r="10" fill="#9ca3af" />
                <ellipse cx="24" cy="42" rx="18" ry="10" fill="#9ca3af" />
              </svg>
          }
        </div>
      </div>

      {/* Student Info */}
      <div style={{ background: LGREEN, border: `1px solid #c6e8d8`, borderRadius: '5px', padding: '6px 10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr>
              <td style={{ width: '15%', fontWeight: 700, color: '#555', paddingBottom: '3px' }}>Full Name</td>
              <td style={{ width: '35%', fontWeight: 700, paddingBottom: '3px', borderBottom: `1px solid #b0d4c4` }}>{result.student.name}</td>
              <td style={{ width: '15%', fontWeight: 700, color: '#555', paddingLeft: '12px', paddingBottom: '3px' }}>Class</td>
              <td style={{ width: '35%', fontWeight: 700, paddingBottom: '3px', borderBottom: `1px solid #b0d4c4` }}>{result.student.class_name}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, color: '#555', paddingTop: '3px' }}>Student ID</td>
              <td style={{ paddingTop: '3px' }}>{result.student.student_code}</td>
              <td style={{ fontWeight: 700, color: '#555', paddingLeft: '12px', paddingTop: '3px' }}>Programme</td>
              <td style={{ paddingTop: '3px' }}>{result.student.program_name ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary Boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '5px' }}>
        {[
          { label: 'Class Average',  value: result.average != null ? String(result.average) : '—', big: true },
          { label: 'Class Position', value: result.class_position ? `${ordinal(result.class_position)} / ${result.class_total ?? '?'}` : '—' },
          { label: 'Overall Grade',  value: result.overall_grade },
          { label: 'Subjects Sat',   value: String(subjects.length) },
        ].map(({ label, value, big }) => (
          <div key={label} style={{ border: `1.5px solid ${GREEN}`, borderRadius: '5px', padding: '5px 4px', textAlign: 'center', background: '#fff' }}>
            <div style={{ fontSize: '7pt', color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
            <div style={{ fontSize: big ? '14pt' : '12pt', fontWeight: 900, color: GREEN, marginTop: '2px', lineHeight: 1.1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Subject Table */}
      <div>
        <div style={{ fontSize: '7.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: GREEN, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ height: '2px', width: '14px', background: GREEN }} />
          Subject Breakdown
          <div style={{ flex: 1, height: '1px', background: '#c6e8d8' }} />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <thead>
            <tr style={{ background: GREEN, color: '#fff' }}>
              {['Subject', 'CA Score', 'Exam Score', 'Total', 'Grade', 'Remarks'].map((h, i) => (
                <th key={h} style={{ padding: '4px 5px', textAlign: i === 0 ? 'left' : 'center', fontWeight: 700, fontSize: '7.5pt', letterSpacing: '0.3px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.subjects.map((s, i) => (
              <tr key={s.subject} style={{ background: i % 2 === 0 ? '#fff' : LGREEN, borderBottom: `1px solid #dde8e3` }}>
                <td style={{ padding: '3.5px 5px', fontWeight: 500 }}>{s.subject}</td>
                <td style={{ padding: '3.5px 5px', textAlign: 'center' }}>{s.ca_score ?? '—'}</td>
                <td style={{ padding: '3.5px 5px', textAlign: 'center' }}>{s.exam_score ?? '—'}</td>
                <td style={{ padding: '3.5px 5px', textAlign: 'center', fontWeight: 700, color: barColor(s.total) }}>{s.total ?? '—'}</td>
                <td style={{ padding: '3.5px 5px', textAlign: 'center', fontWeight: 700, color: gradeCol(s.grade) }}>{s.grade}</td>
                <td style={{ padding: '3.5px 5px', fontSize: '8pt', color: '#444' }}>{s.remark && s.remark !== '-' ? s.remark : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Performance Chart */}
      {subjects.length > 0 && (
        <div>
          <div style={{ fontSize: '7.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: GREEN, marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ height: '2px', width: '14px', background: GREEN }} />
            Performance Overview
            <div style={{ flex: 1, height: '1px', background: '#c6e8d8' }} />
            <span style={{ fontSize: '7pt', fontWeight: 400, color: '#888', textTransform: 'none' }}>
              <span style={{ color: '#15803D' }}>■</span> ≥70 &nbsp;
              <span style={{ color: '#D97706' }}>■</span> 50–69 &nbsp;
              <span style={{ color: '#DC2626' }}>■</span> &lt;50
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px' }}>
            {subjects.map(s => (
              <div key={s.subject} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '7.5pt' }}>
                <div style={{ width: '110px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#444', flexShrink: 0 }}>{s.subject}</div>
                <div style={{ flex: 1, background: '#f0f0f0', height: '10px', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(s.total ?? 0, 100)}%`, background: barColor(s.total), borderRadius: '2px' }} />
                </div>
                <div style={{ width: '28px', textAlign: 'right', fontWeight: 700, color: barColor(s.total), flexShrink: 0 }}>{s.total}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remarks */}
      <div style={{ background: LGREEN, border: `1px solid #c6e8d8`, borderRadius: '5px', padding: '6px 10px' }}>
        <div style={{ fontSize: '7.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: GREEN, marginBottom: '5px' }}>
          Form Teacher&apos;s Remarks
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr>
              <td style={{ width: '12%', fontWeight: 700, color: '#555', paddingBottom: '5px' }}>Attitude</td>
              <td style={{ width: '38%', paddingBottom: '5px', borderBottom: '1px solid #b0d4c4', fontWeight: 600 }}>
                {teacherRemarks?.attitude || <span style={{ color: '#bbb' }}>—</span>}
              </td>
              <td style={{ width: '12%', fontWeight: 700, color: '#555', paddingLeft: '12px', paddingBottom: '5px' }}>Conduct</td>
              <td style={{ width: '38%', paddingBottom: '5px', borderBottom: '1px solid #b0d4c4', fontWeight: 600 }}>
                {teacherRemarks?.conduct || <span style={{ color: '#bbb' }}>—</span>}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, color: '#555', paddingTop: '5px', verticalAlign: 'top' }}>Remarks</td>
              <td colSpan={3} style={{ paddingTop: '5px', borderBottom: '1px solid #b0d4c4', paddingBottom: '5px', minHeight: '20px' }}>
                {teacherRemarks?.general_remarks || <span style={{ color: '#bbb' }}>—</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signatures */}
      <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: `1px dashed #c6e8d8` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr>
              <td style={{ width: '33%', paddingTop: '22px', paddingRight: '20px' }}>
                <div style={{ borderTop: `1.5px solid #888`, paddingTop: '4px', color: '#555' }}>Class Teacher&apos;s Signature &amp; Date</div>
              </td>
              <td style={{ width: '34%', paddingTop: '22px', textAlign: 'center' }}>
                <div style={{ borderTop: `1.5px solid #888`, paddingTop: '4px', color: '#555' }}>Next Term Begins</div>
              </td>
              <td style={{ width: '33%', paddingTop: '22px', paddingLeft: '20px', textAlign: 'right' }}>
                <div style={{ borderTop: `1.5px solid #888`, paddingTop: '4px', color: '#555' }}>Headmaster&apos;s Signature &amp; Date</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StudentResultsPage() {
  const [years,        setYears]        = useState<AcademicYear[]>([]);
  const [yearsReady,   setYearsReady]   = useState(false);
  const [yearId,       setYearId]       = useState('');
  const [semester,     setSemester]     = useState('1');
  const [result,       setResult]       = useState<SemesterResult | null>(null);
  const [classStats,   setClassStats]   = useState<ClassStats | null>(null);
  const [history,      setHistory]      = useState<HistoryPoint[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [printing,     setPrinting]     = useState(false);
  const [school,       setSchool]       = useState<SchoolProfile>({ name: '', address: null, logo_url: null });
  const colors = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  const classAvg = classStats?.class_avg ?? null;

  useEffect(() => {
    studentApi.get<AcademicYear[]>('/api/student/academic-years').then(r => {
      setYears(r.data);
      const cur = r.data.find(y => y.is_current) ?? r.data[0];
      if (cur) { setYearId(cur.id); setSemester(String(cur.current_semester ?? 1)); }
    }).catch(() => {}).finally(() => setYearsReady(true));
    studentApi.get<HistoryPoint[]>('/api/student/results/history').then(r => setHistory(r.data)).catch(() => {});
    studentApi.get<SchoolProfile>('/api/student/school-profile').then(r => setSchool(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    const url = `/api/student/results?academic_year_id=${yearId}&semester=${semester}`;
    studentApi.get<SemesterResult>(url)
      .then(r => {
        setResult(r.data);
        // Also fetch class-wide averages for comparison (silent failure)
        studentApi.get<ClassStats>(`/api/student/results/class?academic_year_id=${yearId}&semester=${semester}`)
          .then(cr => setClassStats(cr.data))
          .catch(() => setClassStats(null));
      })
      .catch(() => { setResult(null); setClassStats(null); })
      .finally(() => setLoading(false));
  }, [yearId, semester]);

  function handlePrint() {
    flushSync(() => setPrinting(true));
    window.print();
    setPrinting(false);
  }

  const maxAvg = Math.max(...history.map(h => h.average), 100);
  const selectedYear = years.find(y => y.id === yearId);

  // Determine which remarks to show on screen
  const displayRemarks = result?.form_teacher_remarks ?? result?.remarks ?? null;

  return (
    <>
      {/* Print styles */}
      <style>{`
        #student-print-area { display: none; }
        @media print {
          body * { visibility: hidden; }
          #student-print-area {
            display: block !important; visibility: visible !important;
            position: fixed; top: 0; left: 0; width: 100%; background: white; z-index: 9999;
          }
          #student-print-area * { visibility: visible !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>

      {/* Print area */}
      <div id="student-print-area">
        {printing && result && (
          <ReportCard
            result={result}
            yearName={selectedYear?.name ?? ''}
            semester={semester}
            schoolName={school.name}
            schoolAddress={school.address ?? ''}
            schoolLogo={school.logo_url}
          />
        )}
      </div>

      {/* Screen UI */}
      <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-1">Academic Year</label>
            <select value={yearId} onChange={e => setYearId(e.target.value)} disabled={!yearsReady}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
              {!yearsReady && <option value="">Loading…</option>}
              {yearsReady && years.length === 0 && <option value="">No academic years found</option>}
              {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-1">Semester</label>
            <select value={semester} onChange={e => setSemester(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
          <button onClick={handlePrint} disabled={!result}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-colors"
            style={{ background: primary }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
            </svg>
            Print Report Card
          </button>
        </div>

        {/* Summary cards */}
        {result && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Average', value: result.average !== null ? `${result.average}%` : '—', sub: result.overall_grade },
              { label: 'Position', value: result.class_position ? `${result.class_position}${ordinal(result.class_position)}` : '—', sub: result.class_total ? `of ${result.class_total}` : '' },
              { label: 'Subjects', value: result.subjects.filter(s => s.total !== null).length, sub: `${result.subjects.filter(s => s.total !== null && s.total >= 50).length} passed` },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-xl font-black text-slate-800">{value}</p>
                {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Class average comparison */}
        {classAvg !== null && result?.average !== null && result?.average !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#64748B' }}>Class average: <strong>{classAvg}%</strong></span>
            {result.average > classAvg ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#15803D', background: '#DCFCE7', padding: '1px 8px', borderRadius: 20 }}>
                ↑ {(result.average - classAvg).toFixed(1)}% above
              </span>
            ) : result.average < classAvg ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '1px 8px', borderRadius: 20 }}>
                ↓ {(classAvg - result.average).toFixed(1)}% below
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '1px 8px', borderRadius: 20 }}>= At class average</span>
            )}
          </div>
        )}

        {/* At-risk banner */}
        {result && result.average !== null && result.average < 40 && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} style={{ width: 20, height: 20, flexShrink: 0, marginTop: 1 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', margin: 0 }}>Your average is below 40%</p>
              <p style={{ fontSize: 12, color: '#B91C1C', margin: '3px 0 0' }}>Please speak with your form teacher or subject teachers for additional support.</p>
            </div>
          </div>
        )}

        {/* Subject table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
          </div>
        ) : result ? (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">{selectedYear?.name} — Semester {semester}</p>
              <p className="text-xs text-slate-400">{result.subjects.length} subjects</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="px-4 py-3 text-left">Subject</th>
                    <th className="px-3 py-3 text-center">CA</th>
                    <th className="px-3 py-3 text-center">Exam</th>
                    <th className="px-3 py-3 text-center">Total</th>
                    <th className="px-3 py-3 text-center">Grade</th>
                    <th className="px-3 py-3 text-left hidden sm:table-cell">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {result.subjects.map(s => (
                    <tr key={s.subject} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{s.subject}</td>
                      <td className="px-3 py-3 text-center text-xs text-slate-500">{s.ca_score ?? '—'}</td>
                      <td className="px-3 py-3 text-center text-xs text-slate-500">{s.exam_score ?? '—'}</td>
                      <td className={`px-3 py-3 text-center font-bold ${scoreColor(s.total)}`}>
                        {s.total ?? '—'}
                        {(() => {
                          const avg = classStats?.subjects.find(sub => sub.subject === s.subject)?.class_avg ?? null;
                          return avg !== null && s.total !== null ? (
                            <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 6 }}>
                              (class avg: {avg}%)
                            </span>
                          ) : null;
                        })()}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ color: gradeColor(s.grade), background: `${gradeColor(s.grade)}18` }}>{s.grade}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 hidden sm:table-cell">
                        {s.remark}
                        {s.subject_remark && (
                          <p style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic', marginTop: 2 }}>{s.subject_remark}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t border-slate-200">
                    <td className="px-4 py-3 text-sm text-slate-700">Average</td>
                    <td colSpan={2} />
                    <td className={`px-3 py-3 text-center font-black ${scoreColor(result.average)}`}>{result.average ?? '—'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ color: gradeColor(result.overall_grade), background: `${gradeColor(result.overall_grade)}18` }}>{result.overall_grade}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 hidden sm:table-cell">
                      {result.class_position ? `Position: ${result.class_position} of ${result.class_total}` : ''}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Form Teacher's Remarks */}
            {displayRemarks && (displayRemarks.attitude || displayRemarks.conduct || displayRemarks.general_remarks) && (
              <div style={{ marginTop: 16, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', margin: '16px' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Form Teacher&apos;s Remarks</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {displayRemarks.attitude && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', width: 80, flexShrink: 0 }}>Attitude:</span>
                      <span style={{ fontSize: 13, color: '#0F172A' }}>{displayRemarks.attitude}</span>
                    </div>
                  )}
                  {displayRemarks.conduct && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', width: 80, flexShrink: 0 }}>Conduct:</span>
                      <span style={{ fontSize: 13, color: '#0F172A' }}>{displayRemarks.conduct}</span>
                    </div>
                  )}
                  {displayRemarks.general_remarks && (
                    <div style={{ marginTop: 4 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>General Remarks:</p>
                      <p style={{ fontSize: 13, color: '#0F172A', lineHeight: 1.6 }}>{displayRemarks.general_remarks}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 p-12 text-center text-slate-400">
            No results found for this period.
          </div>
        )}

        {/* Grade legend */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Grade Legend</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(GRADE_COLORS).map(([g, c]) => (
              <span key={g} className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ color: c, background: `${c}18` }}>{g}</span>
            ))}
          </div>
        </div>

        {/* Performance trend chart */}
        {history.length > 1 && (
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <p className="text-sm font-bold text-slate-700 mb-1">Performance Trend</p>
            <p className="text-xs text-slate-400 mb-4">Average score across all semesters</p>
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.label} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-24 shrink-0 truncate">{h.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                    <div className="h-4 rounded-full flex items-center justify-end pr-2 transition-all"
                      style={{
                        width: `${(h.average / maxAvg) * 100}%`,
                        background: h.average >= 70 ? '#16a34a' : h.average >= 50 ? '#d97706' : '#dc2626',
                        minWidth: 28,
                      }}>
                      <span className="text-[9px] font-bold text-white">{h.average}%</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold w-6 text-right" style={{ color: gradeColor(h.grade) }}>{h.grade}</span>
                </div>
              ))}
            </div>

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mt-5 mb-3">Subjects Sat Per Semester</p>
            <div className="flex flex-wrap gap-2">
              {history.map(h => (
                <div key={h.label} className="text-center px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="text-xs text-slate-400">{h.label}</p>
                  <p className="text-lg font-black text-slate-700">{h.subject_count}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Best semester callout */}
        {history.length > 0 && (() => {
          const best = [...history].sort((a, b) => b.average - a.average)[0];
          return (
            <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: `${primary}10`, border: `1px solid ${primary}30` }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <div>
                <p className="text-sm font-bold" style={{ color: primary }}>Best Semester</p>
                <p className="text-xs text-slate-600">{best.label} — {best.average}% ({best.grade})</p>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
