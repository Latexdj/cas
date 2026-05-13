'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface TimetableSlot {
  id: string;
  startTime: string;
  endTime: string;
  subject: string;
  className: string;
  submitted?: boolean;
}

interface AttendanceRecord {
  slotId: string;
  submitted: boolean;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'Holiday' | 'School Event' | 'Closed Day' | string;
}

function formatLocalDate(iso: string) {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function TeacherTodayPage() {
  const router = useRouter();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [primary, setPrimary] = useState('#2ab289');

  const loadData = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    setLoading(true);
    setError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      const [ttRes, attRes, calRes] = await Promise.allSettled([
        teacherApi.get(`/api/timetable/today/${teacher.id}`),
        teacherApi.get(`/api/attendance/today/${teacher.id}`),
        teacherApi.get(`/api/school-calendar?from=${today}&to=${future}`),
      ]);

      if (ttRes.status === 'fulfilled') {
        const d = ttRes.value.data;
        setSlots(Array.isArray(d) ? d : d?.slots ?? d?.timetable ?? []);
      }
      if (attRes.status === 'fulfilled') {
        const d = attRes.value.data;
        setAttendance(Array.isArray(d) ? d : d?.records ?? []);
      }
      if (calRes.status === 'fulfilled') {
        const d = calRes.value.data;
        setEvents(Array.isArray(d) ? d : d?.events ?? []);
      }
    } catch {
      setError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadData();
  }, [loadData]);

  const submittedIds = new Set(attendance.filter((a) => a.submitted).map((a) => a.slotId));
  const totalLessons = slots.length;
  const submitted = slots.filter((s) => submittedIds.has(s.id)).length;
  const pending = totalLessons - submitted;

  const eventColor = (type: string) => {
    if (type === 'Holiday') return { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' };
    if (type === 'Closed Day') return { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' };
    return { bg: `${primary}18`, border: `${primary}55`, text: primary };
  };

  return (
    <div className="min-h-screen px-4 pt-6 pb-4" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">Today</h1>
          <p className="text-sm text-[#8C7E6E]">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E2D9CC] bg-white text-[#8C7E6E]"
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

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Lessons', value: totalLessons, color: '#8C7E6E' },
          { label: 'Submitted', value: submitted, color: primary },
          { label: 'Pending', value: pending, color: pending > 0 ? '#B83232' : '#8C7E6E' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-3 text-center">
            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-xs text-[#8C7E6E] mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Timetable slots */}
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Schedule</p>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-20 animate-pulse" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-6 text-center">
            <p className="text-[#8C7E6E] text-sm">No lessons scheduled for today</p>
          </div>
        ) : (
          <div className="space-y-3">
            {slots.map((slot) => {
              const isSubmitted = submittedIds.has(slot.id);
              return (
                <div
                  key={slot.id}
                  className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 flex items-center justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ background: isSubmitted ? primary : '#E2D9CC' }}
                    />
                    <div>
                      <p className="text-xs text-[#8C7E6E] font-medium">
                        {slot.startTime} – {slot.endTime}
                      </p>
                      <p className="font-semibold text-[#2C2218] text-sm mt-0.5">{slot.subject}</p>
                      <p className="text-xs text-[#8C7E6E]">{slot.className}</p>
                    </div>
                  </div>
                  {isSubmitted ? (
                    <span
                      className="text-xs font-semibold px-3 py-1 rounded-full"
                      style={{ background: `${primary}18`, color: primary }}
                    >
                      Submitted
                    </span>
                  ) : (
                    <button
                      onClick={() => router.push(`/teacher/submit?slotId=${slot.id}`)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
                      style={{ background: primary }}
                    >
                      Submit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming events */}
      {events.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Upcoming Events</p>
          <div className="space-y-2">
            {events.map((ev) => {
              const col = eventColor(ev.type);
              return (
                <div
                  key={ev.id}
                  className="rounded-xl px-4 py-3 flex items-center justify-between border"
                  style={{ background: col.bg, borderColor: col.border }}
                >
                  <div>
                    <p className="text-sm font-semibold" style={{ color: col.text }}>{ev.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: col.text, opacity: 0.75 }}>
                      {formatLocalDate(ev.date)}
                    </p>
                  </div>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: col.border, color: col.text }}
                  >
                    {ev.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
