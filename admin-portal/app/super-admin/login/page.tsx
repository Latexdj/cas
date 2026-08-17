'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { saveSAToken, isSALoggedIn } from '@/lib/super-admin-auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (isSALoggedIn()) router.replace('/super-admin');
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Username is required.'); return; }
    if (!password)         { setError('Password is required.'); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${BASE}/api/auth/login`, {
        type: 'super_admin',
        username: username.trim(),
        password,
      });
      saveSAToken(res.data.token);
      window.location.href = '/super-admin';
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error ?? 'Invalid credentials.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0E1A0C' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#C8973A' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#0B3D2E" strokeWidth={2} className="w-6 h-6">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Super Admin</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>CAS Platform Control</p>
        </div>

        <div className="rounded-xl border p-6 shadow-xl" style={{ backgroundColor: '#152210', borderColor: '#2A3D28' }}>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                placeholder="admin"
                autoComplete="username"
                className="w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none placeholder-slate-500"
                style={{ backgroundColor: '#0E1A0C', border: '1px solid #2A3D28' }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none placeholder-slate-500"
                style={{ backgroundColor: '#0E1A0C', border: '1px solid #2A3D28' }}
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 rounded-lg px-3 py-2" style={{ backgroundColor: 'rgba(127,29,29,0.25)', border: '1px solid rgba(185,28,28,0.4)' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-40"
              style={{ backgroundColor: '#145C44' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
