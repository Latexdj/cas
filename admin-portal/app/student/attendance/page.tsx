'use client';

import { useEffect, useState } from 'react';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number; }
interface AttSummary { present: number; absent: number; late: number; total: number; rate: number | null; }
interface Session { id: string; date: string; subject: string; class_name: string; semester: number; teacher_name: string | null; status: 'Present' | 'Absent' | 'Late'; }

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  Present: { bg: 'bg-green-50',  text: 'text-green-700' },
  Absent:  { bg: 'bg-red-50',   text: 'text-red-600'   },
  Late:    { bg: 'bg-amber-50', text: 'text-amber-700' },
};

export default function StudentAttendancePage() {
  const [years,      setYears]      = useState<AcademicYear[]>([]);
  const [yearsReady, setYearsReady] = useState(false);
  const [yearId,     setYearId]     = useState('');
  const [semester,   setSemester]   = useState('');
  const [summary,    setSummary]    = useState<AttSummary | null>(null);
  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [loading,    setLoading]    = useState(false);
  const colors = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  useEffect(() => {
    studentApi.get<AcademicYear[]>('/api/student/academic-years').then(r => {
      setYears(r.data);
      const cur = r.data.find(y => y.is_current) ?? r.data[0];
      if (cur) { setYearId(cur.id); setSemester(String(cur.current_semester ?? 1)); }
    }).catch(() => {}).finally(() => setYearsReady(true));
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    const q = `academic_year_id=${yearId}${semester ? `&semester=${semester}` : ''}`;
    studentApi.get<{ summary: AttSummary; sessions: Session[] }>(`/api/student/attendance?${q}`)
      .then(r => { setSummary(r.data.summary); setSessions(r.data.sessions); })
      .catch(() => { setSummary(null); setSessions([]); })
      .finally(() => setLoading(false));
  }, [yearId, semester]);

  const rate = summary?.rate ?? null;
  const rateColor = rate === null ? '#94A3B8' : rate >= 85 ? '#16a34a' : rate >= 70 ? '#d97706' : '#dc2626';

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-1">Academic Year</label>
          <select value={yearId} onChange={e => setYearId(e.target.value)} disabled={!yearsReady}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
            {!yearsReady && <option value="">Loading…</option>}
            {yearsReady && years.length === 0 && <option value="">No academic years found</option>}
            {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-1">Semester</label>
          <select value={semester} onChange={e => setSemester(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All</option>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <>
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-slate-700">Attendance Summary</p>
              <span className="text-2xl font-black" style={{ color: rateColor }}>
                {rate !== null ? `${rate}%` : '—'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Present', value: summary.present, bg: 'bg-green-50', text: 'text-green-700' },
                { label: 'Absent',  value: summary.absent,  bg: 'bg-red-50',   text: 'text-red-600'   },
                { label: 'Late',    value: summary.late,    bg: 'bg-amber-50', text: 'text-amber-700' },
              ].map(({ label, value, bg, text }) => (
                <div key={label} className={`rounded-xl p-3 text-center ${bg}`}>
                  <p className={`text-2xl font-black ${text}`}>{value}</p>
                  <p className={`text-xs font-semibold ${text}`}>{label}</p>
                </div>
              ))}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full transition-all"
                style={{ width: `${Math.min(rate ?? 0, 100)}%`, background: rateColor }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-slate-400">{summary.total} total sessions</span>
              <span className="text-[10px] font-semibold" style={{ color: rateColor }}>
                {rate !== null ? (rate >= 85 ? 'Excellent' : rate >= 75 ? 'Good' : rate >= 70 ? 'At risk' : 'Critical') : ''}
              </span>
            </div>
            {rate !== null && rate < 75 && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-red-700">⚠ Your attendance is below 75%. You may be at risk of being barred from exams.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Session log */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-700">Session Log</p>
          <p className="text-xs text-slate-400">{sessions.length} sessions</p>
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No attendance records found for this period.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {sessions.map(s => {
              const style = STATUS_STYLE[s.status] ?? STATUS_STYLE.Absent;
              const d = new Date(s.date + 'T00:00:00');
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="text-center w-10 shrink-0">
                    <p className="text-[10px] text-slate-400 font-medium">{d.toLocaleDateString('en', { month: 'short' })}</p>
                    <p className="text-base font-black text-slate-700 leading-tight">{d.getDate()}</p>
                    <p className="text-[9px] text-slate-400">{d.toLocaleDateString('en', { weekday: 'short' })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{s.subject}</p>
                    {s.teacher_name && <p className="text-xs text-slate-400 truncate">{s.teacher_name}</p>}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${style.bg} ${style.text}`}>
                    {s.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
