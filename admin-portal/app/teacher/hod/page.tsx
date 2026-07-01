'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

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
  semester: number;
  student_count: number;
  scored_count: number;
}

type Tab = 'overview' | 'approvals' | 'classes' | 'teachers' | 'absences';

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

  const [abTeacher, setAbTeacher] = useState('');
  const [abStatus,  setAbStatus]  = useState('');

  const [error, setError] = useState('');

  // ── Approvals state ──
  const [queue,         setQueue]         = useState<HodQueueItem[]>([]);
  const [queueLoading,  setQueueLoading]  = useState(false);
  const [reviewTarget,  setReviewTarget]  = useState<HodQueueItem | null>(null);
  const [reviewAction,  setReviewAction]  = useState<'approve' | 'reject'>('approve');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewing,     setReviewing]     = useState(false);
  const [reviewError,   setReviewError]   = useState('');

  useEffect(() => { setPrimary(getTeacherColors().primary); }, []);

  // Load overview once
  useEffect(() => {
    setLoadingOv(true);
    teacherApi.get<Overview>('/api/hod/overview')
      .then(r => setOverview(r.data))
      .catch(() => setError('Could not load HOD data. Make sure you are assigned as an HOD.'))
      .finally(() => setLoadingOv(false));
  }, []);

  // ── Queue functions ──
  async function loadQueue() {
    setQueueLoading(true);
    try {
      const { data } = await teacherApi.get<HodQueueItem[]>('/api/result-submissions/hod-queue');
      setQueue(data);
    } catch { /* ignore */ }
    finally { setQueueLoading(false); }
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

  // Lazy-load tabs
  const loadClasses = useCallback(() => {
    if (loadingCl || classes.length) return;
    setLoadingCl(true);
    teacherApi.get<ClassRow[]>('/api/hod/classes')
      .then(r => setClasses(r.data))
      .catch(() => {})
      .finally(() => setLoadingCl(false));
  }, [loadingCl, classes.length]);

  const loadTeachers = useCallback(() => {
    if (loadingTe || teachers.length) return;
    setLoadingTe(true);
    teacherApi.get<TeacherRow[]>('/api/hod/teachers')
      .then(r => setTeachers(r.data))
      .catch(() => {})
      .finally(() => setLoadingTe(false));
  }, [loadingTe, teachers.length]);

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
    if (tab === 'approvals') loadQueue();
    if (tab === 'classes')   loadClasses();
    if (tab === 'teachers')  loadTeachers();
    if (tab === 'absences')  loadAbsences();
  }, [tab, loadClasses, loadTeachers, loadAbsences]);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',   label: 'Overview' },
    { key: 'approvals',  label: 'Approvals' },
    { key: 'classes',    label: 'Classes' },
    { key: 'teachers',   label: 'Teachers' },
    { key: 'absences',   label: 'Absences' },
  ];

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
                {queue.map(item => (
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
                          onClick={() => { setReviewTarget(item); setReviewAction('approve'); setReviewComment(''); setReviewError(''); }}
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

            {/* Review modal */}
            {reviewTarget && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                onClick={() => setReviewTarget(null)}>
                <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
                  onClick={e => e.stopPropagation()}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Review Submission</h3>
                  <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>{reviewTarget.subject} · {reviewTarget.class_name} · {reviewTarget.teacher_name}</p>

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
            <div className="space-y-3">
              {classes.map(cls => {
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
          )
        )}

        {/* ── Teachers ── */}
        {tab === 'teachers' && (
          loadingTe ? <Spinner /> : teachers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
              <p className="text-sm text-[#8C7E6E]">No teachers found in this department.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {teachers.map(t => (
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
          )
        )}

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
                {absences.map(ab => {
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
          </div>
        )}
      </div>
    </div>
  );
}
