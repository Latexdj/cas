'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Stats {
  active_courses: number;
  published_lessons: number;
  active_assignments: number;
  pending_grades: number;
  pasco_questions: number;
}

interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
}

interface Teacher {
  id: string;
  name: string;
}

interface Course {
  id: string;
  teacher_id: string;
  teacher_name: string;
  subject_name: string;
  class_name: string;
  academic_year_name: string;
  term: number | null;
  lesson_count: number;
  assignment_count: number;
  quiz_count: number;
  status: 'draft' | 'published' | 'archived';
}

const statusBadge: Record<Course['status'], string> = {
  draft:     'bg-slate-100 text-slate-600',
  published: 'bg-green-100 text-green-700',
  archived:  'bg-orange-100 text-orange-700',
};

const emptyForm = {
  teacher_id: '',
  subject_name: '',
  class_name: '',
  academic_year_id: '',
  term: '' as '' | '1' | '2' | '3',
  description: '',
};

export default function LMSOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterYear, setFilterYear] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterTerm, setFilterTerm] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Stats>('/api/lms/admin/stats'),
      api.get<Course[]>('/api/lms/admin/courses'),
      api.get<AcademicYear[]>('/api/academic-years'),
    ]).then(([s, c, y]) => {
      setStats(s.data);
      setCourses(c.data);
      setAcademicYears(y.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function openModal() {
    api.get<Teacher[]>('/api/teachers').then(r => setTeachers(r.data)).catch(() => {});
    setForm(emptyForm);
    setShowModal(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/lms/courses', {
        teacher_id: form.teacher_id,
        subject_name: form.subject_name,
        class_name: form.class_name,
        academic_year_id: form.academic_year_id,
        term: form.term ? Number(form.term) : null,
        description: form.description,
      });
      const res = await api.get<Course[]>('/api/lms/admin/courses');
      setCourses(res.data);
      setShowModal(false);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(course: Course) {
    const next: Course['status'] = course.status === 'published' ? 'draft' : 'published';
    setToggling(course.id);
    try {
      await api.patch(`/api/lms/courses/${course.id}`, { status: next });
      setCourses(prev => prev.map(c => c.id === course.id ? { ...c, status: next } : c));
    } catch {
      // silently fail
    } finally {
      setToggling(null);
    }
  }

  async function archiveCourse(course: Course) {
    setToggling(course.id);
    try {
      await api.patch(`/api/lms/courses/${course.id}`, { status: 'archived' });
      setCourses(prev => prev.map(c => c.id === course.id ? { ...c, status: 'archived' } : c));
    } catch {
      // silently fail
    } finally {
      setToggling(null);
    }
  }

  const filtered = courses.filter(c => {
    if (filterYear && c.academic_year_name !== filterYear) return false;
    if (filterClass && !c.class_name.toLowerCase().includes(filterClass.toLowerCase())) return false;
    if (filterTerm && filterTerm !== 'All' && c.term !== Number(filterTerm)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">LMS Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage courses, lessons, assignments, and the Pasco question bank</p>
        </div>
        <Link
          href="/lms/pasco"
          className="text-sm font-semibold px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Pasco Bank →
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs text-slate-500 font-medium">Active Courses</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.active_courses}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs text-slate-500 font-medium">Published Lessons</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.published_lessons}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs text-slate-500 font-medium">Active Assignments</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.active_assignments}</p>
          </div>
          <div className={`rounded-xl border shadow-sm p-4 ${stats.pending_grades > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
            <p className={`text-xs font-medium ${stats.pending_grades > 0 ? 'text-red-600' : 'text-slate-500'}`}>Pending Grades</p>
            <p className={`text-2xl font-bold mt-1 ${stats.pending_grades > 0 ? 'text-red-700' : 'text-slate-900'}`}>{stats.pending_grades}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs text-slate-500 font-medium">Pasco Questions</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.pasco_questions}</p>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="">All Academic Years</option>
            {academicYears.map(y => (
              <option key={y.id} value={y.name}>{y.name}{y.is_current ? ' (Current)' : ''}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Filter by class…"
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
          <select
            value={filterTerm}
            onChange={e => setFilterTerm(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="">All Terms</option>
            <option value="1">Term 1</option>
            <option value="2">Term 2</option>
            <option value="3">Term 3</option>
          </select>
          <button
            onClick={openModal}
            className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#15803D' }}
          >
            + New Course
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Teacher', 'Subject', 'Class', 'Term', 'Lessons', 'Assignments', 'Quizzes', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">No courses found.</td>
                </tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-700">{c.teacher_name}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.subject_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{c.class_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.term ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{c.lesson_count}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{c.assignment_count}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{c.quiz_count}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusBadge[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {c.status !== 'archived' && (
                        <button
                          disabled={toggling === c.id}
                          onClick={() => toggleStatus(c)}
                          className="text-xs font-medium text-green-700 hover:text-green-900 disabled:opacity-40"
                        >
                          {c.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
                      )}
                      {c.status !== 'archived' && (
                        <button
                          disabled={toggling === c.id}
                          onClick={() => archiveCourse(c)}
                          className="text-xs font-medium text-orange-600 hover:text-orange-800 disabled:opacity-40"
                        >
                          Archive
                        </button>
                      )}
                      {c.status === 'archived' && (
                        <button
                          disabled={toggling === c.id}
                          onClick={() => toggleStatus(c)}
                          className="text-xs font-medium text-slate-600 hover:text-slate-800 disabled:opacity-40"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">New Course</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Teacher</label>
                <select
                  required
                  value={form.teacher_id}
                  onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                >
                  <option value="">Select teacher…</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
                <input
                  required
                  type="text"
                  value={form.subject_name}
                  onChange={e => setForm(f => ({ ...f, subject_name: e.target.value }))}
                  placeholder="e.g. Core Mathematics"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Class</label>
                <input
                  required
                  type="text"
                  value={form.class_name}
                  onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))}
                  placeholder="e.g. SHS 2A"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Academic Year</label>
                  <select
                    required
                    value={form.academic_year_id}
                    onChange={e => setForm(f => ({ ...f, academic_year_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="">Select year…</option>
                    {academicYears.map(y => (
                      <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Term</label>
                  <select
                    value={form.term}
                    onChange={e => setForm(f => ({ ...f, term: e.target.value as typeof form.term }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="">Any</option>
                    <option value="1">Term 1</option>
                    <option value="2">Term 2</option>
                    <option value="3">Term 3</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional course description…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 border border-slate-200">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: '#15803D' }}
                >
                  {saving ? 'Creating…' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
