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

function AttPill({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-xs text-slate-400">—</span>;
  const color = rate >= 85 ? 'bg-[#D1EAD9] text-[#145C44]' : rate >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{rate}%</span>;
}

export default function StudentDashboard() {
  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [result,     setResult]     = useState<LatestResult | null>(null);
  const [att,        setAtt]        = useState<AttSummary | null>(null);
  const [events,     setEvents]     = useState<CalEvent[]>([]);
  const [fees,       setFees]       = useState<FeeSummary | null>(null);
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
        // Fetch fee summary in parallel, silently ignore if module disabled
        studentApi.get<{ summary: FeeSummary }>('/api/student/fees')
          .then(r => setFees(r.data.summary))
          .catch(() => null);
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
        <div className="w-8 h-8 rounded-full border-2 border-b-transparent animate-spin" style={{ borderColor: primary, borderBottomColor: 'transparent' }} />
      </div>
    );
  }

  const attWarn = att && att.rate !== null && att.rate < 75;

  const validSubjects = (result?.subjects ?? []).filter(s => s.total !== null).sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  const best3  = validSubjects.slice(0, 3);
  const worst3 = validSubjects.slice(-3).reverse();

  const scoreBar = (v: number) => v >= 70 ? '#145C44' : v >= 50 ? '#C8780A' : '#B83232';

  return (
    <div className="max-w-2xl mx-auto">

      {/* ── Identity banner ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ background: '#0B3D2E' }}>
        {/* Subtle geometric accent */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full opacity-10" style={{ background: '#C8973A' }} />
          <div className="absolute right-16 bottom-0 w-24 h-24 rounded-full opacity-5" style={{ background: '#C8973A' }} />
        </div>
        <div className="relative px-5 pt-7 pb-6 flex items-center gap-4">
          {profile?.picture_url ? (
            <img src={profile.picture_url} alt=""
              className="w-16 h-16 rounded-xl object-cover shrink-0"
              style={{ border: '2px solid rgba(200,151,58,0.5)' }} />
          ) : (
            <div className="w-16 h-16 rounded-xl shrink-0 flex items-center justify-center text-2xl font-black"
              style={{ background: 'rgba(200,151,58,0.15)', color: '#C8973A', border: '2px solid rgba(200,151,58,0.3)' }}>
              {profile?.name?.[0]?.toUpperCase() ?? 'S'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium mb-0.5" style={{ color: 'rgba(200,151,58,0.8)' }}>Student Portal</p>
            <p className="text-lg font-bold leading-tight text-white truncate">{profile?.name}</p>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {profile?.class_name}{profile?.program_name ? `, ${profile.program_name}` : ''}
            </p>
          </div>
        </div>

        {/* Key stats row inside banner */}
        <div className="relative grid grid-cols-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {[
            { label: 'Average', value: result?.average != null ? `${result.average}%` : '--', sub: result?.overall_grade ?? '' },
            { label: 'Position', value: result?.class_position ? `${ordinal(result.class_position)}` : '--', sub: result?.class_total ? `of ${result.class_total}` : '' },
            { label: 'Attendance', value: att?.rate != null ? `${att.rate}%` : '--', sub: att ? `${att.present} present` : '' },
          ].map(({ label, value, sub }, i) => (
            <div key={label} className="px-4 py-4 text-center" style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.08)' : undefined }}>
              <p className="text-[10px] font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>{label}</p>
              <p className="text-xl font-black text-white leading-none">{value}</p>
              {sub && <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{sub}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-5 space-y-4">

        {/* Alerts */}
        {attWarn && (
          <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#B83232" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="text-sm font-bold" style={{ color: '#B83232' }}>Attendance at {att?.rate}%</p>
              <p className="text-xs mt-0.5" style={{ color: '#991B1B' }}>Speak with your form teacher to avoid being barred from exams.</p>
            </div>
          </div>
        )}

        {fees && fees.outstanding > 0 && (
          <Link href="/student/fees" className="block rounded-xl px-4 py-3 no-underline" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="#C8780A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: '#92400E' }}>
                  Outstanding balance: GH&#8373; {fees.outstanding.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>View your fee statement and payment history</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="#C8780A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </Link>
        )}

        {/* Subject performance */}
        {validSubjects.length > 0 && (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2D9CC' }}>
            <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid #F5F0E8' }}>
              <div>
                <p className="text-sm font-bold" style={{ color: '#2C2218' }}>
                  {currentYear?.name}, Semester {currentYear?.current_semester}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8C7E6E' }}>{validSubjects.length} subjects</p>
              </div>
              <Link href="/student/results"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: '#145C44', background: '#E8F4EE' }}>
                Full results
              </Link>
            </div>
            <div className="divide-y" style={{ borderColor: '#F5F0E8' }}>
              {validSubjects.slice(0, 6).map(s => (
                <div key={s.subject} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-xs font-medium truncate flex-1 min-w-0" style={{ color: '#4A3F32' }}>{s.subject}</span>
                  <div className="w-24 h-1.5 rounded-full shrink-0" style={{ background: '#F5F0E8' }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(s.total ?? 0, 100)}%`, background: scoreBar(s.total ?? 0) }} />
                  </div>
                  <span className="text-xs font-bold tabular-nums w-8 text-right shrink-0" style={{ color: scoreBar(s.total ?? 0) }}>{s.total}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: scoreBar(s.total ?? 0), background: `${scoreBar(s.total ?? 0)}15` }}>{s.grade}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attendance */}
        {att && att.total > 0 && (
          <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #E2D9CC' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold" style={{ color: '#2C2218' }}>Attendance this semester</p>
              <AttPill rate={att.rate} />
            </div>
            {att.rate !== null && (
              <div className="w-full rounded-full h-2 mb-3" style={{ background: '#F5F0E8' }}>
                <div className="h-2 rounded-full"
                  style={{ width: `${Math.min(att.rate, 100)}%`, background: att.rate >= 85 ? '#2D7A4F' : att.rate >= 70 ? '#C8780A' : '#B83232' }} />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Present', value: att.present, fg: '#145C44', bg: '#E8F4EE' },
                { label: 'Absent',  value: att.absent,  fg: '#B83232', bg: '#FEF2F2' },
                { label: 'Late',    value: att.late,    fg: '#C8780A', bg: '#FFFBEB' },
              ].map(({ label, value, fg, bg }) => (
                <div key={label} className="rounded-lg py-2 text-center" style={{ background: bg }}>
                  <p className="text-lg font-black leading-none" style={{ color: fg }}>{value}</p>
                  <p className="text-[10px] font-semibold mt-1" style={{ color: fg }}>{label}</p>
                </div>
              ))}
            </div>
            <Link href="/student/attendance" className="block mt-3 text-xs font-semibold text-right" style={{ color: '#145C44' }}>
              View full log
            </Link>
          </div>
        )}

        {/* Form teacher */}
        {profile?.form_teacher && (
          <div className="bg-white rounded-xl p-4 flex items-center gap-3" style={{ border: '1px solid #E2D9CC' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#E8F4EE' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#145C44" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: '#8C7E6E' }}>Form Teacher</p>
              <p className="text-sm font-bold" style={{ color: '#2C2218' }}>{profile.form_teacher.teacher_name}</p>
              {profile.form_teacher.teacher_phone && (
                <p className="text-xs mt-0.5" style={{ color: '#8C7E6E' }}>{profile.form_teacher.teacher_phone}</p>
              )}
            </div>
          </div>
        )}

        {/* Upcoming events */}
        {events.length > 0 && (
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2D9CC' }}>
            <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid #F5F0E8' }}>
              <p className="text-sm font-bold" style={{ color: '#2C2218' }}>Upcoming events</p>
              <Link href="/student/calendar" className="text-xs font-semibold" style={{ color: '#145C44' }}>See all</Link>
            </div>
            <div className="divide-y" style={{ borderColor: '#F5F0E8' }}>
              {events.map(ev => {
                const d = new Date(ev.date + 'T00:00:00');
                const typeStyle: Record<string, { fg: string; bg: string }> = {
                  'Holiday':     { fg: '#145C44', bg: '#E8F4EE' },
                  'School Event':{ fg: '#1D4ED8', bg: '#EFF6FF' },
                  'Closed Day':  { fg: '#B83232', bg: '#FEF2F2' },
                };
                const ts = typeStyle[ev.type] ?? { fg: '#6B7280', bg: '#F3F4F6' };
                return (
                  <div key={ev.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-10 shrink-0 text-center">
                      <p className="text-[10px] font-semibold uppercase" style={{ color: '#8C7E6E', letterSpacing: '0.04em' }}>
                        {d.toLocaleDateString('en', { month: 'short' })}
                      </p>
                      <p className="text-xl font-black leading-none" style={{ color: '#2C2218' }}>{d.getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: '#2C2218' }}>{ev.name}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: ts.fg, background: ts.bg }}>{ev.type}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: '/student/results', label: 'Results', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> },
            { href: '/student/timetable', label: 'Timetable', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
            { href: '/student/attendance', label: 'Attendance', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
            { href: '/student/profile', label: 'My Profile', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
            ...(fees !== null ? [{ href: '/student/fees', label: 'Fees', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> }] : []),
            { href: '/student/library', label: 'Library', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg> },
          ].map(({ href, label, icon }) => (
            <Link key={href} href={href}
              className="bg-white rounded-xl p-4 flex items-center gap-3 transition-colors"
              style={{ border: '1px solid #E2D9CC' }}>
              <span style={{ color: '#145C44' }}>{icon}</span>
              <span className="text-sm font-semibold" style={{ color: '#2C2218' }}>{label}</span>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
