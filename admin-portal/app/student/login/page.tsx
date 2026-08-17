'use client';

import { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { saveStudent, getStudentSchoolCode, getStudentColors, saveStudentColors } from '@/lib/student-auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function StudentLoginPage() {
  const [studentId,  setStudentId]  = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [showPass,   setShowPass]   = useState(false);

  const colors = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!studentId.trim()) { setError('Student ID is required.'); return; }
    if (!password) { setError('Password is required.'); return; }

    const schoolCode = getStudentSchoolCode();
    if (!schoolCode) { setError('No school selected. Please set up your school first.'); return; }

    setLoading(true);
    try {
      const res = await axios.post(`${BASE}/api/auth/login`, {
        type: 'student',
        username: studentId.trim().toUpperCase(),
        password: password,
        schoolCode,
      });
      const data = res.data;
      // Update colours from server response
      if (data.primary_color) saveStudentColors(data.primary_color, data.accent_color ?? '#1D4ED8', data.logo_url);
      saveStudent({
        id:                data.id,
        name:              data.name,
        role:              'student',
        schoolId:          data.schoolId,
        token:             data.token,
        mustChangePassword: !!data.must_change_password,
      });
      window.location.href = data.must_change_password ? '/student/change-password' : '/student';
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message ?? err.response?.data?.error ?? 'Invalid Student ID or password.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{ background: colors.primary }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#1C1208' }}>Student Login</h1>
          <p className="text-sm mt-1" style={{ color: '#8C7E6E' }}>Sign in to your student account</p>
        </div>

        <div className="bg-white rounded-xl border p-6" style={{ borderColor: '#E2D9CC', boxShadow: '0 2px 12px rgba(11,61,46,0.06)' }}>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#8C7E6E' }}>Student ID</label>
              <input
                type="text" value={studentId}
                onChange={e => { setStudentId(e.target.value.toUpperCase()); setError(''); }}
                placeholder="Your student ID" autoComplete="username"
                className="w-full border rounded-xl px-4 py-3 text-sm font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#145C44] bg-white text-slate-800"
                style={{ borderColor: '#E2D9CC' }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#8C7E6E' }}>Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Your password" autoComplete="current-password"
                  className="w-full border rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#145C44] bg-white text-slate-800"
                  style={{ borderColor: '#E2D9CC' }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPass ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-40"
              style={{ background: colors.primary }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-4" style={{ color: '#8C7E6E' }}>
          Wrong school?{' '}
          <Link href="/student/setup" className="font-semibold" style={{ color: '#145C44' }}>Change it</Link>
        </p>
        <p className="text-center text-xs mt-2" style={{ color: '#B0A090' }}>
          Default password is <span className="font-semibold" style={{ color: '#8C7E6E' }}>Student123</span>. Change it after first login.
        </p>
      </div>
    </div>
  );
}
