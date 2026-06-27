'use client';
import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { getPrincipal, clearPrincipal, getRoleLabel, type PrincipalUser } from '@/lib/principal-auth';

type NavItem = { href: string; label: string; icon: ReactNode };
type Section = { label: string; items: NavItem[] };

const sections: Section[] = [
  {
    label: 'OVERVIEW',
    items: [
      {
        href: '/principal',
        label: 'Dashboard',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
      },
    ],
  },
  {
    label: 'MONITORING',
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
    label: 'ACTIONS',
    items: [
      {
        href: '/principal/leaves',
        label: 'Leave Requests',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />,
      },
      {
        href: '/principal/exeats',
        label: 'Exeat Management',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />,
      },
      {
        href: '/principal/clearance',
        label: 'Student Clearance',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />,
      },
    ],
  },
  {
    label: 'FINANCES',
    items: [
      {
        href: '/principal/fees',
        label: 'Financial Overview',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />,
      },
    ],
  },
  {
    label: 'RECORDS',
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

  useEffect(() => {
    setMounted(true);
    const u = getPrincipal();
    if (!u && !pathname.startsWith('/principal/login') && !pathname.startsWith('/principal/setup')) {
      router.replace('/principal/login');
    } else {
      setUser(u);
    }
  }, [pathname, router]);

  // Skip shell for auth pages
  if (!mounted || pathname === '/principal/login' || pathname === '/principal/setup') {
    return <>{children}</>;
  }

  const allHrefs = sections.flatMap(s => s.items.map(i => i.href));

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
      ].join(' ')}
      style={{ backgroundColor: '#0F172A' }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          {user?.school?.logoUrl ? (
            <img src={user.school.logoUrl} alt="School logo" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="white" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
              </svg>
            </div>
          )}
          <div>
            <p className="text-white text-sm font-bold leading-tight">{user?.school?.name ?? 'Management'}</p>
            <p className="text-xs leading-tight" style={{ color: '#64748B' }}>{user ? getRoleLabel(user.role) : 'Portal'}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3" style={{ scrollbarWidth: 'none' }}>
        {sections.map((section, si) => (
          <div key={section.label} className={si > 0 ? 'mt-5' : ''}>
            <p className="px-3 text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#334155' }}>
              {section.label}
            </p>
            {section.items.map(({ href, label, icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSideOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-all"
                  style={{
                    backgroundColor: active ? 'rgba(16,185,129,0.12)' : 'transparent',
                    color: active ? '#34D399' : '#94A3B8',
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-[17px] h-[17px] flex-shrink-0">
                    {icon}
                  </svg>
                  <span className="truncate">{label}</span>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-400" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        {user && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-white truncate">{user.name}</p>
            <p className="text-[10px] mt-0.5" style={{ color: '#64748B' }}>{getRoleLabel(user.role)}</p>
          </div>
        )}
        <button
          onClick={() => { clearPrincipal(); router.push('/principal/login'); }}
          className="text-xs font-medium transition-colors"
          style={{ color: '#475569', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
        >
          Sign out
        </button>
        <div className="mt-3 pt-3 border-t text-center" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: '#334155' }}>Designed by</p>
          <p className="text-[11px] font-bold mt-0.5" style={{ color: '#34D399' }}>LatexTech</p>
          <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>+233 24 8234 649</p>
        </div>
      </div>
    </aside>
  );

  const currentLabel = sections.flatMap(s => s.items).find(i => isActive(i.href))?.label ?? 'Dashboard';

  return (
    <div className="flex min-h-screen" style={{ background: dark ? '#0F172A' : '#F1F5F9' }}>
      {/* Mobile overlay */}
      {sideOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSideOpen(false)}
        />
      )}

      {sidebar}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 border-b"
          style={{
            background: dark ? '#1E293B' : '#FFFFFF',
            borderColor: dark ? '#1E293B' : '#E2E8F0',
          }}
        >
          <button
            className="md:hidden p-1.5 rounded-lg transition-colors"
            style={{ color: dark ? '#94A3B8' : '#64748B' }}
            onClick={() => setSideOpen(s => !s)}
          >
            <MenuIcon />
          </button>

          <span className="flex-1 text-sm font-semibold truncate" style={{ color: dark ? '#F1F5F9' : '#0F172A' }}>
            {currentLabel}
          </span>

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-lg transition-colors"
            style={{
              background: dark ? '#334155' : '#F1F5F9',
              color: dark ? '#CBD5E1' : '#475569',
            }}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>

        <main className="flex-1 p-5 md:p-7 max-w-screen-xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
