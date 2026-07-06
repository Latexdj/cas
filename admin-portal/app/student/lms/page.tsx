'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface AcademicYear { id: string; name: string; is_current: boolean; current_term?: number; current_semester?: number; }
interface Course {
  id: string;
  subject_name: string;
  teacher_name: string;
  lesson_count: number;
  assignment_count: number;
  quiz_count: number;
  pending_assignments: number;
}

export default function LMSCoursesPage() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#3B82F6');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [semester, setSemester] = useState('1');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [yearsLoaded, setYearsLoaded] = useState(false);

  useEffect(() => {
    const colors = getStudentColors();
    setPrimary(colors.primary);
  }, []);

  useEffect(() => {
    studentApi.get<AcademicYear[]>('/api/academic-years').then(r => {
      setYears(r.data);
      const cur = r.data.find(y => y.is_current) ?? r.data[0];
      if (cur) {
        setYearId(cur.id);
        setSemester(String(cur.current_semester ?? 1));
      }
    }).catch(() => {}).finally(() => setYearsLoaded(true));
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    studentApi.get<Course[]>(`/api/lms/student/courses?academic_year_id=${yearId}&semester=${semester}`)
      .then(r => setCourses(r.data))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, [yearId, semester]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">My Courses</h1>
        <div className="flex flex-wrap gap-2">
          <select
            value={yearId}
            onChange={e => setYearId(e.target.value)}
            disabled={!yearsLoaded}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none disabled:opacity-50"
          >
            {years.map(y => (
              <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>
            ))}
          </select>
          <select
            value={semester}
            onChange={e => setSemester(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none"
          >
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: primary, borderTopColor: 'transparent' }}
          />
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 mx-auto mb-3 text-slate-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-slate-400 font-medium">No courses found for this period.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {courses.map(course => (
            <div key={course.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="h-2" style={{ background: primary }} />
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h2 className="text-base font-bold text-slate-800 leading-tight">{course.subject_name}</h2>
                  {course.pending_assignments > 0 && (
                    <span className="shrink-0 text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">
                      {course.pending_assignments} pending
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 mb-4">{course.teacher_name}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: '#3B82F6', background: '#3B82F618' }}>
                    {course.lesson_count} Lessons
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: '#8B5CF6', background: '#8B5CF618' }}>
                    {course.assignment_count} Assignments
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: '#10B981', background: '#10B98118' }}>
                    {course.quiz_count} Quizzes
                  </span>
                </div>
                <button
                  onClick={() => router.push(`/student/lms/${course.id}`)}
                  className="mt-auto w-full py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: primary }}
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
