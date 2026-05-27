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

  const days = [...new Set(rows.map(r => r.day_of_week))].sort();
  const dayRows = rows.filter(r => r.day_of_week === selDay).sort((a, b) => a.start_time.localeCompare(b.start_time));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="p-6 text-center text-slate-400">
        <p className="text-4xl mb-3">🗓️</p>
        <p className="font-semibold text-slate-600">No timetable found</p>
        <p className="text-sm mt-1">Your school hasn&apos;t published a timetable yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
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
        <div className="bg-white rounded-xl border border-slate-100 p-10 text-center text-slate-400">
          No classes on {DAYS[(selDay - 1)] ?? 'this day'}.
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

      {/* Full week grid (desktop) */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-sm font-bold text-slate-700">Weekly Overview</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <th className="px-4 py-2 text-left">Day</th>
                <th className="px-4 py-2 text-left">Time</th>
                <th className="px-4 py-2 text-left">Subject</th>
                <th className="px-4 py-2 text-left">Teacher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.sort((a, b) => a.day_of_week !== b.day_of_week ? a.day_of_week - b.day_of_week : a.start_time.localeCompare(b.start_time)).map(r => (
                <tr key={r.id} className={`hover:bg-slate-50 ${r.day_of_week === TODAY_DAY ? 'bg-blue-50/40' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-slate-600">{DAYS[r.day_of_week - 1]?.slice(0, 3)}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{r.subject}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.teacher_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
