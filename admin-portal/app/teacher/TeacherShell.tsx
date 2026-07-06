'use client';

import { ReactNode, useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { getTeacher, getSchoolCode, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';
import { ThemeToggle } from '@/components/ThemeToggle';

interface NavItem {
  href:              string;
  label:             string;
  badge?:            boolean;
  formTeacherOnly?:  boolean;
  clearanceOnly?:    boolean;
  libraryOnly?:      boolean;
  housemasterOnly?:  boolean;
  hodOnly?:          boolean;
  icon:              ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href:  '/teacher',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href:  '/teacher/submit',
    label: 'Submit',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    href: '/teacher/lms',
    label: 'My Courses',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    href:            '/teacher/form-class',
    label:           'Form Class',
    formTeacherOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    href:     '/teacher/hod',
    label:    'My Dept',
    hodOnly:  true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href:             '/teacher/house-students',
    label:            'My House',
    housemasterOnly:  true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <path d="M9 22V12h6v10" />
        <circle cx="12" cy="7" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    href:        '/teacher/library',
    label:       'Library',
    libraryOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    href:           '/teacher/clearance',
    label:          'Clearance',
    clearanceOnly:  true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
  {
    href:  '/teacher/results',
    label: 'Results',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href:  '/teacher/assessments',
    label: 'Assessments',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <line x1="9" y1="12" x2="15" y2="12" />
        <line x1="9" y1="16" x2="13" y2="16" />
      </svg>
    ),
  },
  {
    href:  '/teacher/meetings',
    label: 'Meetings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    href:  '/teacher/absences',
    label: 'Absences',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    href:  '/teacher/timetable',
    label: 'Timetable',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8"  y1="2" x2="8"  y2="6" />
        <line x1="3"  y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href:  '/teacher/history',
    label: 'History',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <polyline points="12 8 12 12 14 14" />
        <path d="M3.05 11a9 9 0 1 0 .5-4.5" />
        <polyline points="3 3 3 9 9 9" />
      </svg>
    ),
  },
  {
    href:  '/teacher/absences/leaves',
    label: 'Leave',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href:  '/teacher/notifications',
    label: 'Alerts',
    badge: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
  {
    href:  '/teacher/profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

const MOBILE_BAR_HREFS = ['/teacher', '/teacher/meetings', '/teacher/absences', '/teacher/timetable'];

const NO_SHELL_PATHS = ['/teacher/setup', '/teacher/login'];

export default function TeacherShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted,          setMounted]          = useState(false);
  const [ready,            setReady]            = useState(false);
  const [primary,          setPrimary]          = useState('#2ab289');
  const [logoUrl,          setLogoUrl]          = useState<string | null>(null);
  const [unreadCount,      setUnreadCount]      = useState(0);
  const [showNotifs,       setShowNotifs]       = useState(false);
  const [notifs,           setNotifs]           = useState<Array<{ id: string; message: string; link: string | null; is_read: boolean; created_at: string }>>([]);
  const [moreOpen,         setMoreOpen]         = useState(false);
  const [isFormTeacher,    setIsFormTeacher]    = useState(false);
  const [isClearanceStaff, setIsClearanceStaff] = useState(false);
  const [isLibraryTeacher, setIsLibraryTeacher] = useState(false);
  const [isHousemaster,    setIsHousemaster]    = useState(false);
  const [isHod,            setIsHod]            = useState(false);
  const [managementRole,   setManagementRole]   = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const isDark = mounted && resolvedTheme === 'dark';

  const dk = {
    pageBg:        isDark ? '#0F172A' : '#F4EFE6',
    sidebarBg:     isDark ? '#0F172A' : '#ffffff',
    border:        isDark ? 'rgba(255,255,255,0.07)' : '#E2D9CC',
    navText:       isDark ? '#94A3B8' : '#8C7E6E',
    navActiveBg:   isDark ? 'rgba(21,128,61,0.15)' : `${primary}18`,
    navActiveText: isDark ? '#4ADE80' : primary,
    sheetBg:       isDark ? '#0F172A' : '#ffffff',
    closeBtnBg:    isDark ? '#1E293B' : '#F4EFE6',
    closeBtnText:  isDark ? '#94A3B8' : '#8C7E6E',
    moreTitle:     isDark ? '#F1F5F9' : '#2C2218',
    moreItemText:  isDark ? '#CBD5E1' : '#5C4F42',
    tabBarBg:      isDark ? '#0F172A' : '#ffffff',
    footerText:    isDark ? '#475569' : '#8C7E6E',
    brandText:     isDark ? '#4ADE80' : primary,
    sectionLabel:  isDark ? '#334155' : '#94A3B8',
  };

  const fetchUnread = useCallback(async () => {
    try {
      const { data } = await teacherApi.get<Array<{ id: string; message: string; link: string | null; is_read: boolean; created_at: string }>>('/api/result-submissions/notifications');
      setNotifs(data);
      setUnreadCount(data.filter(n => !n.is_read).length);
    } catch { /* ignore */ }
  }, []);

  async function markAllRead() {
    try {
      await teacherApi.post('/api/result-submissions/notifications/mark-read', {});
      setNotifs(n => n.map(x => ({ ...x, is_read: true })));
      setUnreadCount(0);
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    if (NO_SHELL_PATHS.includes(pathname)) { setReady(true); return; }
    const schoolCode = getSchoolCode();
    if (!schoolCode) { router.replace('/teacher/setup'); return; }
    const teacher = getTeacher();
    if (!teacher)   { router.replace('/teacher/login'); return; }
    setManagementRole(teacher.management_role ?? null);
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    setLogoUrl(colors.logoUrl ?? null);
    setReady(true);
    fetchUnread();
    teacherApi.get('/api/form-teacher/assignment')
      .then(r => setIsFormTeacher(!!r.data))
      .catch(() => {});
    teacherApi.get<{ id: string; office_type: string }[]>('/api/clearance/my-offices')
      .then(r => {
        const offices = Array.isArray(r.data) ? r.data : [];
        const houseTypes = ['housemaster', 'senior_housemaster'];
        setIsClearanceStaff(offices.length > 0);
        setIsHousemaster(offices.some(o => houseTypes.includes(o.office_type)));
        setIsHod(offices.some(o => o.office_type === 'hod'));
      })
      .catch(() => {});
    teacherApi.get<{ module_keys: string[] }>('/api/responsibilities/my-modules')
      .then(r => {
        const keys = r.data.module_keys ?? [];
        setIsLibraryTeacher(keys.includes('library'));
        if (keys.includes('hod')) setIsHod(true);
      })
      .catch(() => {});
    const interval = setInterval(fetchUnread, 60_000);
    return () => clearInterval(interval);
  }, [pathname, router, fetchUnread]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: dk.pageBg }}>
        <div className="w-8 h-8 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (NO_SHELL_PATHS.includes(pathname)) return <>{children}</>;

  const allNavHrefs = NAV_ITEMS.map(i => i.href);
  const isActive = (href: string) => {
    if (href === '/teacher') return pathname === '/teacher';
    const hasChildNavItem = allNavHrefs.some(h => h !== href && h.startsWith(href + '/'));
    return pathname === href || (!hasChildNavItem && pathname.startsWith(href));
  };

  const visibleNavItems  = NAV_ITEMS.filter(item =>
    (!item.formTeacherOnly  || isFormTeacher) &&
    (!item.clearanceOnly    || isClearanceStaff) &&
    (!item.libraryOnly      || isLibraryTeacher) &&
    (!item.housemasterOnly  || isHousemaster) &&
    (!item.hodOnly          || isHod)
  );
  const mobileBarItems   = visibleNavItems.filter(item => MOBILE_BAR_HREFS.includes(item.href));
  const mobileMoreItems  = visibleNavItems.filter(item => !MOBILE_BAR_HREFS.includes(item.href));
  const isMoreActive     = mobileMoreItems.some(item => isActive(item.href));

  return (
    <div className="min-h-screen flex" style={{ background: dk.pageBg }}>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 fixed top-0 left-0 h-full z-20 shadow-sm"
        style={{ backgroundColor: dk.sidebarBg, borderRight: `1px solid ${dk.border}` }}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${dk.border}` }}>
          {logoUrl ? (
            <img src={logoUrl} alt="School logo" className="w-9 h-9 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white text-sm font-bold"
              style={{ background: primary }}>T</div>
          )}
          <span className="flex-1 text-base font-bold leading-tight" style={{ color: primary }}>Teacher Portal</span>
          {/* Notifications bell */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setShowNotifs(v => !v);
                if (!showNotifs && unreadCount > 0) markAllRead();
              }}
              style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Notifications"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18, color: dk.navText }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 0, right: 0, background: '#DC2626', color: '#fff', fontSize: 9, fontWeight: 800, minWidth: 14, height: 14, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowNotifs(false)} />
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 8, width: 300, background: isDark ? '#1E293B' : '#fff', border: `1px solid ${dk.border}`, borderRadius: 14, boxShadow: '0 10px 40px rgba(0,0,0,0.15)', zIndex: 50, maxHeight: 380, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '10px 14px', borderBottom: `1px solid ${dk.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#F1F5F9' : '#0F172A' }}>Notifications</span>
                    <button onClick={markAllRead} style={{ fontSize: 11, color: primary, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Mark all read</button>
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {notifs.length === 0 ? (
                      <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12, color: '#94A3B8' }}>No notifications</div>
                    ) : notifs.map(n => (
                      <div
                        key={n.id}
                        onClick={() => { if (n.link && typeof window !== 'undefined') window.location.href = n.link; setShowNotifs(false); }}
                        style={{ padding: '9px 14px', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC'}`, cursor: n.link ? 'pointer' : 'default', background: n.is_read ? 'transparent' : (isDark ? 'rgba(21,128,61,0.08)' : '#F0FDF4') }}
                      >
                        <p style={{ fontSize: 12, color: isDark ? '#E2E8F0' : '#0F172A', margin: 0, lineHeight: 1.4 }}>{n.message}</p>
                        <p style={{ fontSize: 10, color: '#94A3B8', margin: '2px 0 0' }}>
                          {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto no-scrollbar">
          {visibleNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={active ? { backgroundColor: dk.navActiveBg, color: dk.navActiveText } : { color: dk.navText }}
              >
                <span style={{ color: active ? dk.navActiveText : dk.navText }} className="relative">
                  {item.icon}
                  {item.badge && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                {item.label}
                {item.badge && unreadCount > 0 ? (
                  <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                    {unreadCount}
                  </span>
                ) : active ? (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dk.navActiveText }} />
                ) : null}
              </Link>
            );
          })}
        </nav>
        {managementRole && (
          <div className="px-3 pb-2">
            <a
              href="/principal"
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold w-full transition-colors"
              style={{ background: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5', color: '#059669' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
                <path d="M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18" />
              </svg>
              Management Portal
            </a>
          </div>
        )}
        <div className="px-4 py-3.5 text-center" style={{ borderTop: `1px solid ${dk.border}` }}>
          <div className="flex justify-center mb-2">
            <ThemeToggle />
          </div>
          <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: dk.footerText }}>Designed by</p>
          <p className="text-[11px] font-bold mt-0.5" style={{ color: dk.brandText }}>LatexTech</p>
          <p className="text-[9px] mt-0.5" style={{ color: dk.footerText }}>+233 24 8234 649</p>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col md:ml-60 min-h-screen">
        <main className="flex-1 pb-20 md:pb-6">{children}</main>
      </div>

      {/* ── Mobile: More bottom-sheet backdrop ── */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/20 z-30"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* ── Mobile: More bottom-sheet panel ── */}
      {moreOpen && (
        <div className="md:hidden fixed bottom-[60px] left-0 right-0 rounded-t-2xl shadow-2xl z-40 px-4 pt-4 pb-5"
          style={{ backgroundColor: dk.sheetBg, borderTop: `1px solid ${dk.border}` }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold" style={{ color: dk.moreTitle }}>More</p>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button
                onClick={() => setMoreOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold"
                style={{ backgroundColor: dk.closeBtnBg, color: dk.closeBtnText }}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {managementRole && (
              <a
                href="/principal"
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5', color: '#059669' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
                  <path d="M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18" />
                </svg>
                <span className="flex-1">Management Portal</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 opacity-30">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </a>
            )}
            {mobileMoreItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={active ? { backgroundColor: dk.navActiveBg, color: dk.navActiveText } : { color: dk.moreItemText }}
                >
                  <span style={{ color: active ? dk.navActiveText : dk.navText }} className="relative">
                    {item.icon}
                    {item.badge && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && unreadCount > 0 && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{unreadCount}</span>
                  )}
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex" style={{ height: 60, backgroundColor: dk.tabBarBg, borderTop: `1px solid ${dk.border}` }}>
        {mobileBarItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors"
              style={{ color: active ? dk.navActiveText : dk.navText }}
            >
              <span style={{ color: active ? dk.navActiveText : dk.navText }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(o => !o)}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors"
          style={{ color: isMoreActive || moreOpen ? dk.navActiveText : dk.navText }}
        >
          <span style={{ color: isMoreActive || moreOpen ? dk.navActiveText : dk.navText }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </span>
          More
        </button>
      </nav>
    </div>
  );
}
