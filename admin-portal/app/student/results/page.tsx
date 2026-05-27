'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number; }
interface SubjectResult { subject: string; ca_score: number | null; exam_score: number | null; total: number | null; grade: string; remark: string; }
interface SemesterResult {
  student: { id: string; name: string; student_code: string; class_name: string; program_name: string | null; picture_url: string | null };
  subjects: SubjectResult[];
  average: number | null;
  overall_grade: string;
  class_position: number | null;
  class_total: number | null;
  remarks: { attitude: string | null; conduct: string | null; general_remarks: string | null; interest: string | null } | null;
}
interface HistoryPoint { label: string; academic_year: string; semester: number; average: number; grade: string; subject_count: number; }

const GRADE_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#9333ea', E: '#64748b', F: '#dc2626',
};
function gradeColor(g: string) { return GRADE_COLORS[g?.[0]?.toUpperCase()] ?? '#64748b'; }
function scoreColor(t: number | null) {
  if (t === null) return 'text-slate-400';
  if (t >= 70) return 'text-green-700'; if (t >= 50) return 'text-amber-600'; return 'text-red-600';
}

export default function StudentResultsPage() {
  const [years,    setYears]    = useState<AcademicYear[]>([]);
  const [yearId,   setYearId]   = useState('');
  const [semester, setSemester] = useState('1');
  const [result,   setResult]   = useState<SemesterResult | null>(null);
  const [history,  setHistory]  = useState<HistoryPoint[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [printing, setPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const colors = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  useEffect(() => {
    studentApi.get<AcademicYear[]>('/api/student/academic-years').then(r => {
      setYears(r.data);
      const cur = r.data.find(y => y.is_current) ?? r.data[0];
      if (cur) { setYearId(cur.id); setSemester(String(cur.current_semester ?? 1)); }
    }).catch(() => {});
    studentApi.get<HistoryPoint[]>('/api/student/results/history').then(r => setHistory(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    studentApi.get<SemesterResult>(`/api/student/results?academic_year_id=${yearId}&semester=${semester}`)
      .then(r => setResult(r.data))
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [yearId, semester]);

  function handlePrint() {
    flushSync(() => setPrinting(true));
    window.print();
    setPrinting(false);
  }

  const maxAvg = Math.max(...history.map(h => h.average), 100);
  const selectedYear = years.find(y => y.id === yearId);

  return (
    <>
      {/* Print styles */}
      <style>{`
        #student-print-area { display: none; }
        @media print {
          body * { visibility: hidden; }
          #student-print-area {
            display: block !important; visibility: visible !important;
            position: absolute; top: 0; left: 0; width: 100%; background: white;
          }
          #student-print-area * { visibility: visible !important; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      `}</style>

      {/* Print area (hidden until print) */}
      <div id="student-print-area">
        {printing && result && (
          <div style={{ fontFamily: 'serif', padding: 0 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>STUDENT REPORT CARD</p>
              <p style={{ fontSize: 13, margin: '4px 0 0' }}>{selectedYear?.name} — Semester {semester}</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 12 }}>
              <tbody>
                <tr>
                  <td style={{ padding: '2px 8px' }}><b>Name:</b> {result.student.name}</td>
                  <td style={{ padding: '2px 8px' }}><b>Student ID:</b> {result.student.student_code}</td>
                </tr>
                <tr>
                  <td style={{ padding: '2px 8px' }}><b>Class:</b> {result.student.class_name}</td>
                  <td style={{ padding: '2px 8px' }}><b>Programme:</b> {result.student.program_name ?? '—'}</td>
                </tr>
              </tbody>
            </table>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['Subject','CA Score','Exam Score','Total','Grade','Remark'].map(h => (
                    <th key={h} style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.subjects.map(s => (
                  <tr key={s.subject}>
                    <td style={{ border: '1px solid #e2e8f0', padding: '4px 8px' }}>{s.subject}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '4px 8px', textAlign: 'center' }}>{s.ca_score ?? '—'}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '4px 8px', textAlign: 'center' }}>{s.exam_score ?? '—'}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '4px 8px', textAlign: 'center', fontWeight: 700 }}>{s.total ?? '—'}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '4px 8px', textAlign: 'center', fontWeight: 700 }}>{s.grade}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '4px 8px' }}>{s.remark}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  <td colSpan={3} style={{ border: '1px solid #cbd5e1', padding: '5px 8px' }}>Average</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'center' }}>{result.average ?? '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'center' }}>{result.overall_grade}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px' }}>Position: {result.class_position ? `${result.class_position} / ${result.class_total}` : '—'}</td>
                </tr>
              </tfoot>
            </table>
            {result.remarks && (result.remarks.attitude || result.remarks.conduct || result.remarks.general_remarks) && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 12 }}>
                <tbody>
                  {result.remarks.attitude   && <tr><td style={{ padding: '2px 8px', width: 130, fontWeight: 600 }}>Attitude:</td><td style={{ padding: '2px 8px' }}>{result.remarks.attitude}</td></tr>}
                  {result.remarks.conduct    && <tr><td style={{ padding: '2px 8px', fontWeight: 600 }}>Conduct:</td><td style={{ padding: '2px 8px' }}>{result.remarks.conduct}</td></tr>}
                  {result.remarks.interest   && <tr><td style={{ padding: '2px 8px', fontWeight: 600 }}>Interest:</td><td style={{ padding: '2px 8px' }}>{result.remarks.interest}</td></tr>}
                  {result.remarks.general_remarks && <tr><td style={{ padding: '2px 8px', fontWeight: 600 }}>Remarks:</td><td style={{ padding: '2px 8px' }}>{result.remarks.general_remarks}</td></tr>}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #000', width: 160, marginBottom: 4 }} /><p>Class Teacher</p></div>
              <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #000', width: 160, marginBottom: 4 }} /><p>Head Teacher / Principal</p></div>
            </div>
          </div>
        )}
      </div>

      {/* Screen UI */}
      <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-1">Academic Year</label>
            <select value={yearId} onChange={e => setYearId(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-1">Semester</label>
            <select value={semester} onChange={e => setSemester(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
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
            Print
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
                      <td className={`px-3 py-3 text-center font-bold ${scoreColor(s.total)}`}>{s.total ?? '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ color: gradeColor(s.grade), background: `${gradeColor(s.grade)}18` }}>{s.grade}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 hidden sm:table-cell">{s.remark}</td>
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

            {/* Remarks */}
            {result.remarks && (result.remarks.attitude || result.remarks.conduct || result.remarks.general_remarks) && (
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 space-y-1">
                {result.remarks.attitude        && <p className="text-xs text-slate-600"><span className="font-semibold">Attitude: </span>{result.remarks.attitude}</p>}
                {result.remarks.conduct         && <p className="text-xs text-slate-600"><span className="font-semibold">Conduct: </span>{result.remarks.conduct}</p>}
                {result.remarks.interest        && <p className="text-xs text-slate-600"><span className="font-semibold">Interest: </span>{result.remarks.interest}</p>}
                {result.remarks.general_remarks && <p className="text-xs text-slate-600"><span className="font-semibold">Remarks: </span>{result.remarks.general_remarks}</p>}
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

            {/* Subject count per semester */}
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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
