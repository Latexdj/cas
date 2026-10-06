'use client';
import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { getPrincipal, clearPrincipal, getRoleLabel, type PrincipalUser } from '@/lib/principal-auth';
import { principalApi } from '@/lib/principal-api';
import { HelpWidget, HelpNavItem } from '@/components/HelpWidget';
import { useEnabledModules } from '@/hooks/useEnabledModules';

type NavItem = { href: string; label: string; icon: ReactNode; module?: string };
type Section = { label: string; items: NavItem[] };

const OPEN_SECTION_STORAGE_KEY = 'cas_principal_sidebar_open_section';

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

function findRouteSectionLabel(secs: Section[], pathname: string): string | null {
  // A plain prefix match (pathname.startsWith(href + '/')) misfires for a
  // root route like '/principal' (Dashboard), since every other principal
  // route is nested under it — every page would match Overview first. Only
  // prefix-match when no other href is itself more specific, mirroring the
  // guard isActive() already uses for nav-item highlighting below.
  const allHrefs = secs.flatMap(s => s.items.map(i => i.href));
  const isRouteActive = (href: string) => {
    const hasChild = allHrefs.some(h => h !== href && h.startsWith(href + '/'));
    return pathname === href || (!hasChild && pathname.startsWith(href + '/'));
  };
  for (const section of secs) {
    if (section.items.some(item => isRouteActive(item.href))) return section.label;
  }
  return null;
}

const sections: Section[] = [
  {
    label: 'Overview',
    items: [
      {
        href: '/principal',
        label: 'Dashboard',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
      },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      {
        href: '/principal/occupancy',
        label: 'Classroom Occupancy',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />,
      },
      {
        href: '/principal/attendance',
        label: 'Teacher Attendance',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
      },
    ],
  },
  {
    label: 'Actions',
    items: [
      {
        href: '/principal/leaves',
        label: 'Leave Requests',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />,
      },
      {
        href: '/principal/exeats',
        label: 'Exeat Management',
        module: 'exeat',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />,
      },
      {
        href: '/principal/discipline',
        label: 'Discipline Approvals',
        module: 'discipline',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />,
      },
      {
        href: '/principal/general-letters',
        label: 'Letter Approvals',
        module: 'discipline',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />,
      },
      {
        href: '/principal/clearance',
        label: 'Student Clearance',
        module: 'clearance',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />,
      },
    ],
  },
  {
    label: 'Finances',
    items: [
      {
        href: '/principal/fees',
        label: 'Financial Overview',
        module: 'fees',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />,
      },
    ],
  },
  {
    label: 'Boarding',
    items: [
      {
        href: '/principal/resumption',
        label: 'Resumption Register',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />,
      },
      {
        href: '/principal/roll-call',
        label: 'Roll Call',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />,
      },
    ],
  },
  {
    label: 'Records',
    items: [
      {
        href: '/principal/personnel',
        label: 'Personnel Records',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />,
      },
      {
        href: '/principal/reports',
        label: 'Reports',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
      },
      {
        href: '/principal/entry-grades',
        label: 'Entry Grades',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25a2.25 2.25 0 01-2.25 2.25H18m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />,
      },
      {
        href: '/principal/exam-performance',
        label: 'Exam Performance',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />,
      },
    ],
  },
];

function MenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}

