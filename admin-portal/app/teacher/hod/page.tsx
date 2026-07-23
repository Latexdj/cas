'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Overview {
  hod_type:             'subject' | 'programme';
  programme_name:       string;
  department:           string;
  teacher_count:        number;
  class_count:          number;
  student_count:        number;
  outstanding_absences: number;
  pending_remedials:    number;
  assessments_total:    number;
  assessments_scored:   number;
}

// Programme HOD — form teacher per class
interface ClassRow {
  class_name:          string;
  student_count:       number;
  // programme HOD fields
  form_teacher_id?:    string | null;
  form_teacher_name?:  string | null;
  form_teacher_phone?: string | null;
  form_teacher_email?: string | null;
  // subject HOD fields
  teacher_id?:         string | null;
  teacher_name?:       string | null;
  teacher_phone?:      string | null;
  teacher_email?:      string | null;
}

interface TeacherRow {
  id:                      string;
  name:                    string;
  email:                   string | null;
  phone:                   string | null;
  teacher_code:            string | null;
  form_class:              string | null;
  outstanding_absences:    number;
  pending_remedials:       number;
  last_attendance_date:    string | null;
  assessments_total:       number;
  assessments_with_scores: number;
}

interface AbsenceRow {
  id:           string;
  date:         string;
  subject:      string;
  class_name:   string;
  status:       string;
  reason:       string | null;
  periods_lost: number | null;
  teacher_id:   string;
  teacher_name: string;
}

interface HodQueueItem {
  id: string;
  subject: string;
  class_name: string;
  status: string;
  submitted_at: string;
  hod_comment: string | null;
  rejected_reason: string | null;
  teacher_name: string;
  teacher_id: string;
  academic_year: string;
  academic_year_id: string;
  semester: number;
  student_count: number;
  scored_count: number;
}

type Tab = 'overview' | 'approvals' | 'results' | 'classes' | 'teachers' | 'absences' | 'inventory';

type InvSubTab = 'items' | 'issue' | 'return';

interface HodStudentResult {
  student_id: string;
  student_code: string;
  name: string;
  subjects: Array<{
    subject: string;
    ca_score: number | null;
    exam_score: number | null;
    total: number | null;
    grade: string | null;
    remark: string | null;
  }>;
  average: number | null;
  class_position: number | null;
  class_total: number;
}

interface HodClass {
  class_name: string;
  teacher_name: string;
  student_count: number;
}

interface InvItem {
  id: string;
  asset_tag: string | null;
  name: string;
  category_name: string | null;
  quantity_total: number;
  quantity_available: number;
  condition: string;
  location: string | null;
}

interface InvStudent {
  id: string;
  name: string;
  student_code: string;
  class_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 text-center">
      <p className="text-2xl font-bold" style={{ color: accent ?? '#0F172A' }}>{value}</p>
      <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color, background: bg }}>
      {label}
    </span>
  );
}

