'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ThemeToggle } from '@/components/ThemeToggle';

const NO_SHELL = ['/staff-portal/login'];

export interface StaffUser {
  id: string; name: string; role: string; staffRoles: string[]; schoolId: string;
}

export function getStaffUser(): StaffUser | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('cas_st_user') ?? 'null'); } catch { return null; }
}

export function getStaffColors() {
  if (typeof window === 'undefined') return { primary: '#1a5c38', logoUrl: null };
  return {
    primary: localStorage.getItem('cas_st_primary') ?? '#1a5c38',
    logoUrl: localStorage.getItem('cas_st_logo') ?? null,
  };
}

export function getStaffToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('cas_st_token') ?? '';
}

export default function StaffPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [ready,   setReady]   = useState(false);
  const [name,    setName]    = useState('');
  const [primary, setPrimary] = useState('#1a5c38');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  useEffect(() => {
    if (NO_SHELL.includes(pathname)) { setReady(true); return; }
    const user = getStaffUser();
    if (!user) { router.replace('/staff-portal/login'); return; }
    setName(user.name ?? '');
    const c = getStaffColors();
    setPrimary(c.primary); setLogoUrl(c.logoUrl);
    setReady(true);
  }, [pathname, router]);

  if (!ready) return (
    <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#1a5c38', borderTopColor: 'transparent' }} />
    </div>
  );

  if (NO_SHELL.includes(pathname)) return <>{children}</>;

  function handleLogout() {
    localStorage.removeItem('cas_st_token');
    localStorage.removeItem('cas_st_user');
    localStorage.removeItem('cas_st_primary');
    localStorage.removeItem('cas_st_accent');
    localStorage.removeItem('cas_st_logo');
    router.replace('/staff-portal/login');
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <header className={`px-4 md:px-6 py-3 flex items-center gap-3 ${isDark ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-b border-slate-200'}`}>
        {logoUrl ? (
          <img src={logoUrl} alt="logo" className="w-8 h-8 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: primary }}>S</div>
        )}
        <span className={`font-bold text-sm flex-1 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Staff Portal</span>
        <span className={`text-xs hidden sm:block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{name}</span>
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
        >
          Logout
        </button>
      </header>
      <main className="max-w-2xl mx-auto p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
