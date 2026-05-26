'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

export default function AbsencesPage() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');

  const [classCount,    setClassCount]    = useState(0);
  const [meetingCount,  setMeetingCount]  = useState(0);
  const [plcCount,      setPlcCount]      = useState(0);
  const [remedialCount, setRemedialCount] = useState(0);
  const [loading,       setLoading]       = useState(true);

  const loadData = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    setLoading(true);
    try {
      const [absRes, meetRes, plcRes, remRes] = await Promise.allSettled([
        teacherApi.get(`/api/absences/teacher/${teacher.id}`),
        teacherApi.get('/api/meetings/my-absences'),
        teacherApi.get('/api/plc/my-absences'),
        teacherApi.get(`/api/remedial/teacher/${teacher.id}`),
      ]);
      if (absRes.status  === 'fulfilled') setClassCount(Array.isArray(absRes.value.data)   ? absRes.value.data.length   : 0);
      if (meetRes.status === 'fulfilled') setMeetingCount(Array.isArray(meetRes.value.data) ? meetRes.value.data.length : 0);
      if (plcRes.status  === 'fulfilled') setPlcCount(Array.isArray(plcRes.value.data)     ? plcRes.value.data.length   : 0);
      if (remRes.status  === 'fulfilled') setRemedialCount(Array.isArray(remRes.value.data) ? remRes.value.data.length : 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadData();
  }, [loadData]);

  const cards = [
    {
      icon: '⚠️',
      title: 'Class Absences',
      count: classCount,
      subtitle: classCount === 1 ? 'unresolved absence' : 'unresolved absences',
      accent: '#DC2626',
      href: '/teacher/absences/list',
    },
    {
      icon: '🤝',
      title: 'Meeting Absences',
      count: meetingCount,
      subtitle: meetingCount === 1 ? 'recorded absence' : 'recorded absences',
      accent: '#D97706',
      href: '/teacher/absences/meetings',
    },
    {
      icon: '👥',
      title: 'PLC Absences',
      count: plcCount,
      subtitle: plcCount === 1 ? 'recorded absence' : 'recorded absences',
      accent: '#7C3AED',
      href: '/teacher/absences/plc',
    },
    {
      icon: '📅',
      title: 'Remedial Lessons',
      count: remedialCount,
      subtitle: remedialCount === 1 ? 'lesson scheduled' : 'lessons scheduled',
      accent: primary,
      href: '/teacher/absences/remedials',
    },
  ];

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#2C2218]">Absences</h1>
        <p className="text-sm text-[#8C7E6E] mt-0.5">Your absence record by category</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl h-32 animate-pulse border border-[#E2D9CC]" />
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
              <div className="flex items-end gap-3 mb-4">
                <span className="text-5xl font-bold leading-none" style={{ color: card.accent }}>
                  {card.count}
                </span>
                <span className="text-sm text-[#8C7E6E] mb-1">{card.subtitle}</span>
              </div>
              <button
                onClick={() => router.push(card.href)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border border-[#E2D9CC] text-[#4A3F32] bg-[#F4EFE6]"
              >
                View Details
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
