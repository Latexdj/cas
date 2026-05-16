'use client';

import { ReactNode, useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getTeacher, getSchoolCode, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

const NAV_ITEMS = [
  {
    href: '/teacher',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/teacher/submit',
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
    href: '/teacher/absences',
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
    href: '/teacher/timetable',
    label: 'Timetable',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: '/teacher/history',
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
    href: '/teacher/notifications',
    label: 'Alerts',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
  {
    href: '/teacher/profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

const NO_SHELL_PATHS = ['/teacher/setup', '/teacher/login'];

export default function TeacherShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready,       setReady]       = useState(false);
  const [primary,     setPrimary]     = useState('#2ab289');
  const [logoUrl,     setLogoUrl]     = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    try {
      const { data } = await teacherApi.get<{ count: number }>('/api/notifications/unread-count');
      setUnreadCount(data.count ?? 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (NO_SHELL_PATHS.includes(pathname)) {
      setReady(true);
      return;
    }
    const schoolCode = getSchoolCode();
    if (!schoolCode) {
      router.replace('/teacher/setup');
      return;
    }
    const teacher = getTeacher();
    if (!teacher) {
      router.replace('/teacher/login');
      return;
    }
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    setLogoUrl(colors.logoUrl ?? null);
    setReady(true);
    fetchUnread();
    const interval = setInterval(fetchUnread, 60_000);
    return () => clearInterval(interval);
  }, [pathname, router, fetchUnread]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}>
        <div className="w-8 h-8 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (NO_SHELL_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  const isActive = (href: string) => {
    if (href === '/teacher') return pathname === '/teacher';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#F4EFE6' }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-[#E2D9CC] shadow-sm shrink-0 fixed top-0 left-0 h-full z-20">
        <div className="px-5 py-4 border-b border-[#E2D9CC] flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="School logo" className="w-9 h-9 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white text-sm font-bold"
              style={{ background: primary }}>T</div>
          )}
          <span className="text-base font-bold leading-tight" style={{ color: primary }}>Teacher Portal</span>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active  = isActive(item.href);
            const isAlert = item.href === '/teacher/notifications';
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={active ? { backgroundColor: `${primary}18`, color: primary } : { color: '#8C7E6E' }}
              >
                <span style={{ color: active ? primary : '#8C7E6E' }} className="relative">
                  {item.icon}
                  {isAlert && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                {item.label}
                {isAlert && unreadCount > 0 && (
                  <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                    {unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:ml-60 min-h-screen">
        <main className="flex-1 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2D9CC] z-20 flex">
        {NAV_ITEMS.map((item) => {
          const active  = isActive(item.href);
          const isAlert = item.href === '/teacher/notifications';
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors"
              style={{ color: active ? primary : '#8C7E6E' }}
            >
              <span style={{ color: active ? primary : '#8C7E6E' }} className="relative">
                {item.icon}
                {isAlert && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
