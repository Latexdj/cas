'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
  current_semester?: number;
}

interface TimetableAssignments {
  subjects: string[];
  classes: string[];
}

interface Course {
  id: string;
  subject_name: string;
  class_name: string;
  teacher_name?: string;
  status: 'draft' | 'published' | 'archived';
  lesson_count: number;
  assignment_count: number;
  quiz_count: number;
  pending_submissions: number;
  academic_year_id: string;
  semester?: number | null;
  description?: string;
}

const INPUT = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600';

function StatusBadge({ status }: { status: Course['status'] }) {
  const map = {
    draft: 'bg-slate-100 text-slate-600',
    published: 'bg-green-100 text-green-700',
    archived: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${map[status]}`}>
      {status}
    </span>
  );
}

function NewCourseModal({
  years,
  primary,
  onClose,
  onCreated,
}: {
  years: AcademicYear[];
  primary: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [subjectName, setSubjectName] = useState('');
  const [className, setClassName] = useState('');
  const [yearId, setYearId] = useState(years.find(y => y.is_current)?.id ?? years[0]?.id ?? '');
  const [semester, setSemester] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    teacherApi.get<TimetableAssignments>('/api/lms/my-timetable-assignments')
      .then(r => {
        setSubjects(r.data?.subjects ?? []);
        setClasses(r.data?.classes ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingAssignments(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectName || !className || !yearId) {
      setError('Subject, class, and academic year are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await teacherApi.post('/api/lms/courses', {
        subject_name: subjectName,
        class_name: className,
        academic_year_id: yearId,
        semester: semester ? parseInt(semester) : null,
        description: description.trim() || null,
      });
      onCreated();
    } catch {
      setError('Failed to create course. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">New Course</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm font-bold hover:bg-slate-200">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {!loadingAssignments && subjects.length === 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              You have no timetable assignments yet. Ask your admin to assign you subjects and classes in the timetable before creating a course.
            </p>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Subject</label>
            <select className={INPUT} required value={subjectName} onChange={e => setSubjectName(e.target.value)} disabled={loadingAssignments}>
              <option value="">{loadingAssignments ? 'Loading…' : 'Select subject…'}</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Class</label>
            <select className={INPUT} required value={className} onChange={e => setClassName(e.target.value)} disabled={loadingAssignments}>
              <option value="">{loadingAssignments ? 'Loading…' : 'Select class…'}</option>
              {classes.map(cl => <option key={cl} value={cl}>{cl}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Academic Year</label>
            <select className={INPUT} value={yearId} onChange={e => setYearId(e.target.value)}>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Semester (optional)</label>
            <select className={INPUT} value={semester} onChange={e => setSemester(e.target.value)}>
              <option value="">— Any Semester —</option>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Description (optional)</label>
            <textarea className={INPUT} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief course description…" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button
              type="submit"
              disabled={saving || loadingAssignments || subjects.length === 0}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: primary }}
            >
              {saving ? 'Creating…' : 'Create Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CoursesContent() {
  const [primary, setPrimary] = useState('#2ab289');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [semester, setSemester] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadCourses = useCallback(async (yId: string, sem: string) => {
    if (!yId) return;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { academic_year_id: yId };
      if (sem) params.semester = sem;
      const { data } = await teacherApi.get<Course[]>('/api/lms/my-courses', { params });
      setCourses(data ?? []);
    } catch {
      setError('Failed to load courses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    teacherApi.get<AcademicYear[]>('/api/academic-years').then(({ data }) => {
      setYears(data ?? []);
      const current = data?.find(y => y.is_current) ?? data?.[0];
      if (!current) { setLoading(false); return; }
      setYearId(current.id);
      loadCourses(current.id, '');
    }).catch(() => { setError('Failed to load academic years.'); setLoading(false); });
  }, [loadCourses]);

  async function toggleStatus(course: Course) {
    const next = course.status === 'published' ? 'draft' : 'published';
    setTogglingId(course.id);
    try {
      await teacherApi.patch(`/api/lms/courses/${course.id}`, { status: next });
      setCourses(prev => prev.map(c => c.id === course.id ? { ...c, status: next } : c));
    } catch {
      /* ignore */
    } finally {
      setTogglingId(null);
    }
  }

  function handleYearChange(id: string) {
    setYearId(id);
    loadCourses(id, semester);
  }

  function handleSemesterChange(sem: string) {
    setSemester(sem);
    loadCourses(yearId, sem);
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-10" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">My LMS Courses</h1>
          <p className="text-sm text-[#8C7E6E] mt-0.5">Manage your online courses</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm"
          style={{ background: primary }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Course
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-5 flex gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-[#8C7E6E] mb-1.5 uppercase tracking-wide">Academic Year</p>
          <div className="relative">
            <select
              value={yearId}
              onChange={e => handleYearChange(e.target.value)}
              className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-8 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
            >
              {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
        <div className="w-40 shrink-0">
          <p className="text-[10px] font-semibold text-[#8C7E6E] mb-1.5 uppercase tracking-wide">Semester</p>
          <div className="relative">
            <select
              value={semester}
              onChange={e => handleSemesterChange(e.target.value)}
              className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-8 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
            >
              <option value="">All Semesters</option>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-48 animate-pulse" />)}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white border border-[#E2D9CC] flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-[#C8BFB5]">
              <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#8C7E6E]">No courses yet</p>
          <p className="text-xs text-[#C8BFB5] mt-1 mb-4">Get started by creating your first course</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: primary }}
          >
            Create your first course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(course => (
            <div key={course.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm flex flex-col overflow-hidden">
              <div className="h-1.5 w-full" style={{ background: primary }} />
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-[#2C2218] leading-tight">{course.subject_name}</h3>
                  <StatusBadge status={course.status} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{course.class_name}</span>
                  {course.teacher_name && (
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: primary }}>{course.teacher_name}</span>
                  )}
                  {course.semester && (
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Sem {course.semester}</span>
                  )}
                </div>
                <p className="text-xs text-[#8C7E6E]">
                  {course.lesson_count} lessons · {course.assignment_count} assignments · {course.quiz_count} quizzes
                </p>
                {course.pending_submissions > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-full px-2.5 py-0.5 w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                    {course.pending_submissions} pending
                  </span>
                )}
              </div>
              <div className="px-4 pb-4 flex gap-2">
                <Link
                  href={`/teacher/lms/${course.id}`}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-sm font-bold text-white"
                  style={{ background: primary }}
                >
                  Open Course
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
                <button
                  onClick={() => toggleStatus(course)}
                  disabled={togglingId === course.id}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {togglingId === course.id ? '…' : course.status === 'published' ? 'Unpublish' : 'Publish'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NewCourseModal
          years={years}
          primary={primary}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); loadCourses(yearId, semester); }}
        />
      )}
    </div>
  );
}

export default function LmsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}>
        <div className="w-7 h-7 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" />
      </div>
    }>
      <CoursesContent />
    </Suspense>
  );
}
