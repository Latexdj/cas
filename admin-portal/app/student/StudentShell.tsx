'use client';

import { ReactNode, useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { getStudent, getStudentSchoolCode, getStudentColors, clearStudent } from '@/lib/student-auth';
import { studentApi } from '@/lib/student-api';
import { HelpWidget, HelpNavItem } from '@/components/HelpWidget';

const PRIMARY = '#3B82F6';

interface NavItem { href: string; label: string; icon: ReactNode; }

type Section = { label: string; hrefs: string[] };

const SECTIONS: Section[] = [
  { label: 'Overview', hrefs: ['/student'] },
  { label: 'Academics', hrefs: ['/student/results', '/student/lms', '/student/lms/pasco', '/student/timetable', '/student/calendar'] },
  { label: 'Records', hrefs: ['/student/attendance', '/student/conduct', '/student/clearance', '/student/exeat'] },
  { label: 'Services', hrefs: ['/student/fees', '/student/library'] },
  { label: 'Account', hrefs: ['/student/profile'] },
];

const OPEN_SECTION_STORAGE_KEY = 'cas_student_sidebar_open_section';

function loadStoredOpenSection(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OPEN_SECTION_STORAGE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch { return null; }
}

function saveStoredOpenSection(label: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (label) localStorage.setItem(OPEN_SECTION_STORAGE_KEY, label);
    else localStorage.removeItem(OPEN_SECTION_STORAGE_KEY);
  } catch { /* ignore */ }
}

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
    href: '/student/lms',
    label: 'LMS',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    href: '/student/lms/pasco',
    label: 'Pasco',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
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
    href: '/student/fees',
    label: 'Fees',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    href: '/student/clearance',
    label: 'Clearance',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
  {
    href: '/student/conduct',
    label: 'Conduct',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    href: '/student/library',
    label: 'Library',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    href: '/student/exeat',
    label: 'Exeat',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M13 4h3a2 2 0 012 2v14" /><path d="M2 20h3" /><path d="M13 20h9" />
        <path d="M10 12v.01" /><path d="M13 4.562v16.157a1 1 0 01-1.242.97L4 20V5.562a2 2 0 011.515-1.94l6-1.5a1 1 0 011.485.94z" />
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

const MOBILE_BAR_HREFS = ['/student', '/student/results', '/student/lms', '/student/attendance', '/student/timetable'];
const NO_SHELL_PATHS   = ['/student/setup', '/student/login'];

export default function StudentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted,  setMounted]  = useState(false);
  const [ready,    setReady]    = useState(false);
  const [primary,  setPrimary]  = useState(PRIMARY);
  const [logoUrl,  setLogoUrl]  = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const isDark = mounted && resolvedTheme === 'dark';

  useEffect(() => {
    if (NO_SHELL_PATHS.includes(pathname)) { setReady(true); return; }
    const schoolCode = getStudentSchoolCode();
    if (!schoolCode) { router.replace('/student/setup'); return; }
    const student = getStudent();
    if (!student) { router.replace('/student/login'); return; }
    if (student.mustChangePassword && pathname !== '/student/change-password') {
      router.replace('/student/change-password'); return;
    }
    const colors = getStudentColors();
    setPrimary(colors.primary || PRIMARY);
    setLogoUrl(colors.logoUrl ?? null);
    setReady(true);
  }, [pathname, router]);

  const handleLogout = useCallback(() => {
    clearStudent();
    router.replace('/student/login');
  }, [router]);

  const isActive = (href: string) =>
    href === '/student' ? pathname === '/student' : pathname.startsWith(href);

  const visibleSections = SECTIONS.map(section => ({
    label: section.label,
    items: section.hrefs
      .map(href => NAV_ITEMS.find(item => item.href === href))
      .filter((item): item is NavItem => !!item),
  })).filter(section => section.items.length > 0);

  useEffect(() => {
    const routeMatch = visibleSections.find(s => s.items.some(i => isActive(i.href)))?.label ?? null;
    if (routeMatch) {
      setOpenSection(routeMatch);
    } else {
      setOpenSection(prev => prev ?? loadStoredOpenSection());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleSectionOpen(label: string) {
    setOpenSection(prev => {
      const next = prev === label ? null : label;
      saveStoredOpenSection(next);
      return next;
    });
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: isDark ? '#0E1A0C' : '#F5F0E8' }}>
        <div className="w-8 h-8 rounded-full border-2 border-b-transparent animate-spin" style={{ borderColor: PRIMARY, borderBottomColor: 'transparent' }} />
      </div>
    );
  }

  if (NO_SHELL_PATHS.includes(pathname)) return <>{children}</>;

  const mobileBarItems  = NAV_ITEMS.filter(item => MOBILE_BAR_HREFS.includes(item.href));
  const mobileMoreItems = NAV_ITEMS.filter(item => !MOBILE_BAR_HREFS.includes(item.href));
  const isMoreActive    = mobileMoreItems.some(item => isActive(item.href));
  const student         = getStudent();

  const navTextColor    = isDark ? 'rgba(255,255,255,0.6)' : '#8C7E6E';
  const navIconColor    = isDark ? 'rgba(255,255,255,0.6)' : '#8C7E6E';
  const sidebarBg       = isDark ? '#0B3D2E' : '#FDFAF5';
  const sidebarBorder   = isDark ? 'rgba(255,255,255,0.08)' : '#E2D9CC';

  return (
    <div className="min-h-screen flex" style={{ background: isDark ? '#0E1A0C' : '#F5F0E8' }}>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 fixed top-0 left-0 h-full z-20 shadow-sm"
        style={{ backgroundColor: sidebarBg, borderRight: `1px solid ${sidebarBorder}` }}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${sidebarBorder}` }}>
          {logoUrl ? (
            <img src={logoUrl} alt="School logo" className="w-9 h-9 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white text-sm font-bold"
              style={{ background: primary }}>S</div>
          )}
          <span className="text-base font-bold leading-tight" style={{ color: primary }}>Student Portal</span>
        </div>

        {/* Student identity chip */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${sidebarBorder}` }}>
          <p className="text-xs font-medium" style={{ color: isDark ? 'rgba(255,255,255,0.35)' : '#8C7E6E' }}>Signed in as</p>
          <p className="text-sm font-semibold truncate" style={{ color: isDark ? 'rgba(255,255,255,0.85)' : '#2C2218' }}>{student?.name}</p>
        </div>

        <nav className="flex-1 py-4 px-3 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {visibleSections.map((section, si) => {
            const isOpen = openSection === section.label;
            const headerIcon = section.items[0]?.icon;
            return (
              <div key={section.label} className={si > 0 ? 'mt-1' : ''}>
                <button
                  type="button"
                  onClick={() => toggleSectionOpen(section.label)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-0.5 border-0 cursor-pointer transition-all duration-200 ease-out"
                  style={{ backgroundColor: isOpen ? `${primary}18` : 'transparent' }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'; }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <span style={{ color: isOpen ? primary : navIconColor }} className="flex-shrink-0">
                    {headerIcon}
                  </span>
                  <span className="flex-1 text-left text-sm font-semibold truncate" style={{ color: isOpen ? primary : navTextColor }}>
                    {section.label}
                  </span>
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
                    className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ease-out"
                    style={{ color: isOpen ? primary : navTextColor, transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="ml-[22px] pl-3 mb-1 border-l" style={{ borderColor: `${primary}22` }}>
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <div key={item.href} className="relative">
                          {active && (
                            <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ backgroundColor: primary }} />
                          )}
                          <Link href={item.href}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors"
                            style={active ? { backgroundColor: `${primary}18`, color: primary } : { color: navTextColor }}>
                            <span style={{ color: active ? primary : navIconColor }} className="flex-shrink-0">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="px-4 py-3" style={{ borderTop: `1px solid ${sidebarBorder}` }}>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ color: '#B83232' }}>
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
        <header className="md:hidden sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: isDark ? '#152210' : '#FDFAF5', borderBottom: `1px solid ${sidebarBorder}` }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-7 h-7 rounded-lg object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: primary }}>S</div>
          )}
          <span className="font-bold text-sm flex-1" style={{ color: primary }}>Student Portal</span>
          <button onClick={handleLogout} className="p-1.5 rounded-lg transition-colors" style={{ color: '#B83232' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </header>

        <main className="flex-1 pb-20 md:pb-6">{children}</main>
      </div>

      <HelpWidget apiClient={studentApi} navItems={visibleSections.flatMap(s => s.items.map((i): HelpNavItem => ({ section: s.label, label: i.label, href: i.href })))} />

      {/* ── Mobile More backdrop ── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-30" style={{ backgroundColor: 'rgba(11,61,46,0.2)' }} onClick={() => setMoreOpen(false)} />
      )}

      {/* ── Mobile More bottom-sheet ── */}
      {moreOpen && (
        <div className={`md:hidden fixed bottom-[60px] left-0 right-0 rounded-t-xl shadow-2xl z-40 px-4 pt-4 pb-5 ${isDark ? 'bg-slate-800 border-t border-slate-700' : 'bg-white border-t border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>More</p>
            <button onClick={() => setMoreOpen(false)}
              className={`w-7 h-7 flex items-center justify-center rounded-full ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-3.5 h-3.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="space-y-1">
            {mobileMoreItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={active ? { backgroundColor: `${primary}18`, color: primary } : { color: isDark ? '#CBD5E1' : '#374151' }}>
                  <span style={{ color: active ? primary : navIconColor }}>{item.icon}</span>
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
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-20 flex ${isDark ? 'bg-slate-800 border-t border-slate-700' : 'bg-white border-t border-slate-200'}`} style={{ height: 60 }}>
        {mobileBarItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium"
              style={{ color: active ? primary : navTextColor }}>
              <span style={{ color: active ? primary : navIconColor }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
        <button onClick={() => setMoreOpen(o => !o)}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium"
          style={{ color: isMoreActive || moreOpen ? primary : navTextColor }}>
          <span style={{ color: isMoreActive || moreOpen ? primary : navIconColor }}>
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