export default function PrincipalShell({ children }: { children: ReactNode }) {
  const pathname            = usePathname();
  const router              = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted,  setMounted]  = useState(false);
  const [user,     setUser]     = useState<PrincipalUser | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const enabledModules = useEnabledModules(principalApi, user?.schoolId, user?.id);

  useEffect(() => {
    setMounted(true);
    const u = getPrincipal();
    if (!u && !pathname.startsWith('/principal/login') && !pathname.startsWith('/principal/setup')) {
      router.replace('/principal/login');
    } else {
      setUser(u);
    }
  }, [pathname, router]);

  useEffect(() => {
    const routeMatch = findRouteSectionLabel(sections, pathname);
    if (routeMatch) {
      setOpenSection(routeMatch);
    } else {
      setOpenSection(prev => prev ?? loadStoredOpenSection());
    }
  }, [pathname]);

  function toggleSectionOpen(label: string) {
    setOpenSection(prev => {
      const next = prev === label ? null : label;
      saveStoredOpenSection(next);
      return next;
    });
  }

  // Skip shell for auth pages
  if (!mounted || pathname === '/principal/login' || pathname === '/principal/setup') {
    return <>{children}</>;
  }

  const visibleSections = sections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (!item.module) return true;
      if (enabledModules === null) return true;
      return enabledModules.includes(item.module);
    }),
  })).filter(section => section.items.length > 0);

  const allHrefs = visibleSections.flatMap(s => s.items.map(i => i.href));

  function isActive(href: string) {
    const hasChild = allHrefs.some(h => h !== href && h.startsWith(href + '/'));
    return pathname === href || (!hasChild && pathname.startsWith(href + '/'));
  }

  const dark = mounted && theme === 'dark';

  const sidebar = (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-50 w-56 flex flex-col flex-shrink-0',
        'transition-transform duration-300 ease-in-out',
        sideOpen ? 'translate-x-0' : '-translate-x-full',
        'md:relative md:translate-x-0 md:z-auto',
        'print:hidden',
      ].join(' ')}
      style={{ backgroundColor: '#0B3D2E' }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          {user?.school?.logoUrl ? (
            <img src={user.school.logoUrl} alt="School logo" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#145C44' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="white" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
              </svg>
            </div>
          )}
          <div>
            <p className="text-white text-sm font-bold leading-tight">{user?.school?.name ?? 'Management'}</p>
            <p className="text-xs leading-tight" style={{ color: 'rgba(200,151,58,0.6)' }}>{user ? getRoleLabel(user.role) : 'Portal'}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3" style={{ scrollbarWidth: 'none' }}>
        {visibleSections.map((section, si) => {
          const isOpen = openSection === section.label;
          const headerIcon = section.items[0]?.icon;
          return (
          <div key={section.label} className={si > 0 ? 'mt-1' : ''}>
            <button
              type="button"
              onClick={() => toggleSectionOpen(section.label)}
              className={[
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-0.5',
                'border-0 cursor-pointer transition-all duration-200 ease-out',
                isOpen ? 'bg-[rgba(200,151,58,0.12)]' : 'bg-transparent hover:bg-white/[0.05]',
              ].join(' ')}
            >
              <svg
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
                className="w-[17px] h-[17px] flex-shrink-0 transition-colors duration-200"
                style={{ color: isOpen ? '#C8973A' : 'rgba(255,255,255,0.6)' }}
              >
                {headerIcon}
              </svg>
              <span
                className="flex-1 text-left text-sm font-semibold truncate transition-colors duration-200"
                style={{ color: isOpen ? '#C8973A' : 'rgba(255,255,255,0.78)' }}
              >
                {section.label}
              </span>
              <svg
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
                className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ease-out"
                style={{
                  color: isOpen ? '#C8973A' : 'rgba(255,255,255,0.4)',
                  transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isOpen && (
              <div className="ml-[22px] pl-3 mb-1 border-l" style={{ borderColor: 'rgba(200,151,58,0.14)' }}>
                {section.items.map(({ href, label, icon }) => {
                  const active = isActive(href);
                  return (
                    <div key={href} className="relative">
                      {active && (
                        <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ backgroundColor: '#C8973A' }} />
                      )}
                      <Link
                        href={href}
                        onClick={() => setSideOpen(false)}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium mb-0.5 transition-all"
                        style={{
                          backgroundColor: active ? 'rgba(200,151,58,0.15)' : 'transparent',
                          color: active ? '#C8973A' : 'rgba(255,255,255,0.55)',
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-[17px] h-[17px] flex-shrink-0">
                          {icon}
                        </svg>
                        <span className="truncate">{label}</span>
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

      {/* Footer */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        {user && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-white truncate">{user.name}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(200,151,58,0.6)' }}>{getRoleLabel(user.role)}</p>
          </div>
        )}
        <button
          onClick={() => { clearPrincipal(); router.push('/principal/login'); }}
          className="text-xs font-medium transition-colors"
          style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
        >
          Sign out
        </button>
        <div className="mt-3.5 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[9px] text-center font-bold" style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.09em' }}>
            COMPREHENSIVE ACADEMIC <span style={{ color: '#C8973A' }}>SUITE</span>
          </p>
          <div className="mt-3 pt-3 flex items-center gap-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-extrabold tracking-tight"
              style={{ background: 'linear-gradient(135deg, #E8B85C, #C8973A)', color: '#0B3D2E', boxShadow: '0 2px 6px rgba(200,151,58,0.3)' }}
            >
              LT
            </div>
            <div className="w-px self-stretch flex-shrink-0" style={{ background: 'linear-gradient(180deg, transparent, rgba(200,151,58,0.25), transparent)' }} />
            <div className="text-left leading-tight min-w-0">
              <p className="text-[8px] font-semibold truncate" style={{ color: 'rgba(200,151,58,0.55)', letterSpacing: '0.1em' }}>DESIGNED BY</p>
              <p className="text-[11px] font-bold truncate" style={{ color: '#C8973A' }}>LatexTech</p>
            </div>
            <div className="w-px self-stretch flex-shrink-0" style={{ background: 'linear-gradient(180deg, transparent, rgba(200,151,58,0.25), transparent)' }} />
            <div className="flex items-center gap-1 min-w-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.8} className="w-3 h-3 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              <span className="text-[8px] leading-tight" style={{ color: 'rgba(255,255,255,0.3)' }}>+233 24<br />8234 649</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );

  const currentLabel = visibleSections.flatMap(s => s.items).find(i => isActive(i.href))?.label ?? 'Dashboard';

  return (
    <div className="flex min-h-screen" style={{ background: dark ? '#0E1A0C' : '#F5F0E8' }}>
      {/* Mobile overlay */}
      {sideOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(11,61,46,0.55)' }}
          onClick={() => setSideOpen(false)}
        />
      )}

      {sidebar}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 border-b print:hidden"
          style={{
            background: dark ? '#152210' : '#FDFAF5',
            borderColor: dark ? 'rgba(255,255,255,0.07)' : '#E8E0D4',
          }}
        >
          <button
            className="md:hidden p-1.5 rounded-lg transition-colors"
            style={{ color: dark ? '#94A3B8' : '#64748B' }}
            onClick={() => setSideOpen(s => !s)}
          >
            <MenuIcon />
          </button>

          <span className="flex-1 text-sm font-semibold truncate" style={{ color: dark ? '#FDFAF5' : '#2C2218' }}>
            {currentLabel}
          </span>

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-lg transition-colors"
            style={{
              background: dark ? 'rgba(255,255,255,0.07)' : '#F0EBE1',
              color: dark ? '#C8973A' : '#8C7E6E',
            }}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>

        <main className="flex-1 p-5 md:p-7 max-w-screen-xl w-full mx-auto">
          {children}
        </main>
      </div>
      <HelpWidget apiClient={principalApi} navItems={visibleSections.flatMap(s => s.items.map((i): HelpNavItem => ({ section: s.label, label: i.label, href: i.href })))} />
    </div>
  );
}
