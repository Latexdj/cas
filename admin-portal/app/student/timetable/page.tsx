'use client';

import { useEffect, useState } from 'react';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface TimetableRow {
  id: string; day_of_week: number; start_time: string; end_time: string;
  subject: string; class_names: string; teacher_name: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TODAY_DAY = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d; })();

export default function StudentTimetablePage() {
  const [rows,    setRows]    = useState<TimetableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selDay,  setSelDay]  = useState(TODAY_DAY);
  const colors = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  useEffect(() => {
    studentApi.get<TimetableRow[]>('/api/student/timetable')
      .then(r => setRows(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const days = [...new Set(rows.map(r => Number(r.day_of_week)))].sort((a, b) => a - b);
  const dayRows = rows.filter(r => Number(r.day_of_week) === selDay).sort((a, b) => a.start_time.localeCompare(b.start_time));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-7 h-7 rounded-full border-2 border-b-transparent animate-spin" style={{ borderColor: primary, borderBottomColor: 'transparent' }} />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="p-6 text-center text-slate-400">
        
        <p className="font-semibold text-slate-600">No timetable found</p>
        <p className="text-sm mt-1">Your school hasn&apos;t published a timetable yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <p className="text-sm font-bold text-slate-700 mb-3">My Class Timetable</p>

        {/* Day selector */}
        <div className="flex gap-1.5 flex-wrap">
          {days.map(d => (
            <button key={d} onClick={() => setSelDay(d)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={selDay === d
                ? { background: primary, color: '#fff' }
                : { background: '#f1f5f9', color: '#64748b' }}>
              {DAYS[d - 1]?.slice(0, 3)}
              {d === TODAY_DAY && <span className="ml-1 text-[9px] opacity-70">Today</span>}
            </button>
          ))}
        </div>
      </div>

      {dayRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 p-10 text-center">
          <p className="text-slate-500 font-medium">No classes on {DAYS[(selDay - 1)] ?? 'this day'}.</p>
          <p className="text-slate-400 text-sm mt-1">Select another day to view its schedule.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayRows.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center gap-4">
              <div className="shrink-0 text-center w-16">
                <p className="text-xs font-mono font-semibold text-slate-700">{r.start_time.slice(0, 5)}</p>
                <p className="text-[10px] text-slate-400">to</p>
                <p className="text-xs font-mono font-semibold text-slate-700">{r.end_time.slice(0, 5)}</p>
              </div>
              <div className="w-px h-10 bg-slate-100 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{r.subject}</p>
                <p className="text-xs text-slate-400 truncate">{r.teacher_name}</p>
              </div>
              <div className="shrink-0 w-2 h-2 rounded-full" style={{ background: primary }} />
            </div>
          ))}
        </div>
      )}

      {/* Full week overview (desktop) */}
      <div className="hidden md:block space-y-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Weekly Overview</p>
        {days.map(d => {
          const dayLabel = DAYS[d - 1] ?? `Day ${d}`;
          const dayEntries = rows
            .filter(r => Number(r.day_of_week) === d)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
          const isToday = d === TODAY_DAY;
          return (
            <div key={d} className="rounded-xl overflow-hidden"
              style={{ border: isToday ? '1.5px solid #145C44' : '1px solid #E8E0D5' }}>
              {/* Day header */}
              <div className="px-4 py-2.5 flex items-center justify-between"
                style={{ background: isToday ? '#0B3D2E' : '#F5F0E8' }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-bold" style={{ color: isToday ? '#fff' : '#3C2F20' }}>{dayLabel}</span>
                  {isToday && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#C8973A', color: '#0B3D2E' }}>Today</span>
                  )}
                </div>
                <span className="text-xs" style={{ color: isToday ? 'rgba(255,255,255,0.5)' : '#8C7E6E' }}>
                  {dayEntries.length} {dayEntries.length === 1 ? 'class' : 'classes'}
                </span>
              </div>
              {/* Period rows */}
              <div className="bg-white divide-y divide-slate-50">
                {dayEntries.map((r, i) => (
                  <div key={r.id} className="px-4 py-3 flex items-center gap-4 group hover:bg-[#FDFAF5] transition-colors">
                    <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: isToday ? '#E8F4EE' : '#F1EDE6', color: isToday ? '#145C44' : '#8C7E6E' }}>
                      {i + 1}
                    </div>
                    <span className="text-xs font-mono tabular-nums shrink-0 w-28" style={{ color: '#6B5E50' }}>
                      {r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}
                    </span>
                    <span className="font-semibold flex-1 text-slate-800">{r.subject}</span>
                    <span className="text-xs text-slate-400 shrink-0 max-w-[160px] truncate">{r.teacher_name}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
