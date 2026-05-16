'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface AbsenceRecord  { id: string; }
interface RemedialLesson { id: string; status: string; }
interface TeacherExcuse  { id: string; status: 'Pending' | 'Approved' | 'Rejected'; }

export default function AbsencesPage() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');

  const [absences,  setAbsences]  = useState<AbsenceRecord[]>([]);
  const [remedials, setRemedials] = useState<RemedialLesson[]>([]);
  const [leaves,    setLeaves]    = useState<TeacherExcuse[]>([]);
  const [loading,   setLoading]   = useState(true);

  const loadData = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    setLoading(true);
    try {
      const [absRes, remRes, levRes] = await Promise.allSettled([
        teacherApi.get(`/api/absences/teacher/${teacher.id}`),
        teacherApi.get(`/api/remedial/teacher/${teacher.id}`),
        teacherApi.get('/api/teacher-excuses'),
      ]);
      if (absRes.status === 'fulfilled') setAbsences(Array.isArray(absRes.value.data) ? absRes.value.data : []);
      if (remRes.status === 'fulfilled') setRemedials(Array.isArray(remRes.value.data) ? remRes.value.data : []);
      if (levRes.status === 'fulfilled') setLeaves(Array.isArray(levRes.value.data) ? levRes.value.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadData();
  }, [loadData]);

  const pendingLeaves = leaves.filter(l => l.status === 'Pending').length;

  const cards = [
    {
      icon: '⚠️',
      title: 'Outstanding Absences',
      count: absences.length,
      subtitle: absences.length === 1 ? 'unresolved absence' : 'unresolved absences',
      accent: '#DC2626',
      href: '/teacher/absences/list',
      requestHref: null,
    },
    {
      icon: '📅',
      title: 'Remedial Lessons',
      count: remedials.length,
      subtitle: remedials.length === 1 ? 'lesson scheduled' : 'lessons scheduled',
      accent: primary,
      href: '/teacher/absences/remedials',
      requestHref: null,
    },
    {
      icon: '📋',
      title: 'Leave Requests',
      count: leaves.length,
      subtitle: pendingLeaves > 0 ? `${pendingLeaves} pending approval` : 'no pending requests',
      accent: '#D97706',
      href: '/teacher/absences/leaves',
      requestHref: '/teacher/absences/leaves?new=1',
    },
  ];

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#2C2218]">Absences &amp; Leave</h1>
        <p className="text-sm text-[#8C7E6E] mt-0.5">Overview of your attendance record</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl h-36 animate-pulse border border-[#E2D9CC]" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map(card => (
            <div key={card.title} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E]">{card.title}</p>
                <span className="text-xl">{card.icon}</span>
              </div>

              <div className="flex items-end gap-3 mb-5">
                <span className="text-5xl font-bold leading-none" style={{ color: card.accent }}>
                  {card.count}
                </span>
                <span className="text-sm text-[#8C7E6E] mb-1">{card.subtitle}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => router.push(card.href)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[#E2D9CC] text-[#4A3F32] bg-[#F4EFE6]"
                >
                  View
                </button>
                {card.requestHref && (
                  <button
                    onClick={() => router.push(card.requestHref!)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: primary }}
                  >
                    + Request Leave
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
