'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';
import type { AcademicYear, StudentResult } from '@/types/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ResultsContent() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');

  const [years,     setYears]     = useState<AcademicYear[]>([]);
  const [classes,   setClasses]   = useState<string[]>([]);
  const [yearId,    setYearId]    = useState('');
  const [semester,  setSemester]  = useState('1');
  const [className, setClassName] = useState('');
  const [results,   setResults]   = useState<StudentResult[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error,     setError]     = useState('');
  const [selected,  setSelected]  = useState<StudentResult | null>(null);
  const [rejections, setRejections] = useState<Array<{ subject: string; class_name: string; rejected_reason: string | null; hod_comment: string | null }>>([]);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);

    Promise.all([
      teacherApi.get<AcademicYear[]>('/api/academic-years'),
      teacherApi.get<string[]>('/api/students/classes'),
    ]).then(([yRes, cRes]) => {
      setYears(yRes.data ?? []);
      const current = (yRes.data ?? []).find((y: AcademicYear) => y.is_current);
      const activeYear  = current ?? yRes.data?.[0];
      const activeSem   = String(current?.current_semester ?? 1);
      if (activeYear) { setYearId(activeYear.id); setSemester(activeSem); }
      setClasses(cRes.data ?? []);
      if (activeYear) {
        teacherApi.get<Array<{ subject: string; class_name: string; status: string; rejected_reason: string | null; hod_comment: string | null }>>(
          `/api/result-submissions/my-status?academic_year_id=${activeYear.id}&semester=${activeSem}`
        ).then(sRes => {
          setRejections((sRes.data ?? []).filter(s => s.status === 'rejected'));
        }).catch(() => {});
      }
    }).catch(() => setError('Failed to load filters.')).finally(() => setLoadingMeta(false));
  }, []);

  const load = useCallback(async () => {
    if (!yearId || !semester || !className) return;
    setLoading(true); setError(''); setSelected(null);
    try {
      const { data } = await teacherApi.get<StudentResult[]>('/api/results', {
        params: { academic_year_id: yearId, semester, class_name: className },
      });
      setResults(data ?? []);
    } catch { setError('Failed to load results.'); }
    finally { setLoading(false); }
  }, [yearId, semester, className]);

  useEffect(() => { load(); }, [load]);

  const yearName = years.find(y => y.id === yearId)?.name ?? '';
  const caLabel  = results[0] ? `CA (${results[0].ca_percentage}%)` : 'CA';
  const exLabel  = results[0] ? `Exam (${results[0].exam_percentage}%)` : 'Exam';

  const sortedResults = useMemo(() => results.slice().sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999)), [results]);
  const { displayRows, total, page, setPage, pageSize, setPageSize } = useTableControls(sortedResults);

  const selCls = 'flex-1 min-w-0 appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-8 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]';

  return (
    <div className="min-h-screen pb-10" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-xl font-bold text-[#2C2218]">Results</h1>
        <p className="text-sm text-[#8C7E6E] mt-0.5">End-of-semester report cards</p>
      </div>

      {/* Filters */}
      <div className="mx-4 bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-4 space-y-3">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <select value={yearId} onChange={e => setYearId(e.target.value)} className={selCls} disabled={loadingMeta}>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>)}
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          <div className="w-36 relative">
            <select value={semester} onChange={e => setSemester(e.target.value)} className={selCls}>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>
        <div className="relative">
          <select value={className} onChange={e => setClassName(e.target.value)} className={`w-full ${selCls}`} disabled={loadingMeta}>
            <option value="">— Select class —</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      {error && <p className="mx-4 text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>}

      {rejections.length > 0 && (
        <div className="mx-4 mb-4 bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-red-700 mb-2">Results Returned for Editing</p>
          <div className="space-y-2">
            {rejections.map(r => (
              <div key={`${r.subject}||${r.class_name}`} className="bg-white rounded-xl border border-red-100 px-3 py-2.5">
                <p className="text-sm font-semibold text-[#2C2218]">{r.subject} — {r.class_name}</p>
                {(r.rejected_reason || r.hod_comment) && (
                  <p className="text-xs text-red-600 mt-0.5 italic">"{r.rejected_reason || r.hod_comment}"</p>
                )}
                <p className="text-xs text-[#8C7E6E] mt-1">Edit your scores and resubmit from the Assessments page.</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!className ? (
        <div className="mx-4 bg-white rounded-2xl border border-[#E2D9CC] p-12 text-center">
          <p className="text-sm text-[#8C7E6E]">Select a class to view results</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
        </div>
      ) : results.length === 0 ? (
        <div className="mx-4 bg-white rounded-2xl border border-[#E2D9CC] p-10 text-center">
          <p className="text-sm text-[#8C7E6E]">No results found for {className}</p>
          <p className="text-xs text-[#C8BFB5] mt-1">Ensure assessments and exam scores have been entered.</p>
        </div>
      ) : (
        <div className="mx-4 bg-white rounded-2xl border border-[#E2D9CC] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2D9CC]">
            <p className="text-sm font-bold text-[#2C2218]">{className}</p>
            <p className="text-xs text-[#8C7E6E]">{yearName} · Semester {semester} · {results.length} students</p>
          </div>
          <div className="divide-y divide-[#F4EFE6]">
            {(displayRows as typeof sortedResults).map(r => (
                <button
                  key={r.student_id}
                  onClick={() => setSelected(r)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#F9F6F2] transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: primary }}>
                    {r.class_position ?? '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#2C2218] truncate">{r.name}</p>
                    <p className="text-xs text-[#8C7E6E]">{r.student_code}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold" style={{ color: primary }}>{r.average ?? '—'}</p>
                    <p className="text-xs text-[#8C7E6E]">{r.overall_grade}</p>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#C8BFB5] shrink-0"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              ))}
          </div>
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />

      {/* Report card slide-in */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-3xl shadow-2xl">
            {/* Card header */}
            <div className="sticky top-0 bg-white px-5 pt-5 pb-4 border-b border-[#E2D9CC]">
              <div className="flex items-start gap-3">
                <button onClick={() => setSelected(null)} className="mt-0.5 text-[#8C7E6E]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
                <div className="flex-1">
                  <p className="font-bold text-[#2C2218]">{selected.name}</p>
                  <p className="text-xs text-[#8C7E6E]">{selected.student_code} · {className} · Semester {semester}</p>
                </div>
              </div>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  { label: 'Average', value: selected.average ?? '—', highlight: true },
                  { label: 'Position', value: selected.class_position ? `${ordinal(selected.class_position)} / ${selected.class_total}` : '—' },
                  { label: 'Grade', value: selected.overall_grade },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="bg-[#F4EFE6] rounded-xl p-3 text-center">
                    <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide">{label}</p>
                    <p className="text-lg font-bold mt-0.5" style={{ color: highlight ? primary : '#2C2218' }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Attendance */}
            {selected.attendance && (
              <div className="px-5 pt-4 pb-0">
                <p className="text-xs font-semibold text-[#8C7E6E] uppercase tracking-wide mb-2">Attendance</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Present',       value: selected.attendance.present, color: '#15803D' },
                    { label: 'Late',          value: selected.attendance.late,    color: '#D97706' },
                    { label: 'Absent',        value: selected.attendance.absent,  color: '#DC2626' },
                    { label: 'Total Periods', value: selected.attendance.total,   color: '#2C2218' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-[#F4EFE6] rounded-xl p-2.5 text-center">
                      <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide">{label}</p>
                      <p className="text-lg font-bold mt-0.5" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Subject table */}
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-[#8C7E6E] uppercase tracking-wide mb-3">Subject Breakdown</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide border-b border-[#E2D9CC]">
                      <th className="pb-2 text-left">Subject</th>
                      <th className="pb-2 text-center">{caLabel}</th>
                      <th className="pb-2 text-center">{exLabel}</th>
                      <th className="pb-2 text-center">Total</th>
                      <th className="pb-2 text-center">Grade</th>
                      <th className="pb-2 text-center">Pos</th>
                      <th className="pb-2 text-left">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4EFE6]">
                    {selected.subjects.map(s => (
                      <tr key={s.subject}>
                        <td className="py-2.5 font-medium text-[#2C2218] pr-3">
                          {s.subject}
                          {s.is_imported && (
                            <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 align-middle">IMP</span>
                          )}
                        </td>
                        <td className="py-2.5 text-center text-[#2C2218]">{s.ca_score ?? '—'}</td>
                        <td className="py-2.5 text-center text-[#2C2218]">{s.exam_score ?? '—'}</td>
                        <td className="py-2.5 text-center font-bold" style={{ color: primary }}>{s.total ?? '—'}</td>
                        <td className="py-2.5 text-center font-bold text-[#2C2218]">{s.grade}</td>
                        <td className="py-2.5 text-center text-xs text-[#8C7E6E]">
                          {s.subject_position ? `${ordinal(s.subject_position)}/${s.class_size}` : '—'}
                        </td>
                        <td className="py-2.5 text-xs text-[#8C7E6E]">{s.remark && s.remark !== '-' ? s.remark : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}><div className="w-7 h-7 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" /></div>}>
      <ResultsContent />
    </Suspense>
  );
}
