'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
  current_semester: number;
}

interface SubjectSlot {
  subject: string;
  class_name: string;
}

function AssessmentsContent() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [yearName, setYearName] = useState('');
  const [semester, setSemester] = useState<1 | 2>(1);
  const [slots, setSlots] = useState<SubjectSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSlots = useCallback(async (yId: string, sem: 1 | 2) => {
    if (!yId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await teacherApi.get<SubjectSlot[]>('/api/assessments/my-subjects', {
        params: { academic_year_id: yId, semester: sem },
      });
      setSlots(data ?? []);
    } catch {
      setError('Failed to load subjects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);

    const teacher = getTeacher();
    if (!teacher) return;

    teacherApi.get<AcademicYear[]>('/api/academic-years').then(({ data }) => {
      setYears(data ?? []);
      const current = data?.find(y => y.is_current);
      const activeYear = current ?? data?.[0];
      if (!activeYear) { setLoading(false); return; }
      const sem = (current?.current_semester ?? 1) as 1 | 2;
      setYearId(activeYear.id);
      setYearName(activeYear.name);
      setSemester(sem);
      loadSlots(activeYear.id, sem);
    }).catch(() => { setError('Failed to load years.'); setLoading(false); });
  }, [loadSlots]);

  function changeYear(y: AcademicYear) {
    setYearId(y.id);
    setYearName(y.name);
    loadSlots(y.id, semester);
  }

  function changeSemester(s: 1 | 2) {
    setSemester(s);
    loadSlots(yearId, s);
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-8" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#2C2218]">Assessments</h1>
        <p className="text-sm text-[#8C7E6E] mt-0.5">Select a subject to manage scores</p>
      </div>

      {/* Year + Semester selectors */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-5 flex gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-[#8C7E6E] mb-1.5 uppercase tracking-wide">Academic Year</p>
          <div className="relative">
            <select
              value={yearId}
              onChange={e => {
                const y = years.find(y => y.id === e.target.value);
                if (y) changeYear(y);
              }}
              className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-8 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
            >
              {years.map(y => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
        <div className="w-36 shrink-0">
          <p className="text-[10px] font-semibold text-[#8C7E6E] mb-1.5 uppercase tracking-wide">Semester</p>
          <div className="relative">
            <select
              value={semester}
              onChange={e => changeSemester(parseInt(e.target.value) as 1 | 2)}
              className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-8 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
            >
              <option value={1}>Semester 1</option>
              <option value={2}>Semester 2</option>
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-16 animate-pulse" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white border border-[#E2D9CC] flex items-center justify-center mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-[#C8BFB5]">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <line x1="9" y1="12" x2="15" y2="12" />
              <line x1="9" y1="16" x2="13" y2="16" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#8C7E6E]">No subjects found</p>
          <p className="text-xs text-[#C8BFB5] mt-1">No timetable entries for this year &amp; semester</p>
        </div>
      ) : (
        <div className="space-y-2">
          {slots.map(slot => (
            <button
              key={`${slot.subject}|${slot.class_name}`}
              onClick={() => router.push(
                `/teacher/assessments/subject?subject=${encodeURIComponent(slot.subject)}&class_name=${encodeURIComponent(slot.class_name)}&year_id=${yearId}&semester=${semester}&year_name=${encodeURIComponent(yearName)}`
              )}
              className="w-full bg-white rounded-2xl border border-[#E2D9CC] shadow-sm flex items-center overflow-hidden text-left hover:shadow-md transition-shadow"
            >
              <div className="w-1 self-stretch" style={{ background: primary }} />
              <div className="flex-1 px-4 py-3.5">
                <p className="text-sm font-bold text-[#2C2218]">{slot.subject}</p>
                <p className="text-xs text-[#8C7E6E] mt-0.5">{slot.class_name}</p>
              </div>
              <div className="pr-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#C8BFB5]">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssessmentsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}><div className="w-7 h-7 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" /></div>}>
      <AssessmentsContent />
    </Suspense>
  );
}
