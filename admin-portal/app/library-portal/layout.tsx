'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ThemeToggle } from '@/components/ThemeToggle';

const NO_SHELL = ['/library-portal/login'];

function getLibraryUser() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('cas_lib_user') ?? 'null'); } catch { return null; }
}
function getLibraryColors() {
  if (typeof window === 'undefined') return { primary: '#1a5c38', logoUrl: null };
  return {
    primary: localStorage.getItem('cas_lib_primary') ?? '#1a5c38',
    logoUrl: localStorage.getItem('cas_lib_logo') ?? null,
  };
}

export { getLibraryUser, getLibraryColors };

export default function LibraryPortalLayout({ children }: { children: ReactNode }) {
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
    const user = getLibraryUser();
    if (!user) { router.replace('/library-portal/login'); return; }
    setName(user.name ?? '');
    const c = getLibraryColors();
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
    localStorage.removeItem('cas_lib_token');
    localStorage.removeItem('cas_lib_user');
    localStorage.removeItem('cas_lib_primary');
    localStorage.removeItem('cas_lib_logo');
    router.replace('/library-portal/login');
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <header className={`px-4 md:px-6 py-3 flex items-center gap-3 ${isDark ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-b border-slate-200'}`}>
        {logoUrl ? (
          <img src={logoUrl} alt="logo" className="w-8 h-8 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: primary }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}
        <span className={`font-bold text-sm flex-1 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Library Portal</span>
        <span className={`text-xs hidden sm:block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{name}</span>
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
        >
          Logout
        </button>
      </header>
      <main className="max-w-3xl mx-auto p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
