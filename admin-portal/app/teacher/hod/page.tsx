'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Overview {
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

interface ClassRow {
  class_name:          string;
  student_count:       number;
  form_teacher_id:     string | null;
  form_teacher_name:   string | null;
  form_teacher_phone:  string | null;
  form_teacher_email:  string | null;
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

type Tab = 'overview' | 'classes' | 'teachers' | 'absences';

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

  useEffect(() => { setPrimary(getTeacherColors().primary); }, []);

  // Load overview once
  useEffect(() => {
    setLoadingOv(true);
    teacherApi.get<Overview>('/api/hod/overview')
      .then(r => setOverview(r.data))
      .catch(() => setError('Could not load HOD data. Make sure you are assigned as an HOD.'))
      .finally(() => setLoadingOv(false));
  }, []);

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
    if (tab === 'classes')  loadClasses();
    if (tab === 'teachers') loadTeachers();
    if (tab === 'absences') loadAbsences();
  }, [tab, loadClasses, loadTeachers, loadAbsences]);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'classes',   label: 'Classes' },
    { key: 'teachers',  label: 'Teachers' },
    { key: 'absences',  label: 'Absences' },
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
            <p className="text-xs text-[#8C7E6E]">HOD Dashboard</p>
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

        {/* ── Classes ── */}
        {tab === 'classes' && (
          loadingCl ? <Spinner /> : classes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
              <p className="text-sm text-[#8C7E6E]">No classes found for this programme.</p>
              <p className="text-xs text-[#C0B5A5] mt-1">Ensure students have the correct programme assigned.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {classes.map(cls => (
                <div key={cls.class_name} className="bg-white rounded-2xl border border-[#E2D9CC] p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#2C2218]">{cls.class_name}</p>
                      <p className="text-xs text-[#8C7E6E] mt-0.5">{cls.student_count} student{cls.student_count !== 1 ? 's' : ''}</p>
                    </div>
                    {cls.form_teacher_name ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#F0FDF4', color: '#15803D' }}>
                        Form teacher assigned
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#FEF9C3', color: '#92400E' }}>
                        Unassigned
                      </span>
                    )}
                  </div>
                  {cls.form_teacher_name ? (
                    <div className="mt-3 pt-3 border-t border-[#F4EFE6]">
                      <p className="text-xs font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Form Teacher</p>
                      <p className="text-sm font-semibold text-[#2C2218]">{cls.form_teacher_name}</p>
                      <div className="flex gap-4 mt-1">
                        {cls.form_teacher_phone && (
                          <a href={`tel:${cls.form_teacher_phone}`} className="text-xs text-[#8C7E6E]">
                            📞 {cls.form_teacher_phone}
                          </a>
                        )}
                        {cls.form_teacher_email && (
                          <a href={`mailto:${cls.form_teacher_email}`} className="text-xs text-[#8C7E6E]">
                            ✉ {cls.form_teacher_email}
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#C0B5A5] mt-2 italic">No form teacher assigned for this class this term.</p>
                  )}
                </div>
              ))}
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
