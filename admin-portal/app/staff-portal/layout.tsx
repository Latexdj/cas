'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ThemeToggle } from '@/components/ThemeToggle';
import { staffApi } from '@/lib/staff-api';
import { SessionExpiryWarning } from '@/components/SessionExpiryWarning';
import { markSessionExpired } from '@/lib/session-expiry';

const NO_SHELL = ['/staff-portal/login'];

export interface StaffUser {
  id: string; name: string; email?: string; role: string; staffRoles: string[]; schoolId: string;
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
  const [email,   setEmail]   = useState('');
  const [primary, setPrimary] = useState('#1a5c38');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [showCredModal, setShowCredModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);
  const [credForm, setCredForm] = useState({ currentPassword: '', newEmail: '', newPassword: '', confirmPassword: '' });
  const [credSaving, setCredSaving] = useState(false);
  const [credError,  setCredError]  = useState('');
  const [credSuccess, setCredSuccess] = useState('');

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  useEffect(() => {
    if (NO_SHELL.includes(pathname)) { setReady(true); return; }
    const user = getStaffUser();
    if (!user) { router.replace('/staff-portal/login'); return; }
    setName(user.name ?? '');
    setEmail(user.email ?? '');
    const c = getStaffColors();
    setPrimary(c.primary); setLogoUrl(c.logoUrl);
    setReady(true);
  }, [pathname, router]);

  function openCredModal() {
    setCredForm({ currentPassword: '', newEmail: email, newPassword: '', confirmPassword: '' });
    setCredError(''); setCredSuccess(''); setShowCredModal(true);
  }

  async function submitCredentials() {
    setCredError(''); setCredSuccess('');
    if (!credForm.currentPassword) { setCredError('Enter your current password to confirm changes.'); return; }
    const wantsEmailChange    = credForm.newEmail.trim().toLowerCase() !== email.toLowerCase();
    const wantsPasswordChange = credForm.newPassword.length > 0;
    if (!wantsEmailChange && !wantsPasswordChange) { setCredError('Change your email and/or set a new password first.'); return; }
    if (wantsPasswordChange) {
      if (credForm.newPassword.length < 6) { setCredError('New password must be at least 6 characters.'); return; }
      if (credForm.newPassword !== credForm.confirmPassword) { setCredError('New password and confirmation do not match.'); return; }
    }
    setCredSaving(true);
    try {
      const res = await staffApi.post('/api/auth/change-password', {
        currentPassword: credForm.currentPassword,
        newPassword: wantsPasswordChange ? credForm.newPassword : undefined,
        newEmail: wantsEmailChange ? credForm.newEmail.trim() : undefined,
      });

      const updatedEmail = res.data.email ?? email;
      setEmail(updatedEmail);
      const user = getStaffUser();
      if (user) localStorage.setItem('cas_st_user', JSON.stringify({ ...user, email: updatedEmail }));
      setCredSuccess('Credentials updated successfully.');
      setCredForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCredError(msg ?? 'Failed to update credentials.');
    } finally { setCredSaving(false); }
  }

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

  function handleSessionExpire() {
    markSessionExpired();
    handleLogout();
  }

  return (
    <div className="min-h-screen bg-canvas">
      <SessionExpiryWarning
        apiClient={staffApi}
        tokenKey="cas_st_token"
        refreshPath="/api/auth/refresh"
        onExpire={handleSessionExpire}
      />
      <header className="sticky top-0 z-30 h-14 px-4 md:px-6 flex items-center gap-3 bg-surface border-b border-line print:hidden">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: primary }}>S</div>
        )}
        <span className="font-semibold text-sm flex-1 text-ink">Staff portal</span>
        <ThemeToggle />
        <div className="relative" ref={menuRef}>
          <button type="button" onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
            aria-label={`Account: ${name || 'staff'}`}
            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: primary }}>
            {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'S'}
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-line bg-elevated shadow-lg py-2">
              <div className="px-4 py-2 border-b border-line mb-1">
                <p className="text-sm font-semibold text-ink truncate">{name}</p>
                <p className="text-sm text-ink-muted truncate">{email}</p>
              </div>
              <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); openCredModal(); }}
                className="w-full text-left px-4 min-h-[44px] text-sm text-ink hover:bg-sunken">Change email or password</button>
              <button role="menuitem" type="button" onClick={handleLogout}
                className="w-full text-left px-4 min-h-[44px] text-sm text-ink hover:bg-sunken">Sign out</button>
            </div>
          )}
        </div>
      </header>
      <main data-staff>
        {children}
      </main>

      {/* ── Change Credentials Modal ──────────────────────────────────────── */}
      {showCredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/55 p-4 overflow-y-auto">
          <div className={`rounded-xl shadow-2xl w-full max-w-sm ${isDark ? 'bg-slate-800' : 'bg-white'} my-auto`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Change Login Credentials</p>
              <button onClick={() => setShowCredModal(false)} className={isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className={`text-xs font-semibold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Email</label>
                <input type="email" value={credForm.newEmail}
                  onChange={e => setCredForm(f => ({ ...f, newEmail: e.target.value }))}
                  className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#145C44] ${isDark ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-200 bg-white text-slate-900'}`} />
              </div>
              <div>
                <label className={`text-xs font-semibold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>New Password (leave blank to keep current)</label>
                <input type="password" value={credForm.newPassword}
                  onChange={e => setCredForm(f => ({ ...f, newPassword: e.target.value }))}
                  placeholder="At least 6 characters"
                  className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#145C44] ${isDark ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-200 bg-white text-slate-900'}`} />
              </div>
              {credForm.newPassword.length > 0 && (
                <div>
                  <label className={`text-xs font-semibold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Confirm New Password</label>
                  <input type="password" value={credForm.confirmPassword}
                    onChange={e => setCredForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#145C44] ${isDark ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-200 bg-white text-slate-900'}`} />
                </div>
              )}
              <div>
                <label className={`text-xs font-semibold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Current Password *</label>
                <input type="password" value={credForm.currentPassword}
                  onChange={e => setCredForm(f => ({ ...f, currentPassword: e.target.value }))}
                  placeholder="Required to confirm any change"
                  className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#145C44] ${isDark ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-200 bg-white text-slate-900'}`} />
              </div>
              {credError   && <p className="text-sm text-red-600">{credError}</p>}
              {credSuccess && <p className="text-sm text-[#145C44] dark:text-[#2ab289]">{credSuccess}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowCredModal(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${isDark ? 'border-slate-600 text-slate-300' : 'border-slate-200 text-slate-600'}`}>Close</button>
                <button onClick={submitCredentials} disabled={credSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
                  {credSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
