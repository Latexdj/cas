'use client';

import { useState } from 'react';
import { saApi } from '@/lib/super-admin-api';
import { clearSASession } from '@/lib/super-admin-auth';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);
  const [success,         setSuccess]         = useState('');
  const [error,           setError]           = useState('');

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!currentPassword)          { setError('Current password is required.'); return; }
    if (!newPassword)              { setError('New password is required.'); return; }
    if (newPassword.length < 8)    { setError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await saApi.post('/api/super-admin/change-password', { currentPassword, newPassword });
      setSuccess('Password changed. You will be signed out — please log in again with your new password.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => {
        clearSASession();
        router.replace('/super-admin/login');
      }, 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to change password.');
    } finally { setLoading(false); }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Manage your super-admin credentials</p>
      </div>

      {/* Security info */}
      <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-2xl p-4 mb-6 flex gap-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-indigo-300">Session timeout: 30 minutes</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Your session automatically ends after 30 minutes of inactivity. This protects the portal if you step away.
          </p>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-5">Change Password</p>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Current Password</label>
            <input
              type="password" value={currentPassword}
              onChange={e => { setCurrentPassword(e.target.value); setError(''); setSuccess(''); }}
              autoComplete="current-password" placeholder="••••••••"
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">New Password</label>
            <input
              type="password" value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setError(''); setSuccess(''); }}
              autoComplete="new-password" placeholder="Minimum 8 characters"
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Confirm New Password</label>
            <input
              type="password" value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(''); setSuccess(''); }}
              autoComplete="new-password" placeholder="Repeat new password"
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
            />
          </div>

          {error   && <p className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-xl px-4 py-3">{error}</p>}
          {success && <p className="text-xs text-green-400 bg-green-900/30 border border-green-800 rounded-xl px-4 py-3">{success}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors disabled:opacity-40">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Updating...
              </span>
            ) : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
