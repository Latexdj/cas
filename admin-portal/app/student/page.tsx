'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface Profile {
  name: string; student_code: string; class_name: string; picture_url: string | null;
  program_name: string | null; residential_status: string | null; house: string | null;
  form_teacher: { teacher_name: string; teacher_phone: string | null } | null;
}
interface LatestResult {
  average: number | null; overall_grade: string; class_position: number | null; class_total: number | null;
  subjects: { subject: string; total: number | null; grade: string }[];
}
interface AttSummary { present: number; absent: number; late: number; total: number; rate: number | null; }
interface CalEvent  { id: string; date: string; name: string; type: string; }
interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number; }
interface FeeSummary { total_billed: number; total_paid: number; outstanding: number; }

function greet(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const sc = (v: number) => v >= 70 ? '#145C44' : v >= 50 ? '#C8780A' : '#B83232';
const sb = (v: number) => v >= 70 ? '#E8F4EE' : v >= 50 ? '#FFFBEB' : '#FEF2F2';
const sl = (v: number) => v >= 70 ? '#2D7A4F' : v >= 50 ? '#C8780A' : '#B83232';

const NAV_LINKS = [
  { href: '/student/results',    label: 'Results',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> },
  { href: '/student/timetable',  label: 'Timetable',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { href: '/student/attendance', label: 'Attendance',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
  { href: '/student/fees',       label: 'Fees',       _feesGated: true,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"/></svg> },
  { href: '/student/lms',        label: 'LMS',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg> },
  { href: '/student/library',    label: 'Library',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg> },
  { href: '/student/profile',    label: 'Profile',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
] as const;

const EVENT_STYLE: Record<string, { fg: string; bg: string }> = {
  'Holiday':      { fg: '#145C44', bg: '#E8F4EE' },
  'School Event': { fg: '#8C7E6E', bg: '#F5F0E8' },
  'Closed Day':   { fg: '#B83232', bg: '#FEF2F2' },
};

export default function StudentDashboard() {
  const [profile,     setProfile]     = useState<Profile | null>(null);
  const [result,      setResult]      = useState<LatestResult | null>(null);
  const [att,         setAtt]         = useState<AttSummary | null>(null);
  const [events,      setEvents]      = useState<CalEvent[]>([]);
  const [fees,        setFees]        = useState<FeeSummary | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [currentYear, setCurrentYear] = useState<AcademicYear | null>(null);
  const [dayStatus,   setDayStatus]   = useState<{ status: string; label: string | null } | null>(null);

  const colors  = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  useEffect(() => {
    async function load() {
      try {
        const today2 = new Date().toISOString().slice(0, 10);
        const [profileRes, yearsRes, dsRes] = await Promise.all([
          studentApi.get<Profile>('/api/student/profile'),
          studentApi.get<AcademicYear[]>('/api/student/academic-years'),
          studentApi.get(`/api/student/day-status?date=${today2}`).catch(() => null),
        ]);
        if (dsRes) setDayStatus(dsRes.data);
        studentApi.get<{ summary: FeeSummary }>('/api/student/fees')
          .then(r => setFees(r.data.summary))
          .catch(() => null);
        setProfile(profileRes.data);
        const cur = yearsRes.data.find(y => y.is_current) ?? yearsRes.data[0];
        setCurrentYear(cur ?? null);

        if (cur) {
          const sem = cur.current_semester ?? 1;
          const today      = new Date().toISOString().slice(0, 10);
          const threeMonths = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const [resRes, attRes, calRes] = await Promise.all([
            studentApi.get<LatestResult>(`/api/student/results?academic_year_id=${cur.id}&semester=${sem}`).catch(() => null),
            studentApi.get<{ summary: AttSummary }>(`/api/student/attendance?academic_year_id=${cur.id}&semester=${sem}`).catch(() => null),
            studentApi.get<CalEvent[]>(`/api/student/calendar?from=${today}&to=${threeMonths}`).catch(() => ({ data: [] })),
          ]);
          if (resRes) setResult(resRes.data);
          if (attRes) setAtt(attRes.data.summary);
          setEvents((calRes?.data ?? []).slice(0, 5));
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-b-transparent animate-spin"
          style={{ borderColor: primary, borderBottomColor: 'transparent' }} />
      </div>
    );
  }

  const validSubjects = (result?.subjects ?? [])
    .filter(s => s.total !== null)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  const visibleLinks = NAV_LINKS.filter(l => !('_feesGated' in l && l._feesGated) || fees !== null);

  const hasAtt    = att && att.total > 0;
  const hasEvents = events.length > 0;

  return (
    <div className="max-w-3xl mx-auto">

      {/* ── Identity banner ── */}
      <div className="relative overflow-hidden" style={{ background: '#0B3D2E' }}>
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute rounded-full"
            style={{ right: -60, top: -60, width: 240, height: 240, border: '1px solid rgba(200,151,58,0.13)' }} />
          <div className="absolute rounded-full"
            style={{ right: -18, top: -18, width: 148, height: 148, border: '1px solid rgba(200,151,58,0.08)' }} />
        </div>

        <div className="relative px-5 pt-6 pb-5 flex items-center gap-4">
          {profile?.picture_url ? (
            <img src={profile.picture_url} alt=""
              className="w-14 h-14 rounded-2xl object-cover shrink-0"
              style={{ border: '2px solid rgba(200,151,58,0.45)' }} />
          ) : (
            <div className="w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center text-xl font-black"
              style={{ background: 'rgba(200,151,58,0.12)', color: '#C8973A', border: '2px solid rgba(200,151,58,0.22)' }}>
              {profile?.name?.[0]?.toUpperCase() ?? 'S'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'rgba(200,151,58,0.8)' }}>{greet()}</p>
            <p className="text-xl font-black leading-tight text-white truncate">{profile?.name}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {profile?.class_name && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)' }}>
                  {profile.class_name}
                </span>
              )}
              {profile?.program_name && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)' }}>
                  {profile.program_name}
                </span>
              )}
              {currentYear && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(200,151,58,0.18)', color: '#C8973A' }}>
                  {currentYear.name} · Sem {currentYear.current_semester}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Key metrics strip */}
        <div className="relative grid grid-cols-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { label: 'Avg Score',  value: result?.average != null ? `${result.average}%` : '—', sub: result?.overall_grade ?? '' },
            { label: 'Class Rank', value: result?.class_position ? ordinal(result.class_position) : '—', sub: result?.class_total ? `of ${result.class_total}` : '' },
            { label: 'Attendance', value: att?.rate != null ? `${att.rate}%` : '—', sub: att ? `${att.present}/${att.total} days` : '' },
          ].map(({ label, value, sub }, i) => (
            <div key={label} className="py-4 px-2 text-center"
              style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.07)' : undefined }}>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.09em' }}>{label}</p>
              <p className="text-2xl font-black text-white mt-1 leading-none">{value}</p>
              {sub && <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-5 space-y-4">

        {/* School status banner */}
        {dayStatus && dayStatus.status !== 'normal' && (() => {
          const isVac     = dayStatus.status === 'vacation';
          const isHoliday = dayStatus.status === 'holiday';
          const isClosed  = dayStatus.status === 'closed';
          const bg     = isVac || isHoliday ? '#E8F4EE' : isClosed ? '#FEF2F2' : '#FFF8E1';
          const border = isVac || isHoliday ? '#BBF7D0' : isClosed ? '#FECACA' : '#FDE68A';
          const color  = isVac || isHoliday ? '#145C44' : isClosed ? '#B83232' : '#92400E';
          const title  = isVac ? 'School vacation' : isHoliday ? 'Public holiday' : isClosed ? 'School closed' : 'School event today';
          const body   = `${dayStatus.label ? dayStatus.label + '. ' : ''}No lessons are scheduled today.`;
          return (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ backgroundColor: bg, border: `1px solid ${border}`, borderLeft: `4px solid ${color}` }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
                style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }}>
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                <line x1="9.5" y1="14.5" x2="14.5" y2="19.5"/><line x1="14.5" y1="14.5" x2="9.5" y2="19.5"/>
              </svg>
              <div>
                <p className="text-sm font-bold" style={{ color }}>{title}</p>
                <p className="text-xs mt-0.5" style={{ color, opacity: 0.8 }}>{body}</p>
              </div>
            </div>
          );
        })()}

        {/* Attendance warning */}
        {att && att.rate !== null && att.rate < 75 && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#B83232" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <p className="text-sm font-bold" style={{ color: '#B83232' }}>Attendance at {att.rate}% — action needed</p>
              <p className="text-xs mt-0.5" style={{ color: '#991B1B' }}>Speak with your form teacher to avoid being barred from exams.</p>
            </div>
          </div>
        )}

        {/* Fee alert */}
        {fees && fees.outstanding > 0 && (
          <Link href="/student/fees"
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#C8780A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: '#92400E' }}>
                Outstanding: GH&#8373; {fees.outstanding.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs" style={{ color: '#B45309' }}>View fee statement and payment history</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="#C8780A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </Link>
        )}

        {/* Subject performance */}
        {validSubjects.length > 0 && (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2D9CC' }}>
            <div className="px-4 pt-4 pb-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid #F5F0E8' }}>
              <div>
                <p className="text-sm font-bold" style={{ color: '#2C2218' }}>Subject Performance</p>
                {currentYear && (
                  <p className="text-xs mt-0.5" style={{ color: '#8C7E6E' }}>
                    {currentYear.name}, Semester {currentYear.current_semester}
                  </p>
                )}
              </div>
              <Link href="/student/results"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ color: '#145C44', background: '#E8F4EE' }}>
                Full results
              </Link>
            </div>
            <div className="divide-y" style={{ borderColor: '#F5F0E8' }}>
              {validSubjects.slice(0, 7).map((s, i) => (
                <div key={s.subject} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs tabular-nums w-4 shrink-0 text-right" style={{ color: '#C4B5A5' }}>{i + 1}</span>
                  <div className="w-1 h-5 rounded-full shrink-0" style={{ background: sl(s.total ?? 0) }} />
                  <span className="text-sm flex-1 truncate" style={{ color: '#3C2F20' }}>{s.subject}</span>
                  <span className="text-sm font-black tabular-nums shrink-0" style={{ color: sc(s.total ?? 0) }}>{s.total}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 min-w-[26px] text-center"
                    style={{ color: sc(s.total ?? 0), background: sb(s.total ?? 0) }}>{s.grade}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attendance + Events */}
        {(hasAtt || hasEvents) && (
          <div className="flex flex-col md:flex-row gap-4">

            {hasAtt && (
              <div className="flex-1 bg-white rounded-xl p-4" style={{ border: '1px solid #E2D9CC' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold" style={{ color: '#2C2218' }}>Attendance</p>
                  {att!.rate !== null && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
                      background: att!.rate >= 85 ? '#D1EAD9' : att!.rate >= 70 ? '#FFFBEB' : '#FEF2F2',
                      color:      att!.rate >= 85 ? '#145C44' : att!.rate >= 70 ? '#92400E' : '#B83232',
                    }}>{att!.rate}%</span>
                  )}
                </div>
                {att!.rate !== null && (
                  <div className="w-full rounded-full h-1.5 mb-3" style={{ background: '#F5F0E8' }}>
                    <div className="h-1.5 rounded-full" style={{
                      width: `${Math.min(att!.rate, 100)}%`,
                      background: att!.rate >= 85 ? '#2D7A4F' : att!.rate >= 70 ? '#C8780A' : '#B83232',
                    }} />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { label: 'Present', value: att!.present, fg: '#145C44', bg: '#E8F4EE' },
                    { label: 'Absent',  value: att!.absent,  fg: '#B83232', bg: '#FEF2F2' },
                    { label: 'Late',    value: att!.late,    fg: '#C8780A', bg: '#FFFBEB' },
                  ] as const).map(({ label, value, fg, bg }) => (
                    <div key={label} className="rounded-xl py-3 text-center" style={{ background: bg }}>
                      <p className="text-xl font-black leading-none" style={{ color: fg }}>{value}</p>
                      <p className="text-[10px] font-semibold mt-1" style={{ color: fg }}>{label}</p>
                    </div>
                  ))}
                </div>
                <Link href="/student/attendance"
                  className="block mt-3 text-xs font-semibold text-right"
                  style={{ color: '#145C44' }}>
                  View full log
                </Link>
              </div>
            )}

            {hasEvents && (
              <div className="flex-1 bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2D9CC' }}>
                <div className="px-4 pt-4 pb-3 flex items-center justify-between"
                  style={{ borderBottom: '1px solid #F5F0E8' }}>
                  <p className="text-sm font-bold" style={{ color: '#2C2218' }}>Upcoming Events</p>
                  <Link href="/student/calendar" className="text-xs font-semibold" style={{ color: '#145C44' }}>See all</Link>
                </div>
                <div className="divide-y" style={{ borderColor: '#F5F0E8' }}>
                  {events.map(ev => {
                    const d  = new Date(ev.date + 'T00:00:00');
                    const ts = EVENT_STYLE[ev.type] ?? { fg: '#6B7280', bg: '#F3F4F6' };
                    return (
                      <div key={ev.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-9 shrink-0 text-center">
                          <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#8C7E6E' }}>
                            {d.toLocaleDateString('en', { month: 'short' })}
                          </p>
                          <p className="text-xl font-black leading-none mt-0.5" style={{ color: '#2C2218' }}>{d.getDate()}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: '#2C2218' }}>{ev.name}</p>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{ color: ts.fg, background: ts.bg }}>{ev.type}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}

        {/* Form teacher */}
        {profile?.form_teacher && (
          <div className="flex items-center gap-3 px-4 py-3.5 bg-white rounded-xl"
            style={{ border: '1px solid #E2D9CC' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: '#E8F4EE' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#145C44" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: '#8C7E6E' }}>Form Teacher</p>
              <p className="text-sm font-bold truncate" style={{ color: '#2C2218' }}>{profile.form_teacher.teacher_name}</p>
            </div>
            {profile.form_teacher.teacher_phone && (
              <p className="text-xs font-medium shrink-0" style={{ color: '#8C7E6E' }}>
                {profile.form_teacher.teacher_phone}
              </p>
            )}
          </div>
        )}

        {/* Quick access */}
        <div>
          <p className="text-[10px] font-bold uppercase mb-3 px-0.5"
            style={{ color: '#8C7E6E', letterSpacing: '0.09em' }}>Quick Access</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {visibleLinks.map(({ href, label, icon }) => (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-2 py-3.5 bg-white rounded-xl"
                style={{ border: '1px solid #E2D9CC' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: '#F5F0E8' }}>
                  <span style={{ color: '#145C44' }}>{icon}</span>
                </div>
                <span className="text-xs font-semibold" style={{ color: '#3C2F20' }}>{label}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
