'use client';

import { useEffect, useMemo, useState } from 'react';
import { teacherApi } from '@/lib/teacher-api';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import type { AcademicYear, FormTeacherAssignment, FormTeacherStudent, ReportRemark, StudentResult } from '@/types/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';

// ── Helpers ───────────────────────────────────────────────────────────────────
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function AttPill({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-slate-300">—</span>;
  const cls = pct >= 80 ? 'bg-[#D1EAD9] text-[#145C44]' : pct >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-[#FEF2F2] text-[#B83232]';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{pct}%</span>;
}

function Avatar({ url, name, gender }: { url?: string | null; name: string; gender?: string | null }) {
  if (url) return <img src={url} alt={name} className="w-full h-full object-cover" />;
  const isFemale = gender?.toLowerCase() === 'female';
  return (
    <div className={`w-full h-full flex items-center justify-center text-sm font-bold ${isFemale ? 'bg-pink-100 text-pink-600' : 'bg-[#F5F0E8] text-[#8C7E6E]'}`}>
      {name[0]}
    </div>
  );
}

const RATING_OPTS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];

type Tab = 'overview' | 'remarks' | 'attendance' | 'results';

// ── Student detail drawer ─────────────────────────────────────────────────────
function StudentDrawer({
  student, remark, attRow, result, resultsLoading, onClose,
}: {
  student: FormTeacherStudent;
  remark: ReportRemark | null;
  attRow: { present: number; absent: number; late: number; total: number; pct: number | null } | null;
  result: StudentResult | null;
  resultsLoading?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-[#0B3D2E]/55" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="h-full w-full max-w-sm bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 z-10">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <div className="flex-1">
            <p className="font-bold text-slate-800 text-sm">{student.name}</p>
            <p className="text-xs text-slate-400">{student.student_code}</p>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {/* Profile */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0">
              <Avatar url={student.picture_url} name={student.name} gender={student.gender} />
            </div>
            <div>
              <p className="font-bold text-slate-800">{student.name}</p>
              <p className="text-xs text-slate-500">{student.program_name ?? '—'} · {student.gender ?? '—'}</p>
              {student.house && <p className="text-xs text-slate-400">{student.house}</p>}
            </div>
          </div>
          {/* Attendance */}
          {attRow && (
            <div className="bg-[#F5F0E8] rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-500 font-medium mb-2">Attendance</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Present', attRow.present, 'text-[#145C44]'], ['Absent', attRow.absent, 'text-[#B83232]'], ['Late', attRow.late, 'text-amber-600'], ['Total', attRow.total, 'text-slate-700']].map(([label, val, color]) => (
                  <div key={String(label)}>
                    <p className={`text-lg font-bold ${color}`}>{val}</p>
                    <p className="text-[10px] text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
              {attRow.pct != null && (
                <div className="mt-2 bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full ${attRow.pct >= 80 ? 'bg-[#145C44]' : attRow.pct >= 60 ? 'bg-amber-400' : 'bg-[#B83232]'}`}
                    style={{ width: `${attRow.pct}%` }} />
                </div>
              )}
            </div>
          )}
          {/* Academic */}
          {resultsLoading ? (
            <div className="bg-[#F5F0E8] rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-500 font-medium mb-3">Academic</p>
              <div className="flex justify-center py-2">
                <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
              </div>
            </div>
          ) : result ? (
            <div className="bg-[#F5F0E8] rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-500 font-medium mb-2">Academic</p>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div><p className="text-lg font-bold text-[#145C44]">{result.average ?? '—'}</p><p className="text-[10px] text-slate-400">Average</p></div>
                <div><p className="text-lg font-bold text-slate-700">{result.class_position ? ordinal(result.class_position) : '—'}</p><p className="text-[10px] text-slate-400">Position</p></div>
                <div><p className="text-lg font-bold text-slate-700">{result.overall_grade || '—'}</p><p className="text-[10px] text-slate-400">Grade</p></div>
              </div>
              <div className="flex items-center gap-1 text-[9px] font-semibold text-slate-400 font-medium pb-1 mb-0.5 border-b border-slate-100">
                <span className="flex-1">Subject</span>
                <span className="w-8 text-center">CA</span>
                <span className="w-8 text-center">Exam</span>
                <span className="w-8 text-center">Total</span>
                <span className="w-7 text-center">Grd</span>
              </div>
              {result.subjects.map(s => (
                <div key={s.subject} className="flex items-center gap-1 py-1 border-b border-slate-100 last:border-0 text-xs">
                  <span className="text-slate-700 truncate flex-1">{s.subject}</span>
                  <span className="text-slate-500 w-8 text-center">{s.ca_score != null ? s.ca_score : '—'}</span>
                  <span className="text-slate-500 w-8 text-center">{s.exam_score != null ? s.exam_score : '—'}</span>
                  <span className="font-bold text-slate-700 w-8 text-center">{s.total != null ? s.total : '—'}</span>
                  <span className="font-bold text-slate-500 w-7 text-center">{s.grade && s.grade !== '-' ? s.grade : '—'}</span>
                </div>
              ))}
            </div>
          ) : null}
          {/* Remarks */}
          {remark && (remark.attitude || remark.conduct || remark.general_remarks) && (
            <div className="bg-[#E8F4EE] border border-[#D1EAD9] rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-500 font-medium mb-2">Form Teacher Remarks</p>
              {remark.attitude && <p className="text-xs text-slate-700"><span className="font-semibold">Attitude:</span> {remark.attitude}</p>}
              {remark.conduct  && <p className="text-xs text-slate-700 mt-0.5"><span className="font-semibold">Conduct:</span> {remark.conduct}</p>}
              {remark.general_remarks && <p className="text-xs text-slate-600 mt-1 italic">{remark.general_remarks}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FormClassPage() {
  const teacher = getTeacher();
  const { primary } = getTeacherColors();

  const [years,      setYears]      = useState<AcademicYear[]>([]);
  const [yearId,     setYearId]     = useState('');
  const [semester,   setSemester]   = useState('1');
  const [assignment, setAssignment] = useState<FormTeacherAssignment | null | undefined>(undefined); // undefined = loading
  const [students,   setStudents]   = useState<FormTeacherStudent[]>([]);
  const [attData,    setAttData]    = useState<Record<string, { present: number; absent: number; late: number; total: number; pct: number | null }>>({});
  const [resultsData, setResultsData] = useState<StudentResult[]>([]);
  const [remarksMap,     setRemarksMap]     = useState<Record<string, ReportRemark>>({});
  const [draft,          setDraft]          = useState<Record<string, ReportRemark>>({});
  const [aiSuggestion,   setAiSuggestion]   = useState<Record<string, string>>({});
  const [aiLoading,      setAiLoading]      = useState<Record<string, boolean>>({});
  const [aiError,        setAiError]        = useState<Record<string, string>>({});
  const [aiAcceptedIds,  setAiAcceptedIds]  = useState<Set<string>>(new Set());
  const [tab,         setTab]         = useState<Tab>('overview');
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingTab,      setLoadingTab]      = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [savedMsg,        setSavedMsg]        = useState(false);
  const [drawerStudent,   setDrawerStudent]   = useState<FormTeacherStudent | null>(null);
  const [onExeatIds,      setOnExeatIds]      = useState<Set<string>>(new Set());

  // Load active exeat IDs for badge display
  useEffect(() => {
    teacherApi.get<string[]>('/api/exeat/on-exeat-ids')
      .then(r => setOnExeatIds(new Set(r.data)))
      .catch(() => {});
  }, []);

  // Load years on mount
  useEffect(() => {
    teacherApi.get('/api/academic-years').then(r => {
      setYears(r.data);
      const cur = r.data.find((y: AcademicYear) => y.is_current) ?? r.data[0];
      if (cur) { setYearId(cur.id); setSemester(String(cur.current_semester ?? 1)); }
    }).catch(() => {});
  }, []);

  // Load assignment when year changes
  useEffect(() => {
    if (!yearId) return;
    setAssignment(undefined);
    teacherApi.get(`/api/form-teacher/assignment?academic_year_id=${yearId}`)
      .then(r => setAssignment(r.data))
      .catch(() => setAssignment(null));
  }, [yearId]);

  // Load students when assignment available
  useEffect(() => {
    if (!assignment?.class_name || !yearId) return;
    setLoadingStudents(true);
    teacherApi.get(`/api/form-teacher/students?academic_year_id=${yearId}&semester=${semester}`)
      .then(r => {
        setStudents(r.data);
        const d: Record<string, ReportRemark> = {};
        for (const s of r.data) {
          d[s.id] = remarksMap[s.id] ?? { student_id: s.id, attitude: null, conduct: null, general_remarks: null };
        }
        setDraft(d);
      })
      .catch(() => {})
      .finally(() => setLoadingStudents(false));
  }, [assignment, yearId, semester]);

  // Load tab-specific data
  useEffect(() => {
    if (!assignment?.class_name || !yearId) return;
    setLoadingTab(true);

    if (tab === 'remarks') {
      Promise.all([
        teacherApi.get(`/api/form-teacher/remarks?academic_year_id=${yearId}&semester=${semester}`),
        teacherApi.get(`/api/results?academic_year_id=${yearId}&semester=${semester}&class_name=${encodeURIComponent(assignment.class_name)}`),
      ]).then(([remarksRes, resultsRes]) => {
        const m: Record<string, ReportRemark> = {};
        for (const rem of remarksRes.data) m[rem.student_id] = rem;
        setRemarksMap(m);
        setDraft(prev => {
          const next = { ...prev };
          for (const s of students) next[s.id] = m[s.id] ?? { student_id: s.id, attitude: null, conduct: null, general_remarks: null };
          return next;
        });
        setResultsData(resultsRes.data ?? []);
      }).catch(() => {}).finally(() => setLoadingTab(false));
    } else if (tab === 'attendance') {
      teacherApi.get(`/api/form-teacher/attendance?academic_year_id=${yearId}&semester=${semester}`)
        .then(r => {
          const m: Record<string, typeof attData[string]> = {};
          for (const row of r.data) m[row.student_id] = row;
          setAttData(m);
        })
        .catch(() => {})
        .finally(() => setLoadingTab(false));
    } else if (tab === 'results') {
      teacherApi.get(`/api/results?academic_year_id=${yearId}&semester=${semester}&class_name=${encodeURIComponent(assignment.class_name)}`)
        .then(r => setResultsData(r.data))
        .catch(() => {})
        .finally(() => setLoadingTab(false));
    } else {
      setLoadingTab(false);
    }
  }, [tab, assignment, yearId, semester]);

  function updateDraft(studentId: string, field: keyof ReportRemark, value: string) {
    setDraft(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value || null } }));
  }

  async function draftWithAI(studentId: string) {
    const s = students.find(st => st.id === studentId);
    if (!s) return;
    const sResult = resultsData.find(r => r.student_id === studentId) ?? null;
    const att = s.attendance;
    const yearName = years.find(y => y.id === yearId)?.name ?? '';

    setAiLoading(prev => ({ ...prev, [studentId]: true }));
    setAiError(prev => ({ ...prev, [studentId]: '' }));
    setAiSuggestion(prev => ({ ...prev, [studentId]: '' }));

    try {
      const { data } = await teacherApi.post<{ draft: string }>('/api/ai/draft-remark', {
        student_id: studentId,
        academic_year_id: yearId,
        semester: parseInt(semester),
        track: 'secondary_overall',
        context: {
          student_name:   s.name,
          class_name:     assignment?.class_name ?? '',
          year_name:      yearName,
          semester:       parseInt(semester),
          subjects:       sResult?.subjects ?? [],
          class_position: sResult?.class_position ?? null,
          class_total:    sResult?.class_total ?? null,
          average:        sResult?.average ?? null,
          overall_grade:  sResult?.overall_grade ?? null,
          attendance:     { present: att.present, absent: att.absent, late: att.late },
        },
      });
      setAiSuggestion(prev => ({ ...prev, [studentId]: data.draft }));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Draft unavailable. Please write the remark directly.';
      setAiError(prev => ({ ...prev, [studentId]: msg }));
    } finally {
      setAiLoading(prev => ({ ...prev, [studentId]: false }));
    }
  }

  function acceptAIDraft(studentId: string) {
    const text = aiSuggestion[studentId];
    if (!text) return;
    setDraft(prev => ({ ...prev, [studentId]: { ...prev[studentId], general_remarks: text } }));
    setAiAcceptedIds(prev => new Set(prev).add(studentId));
    setAiSuggestion(prev => ({ ...prev, [studentId]: '' }));
  }

  async function saveRemarks() {
    setSaving(true);
    try {
      await teacherApi.post('/api/form-teacher/remarks', {
        academic_year_id: yearId,
        semester,
        remarks: Object.values(draft).map(r => ({
          ...r,
          ai_drafted: aiAcceptedIds.has(r.student_id),
        })),
      });
      setRemarksMap({ ...draft });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch { /* silent */ }
    setSaving(false);
  }

  // Derived stats
  const stats = useMemo(() => {
    if (!students.length) return null;
    const atts = students.map(s => s.attendance.pct).filter(p => p != null) as number[];
    const avgAtt = atts.length ? Math.round(atts.reduce((a, b) => a + b, 0) / atts.length) : null;
    const remarksEntered = students.filter(s => s.has_remarks).length;
    return { total: students.length, avgAtt, remarksEntered };
  }, [students]);

  const drawerResult    = resultsData.find(r => r.student_id === drawerStudent?.id) ?? null;
  const drawerAttRow    = drawerStudent ? attData[drawerStudent.id] ?? null : null;
  const drawerRemark    = drawerStudent ? (remarksMap[drawerStudent.id] ?? draft[drawerStudent.id] ?? null) : null;

  const { displayRows: stuRows, total: stuTotal, page: stuPage, setPage: setStuPage, pageSize: stuPageSize, setPageSize: setStuPageSize } = useTableControls(students);

  const selectCls = 'border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#145C44]';

  // ── No assignment state ───────────────────────────────────────────────────
  if (assignment === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: '#F4EFE6' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: '#e8f5ee' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#145C44" strokeWidth={1.5} className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
          </svg>
        </div>
        <p className="text-lg font-bold text-slate-700">No Form Class Assigned</p>
        <p className="text-slate-500 text-sm mt-2 max-w-xs">
          You haven&apos;t been assigned a form class for this academic year. Contact your administrator.
        </p>
        <div className="mt-4">
          <select value={yearId} onChange={e => setYearId(e.target.value)} className={selectCls}>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </div>
      </div>
    );
  }

  // ── Loading assignment ────────────────────────────────────────────────────
  if (assignment === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}>
        <div className="w-8 h-8 rounded-full border-2 border-b-transparent animate-spin" style={{ borderColor: primary, borderBottomColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="pb-6" style={{ background: '#F4EFE6', minHeight: '100vh' }}>

      {/* ── Header ── */}
      <div className="bg-white border-b border-[#E2D9CC] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-slate-400 font-medium">Form Class</p>
            <p className="text-xl font-bold text-slate-800">{assignment.class_name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{assignment.academic_year}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select value={yearId} onChange={e => setYearId(e.target.value)} className={selectCls}>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
            <select value={semester} onChange={e => setSemester(e.target.value)} className={selectCls}>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white border-b border-[#E2D9CC] px-4 flex gap-0 overflow-x-auto no-scrollbar">
        {(['overview', 'remarks', 'attendance', 'results'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-semibold capitalize whitespace-nowrap border-b-2 transition-colors ${tab === t ? 'border-green-600 text-[#145C44]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t === 'overview' ? 'Overview' : t === 'remarks' ? 'Remarks' : t === 'attendance' ? 'Attendance' : 'Results'}
            {t === 'remarks' && stats && (
              <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stats.remarksEntered === stats.total ? 'bg-[#D1EAD9] text-[#145C44]' : 'bg-amber-100 text-amber-700'}`}>
                {stats.remarksEntered}/{stats.total}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <>
            {/* Stat boxes */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Students',  value: students.length, color: 'text-slate-700' },
                { label: 'Avg Attendance',  value: stats?.avgAtt != null ? `${stats.avgAtt}%` : '—', color: stats?.avgAtt != null ? (stats.avgAtt >= 80 ? 'text-[#145C44]' : stats.avgAtt >= 60 ? 'text-amber-600' : 'text-[#B83232]') : 'text-slate-400' },
                { label: 'Remarks Entered', value: stats ? `${stats.remarksEntered}/${stats.total}` : '—', color: 'text-slate-700' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-xl border border-[#E2D9CC] p-4 text-center">
                  <p className="text-[10px] font-semibold text-slate-400 font-medium mb-1">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {loadingStudents ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-b-transparent animate-spin" style={{ borderColor: primary, borderBottomColor: 'transparent' }} />
              </div>
            ) : (
              <div className="space-y-2">
                {(stuRows as typeof students).map(s => (
                  <button key={s.id} onClick={() => setDrawerStudent(s)}
                    className="w-full bg-white rounded-xl border border-[#E2D9CC] p-3 flex items-center gap-3 hover:border-[#8FC4A4] transition-colors text-left">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 flex-shrink-0">
                      <Avatar url={s.picture_url} name={s.name} gender={s.gender} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                        {onExeatIds.has(s.id) && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 flex-shrink-0">On Exeat</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{s.student_code}{s.program_name ? ` · ${s.program_name}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <AttPill pct={s.attendance.pct} />
                      {s.has_remarks && (
                        <span className="w-2 h-2 rounded-full bg-[#145C44]" title="Remarks saved" />
                      )}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-300">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </button>
                ))}
                {!students.length && !loadingStudents && (
                  <div className="bg-white rounded-xl border border-[#E2D9CC] p-8 text-center text-slate-400 text-sm">
                    No active students found in class {assignment.class_name}
                  </div>
                )}
              </div>
            )}
            {students.length > 0 && (
              <Pagination page={stuPage} pageSize={stuPageSize} total={stuTotal} onPage={setStuPage} onPageSize={(s) => { setStuPageSize(s); setStuPage(1); }} />
            )}
          </>
        )}

        {/* ── Remarks tab ── */}
        {tab === 'remarks' && (
          <>
            <div className="bg-white rounded-xl border border-[#E2D9CC] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-700 text-sm">Student Remarks</p>
                  <p className="text-xs text-slate-400 mt-0.5">Attitude · Conduct · General remarks for report cards</p>
                </div>
                <button onClick={saveRemarks} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#145C44] text-white hover:bg-[#145C44] disabled:opacity-60">
                  {saving ? (
                    <><div className="w-3 h-3 rounded-full border-2 border-white border-b-transparent animate-spin" />Saving…</>
                  ) : savedMsg ? (
                    <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12" /></svg>Saved!</>
                  ) : 'Save All'}
                </button>
              </div>

              {loadingTab ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 rounded-full border-2 border-b-transparent animate-spin" style={{ borderColor: primary, borderBottomColor: 'transparent' }} />
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {students.map((s, i) => {
                    const d = draft[s.id] ?? { student_id: s.id, attitude: null, conduct: null, general_remarks: null };
                    const sResult = resultsData.find(r => r.student_id === s.id) ?? null;
                    const att = s.attendance;
                    return (
                      <div key={s.id} className={`p-4 ${i % 2 === 0 ? '' : 'bg-[#F5F0E8]/40'}`}>
                        {/* Name row with quick-access buttons */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-7 h-7 rounded-full overflow-hidden border border-slate-200 flex-shrink-0">
                            <Avatar url={s.picture_url} name={s.name} gender={s.gender} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                              <span className="text-xs text-slate-400">{s.student_code}</span>
                              {remarksMap[s.id] && <span className="text-[10px] font-bold text-[#145C44] bg-[#E8F4EE] px-1.5 py-0.5 rounded-full">Saved</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button type="button" onClick={() => setDrawerStudent(s)}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:border-[#8FC4A4] hover:text-[#145C44] transition-colors whitespace-nowrap">
                              Attendance
                            </button>
                            <button type="button" onClick={() => setDrawerStudent(s)}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:border-[#8FC4A4] hover:text-[#145C44] transition-colors whitespace-nowrap">
                              Results
                            </button>
                          </div>
                        </div>
                        {/* Compact stat strip */}
                        <div className="flex items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mb-2.5 flex-wrap">
                          <span>
                            Att: <span className={`font-bold ${att.pct != null ? (att.pct >= 80 ? 'text-[#145C44]' : att.pct >= 60 ? 'text-amber-600' : 'text-[#B83232]') : 'text-slate-400'}`}>{att.pct != null ? `${att.pct}%` : '—'}</span>
                            <span className="text-slate-400 ml-1">({att.present}P · {att.absent}A{att.late > 0 ? ` · ${att.late}L` : ''})</span>
                          </span>
                          {sResult ? (
                            <>
                              <span className="text-slate-300">·</span>
                              <span>Pos: <span className="font-bold text-slate-700">{sResult.class_position ? ordinal(sResult.class_position) : '—'}</span></span>
                              <span className="text-slate-300">·</span>
                              <span>Avg: <span className={`font-bold ${sResult.average != null ? (sResult.average >= 70 ? 'text-[#145C44]' : sResult.average >= 50 ? 'text-amber-600' : 'text-[#B83232]') : 'text-slate-400'}`}>{sResult.average != null ? `${sResult.average}%` : '—'}</span></span>
                              <span className="text-slate-300">·</span>
                              <span>Grade: <span className="font-bold text-slate-700">{sResult.overall_grade || '—'}</span></span>
                            </>
                          ) : !loadingTab ? (
                            <><span className="text-slate-300">·</span><span className="text-slate-300 italic">Results not yet available</span></>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-400 font-medium mb-1 block">Attitude</label>
                            <select value={d.attitude ?? ''} onChange={e => updateDraft(s.id, 'attitude', e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#145C44]">
                              <option value="">— Select —</option>
                              {RATING_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-400 font-medium mb-1 block">Conduct</label>
                            <select value={d.conduct ?? ''} onChange={e => updateDraft(s.id, 'conduct', e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#145C44]">
                              <option value="">— Select —</option>
                              {RATING_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-semibold text-slate-400 font-medium">General Remarks</label>
                            <button
                              type="button"
                              onClick={() => draftWithAI(s.id)}
                              disabled={aiLoading[s.id]}
                              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border border-[#8FC4A4] text-[#145C44] hover:bg-[#E8F4EE] disabled:opacity-50 transition-colors"
                            >
                              {aiLoading[s.id]
                                ? <><div className="w-2.5 h-2.5 rounded-full border border-[#145C44] border-b-transparent animate-spin" />Drafting…</>
                                : <>&#10024; Draft with AI</>}
                            </button>
                          </div>
                          <input value={d.general_remarks ?? ''} onChange={e => updateDraft(s.id, 'general_remarks', e.target.value)}
                            placeholder="e.g. A diligent student who shows great potential…"
                            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#145C44]" />
                          {aiError[s.id] && (
                            <p className="mt-1 text-[10px] text-[#B83232]">{aiError[s.id]}</p>
                          )}
                          {aiSuggestion[s.id] && (
                            <div className="mt-2 rounded-lg border border-[#8FC4A4] bg-[#F0FAF4] p-2.5">
                              <p className="text-[10px] font-semibold text-[#145C44] mb-1">AI suggestion — review before using:</p>
                              <p className="text-xs text-slate-700 leading-relaxed">{aiSuggestion[s.id]}</p>
                              <div className="flex gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => acceptAIDraft(s.id)}
                                  className="text-[10px] font-bold px-2.5 py-1 rounded bg-[#145C44] text-white hover:bg-[#0B3D2E] transition-colors"
                                >
                                  Use this draft
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAiSuggestion(prev => ({ ...prev, [s.id]: '' }))}
                                  className="text-[10px] font-semibold px-2.5 py-1 rounded border border-slate-200 text-slate-500 hover:border-slate-300 transition-colors"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!students.length && (
                    <div className="p-8 text-center text-slate-400 text-sm">No students found</div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Attendance tab ── */}
        {tab === 'attendance' && (
          <div className="bg-white rounded-xl border border-[#E2D9CC] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="font-semibold text-slate-700 text-sm">Student Attendance — Semester {semester}</p>
              <p className="text-xs text-slate-400 mt-0.5">All classes recorded for this class this semester</p>
            </div>
            {loadingTab ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 rounded-full border-2 border-b-transparent animate-spin" style={{ borderColor: primary, borderBottomColor: 'transparent' }} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F5F0E8] text-xs font-semibold text-slate-500 font-medium border-b border-slate-100">
                      <th className="px-4 py-2.5 text-left">Student</th>
                      <th className="px-4 py-2.5 text-center">Present</th>
                      <th className="px-4 py-2.5 text-center">Absent</th>
                      <th className="px-4 py-2.5 text-center">Late</th>
                      <th className="px-4 py-2.5 text-center">Total</th>
                      <th className="px-4 py-2.5 text-center">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {Object.values(attData).length === 0 && !loadingTab ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">No attendance records found for this semester</td></tr>
                    ) : (
                      Object.entries(attData)
                        .sort(([, a], [, b]) => (b.pct ?? 0) - (a.pct ?? 0))
                        .map(([id, row]) => {
                          const s = students.find(s => s.id === id);
                          return (
                            <tr key={id} className="hover:bg-[#F5F0E8]">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full overflow-hidden border border-slate-200 flex-shrink-0">
                                    <Avatar url={s?.picture_url} name={s?.name ?? '?'} gender={s?.gender} />
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-800 text-xs">{s?.name ?? id}</p>
                                    <p className="text-[10px] text-slate-400">{s?.student_code}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center text-[#145C44] font-semibold text-xs">{row.present}</td>
                              <td className="px-4 py-2.5 text-center text-[#B83232] font-semibold text-xs">{row.absent}</td>
                              <td className="px-4 py-2.5 text-center text-amber-600 font-semibold text-xs">{row.late}</td>
                              <td className="px-4 py-2.5 text-center text-slate-600 text-xs">{row.total}</td>
                              <td className="px-4 py-2.5 text-center"><AttPill pct={row.pct} /></td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Results tab ── */}
        {tab === 'results' && (
          <div className="bg-white rounded-xl border border-[#E2D9CC] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="font-semibold text-slate-700 text-sm">Academic Results — Semester {semester}</p>
            </div>
            {loadingTab ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 rounded-full border-2 border-b-transparent animate-spin" style={{ borderColor: primary, borderBottomColor: 'transparent' }} />
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {resultsData.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-sm">No results found for this semester</div>
                )}
                {resultsData
                  .sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999))
                  .map(r => (
                    <button key={r.student_id} onClick={() => {
                      const s = students.find(s => s.id === r.student_id);
                      if (s) setDrawerStudent(s);
                    }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F5F0E8] transition-colors text-left">
                      <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-xs font-bold"
                        style={{ background: r.class_position && r.class_position <= 3 ? '#fef3c7' : '#f1f5f9', color: r.class_position && r.class_position <= 3 ? '#d97706' : '#64748b' }}>
                        {r.class_position ?? '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                        <p className="text-xs text-slate-400">{r.student_code} · {r.subjects.length} subjects</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-bold" style={{ color: r.average != null ? (r.average >= 70 ? '#145C44' : r.average >= 50 ? '#D97706' : '#B83232') : '#94a3b8' }}>
                            {r.average ?? '—'}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${['A1','B2','B3','A','B+','B-'].includes(r.overall_grade) ? 'bg-[#D1EAD9] text-[#145C44]' : ['F9','F','E8'].includes(r.overall_grade) ? 'bg-[#FEF2F2] text-[#B83232]' : 'bg-amber-100 text-amber-700'}`}>
                          {r.overall_grade || '—'}
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Student detail drawer */}
      {drawerStudent && (
        <StudentDrawer
          student={drawerStudent}
          remark={remarksMap[drawerStudent.id] ?? draft[drawerStudent.id] ?? null}
          attRow={attData[drawerStudent.id] ?? drawerStudent.attendance}
          result={drawerResult}
          resultsLoading={loadingTab && tab === 'remarks' && resultsData.length === 0}
          onClose={() => setDrawerStudent(null)}
        />
      )}
    </div>
  );
}
