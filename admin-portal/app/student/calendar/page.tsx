'use client';

import { useEffect, useState } from 'react';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface CalEvent { id: string; date: string; name: string; type: string; notes: string | null; }

const TYPE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  'Holiday':     { bg: 'bg-green-50',  text: 'text-green-700',  dot: '#16a34a' },
  'School Event':{ bg: 'bg-blue-50',   text: 'text-blue-700',   dot: '#2563eb' },
  'Closed Day':  { bg: 'bg-red-50',    text: 'text-red-600',    dot: '#dc2626' },
};

export default function StudentCalendarPage() {
  const [events,  setEvents]  = useState<CalEvent[]>([]);
  const [year,    setYear]    = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const colors = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  useEffect(() => {
    setLoading(true);
    studentApi.get<CalEvent[]>(`/api/student/calendar?year=${year}`)
      .then(r => setEvents(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year]);

  // Group by month
  const byMonth: Record<string, CalEvent[]> = {};
  for (const ev of events) {
    const key = ev.date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(ev);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">

      {/* Year selector */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
        <button onClick={() => setYear(y => y - 1)} className="p-2 rounded-lg hover:bg-slate-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-500">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <p className="flex-1 text-center text-sm font-bold text-slate-700">{year}</p>
        <button onClick={() => setYear(y => y + 1)} className="p-2 rounded-lg hover:bg-slate-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-500">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Type legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPE_STYLE).map(([type, s]) => (
          <span key={type} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>{type}</span>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 p-12 text-center text-slate-400">
          No events for {year}.
        </div>
      ) : (
        Object.entries(byMonth).map(([month, evs]) => {
          const d = new Date(month + '-01T00:00:00');
          return (
            <div key={month} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-50 bg-slate-50">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  {d.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="divide-y divide-slate-50">
                {evs.map(ev => {
                  const evDate = new Date(ev.date + 'T00:00:00');
                  const isToday = ev.date === today;
                  const isPast  = ev.date < today;
                  const style   = TYPE_STYLE[ev.type] ?? { bg: 'bg-slate-50', text: 'text-slate-600', dot: '#94a3b8' };
                  return (
                    <div key={ev.id} className={`flex items-start gap-3 px-4 py-3 ${isPast ? 'opacity-50' : ''}`}>
                      <div className="text-center w-10 shrink-0">
                        <p className="text-[10px] text-slate-400 font-medium">{evDate.toLocaleDateString('en', { weekday: 'short' })}</p>
                        <p className={`text-lg font-black leading-tight ${isToday ? '' : 'text-slate-700'}`}
                          style={isToday ? { color: primary } : undefined}>{evDate.getDate()}</p>
                        {isToday && <p className="text-[8px] font-bold" style={{ color: primary }}>TODAY</p>}
                      </div>
                      <div className="flex-1 min-w-0 pt-1">
                        <p className="text-sm font-semibold text-slate-700 truncate">{ev.name}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>{ev.type}</span>
                        {ev.notes && <p className="text-xs text-slate-400 mt-1">{ev.notes}</p>}
                      </div>
                      <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" style={{ background: style.dot }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
