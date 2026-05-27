'use client';

import { ReactNode, useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStudent, getStudentSchoolCode, getStudentColors, clearStudent } from '@/lib/student-auth';

const PRIMARY = '#3B82F6';

interface NavItem { href: string; label: string; icon: ReactNode; }

const NAV_ITEMS: NavItem[] = [
  {
    href: '/student',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/student/results',
    label: 'Results',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: '/student/attendance',
    label: 'Attendance',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    href: '/student/timetable',
    label: 'Timetable',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: '/student/calendar',
    label: 'Calendar',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
      </svg>
    ),
  },
  {
    href: '/student/profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

const MOBILE_BAR_HREFS = ['/student', '/student/results', '/student/attendance', '/student/timetable'];
const NO_SHELL_PATHS   = ['/student/setup', '/student/login'];

export default function StudentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [ready,    setReady]    = useState(false);
  const [primary,  setPrimary]  = useState(PRIMARY);
  const [logoUrl,  setLogoUrl]  = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  useEffect(() => {
    if (NO_SHELL_PATHS.includes(pathname)) { setReady(true); return; }
    const schoolCode = getStudentSchoolCode();
    if (!schoolCode) { router.replace('/student/setup'); return; }
    const student = getStudent();
    if (!student) { router.replace('/student/login'); return; }
    const colors = getStudentColors();
    setPrimary(colors.primary || PRIMARY);
    setLogoUrl(colors.logoUrl ?? null);
    setReady(true);
  }, [pathname, router]);

  const handleLogout = useCallback(() => {
    clearStudent();
    router.replace('/student/login');
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: PRIMARY, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (NO_SHELL_PATHS.includes(pathname)) return <>{children}</>;

  const isActive = (href: string) =>
    href === '/student' ? pathname === '/student' : pathname.startsWith(href);

  const mobileBarItems  = NAV_ITEMS.filter(item => MOBILE_BAR_HREFS.includes(item.href));
  const mobileMoreItems = NAV_ITEMS.filter(item => !MOBILE_BAR_HREFS.includes(item.href));
  const isMoreActive    = mobileMoreItems.some(item => isActive(item.href));
  const student         = getStudent();

  return (
    <div className="min-h-screen flex bg-slate-50">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-200 shadow-sm shrink-0 fixed top-0 left-0 h-full z-20">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="School logo" className="w-9 h-9 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white text-sm font-bold"
              style={{ background: primary }}>S</div>
          )}
          <span className="text-base font-bold leading-tight" style={{ color: primary }}>Student Portal</span>
        </div>

        {/* Student identity chip */}
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs text-slate-400 font-medium">Signed in as</p>
          <p className="text-sm font-semibold text-slate-700 truncate">{student?.name}</p>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={active ? { backgroundColor: `${primary}18`, color: primary } : { color: '#64748B' }}>
                <span style={{ color: active ? primary : '#94A3B8' }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-slate-100">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col md:ml-60 min-h-screen">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-7 h-7 rounded-lg object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: primary }}>S</div>
          )}
          <span className="font-bold text-sm flex-1" style={{ color: primary }}>Student Portal</span>
          <button onClick={handleLogout} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </header>

        <main className="flex-1 pb-20 md:pb-6">{children}</main>
      </div>

      {/* ── Mobile More backdrop ── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 bg-black/20 z-30" onClick={() => setMoreOpen(false)} />
      )}

      {/* ── Mobile More bottom-sheet ── */}
      {moreOpen && (
        <div className="md:hidden fixed bottom-[60px] left-0 right-0 bg-white border-t border-slate-200 rounded-t-2xl shadow-2xl z-40 px-4 pt-4 pb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-slate-800">More</p>
            <button onClick={() => setMoreOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-xs font-bold">✕</button>
          </div>
          <div className="space-y-1">
            {mobileMoreItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={active ? { backgroundColor: `${primary}18`, color: primary } : { color: '#374151' }}>
                  <span style={{ color: active ? primary : '#94A3B8' }}>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 opacity-30">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 flex" style={{ height: 60 }}>
        {mobileBarItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium"
              style={{ color: active ? primary : '#94A3B8' }}>
              <span style={{ color: active ? primary : '#94A3B8' }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
        <button onClick={() => setMoreOpen(o => !o)}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium"
          style={{ color: isMoreActive || moreOpen ? primary : '#94A3B8' }}>
          <span style={{ color: isMoreActive || moreOpen ? primary : '#94A3B8' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </span>
          More
        </button>
      </nav>
    </div>
  );
}
