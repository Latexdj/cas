'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface TimetableSlot {
  id: string;
  start_time: string;
  end_time: string;
  subject: string;
  class_names: string;
}

interface AttendanceRecord {
  id: string;
  subject: string;
  class_names: string;
}

interface CalendarEvent {
  id: string;
  name: string;
  date: string;
  type: 'Holiday' | 'School Event' | 'Closed Day' | string;
  notes?: string;
}

interface AttendanceSummary {
  present_periods: number;
  absent_periods: number;
  excused_periods: number;
  total_scheduled: number;
  attendance_pct: number | null;
}

function formatLocalDate(iso: string) {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function pctColor(pct: number | null) {
  if (pct === null) return '#8C7E6E';
  if (pct >= 90) return '#2D7A4F';
  if (pct >= 75) return '#2563EB';
  if (pct >= 60) return '#D97706';
  return '#DC2626';
}

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [slots,     setSlots]     = useState<TimetableSlot[]>([]);
  const [attendance,setAttendance]= useState<AttendanceRecord[]>([]);
  const [events,    setEvents]    = useState<CalendarEvent[]>([]);
  const [summary,   setSummary]   = useState<AttendanceSummary | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [primary,   setPrimary]   = useState('#2ab289');

  const loadData = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    setLoading(true);
    setError('');
    try {
      const today  = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      const [ttRes, attRes, calRes, sumRes] = await Promise.allSettled([
        teacherApi.get(`/api/timetable/today/${teacher.id}`),
        teacherApi.get(`/api/attendance/today/${teacher.id}`),
        teacherApi.get(`/api/school-calendar?from=${today}&to=${future}`),
        teacherApi.get('/api/attendance/my-summary'),
      ]);

      if (ttRes.status  === 'fulfilled') { const d = ttRes.value.data;  setSlots(Array.isArray(d) ? d : d?.slots ?? d?.timetable ?? []); }
      if (attRes.status === 'fulfilled') { const d = attRes.value.data; setAttendance(Array.isArray(d) ? d : d?.records ?? []); }
      if (calRes.status === 'fulfilled') { const d = calRes.value.data; setEvents(Array.isArray(d) ? d : d?.events ?? []); }
      if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data);
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

  function isSlotSubmitted(slot: TimetableSlot) {
    return attendance.some((a) => {
      if (a.subject.toLowerCase() !== slot.subject.toLowerCase()) return false;
      const slotClasses = slot.class_names.split(',').map((c) => c.trim().toLowerCase());
      const attClasses  = a.class_names.split(',').map((c) => c.trim().toLowerCase());
      return slotClasses.some((sc) => attClasses.includes(sc));
    });
  }

  const totalLessons = slots.length;
  const submittedCount = slots.filter(isSlotSubmitted).length;
  const pending = totalLessons - submittedCount;

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
          <h1 className="text-xl font-bold text-[#2C2218]">Dashboard</h1>
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
          { label: 'Submitted', value: submittedCount, color: primary },
          { label: 'Pending', value: pending, color: pending > 0 ? '#B83232' : '#8C7E6E' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-3 text-center">
            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-xs text-[#8C7E6E] mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* My Attendance — Current Semester */}
      {summary && (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E]">My Attendance — Current Semester</p>
            <p className="text-xl font-bold" style={{ color: pctColor(summary.attendance_pct) }}>
              {summary.attendance_pct !== null ? `${summary.attendance_pct}%` : '—'}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: 'Present',   value: summary.present_periods,   color: '#2D7A4F' },
              { label: 'Absent',    value: summary.absent_periods,    color: summary.absent_periods > 0 ? '#DC2626' : '#8C7E6E' },
              { label: 'Excused',   value: summary.excused_periods,   color: '#7C3AED' },
              { label: 'Scheduled', value: summary.total_scheduled,   color: '#8C7E6E' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className="text-lg font-bold" style={{ color }}>{value}</p>
                <p className="text-[10px] text-[#8C7E6E] font-semibold mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {summary.total_scheduled > 0 && (
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(summary.attendance_pct ?? 0, 100)}%`, backgroundColor: pctColor(summary.attendance_pct) }} />
            </div>
          )}
        </div>
      )}

      {/* View Weekly Timetable */}
      <button
        onClick={() => router.push('/teacher/timetable')}
        className="w-full flex items-center justify-between bg-white rounded-2xl border border-[#E2D9CC] shadow-sm px-4 py-3 mb-6 text-sm font-semibold hover:bg-slate-50 transition-colors"
        style={{ color: primary }}
      >
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-5 h-5">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          View Weekly Timetable
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 opacity-50">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

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
              const done = isSlotSubmitted(slot);
              return (
                <div
                  key={slot.id}
                  className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 flex items-center justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ background: done ? primary : '#E2D9CC' }}
                    />
                    <div>
                      <p className="text-xs text-[#8C7E6E] font-medium">
                        {slot.start_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5)}
                      </p>
                      <p className="font-semibold text-[#2C2218] text-sm mt-0.5">{slot.subject}</p>
                      <p className="text-xs text-[#8C7E6E]">{slot.class_names}</p>
                    </div>
                  </div>
                  {done ? (
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
                    <p className="text-sm font-semibold" style={{ color: col.text }}>{ev.name}</p>
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
