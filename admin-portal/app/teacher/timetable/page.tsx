'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface TimetableSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string;
  class_names: string;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function TimetablePage() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const todayDow = (() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d; // 1=Mon … 5=Fri, 6/7=weekend
  })();

  const load = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    setLoading(true);
    setError('');
    try {
      const res = await teacherApi.get<TimetableSlot[]>(`/api/timetable/teacher/${teacher.id}`);
      setSlots(res.data ?? []);
    } catch {
      setError('Failed to load timetable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    load();
  }, [load]);

  const byDay = (dow: number) =>
    slots
      .filter(s => s.day_of_week === dow)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div className="min-h-screen px-4 pt-6 pb-6" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/teacher')}
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">Weekly Timetable</h1>
          <p className="text-sm text-[#8C7E6E]">Your full week schedule</p>
        </div>
        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E2D9CC] bg-white text-[#8C7E6E]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-32 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {DAY_NAMES.map((dayName, i) => {
            const dow      = i + 1;
            const daySlots = byDay(dow);
            const isToday  = dow === todayDow;
            return (
              <div key={dow}>
                {/* Day header */}
                <div className="flex items-center gap-2 mb-2">
                  <p
                    className="text-xs font-bold uppercase tracking-wide"
                    style={{ color: isToday ? primary : '#8C7E6E' }}
                  >
                    {dayName}
                  </p>
                  {isToday && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ background: primary }}
                    >
                      Today
                    </span>
                  )}
                </div>

                {daySlots.length === 0 ? (
                  <div
                    className="rounded-xl border-2 border-dashed border-[#E2D9CC] px-4 py-3"
                    style={{ background: 'transparent' }}
                  >
                    <p className="text-xs text-[#C8BFB5] text-center">No classes</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map(slot => (
                      <div
                        key={slot.id}
                        className="bg-white rounded-xl border border-[#E2D9CC] shadow-sm p-3 flex gap-3 items-start"
                        style={isToday ? { borderLeftWidth: 3, borderLeftColor: primary } : {}}
                      >
                        <div className="text-right shrink-0 w-16">
                          <p className="text-xs font-bold text-[#8C7E6E]">{slot.start_time.slice(0, 5)}</p>
                          <p className="text-[10px] text-[#C8BFB5]">{slot.end_time.slice(0, 5)}</p>
                        </div>
                        <div className="w-px self-stretch bg-[#E2D9CC] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#2C2218] truncate">{slot.subject}</p>
                          <p className="text-xs text-[#8C7E6E] mt-0.5">{slot.class_names}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
