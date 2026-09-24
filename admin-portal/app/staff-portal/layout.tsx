'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import axios from 'axios';
import { ThemeToggle } from '@/components/ThemeToggle';

const NO_SHELL = ['/staff-portal/login'];
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

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
      const token = getStaffToken();
      const res = await axios.post(`${BASE}/api/auth/change-password`, {
        currentPassword: credForm.currentPassword,
        newPassword: wantsPasswordChange ? credForm.newPassword : undefined,
        newEmail: wantsEmailChange ? credForm.newEmail.trim() : undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });

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
          onClick={openCredModal}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
        >
          Account
        </button>
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

      {/* ── Change Credentials Modal ──────────────────────────────────────── */}
      {showCredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/55 p-4">
          <div className={`rounded-xl shadow-2xl w-full max-w-sm ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
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
