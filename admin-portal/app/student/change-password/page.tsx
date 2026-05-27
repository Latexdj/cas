'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { studentApi } from '@/lib/student-api';
import { getStudent, saveStudent, getStudentColors } from '@/lib/student-auth';

export default function StudentChangePasswordPage() {
  const router = useRouter();
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const colors  = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!current) { setError('Current password is required.'); return; }
    if (next.length < 4) { setError('New password must be at least 4 characters.'); return; }
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    if (next === 'Student123') { setError('Please choose a different password.'); return; }

    setLoading(true);
    try {
      await studentApi.post('/api/auth/change-password', {
        currentPassword: current,
        newPassword:     next,
      });
      const student = getStudent();
      if (student) {
        saveStudent({ ...student, mustChangePassword: false });
      }
      router.replace('/student');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: primary }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Set Your Password</h1>
          <p className="text-sm text-slate-500 mt-1">You must change your password before continuing.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1.5">Current Password</label>
              <input
                type="password" value={current}
                onChange={e => { setCurrent(e.target.value); setError(''); }}
                placeholder="Student123"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 bg-white"
                style={{ ['--tw-ring-color' as string]: primary }}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1.5">New Password</label>
              <input
                type="password" value={next}
                onChange={e => { setNext(e.target.value); setError(''); }}
                placeholder="Min. 4 characters"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1.5">Confirm New Password</label>
              <input
                type="password" value={confirm}
                onChange={e => { setConfirm(e.target.value); setError(''); }}
                placeholder="Repeat new password"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 bg-white"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
              style={{ background: primary }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Saving…
                </span>
              ) : 'Set Password & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
