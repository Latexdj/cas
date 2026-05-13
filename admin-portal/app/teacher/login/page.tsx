'use client';

import { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { saveTeacher, getSchoolCode, getTeacherColors } from '@/lib/teacher-auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function TeacherLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const colors = typeof window !== 'undefined' ? getTeacherColors() : { primary: '#2ab289', accent: '#1a8a6a' };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Teacher ID is required.'); return; }
    if (!password) { setError('Password is required.'); return; }

    const schoolCode = getSchoolCode();
    if (!schoolCode) {
      setError('No school selected. Please set up your school first.');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${BASE}/api/auth/login`, {
        type: 'teacher',
        username: username.trim(),
        password,
        schoolCode,
      });

      const data = res.data;
      saveTeacher({
        id: data.user?.id ?? data.id ?? '',
        name: data.user?.name ?? data.name ?? username,
        role: data.user?.role ?? data.role ?? 'Teacher',
        schoolId: data.user?.schoolId ?? data.schoolId ?? '',
        token: data.token ?? data.accessToken ?? '',
      });

      window.location.href = '/teacher';
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message ?? err.response?.data?.error ?? 'Invalid credentials. Please try again.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#F4EFE6' }}>
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: colors.primary }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#2C2218]">Teacher Login</h1>
          <p className="text-sm text-[#8C7E6E] mt-1">Sign in to your teacher account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1.5">
                Teacher ID
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                placeholder="Your teacher ID"
                autoComplete="username"
                className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white text-[#2C2218]"
                style={{ '--tw-ring-color': colors.primary } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Your password"
                autoComplete="current-password"
                className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white text-[#2C2218]"
              />
            </div>

            {error && (
              <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-40"
              style={{ background: colors.primary }}
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

        <p className="text-center text-sm text-[#8C7E6E] mt-4">
          Wrong school?{' '}
          <Link href="/teacher/setup" className="font-semibold" style={{ color: colors.primary }}>
            Change it
          </Link>
        </p>
      </div>
    </div>
  );
}
