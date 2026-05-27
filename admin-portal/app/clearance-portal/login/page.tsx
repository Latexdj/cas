'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function ClearanceLoginPage() {
  const router = useRouter();
  const [schoolCode, setSchoolCode] = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolCode.trim() || !email.trim() || !password) { setError('All fields are required.'); return; }
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${BASE}/api/auth/clearance-login`, {
        schoolCode: schoolCode.trim().toUpperCase(),
        email: email.trim().toLowerCase(),
        password,
      });
      const data = res.data;
      localStorage.setItem('cas_cl_token', data.token);
      localStorage.setItem('cas_cl_user', JSON.stringify({ id: data.id, name: data.name, role: data.role, schoolId: data.schoolId }));
      if (data.primary_color) localStorage.setItem('cas_cl_primary', data.primary_color);
      if (data.logo_url)      localStorage.setItem('cas_cl_logo',    data.logo_url);
      router.replace('/clearance');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Login failed. Check your details and try again.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#1a5c38' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Clearance Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to process student clearances</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1.5">School Code</label>
              <input type="text" value={schoolCode}
                onChange={e => { setSchoolCode(e.target.value.toUpperCase()); setError(''); }}
                placeholder="e.g. ABC123" maxLength={20} autoCapitalize="characters"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1.5">Email</label>
              <input type="email" value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="your@email.com"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-slate-900" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1.5">Password</label>
              <input type="password" value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Your password"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-slate-900" />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40 transition-colors"
              style={{ background: '#1a5c38' }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
