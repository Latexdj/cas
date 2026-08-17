'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { isSALoggedIn, clearSASession, touchSAActivity } from '@/lib/super-admin-auth';

const NAV = [
  { href: '/super-admin',          label: 'Dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/super-admin/schools',  label: 'Schools',    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { href: '/super-admin/stats',    label: 'Statistics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { href: '/super-admin/audit',    label: 'Audit Log',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { href: '/super-admin/settings', label: 'Settings',   icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export default function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  // Auth guard + session timeout
  const checkSession = useCallback(() => {
    if (!isSALoggedIn()) {
      clearSASession();
      router.replace('/super-admin/login');
    }
  }, [router]);

  useEffect(() => {
    checkSession();
    // Check every 60 seconds
    const interval = setInterval(checkSession, 60_000);
    // Reset timer on any user activity
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const handler = () => touchSAActivity();
    events.forEach(ev => window.addEventListener(ev, handler, { passive: true }));
    return () => {
      clearInterval(interval);
      events.forEach(ev => window.removeEventListener(ev, handler));
    };
  }, [checkSession]);

  function handleLogout() {
    clearSASession();
    router.replace('/super-admin/login');
  }

  return (
    <div className="flex h-screen" style={{ background: '#0E1A0C' }}>
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col" style={{ backgroundColor: '#0B3D2E', borderRight: '1px solid #2A3D28' }}>
        {/* Logo */}
        <div className="px-5 py-5" style={{ borderBottom: '1px solid #2A3D28' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#C8973A' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#0B3D2E" strokeWidth={2} className="w-4 h-4">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-white leading-none">CAS Admin</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(200,151,58,0.55)' }}>Super Admin</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto no-scrollbar">
          {NAV.map(item => {
            const active = item.href === '/super-admin'
              ? pathname === '/super-admin'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={active
                  ? { backgroundColor: 'rgba(200,151,58,0.15)', color: '#C8973A' }
                  : { color: 'rgba(255,255,255,0.55)' }
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
                {active && <span className="ml-auto w-1 h-4 rounded-full" style={{ backgroundColor: '#C8973A' }} />}
              </Link>
            );
          })}
        </nav>

        {/* Logout + credit */}
        <div className="px-3 py-4 space-y-3" style={{ borderTop: '1px solid #2A3D28' }}>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ color: 'rgba(255,255,255,0.45)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)'; }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
          <div className="pt-2.5 text-center" style={{ borderTop: '1px solid rgba(42,61,40,0.6)' }}>
            <p className="text-[9px] font-semibold" style={{ color: 'rgba(255,255,255,0.25)' }}>Designed by</p>
            <p className="text-[11px] font-bold mt-0.5" style={{ color: '#C8973A' }}>LatexTech</p>
            <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>+233 24 8234 649</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-h-0">
        {children}
      </main>
    </div>
  );
}
