'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface Profile {
  name: string; student_code: string; class_name: string; picture_url: string | null;
  program_name: string | null; residential_status: string | null; house: string | null;
  form_teacher: { teacher_name: string; teacher_code: string } | null;
}
interface LatestResult {
  average: number | null; overall_grade: string; class_position: number | null; class_total: number | null;
  subjects: { subject: string; total: number | null; grade: string }[];
}
interface AttSummary { present: number; absent: number; late: number; total: number; rate: number | null; }
interface CalEvent  { id: string; date: string; name: string; type: string; }
interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number; }

function AttPill({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-xs text-slate-400">—</span>;
  const color = rate >= 85 ? 'bg-green-100 text-green-700' : rate >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{rate}%</span>;
}

export default function StudentDashboard() {
  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [result,     setResult]     = useState<LatestResult | null>(null);
  const [att,        setAtt]        = useState<AttSummary | null>(null);
  const [events,     setEvents]     = useState<CalEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [currentYear, setCurrentYear] = useState<AcademicYear | null>(null);
  const colors = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  useEffect(() => {
    async function load() {
      try {
        const [profileRes, yearsRes] = await Promise.all([
          studentApi.get<Profile>('/api/student/profile'),
          studentApi.get<AcademicYear[]>('/api/student/academic-years'),
        ]);
        setProfile(profileRes.data);
        const cur = yearsRes.data.find(y => y.is_current) ?? yearsRes.data[0];
        setCurrentYear(cur ?? null);

        if (cur) {
          const sem = cur.current_semester ?? 1;
          const today = new Date().toISOString().slice(0, 10);
          const threeMonths = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

          const [resRes, attRes, calRes] = await Promise.all([
            studentApi.get<LatestResult>(`/api/student/results?academic_year_id=${cur.id}&semester=${sem}`).catch(() => null),
            studentApi.get<{ summary: AttSummary }>(`/api/student/attendance?academic_year_id=${cur.id}&semester=${sem}`).catch(() => null),
            studentApi.get<CalEvent[]>(`/api/student/calendar?from=${today}&to=${threeMonths}`).catch(() => ({ data: [] })),
          ]);
          if (resRes) setResult(resRes.data);
          if (attRes) setAtt(attRes.data.summary);
          setEvents((calRes?.data ?? []).slice(0, 4));
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const attWarn = att && att.rate !== null && att.rate < 75;

  // Best and worst subjects
  const validSubjects = (result?.subjects ?? []).filter(s => s.total !== null).sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  const best3  = validSubjects.slice(0, 3);
  const worst3 = validSubjects.slice(-3).reverse();

  const eventTypeColor: Record<string, string> = {
    'Holiday': 'bg-green-100 text-green-700',
    'School Event': 'bg-blue-100 text-blue-700',
    'Closed Day': 'bg-red-100 text-red-700',
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">

      {/* Attendance warning */}
      {attWarn && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-sm font-bold text-red-700">Low Attendance — {att?.rate}%</p>
            <p className="text-xs text-red-600 mt-0.5">Your attendance is below 75% this semester. You may risk being barred from exams.</p>
          </div>
        </div>
      )}

      {/* Welcome card */}
      <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}>
        <div className="flex items-center gap-4">
          {profile?.picture_url ? (
            <img src={profile.picture_url} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-white/40" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
              {profile?.name?.[0] ?? 'S'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs font-medium">Welcome back</p>
            <p className="font-bold text-lg leading-tight truncate">{profile?.name}</p>
            <p className="text-white/80 text-xs mt-0.5">{profile?.student_code} · {profile?.class_name}</p>
          </div>
        </div>
        {profile?.program_name && (
          <p className="text-white/70 text-xs mt-3 font-medium">{profile.program_name}</p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Average', value: result?.average !== null && result?.average !== undefined ? `${result.average}%` : '—', sub: result?.overall_grade ?? '' },
          { label: 'Position', value: result?.class_position ? `${result.class_position}${ordinal(result.class_position)}` : '—', sub: result?.class_total ? `of ${result.class_total}` : '' },
          { label: 'Attendance', value: att?.rate !== null && att?.rate !== undefined ? `${att.rate}%` : '—', sub: att ? `${att.present} present` : '' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-xl font-black text-slate-800">{value}</p>
            {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Subject performance strip */}
      {(best3.length > 0 || worst3.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-slate-700">
              {currentYear?.name} — Semester {currentYear?.current_semester}
            </p>
            <Link href="/student/results" className="text-xs font-semibold" style={{ color: primary }}>View all →</Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {best3.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide mb-2">Top subjects</p>
                <div className="space-y-1.5">
                  {best3.map(s => (
                    <div key={s.subject} className="flex items-center justify-between">
                      <span className="text-xs text-slate-600 truncate flex-1 mr-2">{s.subject}</span>
                      <span className="text-xs font-bold text-green-700">{s.total}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {worst3.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-2">Needs work</p>
                <div className="space-y-1.5">
                  {worst3.map(s => (
                    <div key={s.subject} className="flex items-center justify-between">
                      <span className="text-xs text-slate-600 truncate flex-1 mr-2">{s.subject}</span>
                      <span className="text-xs font-bold text-red-500">{s.total}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attendance summary */}
      {att && att.total > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-slate-700">Attendance This Semester</p>
            <AttPill rate={att.rate} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Present', value: att.present, color: 'text-green-700 bg-green-50' },
              { label: 'Absent',  value: att.absent,  color: 'text-red-600 bg-red-50' },
              { label: 'Late',    value: att.late,    color: 'text-amber-600 bg-amber-50' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-lg p-2 text-center ${color}`}>
                <p className="text-lg font-black">{value}</p>
                <p className="text-[10px] font-semibold">{label}</p>
              </div>
            ))}
          </div>
          {att.rate !== null && (
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="h-2 rounded-full transition-all"
                style={{ width: `${Math.min(att.rate, 100)}%`, background: att.rate >= 85 ? '#16a34a' : att.rate >= 70 ? '#d97706' : '#dc2626' }} />
            </div>
          )}
          <Link href="/student/attendance" className="block mt-2 text-xs font-semibold text-right" style={{ color: primary }}>Full log →</Link>
        </div>
      )}

      {/* Form teacher */}
      {profile?.form_teacher && (
        <div className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${primary}20` }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Your Form Teacher</p>
            <p className="text-sm font-bold text-slate-700">{profile.form_teacher.teacher_name}</p>
            <p className="text-xs text-slate-400 font-mono">{profile.form_teacher.teacher_code}</p>
          </div>
        </div>
      )}

      {/* Upcoming events */}
      {events.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-slate-700">Upcoming Events</p>
            <Link href="/student/calendar" className="text-xs font-semibold" style={{ color: primary }}>View all →</Link>
          </div>
          <div className="space-y-2">
            {events.map(ev => {
              const d = new Date(ev.date + 'T00:00:00');
              return (
                <div key={ev.id} className="flex items-center gap-3">
                  <div className="text-center w-10 shrink-0">
                    <p className="text-[10px] text-slate-400 font-medium">{d.toLocaleDateString('en', { month: 'short' })}</p>
                    <p className="text-lg font-black text-slate-700 leading-none">{d.getDate()}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{ev.name}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${eventTypeColor[ev.type] ?? 'bg-slate-100 text-slate-500'}`}>{ev.type}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick nav */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { href: '/student/results',    label: 'View Results',    icon: '📊' },
          { href: '/student/timetable',  label: 'My Timetable',   icon: '🗓️' },
          { href: '/student/attendance', label: 'Attendance Log',  icon: '✅' },
          { href: '/student/profile',    label: 'My Profile',      icon: '👤' },
        ].map(({ href, label, icon }) => (
          <Link key={href} href={href}
            className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3 hover:border-blue-200 transition-colors">
            <span className="text-xl">{icon}</span>
            <span className="text-sm font-semibold text-slate-700">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
