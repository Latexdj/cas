'use client';

import { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { saveStudent, getStudentSchoolCode, getStudentColors, saveStudentColors } from '@/lib/student-auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function StudentLoginPage() {
  const [studentId, setStudentId] = useState('');
  const [pin,       setPin]       = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [showPin,   setShowPin]   = useState(false);

  const colors = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!studentId.trim()) { setError('Student ID is required.'); return; }
    if (!pin) { setError('PIN is required.'); return; }

    const schoolCode = getStudentSchoolCode();
    if (!schoolCode) { setError('No school selected. Please set up your school first.'); return; }

    setLoading(true);
    try {
      const res = await axios.post(`${BASE}/api/auth/login`, {
        type: 'student',
        username: studentId.trim().toUpperCase(),
        password: pin,
        schoolCode,
      });
      const data = res.data;
      // Update colours from server response
      if (data.primary_color) saveStudentColors(data.primary_color, data.accent_color ?? '#1D4ED8', data.logo_url);
      saveStudent({
        id:       data.id,
        name:     data.name,
        role:     'student',
        schoolId: data.schoolId,
        token:    data.token,
      });
      window.location.href = '/student';
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message ?? err.response?.data?.error ?? 'Invalid Student ID or PIN.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: colors.primary }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Student Login</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your student account</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1.5">Student ID</label>
              <input
                type="text" value={studentId}
                onChange={e => { setStudentId(e.target.value.toUpperCase()); setError(''); }}
                placeholder="Your student ID" autoComplete="username"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1.5">PIN</label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'} value={pin}
                  onChange={e => { setPin(e.target.value); setError(''); }}
                  placeholder="Your PIN" autoComplete="current-password"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
                />
                <button type="button" onClick={() => setShowPin(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPin ? (
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

        <p className="text-center text-sm text-slate-500 mt-4">
          Wrong school?{' '}
          <Link href="/student/setup" className="font-semibold text-blue-600">Change it</Link>
        </p>
        <p className="text-center text-xs text-slate-400 mt-2">
          Default PIN is <span className="font-semibold text-slate-500">Student123</span> — change it after first login.
        </p>
      </div>
    </div>
  );
}
