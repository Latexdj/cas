'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

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
  const [ready,   setReady]   = useState(false);
  const [name,    setName]    = useState('');
  const [primary, setPrimary] = useState('#1a5c38');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
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
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt="logo" className="w-8 h-8 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: primary }}>C</div>
        )}
        <span className="font-bold text-slate-800 text-sm flex-1">Clearance Portal</span>
        <span className="text-xs text-slate-400 hidden sm:block">{name}</span>
        <button onClick={handleLogout} className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100">
          Logout
        </button>
      </header>
      <main className="max-w-2xl mx-auto p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
