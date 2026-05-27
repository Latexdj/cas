'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ThemeToggle } from '@/components/ThemeToggle';

const NO_SHELL = ['/clearance-portal/login'];

function getClearanceUser() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('cas_cl_user') ?? 'null'); } catch { return null; }
}
function getClearanceColors() {
  if (typeof window === 'undefined') return { primary: '#1a5c38', logoUrl: null };
  return {
    primary: localStorage.getItem('cas_cl_primary') ?? '#1a5c38',
    logoUrl: localStorage.getItem('cas_cl_logo') ?? null,
  };
}

export { getClearanceUser, getClearanceColors };

export default function ClearanceLayout({ children }: { children: ReactNode }) {
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
    const user = getClearanceUser();
    if (!user) { router.replace('/clearance-portal/login'); return; }
    setName(user.name ?? '');
    const c = getClearanceColors();
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
    localStorage.removeItem('cas_cl_token');
    localStorage.removeItem('cas_cl_user');
    localStorage.removeItem('cas_cl_primary');
    localStorage.removeItem('cas_cl_logo');
    router.replace('/clearance-portal/login');
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      {/* Top bar */}
      <header className={`px-4 md:px-6 py-3 flex items-center gap-3 ${isDark ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-b border-slate-200'}`}>
        {logoUrl ? (
          <img src={logoUrl} alt="logo" className="w-8 h-8 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: primary }}>C</div>
        )}
        <span className={`font-bold text-sm flex-1 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Clearance Portal</span>
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