const ABSENCE_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  'Absent':             { color: '#B91C1C', bg: '#FEF2F2' },
  'Remedial Scheduled': { color: '#92400E', bg: '#FEF9C3' },
  'Made Up':            { color: '#15803D', bg: '#F0FDF4' },
  'Cleared':            { color: '#1D4ED8', bg: '#EFF6FF' },
  'Verified':           { color: '#1D4ED8', bg: '#DBEAFE' },
  'Excused':            { color: '#6D28D9', bg: '#F5F3FF' },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HodPage() {
  const router  = useRouter();
  const [primary, setPrimary] = useState('#2ab289');
  const [tab,     setTab]     = useState<Tab>('overview');

  const [overview,  setOverview]  = useState<Overview | null>(null);
  const [classes,   setClasses]   = useState<ClassRow[]>([]);
  const [teachers,  setTeachers]  = useState<TeacherRow[]>([]);
  const [absences,  setAbsences]  = useState<AbsenceRow[]>([]);

  const [loadingOv,  setLoadingOv]  = useState(true);
  const [loadingCl,  setLoadingCl]  = useState(false);
  const [loadingTe,  setLoadingTe]  = useState(false);
  const [loadingAb,  setLoadingAb]  = useState(false);

  // Refs to prevent useCallback deps from triggering infinite reload loops
  const clTriggered = useRef(false);
  const teTriggered = useRef(false);

  const [abTeacher, setAbTeacher] = useState('');
  const [abStatus,  setAbStatus]  = useState('');

  const [error, setError] = useState('');

  // ── Approvals state ──
  const [queue,          setQueue]          = useState<HodQueueItem[]>([]);
  const [queueLoading,   setQueueLoading]   = useState(false);
  const [reviewTarget,   setReviewTarget]   = useState<HodQueueItem | null>(null);
  const [reviewAction,   setReviewAction]   = useState<'approve' | 'reject'>('approve');
  const [reviewComment,  setReviewComment]  = useState('');
  const [reviewing,      setReviewing]      = useState(false);
  const [reviewError,    setReviewError]    = useState('');
  const [previewResults, setPreviewResults] = useState<HodStudentResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError,   setPreviewError]   = useState('');

  // ── Results state ──
  const [academicYears,   setAcademicYears]   = useState<Array<{id:string; name:string; is_current:boolean; current_semester:number}>>([]);
  const [hodClasses,      setHodClasses]      = useState<HodClass[]>([]);
  const [resultsClass,    setResultsClass]    = useState('');
  const [resultsYear,     setResultsYear]     = useState('');
  const [resultsSem,      setResultsSem]      = useState<1|2>(1);
  const [hodResults,      setHodResults]      = useState<HodStudentResult[]>([]);
  const [resultsLoading,  setResultsLoading]  = useState(false);
  const [resultsError,    setResultsError]    = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  // ── Inventory state ──
  const [invItems,         setInvItems]         = useState<InvItem[]>([]);
  const [invLoading,       setInvLoading]       = useState(false);
  const [invSubTab,        setInvSubTab]        = useState<InvSubTab>('items');
  // Issue
  const [issueItemId,      setIssueItemId]      = useState('');
  const [issueToType,      setIssueToType]      = useState<'student' | 'staff' | 'department'>('staff');
  const [issueStudentCode, setIssueStudentCode] = useState('');
  const [issueStudent,     setIssueStudent]     = useState<InvStudent | null>(null);
  const [issueStudentLoading, setIssueStudentLoading] = useState(false);
  const [issueStudentError,   setIssueStudentError]   = useState('');
  const [issueName,        setIssueName]        = useState('');
  const [issueRole,        setIssueRole]        = useState('');
  const [issueQty,         setIssueQty]         = useState(1);
  const [issueNotes,       setIssueNotes]       = useState('');
  const [issuing,          setIssuing]          = useState(false);
  const [issueError,       setIssueError]       = useState('');
  const [issueSuccess,     setIssueSuccess]     = useState('');
  // Return
  const [returnItemId,     setReturnItemId]     = useState('');
  const [returnQty,        setReturnQty]        = useState(1);
  const [returnCondition,  setReturnCondition]  = useState('Good');
  const [returnNotes,      setReturnNotes]      = useState('');
  const [returning,        setReturning]        = useState(false);
  const [returnError,      setReturnError]      = useState('');
  const [returnSuccess,    setReturnSuccess]    = useState('');

  useEffect(() => { setPrimary(getTeacherColors().primary); }, []);

  // Load overview once
  useEffect(() => {
    setLoadingOv(true);
    teacherApi.get<Overview>('/api/hod/overview')
      .then(r => setOverview(r.data))
      .catch(() => setError('Could not load HOD data. Make sure you are assigned as an HOD.'))
      .finally(() => setLoadingOv(false));
  }, []);

  // ── Results functions ──
  async function loadResultsTab() {
    // Fetch independently so a failure in one doesn't blank out the other
    teacherApi.get<HodClass[]>('/api/hod/classes')
      .then(r => setHodClasses(r.data))
      .catch(() => {});

    if (!academicYears.length) {
      teacherApi.get<Array<{id:string;name:string;is_current:boolean;current_semester:number}>>('/api/academic-years')
        .then(r => {
          setAcademicYears(r.data);
          const current = r.data.find(y => y.is_current);
          if (current && !resultsYear) {
            setResultsYear(current.id);
            setResultsSem(current.current_semester as 1|2);
          }
        })
        .catch(() => {});
    }
  }

  async function loadHodResults() {
    if (!resultsClass || !resultsYear) { setResultsError('Select a class and academic year.'); return; }
    setResultsLoading(true); setResultsError('');
    try {
      const { data } = await teacherApi.get<HodStudentResult[]>(
        `/api/hod/results?academic_year_id=${resultsYear}&semester=${resultsSem}&class_name=${encodeURIComponent(resultsClass)}`
      );
      setHodResults(data);
    } catch (err: unknown) {
      const msg = (err as {response?:{data?:{error?:string}}})?.response?.data?.error;
      setResultsError(msg ?? 'Failed to load results.');
    } finally { setResultsLoading(false); }
  }

  // ── Queue functions ──
  async function loadQueue() {
    setQueueLoading(true);
    try {
      const { data } = await teacherApi.get<HodQueueItem[]>('/api/result-submissions/hod-queue');
      setQueue(data);
    } catch { /* ignore */ }
    finally { setQueueLoading(false); }
  }

  async function openReview(item: HodQueueItem) {
    setReviewTarget(item);
    setReviewAction('approve');
    setReviewComment('');
    setReviewError('');
    setPreviewResults([]);
    setPreviewError('');
    setPreviewLoading(true);
    try {
      const { data } = await teacherApi.get<HodStudentResult[]>(
        `/api/hod/results?academic_year_id=${item.academic_year_id}&semester=${item.semester}&class_name=${encodeURIComponent(item.class_name)}`
      );
      setPreviewResults(data);
    } catch {
      setPreviewError('Could not load results preview.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function submitReview() {
    if (!reviewTarget) return;
    if (reviewAction === 'reject' && !reviewComment.trim()) {
      setReviewError('Please provide a reason for rejection.'); return;
    }
    setReviewing(true); setReviewError('');
    try {
      await teacherApi.post('/api/result-submissions/hod-review', {
        submission_id: reviewTarget.id,
        action: reviewAction,
        comment: reviewComment.trim() || undefined,
      });
      setReviewTarget(null); setReviewComment(''); setReviewAction('approve');
      loadQueue(); // refresh
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setReviewError(msg ?? 'Failed to submit review.');
    } finally { setReviewing(false); }
  }

  // ── Inventory functions ──
  async function loadInvItems() {
    setInvLoading(true);
    try {
      const { data } = await teacherApi.get<InvItem[]>('/api/inventory/items');
      setInvItems(data);
    } catch { /* ignore */ }
    finally { setInvLoading(false); }
  }

  async function lookupStudent() {
    if (!issueStudentCode.trim()) return;
    setIssueStudentLoading(true); setIssueStudentError(''); setIssueStudent(null);
    try {
      const { data } = await teacherApi.get<InvStudent>(`/api/inventory/students/${issueStudentCode.trim().toUpperCase()}`);
      setIssueStudent(data);
      setIssueName(data.name);
    } catch { setIssueStudentError('Student not found'); }
    finally { setIssueStudentLoading(false); }
  }

  async function submitIssue() {
    if (!issueItemId) { setIssueError('Please select an item'); return; }
    const recipientName = issueToType === 'student' ? issueStudent?.name : issueName.trim();
    if (!recipientName) { setIssueError('Recipient name is required'); return; }
    setIssuing(true); setIssueError(''); setIssueSuccess('');
    try {
      await teacherApi.post(`/api/inventory/items/${issueItemId}/issue`, {
        issued_to_name: recipientName,
        issued_to_role: issueRole.trim() || undefined,
        issued_to_type: issueToType,
        student_id: issueToType === 'student' ? issueStudent?.id : undefined,
        quantity: issueQty,
        notes: issueNotes.trim() || undefined,
      });
      setIssueSuccess('Item issued successfully');
      setIssueItemId(''); setIssueName(''); setIssueRole('');
      setIssueQty(1); setIssueNotes(''); setIssueStudent(null); setIssueStudentCode('');
      loadInvItems();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setIssueError(msg ?? 'Failed to issue item');
    } finally { setIssuing(false); }
  }

  async function submitReturn() {
    if (!returnItemId) { setReturnError('Please select an item'); return; }
    setReturning(true); setReturnError(''); setReturnSuccess('');
    try {
      await teacherApi.post(`/api/inventory/items/${returnItemId}/return`, {
        quantity: returnQty,
        condition: returnCondition,
        notes: returnNotes.trim() || undefined,
      });
      setReturnSuccess('Item returned successfully');
      setReturnItemId(''); setReturnQty(1); setReturnCondition('Good'); setReturnNotes('');
      loadInvItems();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setReturnError(msg ?? 'Failed to return item');
    } finally { setReturning(false); }
  }

  // Lazy-load tabs — use refs to guard against infinite re-trigger when loading state changes
  const loadClasses = useCallback(() => {
    if (clTriggered.current) return;
    clTriggered.current = true;
    setLoadingCl(true);
    teacherApi.get<ClassRow[]>('/api/hod/classes')
      .then(r => setClasses(r.data))
      .catch(() => {})
      .finally(() => setLoadingCl(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTeachers = useCallback(() => {
    if (teTriggered.current) return;
    teTriggered.current = true;
    setLoadingTe(true);
    teacherApi.get<TeacherRow[]>('/api/hod/teachers')
      .then(r => setTeachers(r.data))
      .catch(() => {})
      .finally(() => setLoadingTe(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAbsences = useCallback(() => {
    setLoadingAb(true);
    const params = new URLSearchParams();
    if (abTeacher) params.set('teacherId', abTeacher);
    if (abStatus)  params.set('status', abStatus);
    teacherApi.get<AbsenceRow[]>(`/api/hod/absences?${params}`)
      .then(r => setAbsences(r.data))
      .catch(() => {})
      .finally(() => setLoadingAb(false));
  }, [abTeacher, abStatus]);

  useEffect(() => {
    if (tab === 'approvals')  loadQueue();
    if (tab === 'results')    loadResultsTab();
    if (tab === 'classes')    loadClasses();
    if (tab === 'teachers')   loadTeachers();
    if (tab === 'absences')   loadAbsences();
    if (tab === 'inventory')  loadInvItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loadClasses, loadTeachers, loadAbsences]);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',   label: 'Overview' },
    { key: 'approvals',  label: 'Approvals' },
    { key: 'results',    label: 'Results' },
    { key: 'classes',    label: 'Classes' },
    { key: 'teachers',   label: 'Teachers' },
    { key: 'absences',   label: 'Absences' },
    { key: 'inventory',  label: 'Inventory' },
  ];

  const { displayRows: absRows, total: absTotal, page: absPage, setPage: setAbsPage, pageSize: absPageSize, setPageSize: setAbsPageSize } = useTableControls(absences);
  const { displayRows: teacherRows, total: teacherTotal, page: teacherPage, setPage: setTeacherPage, pageSize: teacherPageSize, setPageSize: setTeacherPageSize } = useTableControls(teachers);
  const { displayRows: classRows, total: classTotal, page: classPage, setPage: setClassPage, pageSize: classPageSize, setPageSize: setClassPageSize } = useTableControls(classes);
  const { displayRows: queueRows, total: queueTotal, page: queuePage, setPage: setQueuePage, pageSize: queuePageSize, setPageSize: setQueuePageSize } = useTableControls(queue);
  const sortedHodResults = useMemo(() => [...hodResults].sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999)), [hodResults]);
  const { displayRows: hodResultRows, total: hodResultTotal, page: hodResultPage, setPage: setHodResultPage, pageSize: hodResultPageSize, setPageSize: setHodResultPageSize } = useTableControls(sortedHodResults);

  // ── Spinner ──
  function Spinner() {
    return (
      <div className="flex justify-center py-16">
        <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: '#F4EFE6' }}>

      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#2C2218]">
              {overview?.programme_name ?? 'My Department'}
            </h1>
            <p className="text-xs text-[#8C7E6E]">
              {overview?.hod_type === 'subject' ? 'Subject HOD Dashboard' : 'HOD Dashboard'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 mb-4">
        <div className="flex gap-1 bg-white rounded-2xl p-1 border border-[#E2D9CC]">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
              style={tab === t.key
                ? { background: primary, color: '#fff' }
                : { color: '#8C7E6E' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="px-4">

        {/* ── Overview ── */}
        {tab === 'overview' && (
          loadingOv ? <Spinner /> : overview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Teachers"         value={overview.teacher_count} />
                <StatCard label="Classes"          value={overview.class_count} />
                <StatCard label="Students"         value={overview.student_count} />
                <StatCard label="Outstanding Absences" value={overview.outstanding_absences}
                  accent={overview.outstanding_absences > 0 ? '#B91C1C' : undefined} />
                <StatCard label="Pending Remedials"    value={overview.pending_remedials}
                  accent={overview.pending_remedials > 0 ? '#92400E' : undefined} />
                <StatCard label="Assessments (Term)"   value={overview.assessments_total}
                  sub={`${overview.assessments_scored} with scores recorded`} accent={primary} />
              </div>

              {/* Assessment progress bar */}
              {overview.assessments_total > 0 && (
                <div className="bg-white rounded-2xl border border-[#E2D9CC] p-4">
                  <div className="flex justify-between text-xs font-semibold text-[#4A3F32] mb-2">
                    <span>Scores recorded</span>
                    <span>{overview.assessments_scored}/{overview.assessments_total}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round((overview.assessments_scored / overview.assessments_total) * 100)}%`,
                        backgroundColor: primary,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : null
        )}

        {/* ── Approvals ── */}
        {tab === 'approvals' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Pending Review</h3>
                <p style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Results submitted by teachers awaiting your approval.</p>
              </div>
              <button onClick={loadQueue} style={{ fontSize: 12, color: '#15803D', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Refresh</button>
            </div>

            {queueLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Loading…</div>
            ) : queue.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 14 }}>No pending submissions.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(queueRows as typeof queue).map(item => (
                  <div key={item.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{item.subject}</p>
                        <p style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{item.class_name} · {item.academic_year} Sem {item.semester} · {item.teacher_name}</p>
                        <p style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                          {item.scored_count} of {item.student_count} students scored · Submitted {new Date(item.submitted_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => openReview(item)}
                          style={{ background: '#15803D', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!queueLoading && queue.length > 0 && (
              <Pagination page={queuePage} pageSize={queuePageSize} total={queueTotal} onPage={setQueuePage} onPageSize={(s) => { setQueuePageSize(s); setQueuePage(1); }} />
            )}

            {/* Review modal */}
            {reviewTarget && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                onClick={() => setReviewTarget(null)}>
                <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
                  onClick={e => e.stopPropagation()}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Review Submission</h3>
                  <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>{reviewTarget.subject} · {reviewTarget.class_name} · {reviewTarget.teacher_name}</p>

                  {/* Results preview */}
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Submitted Results</p>
                    {previewLoading ? (
                      <div style={{ textAlign: 'center', padding: '14px 0', color: '#94A3B8', fontSize: 12 }}>Loading results…</div>
                    ) : previewError ? (
                      <p style={{ fontSize: 12, color: '#DC2626' }}>{previewError}</p>
                    ) : previewResults.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>No result data found for this class.</p>
                    ) : (() => {
                      const subject = reviewTarget.subject;
                      const sorted  = [...previewResults].sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999));
                      return (
                        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC' }}>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                {['Student', 'CA', 'Exam', 'Total', 'Grade'].map(h => (
                                  <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Student' ? 'left' : 'center', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sorted.map((student, idx) => {
                                const sub = student.subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase());
                                return (
                                  <tr key={student.student_id} style={{ borderTop: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                                    <td style={{ padding: '6px 10px', fontWeight: 500, color: '#0F172A' }}>{student.name}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', color: '#374151' }}>{sub?.ca_score != null ? sub.ca_score.toFixed(1) : '—'}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', color: '#374151' }}>{sub?.exam_score != null ? sub.exam_score.toFixed(1) : '—'}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: '#0F172A' }}>{sub?.total != null ? sub.total : '—'}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: sub?.grade?.startsWith('F') || sub?.grade === 'E8' ? '#DC2626' : '#15803D' }}>{sub?.grade ?? '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Toggle approve/reject */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {(['approve', 'reject'] as const).map(a => (
                      <button key={a}
                        onClick={() => { setReviewAction(a); setReviewError(''); }}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: reviewAction === a ? 'none' : '1px solid #E2E8F0',
                          background: reviewAction === a ? (a === 'approve' ? '#15803D' : '#DC2626') : '#F8FAFC',
                          color: reviewAction === a ? '#fff' : '#64748B',
                        }}>
                        {a === 'approve' ? 'Approve' : 'Reject'}
                      </button>
                    ))}
                  </div>

                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    {reviewAction === 'reject' ? 'Reason (required)' : 'Comment (optional)'}
                  </label>
                  <textarea
                    value={reviewComment}
                    onChange={e => { setReviewComment(e.target.value); setReviewError(''); }}
                    placeholder={reviewAction === 'reject' ? 'Explain why this is being returned…' : 'Add an optional note…'}
                    rows={3}
                    style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  {reviewError && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>{reviewError}</p>}

                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button onClick={() => setReviewTarget(null)}
                      style={{ flex: 1, padding: '9px 0', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={submitReview} disabled={reviewing}
                      style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        background: reviewAction === 'approve' ? '#15803D' : '#DC2626', color: '#fff', opacity: reviewing ? 0.7 : 1 }}>
                      {reviewing ? 'Submitting…' : (reviewAction === 'approve' ? 'Approve' : 'Reject & Return')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Results ── */}
        {tab === 'results' && (
          <div>
            <style dangerouslySetInnerHTML={{ __html: `@media print { aside, nav, .no-print { display: none !important; } [class*="ml-60"] { margin-left: 0 !important; } }` }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Class Results</h3>
            <p style={{ fontSize: 12, color: '#64748B', marginBottom: 16 }}>View academic results for classes in your department or programme.</p>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Class</label>
                <select value={resultsClass} onChange={e => setResultsClass(e.target.value)}
                  style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontSize: 13, minWidth: 140, background: '#fff' }}>
                  <option value="">Select class…</option>
                  {hodClasses.map(c => <option key={c.class_name} value={c.class_name}>{c.class_name} ({c.student_count} students)</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Academic Year</label>
                <select value={resultsYear} onChange={e => setResultsYear(e.target.value)}
                  style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontSize: 13, minWidth: 140, background: '#fff' }}>
                  <option value="">Select year…</option>
                  {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Semester</label>
                <select value={resultsSem} onChange={e => setResultsSem(Number(e.target.value) as 1|2)}
                  style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontSize: 13, background: '#fff' }}>
                  <option value={1}>Semester 1</option>
                  <option value={2}>Semester 2</option>
                </select>
              </div>
              <button onClick={loadHodResults} disabled={resultsLoading || !resultsClass || !resultsYear}
                style={{ background: '#15803D', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (resultsLoading || !resultsClass || !resultsYear) ? 0.5 : 1 }}>
                {resultsLoading ? 'Loading…' : 'View Results'}
              </button>
              {hodResults.length > 0 && (
                <button onClick={() => window.print()}
                  className="no-print"
                  style={{ background: '#fff', color: '#374151', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print Report
                </button>
              )}
            </div>

            {resultsError && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{resultsError}</p>}

            {hodResults.length > 0 && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
                {/* Summary stats */}
                <div style={{ padding: '12px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {(() => {
                    const withAvg = hodResults.filter(r => r.average !== null);
                    const avg = withAvg.length ? (withAvg.reduce((s,r) => s+(r.average??0),0)/withAvg.length).toFixed(1) : '—';
                    const passing = withAvg.filter(r => (r.average??0) >= 40).length;
                    return (
                      <>
                        <span style={{ fontSize: 12, color: '#374151' }}><strong>{hodResults.length}</strong> students</span>
                        <span style={{ fontSize: 12, color: '#374151' }}>Class avg: <strong>{avg}%</strong></span>
                        <span style={{ fontSize: 12, color: '#374151' }}>Passing: <strong style={{ color: '#15803D' }}>{passing}</strong></span>
                        <span style={{ fontSize: 12, color: '#374151' }}>At risk: <strong style={{ color: '#DC2626' }}>{withAvg.filter(r=>(r.average??0)<40).length}</strong></span>
                      </>
                    );
                  })()}
                </div>

                {/* Results table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748B', fontSize: 11, textTransform: 'uppercase' }}>Pos</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748B', fontSize: 11, textTransform: 'uppercase' }}>Student</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748B', fontSize: 11, textTransform: 'uppercase' }}>Average</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748B', fontSize: 11, textTransform: 'uppercase' }}>Subjects</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748B', fontSize: 11, textTransform: 'uppercase' }}>Status</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748B', fontSize: 11, textTransform: 'uppercase' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(hodResultRows as typeof sortedHodResults).map((student, idx) => (
                        <>
                          <tr key={student.student_id}
                            style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#374151' }}>{student.class_position ?? '—'}</td>
                            <td style={{ padding: '10px 12px' }}>
                              <p style={{ fontWeight: 600, color: '#0F172A', margin: 0 }}>{student.name}</p>
                              <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>{student.student_code}</p>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: student.average !== null && student.average >= 40 ? '#15803D' : '#DC2626' }}>
                              {student.average !== null ? student.average + '%' : '—'}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: '#374151' }}>{student.subjects.length}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              {student.average !== null && student.average < 40 ? (
                                <span style={{ background: '#FEE2E2', color: '#DC2626', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>AT RISK</span>
                              ) : student.average !== null ? (
                                <span style={{ background: '#DCFCE7', color: '#15803D', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>PASSING</span>
                              ) : null}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <button onClick={() => setExpandedStudent(expandedStudent === student.student_id ? null : student.student_id)}
                                style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', color: '#64748B' }}>
                                {expandedStudent === student.student_id ? 'Hide' : 'Details'}
                              </button>
                            </td>
                          </tr>
                          {expandedStudent === student.student_id && (
                            <tr key={student.student_id + '_detail'}>
                              <td colSpan={6} style={{ padding: '0 12px 12px 28px', background: '#F8FAFC' }}>
                                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ color: '#64748B' }}>
                                      <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Subject</th>
                                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>CA</th>
                                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>Exam</th>
                                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>Total</th>
                                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>Grade</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {student.subjects.map(sub => (
                                      <tr key={sub.subject} style={{ borderTop: '1px solid #E2E8F0' }}>
                                        <td style={{ padding: '5px 8px', color: '#374151' }}>{sub.subject}</td>
                                        <td style={{ padding: '5px 8px', textAlign: 'center', color: '#64748B' }}>{sub.ca_score != null ? sub.ca_score.toFixed(1) : '—'}</td>
                                        <td style={{ padding: '5px 8px', textAlign: 'center', color: '#64748B' }}>{sub.exam_score != null ? sub.exam_score.toFixed(1) : '—'}</td>
                                        <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600, color: '#0F172A' }}>{sub.total != null ? sub.total : '—'}</td>
                                        <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: sub.grade?.startsWith('F') || sub.grade==='E8' ? '#DC2626' : '#15803D' }}>{sub.grade ?? '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {hodResults.length > 0 && (
              <Pagination page={hodResultPage} pageSize={hodResultPageSize} total={hodResultTotal} onPage={setHodResultPage} onPageSize={(s) => { setHodResultPageSize(s); setHodResultPage(1); }} />
            )}
          </div>
        )}

        {/* ── Classes ── */}
        {tab === 'classes' && (
          loadingCl ? <Spinner /> : classes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
              <p className="text-sm text-[#8C7E6E]">
                {overview?.hod_type === 'subject'
                  ? 'No timetable entries found for this subject.'
                  : 'No classes found for this programme.'}
              </p>
              <p className="text-xs text-[#C0B5A5] mt-1">
                {overview?.hod_type === 'subject'
                  ? 'Ensure the timetable is set up and teachers have the correct department.'
                  : 'Ensure students have the correct programme assigned.'}
              </p>
            </div>
          ) : (
            <>
            <div className="space-y-3">
              {(classRows as typeof classes).map(cls => {
                const isSubject = overview?.hod_type === 'subject';
                const teacherName  = isSubject ? cls.teacher_name  : cls.form_teacher_name;
                const teacherPhone = isSubject ? cls.teacher_phone : cls.form_teacher_phone;
                const teacherEmail = isSubject ? cls.teacher_email : cls.form_teacher_email;
                const roleLabel    = isSubject ? `${overview?.department} Teacher` : 'Form Teacher';
                const assignedLabel = isSubject ? 'Teacher assigned' : 'Form teacher assigned';
                const missingLabel  = isSubject ? 'No teacher on timetable' : 'Unassigned';

                return (
                  <div key={cls.class_name} className="bg-white rounded-2xl border border-[#E2D9CC] p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#2C2218]">{cls.class_name}</p>
                        <p className="text-xs text-[#8C7E6E] mt-0.5">{cls.student_count} student{cls.student_count !== 1 ? 's' : ''}</p>
                      </div>
                      {teacherName ? (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2" style={{ background: '#F0FDF4', color: '#15803D' }}>
                          {assignedLabel}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2" style={{ background: '#FEF9C3', color: '#92400E' }}>
                          {missingLabel}
                        </span>
                      )}
                    </div>
                    {teacherName ? (
                      <div className="mt-3 pt-3 border-t border-[#F4EFE6]">
                        <p className="text-xs font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">{roleLabel}</p>
                        <p className="text-sm font-semibold text-[#2C2218]">{teacherName}</p>
                        <div className="flex gap-4 mt-1">
                          {teacherPhone && (
                            <a href={`tel:${teacherPhone}`} className="text-xs text-[#8C7E6E]">
                              📞 {teacherPhone}
                            </a>
                          )}
                          {teacherEmail && (
                            <a href={`mailto:${teacherEmail}`} className="text-xs text-[#8C7E6E]">
                              ✉ {teacherEmail}
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[#C0B5A5] mt-2 italic">
                        {isSubject
                          ? `No ${overview?.department} lesson found on the timetable for this class.`
                          : 'No form teacher assigned for this class this term.'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <Pagination page={classPage} pageSize={classPageSize} total={classTotal} onPage={setClassPage} onPageSize={(s) => { setClassPageSize(s); setClassPage(1); }} />
            </>
          )
        )}

        {/* ── Teachers ── */}
        {tab === 'teachers' && (
          loadingTe ? <Spinner /> : teachers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
              <p className="text-sm text-[#8C7E6E]">No teachers found in this department.</p>
            </div>
          ) : (
            <>
            <div className="space-y-3">
              {(teacherRows as typeof teachers).map(t => (
                <div key={t.id} className="bg-white rounded-2xl border border-[#E2D9CC] p-4 space-y-3">
                  {/* Name row */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#2C2218]">{t.name}</p>
                      <p className="text-xs text-[#8C7E6E]">{t.teacher_code}</p>
                    </div>
                    {t.form_class && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2"
                        style={{ background: `${primary}18`, color: primary }}>
                        Form: {t.form_class}
                      </span>
                    )}
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl px-3 py-2.5" style={{ background: t.outstanding_absences > 0 ? '#FEF2F2' : '#F8FAFC' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#8C7E6E]">Absences</p>
                      <p className="text-lg font-bold mt-0.5" style={{ color: t.outstanding_absences > 0 ? '#B91C1C' : '#0F172A' }}>
                        {t.outstanding_absences}
                      </p>
                      <p className="text-[10px] text-[#94A3B8]">outstanding</p>
                    </div>
                    <div className="rounded-xl px-3 py-2.5" style={{ background: t.pending_remedials > 0 ? '#FEF9C3' : '#F8FAFC' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#8C7E6E]">Remedials</p>
                      <p className="text-lg font-bold mt-0.5" style={{ color: t.pending_remedials > 0 ? '#92400E' : '#0F172A' }}>
                        {t.pending_remedials}
                      </p>
                      <p className="text-[10px] text-[#94A3B8]">pending</p>
                    </div>
                  </div>

                  {/* Assessments */}
                  <div className="rounded-xl px-3 py-2.5 bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#8C7E6E]">Assessments this term</p>
                      <span className="text-xs font-bold text-[#0F172A]">
                        {t.assessments_with_scores}/{t.assessments_total} scored
                      </span>
                    </div>
                    {t.assessments_total > 0 ? (
                      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round((t.assessments_with_scores / t.assessments_total) * 100)}%`,
                            backgroundColor: primary,
                          }}
                        />
                      </div>
                    ) : (
                      <p className="text-[10px] text-[#C0B5A5] italic">No assessments recorded yet</p>
                    )}
                  </div>

                  {/* Last attendance */}
                  <p className="text-[10px] text-[#C0B5A5]">
                    Last attendance: {t.last_attendance_date ? fmt(t.last_attendance_date) : '—'}
                  </p>
                </div>
              ))}
            </div>
            <Pagination page={teacherPage} pageSize={teacherPageSize} total={teacherTotal} onPage={setTeacherPage} onPageSize={(s) => { setTeacherPageSize(s); setTeacherPage(1); }} />
            </>
          )
        )}

        {/* ── Inventory ── */}
        {tab === 'inventory' && (() => {
          const condColor = (c: string) =>
            c === 'Good'       ? { color: '#15803D', bg: '#F0FDF4' } :
            c === 'Damaged'    ? { color: '#92400E', bg: '#FEF9C3' } :
                                 { color: '#B91C1C', bg: '#FEF2F2' };

          const issuableItems = invItems.filter(i => i.condition !== 'Written Off' && i.quantity_available > 0);
          const returnableItems = invItems.filter(i => i.quantity_available < i.quantity_total);

          return (
            <div className="space-y-4">
              {/* Sub-tab bar */}
              <div className="flex gap-1 bg-white rounded-xl p-1 border border-[#E2D9CC]">
                {(['items', 'issue', 'return'] as InvSubTab[]).map(st => (
                  <button key={st}
                    onClick={() => { setInvSubTab(st); setIssueError(''); setIssueSuccess(''); setReturnError(''); setReturnSuccess(''); }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize"
                    style={invSubTab === st ? { background: primary, color: '#fff' } : { color: '#8C7E6E' }}>
                    {st === 'items' ? 'Items' : st === 'issue' ? 'Issue Item' : 'Return Item'}
                  </button>
                ))}
              </div>

              {/* ── Items list ── */}
              {invSubTab === 'items' && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[#8C7E6E]">{invItems.length} item{invItems.length !== 1 ? 's' : ''} in your department</p>
                    <button onClick={loadInvItems} className="text-xs font-semibold" style={{ color: primary }}>Refresh</button>
                  </div>
                  {invLoading ? <Spinner /> : invItems.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
                      <p className="text-sm text-[#8C7E6E]">No inventory items assigned to your department.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {invItems.map(item => {
                        const cc = condColor(item.condition);
                        return (
                          <div key={item.id} className="bg-white rounded-2xl border border-[#E2D9CC] p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-[#2C2218]">{item.name}</p>
                                <div className="flex flex-wrap gap-2 mt-1 items-center">
                                  {item.asset_tag && (
                                    <span className="text-[10px] font-mono font-semibold text-[#8C7E6E] bg-[#F4EFE6] px-1.5 py-0.5 rounded">
                                      {item.asset_tag}
                                    </span>
                                  )}
                                  {item.category_name && (
                                    <span className="text-[10px] text-[#8C7E6E]">{item.category_name}</span>
                                  )}
                                  {item.location && (
                                    <span className="text-[10px] text-[#8C7E6E]">📍 {item.location}</span>
                                  )}
                                </div>
                              </div>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                                style={{ color: cc.color, background: cc.bg }}>{item.condition}</span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-[#F4EFE6] flex gap-4">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#8C7E6E]">Available</p>
                                <p className="text-base font-bold" style={{ color: item.quantity_available > 0 ? '#15803D' : '#B91C1C' }}>
                                  {item.quantity_available}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#8C7E6E]">Total</p>
                                <p className="text-base font-bold text-[#2C2218]">{item.quantity_total}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#8C7E6E]">Issued</p>
                                <p className="text-base font-bold text-[#92400E]">{item.quantity_total - item.quantity_available}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ── Issue form ── */}
              {invSubTab === 'issue' && (
                <div className="bg-white rounded-2xl border border-[#E2D9CC] p-4 space-y-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Item</label>
                    <select value={issueItemId} onChange={e => setIssueItemId(e.target.value)}
                      className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm bg-white text-[#2C2218] focus:outline-none">
                      <option value="">Select item…</option>
                      {issuableItems.map(i => (
                        <option key={i.id} value={i.id}>{i.name}{i.asset_tag ? ` (${i.asset_tag})` : ''} — {i.quantity_available} available</option>
                      ))}
                    </select>
                    {issuableItems.length === 0 && (
                      <p className="text-xs text-[#8C7E6E] mt-1">No items currently available to issue.</p>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Issue to</label>
                    <div className="flex gap-1 bg-[#F4EFE6] rounded-xl p-1">
                      {(['staff', 'student', 'department'] as const).map(t => (
                        <button key={t} onClick={() => { setIssueToType(t); setIssueStudent(null); setIssueStudentCode(''); setIssueName(''); setIssueStudentError(''); }}
                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors"
                          style={issueToType === t ? { background: '#fff', color: primary, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#8C7E6E' }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {issueToType === 'student' ? (
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Student Code</label>
                      <div className="flex gap-2">
                        <input value={issueStudentCode} onChange={e => setIssueStudentCode(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && lookupStudent()}
                          placeholder="e.g. STU001"
                          className="flex-1 rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
                        <button onClick={lookupStudent} disabled={issueStudentLoading}
                          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                          style={{ background: primary, opacity: issueStudentLoading ? 0.6 : 1 }}>
                          {issueStudentLoading ? '…' : 'Find'}
                        </button>
                      </div>
                      {issueStudentError && <p className="text-xs text-red-600 mt-1">{issueStudentError}</p>}
                      {issueStudent && (
                        <div className="mt-2 bg-[#F0FDF4] border border-green-200 rounded-xl px-3 py-2">
                          <p className="text-sm font-semibold text-[#15803D]">{issueStudent.name}</p>
                          <p className="text-xs text-[#8C7E6E]">{issueStudent.student_code}{issueStudent.class_name ? ` · ${issueStudent.class_name}` : ''}</p>
                        </div>
                      )}
                    </div>
                  ) : issueToType === 'department' ? (
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Department / Section</label>
                      <input value={issueName} onChange={e => setIssueName(e.target.value)}
                        placeholder="e.g. Science Lab"
                        className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Staff Name</label>
                        <input value={issueName} onChange={e => setIssueName(e.target.value)}
                          placeholder="Full name"
                          className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Role / Title (optional)</label>
                        <input value={issueRole} onChange={e => setIssueRole(e.target.value)}
                          placeholder="e.g. Lab Technician"
                          className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Quantity</label>
                    <input type="number" min={1} value={issueQty} onChange={e => setIssueQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Notes (optional)</label>
                    <textarea value={issueNotes} onChange={e => setIssueNotes(e.target.value)}
                      rows={2} placeholder="Purpose of issue, duration, etc."
                      className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none resize-none" />
                  </div>

                  {issueError   && <p className="text-sm text-red-600">{issueError}</p>}
                  {issueSuccess && <p className="text-sm text-green-700 font-semibold">{issueSuccess}</p>}

                  <button onClick={submitIssue} disabled={issuing}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: primary, opacity: issuing ? 0.6 : 1 }}>
                    {issuing ? 'Issuing…' : 'Issue Item'}
                  </button>
                </div>
              )}

              {/* ── Return form ── */}
              {invSubTab === 'return' && (
                <div className="bg-white rounded-2xl border border-[#E2D9CC] p-4 space-y-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Item Being Returned</label>
                    <select value={returnItemId} onChange={e => setReturnItemId(e.target.value)}
                      className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm bg-white text-[#2C2218] focus:outline-none">
                      <option value="">Select item…</option>
                      {returnableItems.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name}{i.asset_tag ? ` (${i.asset_tag})` : ''} — {i.quantity_total - i.quantity_available} issued
                        </option>
                      ))}
                    </select>
                    {returnableItems.length === 0 && (
                      <p className="text-xs text-[#8C7E6E] mt-1">No items are currently issued.</p>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Quantity Returned</label>
                    <input type="number" min={1} value={returnQty} onChange={e => setReturnQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Condition on Return</label>
                    <div className="flex gap-1 bg-[#F4EFE6] rounded-xl p-1">
                      {(['Good', 'Damaged'] as const).map(c => (
                        <button key={c} onClick={() => setReturnCondition(c)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          style={returnCondition === c
                            ? { background: '#fff', color: c === 'Good' ? '#15803D' : '#92400E', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                            : { color: '#8C7E6E' }}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Notes (optional)</label>
                    <textarea value={returnNotes} onChange={e => setReturnNotes(e.target.value)}
                      rows={2} placeholder="Any remarks on the item's condition…"
                      className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none resize-none" />
                  </div>

                  {returnError   && <p className="text-sm text-red-600">{returnError}</p>}
                  {returnSuccess && <p className="text-sm text-green-700 font-semibold">{returnSuccess}</p>}

                  <button onClick={submitReturn} disabled={returning}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: primary, opacity: returning ? 0.6 : 1 }}>
                    {returning ? 'Recording…' : 'Record Return'}
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Absences ── */}
        {tab === 'absences' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <select
                value={abTeacher}
                onChange={e => setAbTeacher(e.target.value)}
                className="flex-1 min-w-[140px] rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm bg-white text-[#2C2218] focus:outline-none"
              >
                <option value="">All teachers</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select
                value={abStatus}
                onChange={e => setAbStatus(e.target.value)}
                className="flex-1 min-w-[140px] rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm bg-white text-[#2C2218] focus:outline-none"
              >
                <option value="">All statuses</option>
                {['Absent','Remedial Scheduled','Made Up','Cleared','Verified','Excused'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                onClick={loadAbsences}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: primary }}
              >
                Filter
              </button>
            </div>

            {loadingAb ? <Spinner /> : absences.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
                <p className="text-sm text-[#8C7E6E]">No absences found.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(absRows as typeof absences).map(ab => {
                  const style = ABSENCE_STATUS_STYLE[ab.status] ?? { color: '#64748B', bg: '#F1F5F9' };
                  return (
                    <div key={ab.id} className="bg-white rounded-2xl border border-[#E2D9CC] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#2C2218]">{ab.teacher_name}</p>
                          <p className="text-xs text-[#475569]">{ab.subject} — {ab.class_name}</p>
                          <p className="text-xs text-[#8C7E6E] mt-0.5">{fmt(ab.date)}</p>
                          {ab.reason && <p className="text-xs text-[#8C7E6E] italic mt-0.5">"{ab.reason}"</p>}
                        </div>
                        <Badge label={ab.status} color={style.color} bg={style.bg} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Pagination page={absPage} pageSize={absPageSize} total={absTotal} onPage={setAbsPage} onPageSize={(s) => { setAbsPageSize(s); setAbsPage(1); }} />
          </div>
        )}
      </div>
    </div>
  );
}
