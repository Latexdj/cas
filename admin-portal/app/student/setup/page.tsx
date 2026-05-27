'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { saveStudentSchoolCode, saveStudentColors } from '@/lib/student-auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function StudentSetupPage() {
  const router = useRouter();
  const [code,    setCode]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [school,  setSchool]  = useState<{ name: string; code: string; primary_color?: string; accent_color?: string; logo_url?: string | null } | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) { setError('Please enter a school code.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await axios.get(`${BASE}/api/auth/school/${code.trim().toUpperCase()}`);
      setSchool({ ...res.data, code: code.trim().toUpperCase() });
    } catch {
      setError('School not found. Check the code and try again.'); setSchool(null);
    } finally { setLoading(false); }
  }

  function handleConfirm() {
    if (!school) return;
    saveStudentSchoolCode(school.code);
    saveStudentColors(school.primary_color ?? '#3B82F6', school.accent_color ?? '#1D4ED8', school.logo_url);
    router.push('/student/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Student Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Enter your school code to get started</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleLookup} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-1.5">School Code</label>
              <input
                type="text" value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); setSchool(null); }}
                placeholder="e.g. ABC123" maxLength={20} autoComplete="off" autoCapitalize="characters"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading || !code.trim()}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition-colors">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Looking up...
                </span>
              ) : 'Find School'}
            </button>
          </form>

          {school && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <div className="rounded-xl bg-blue-50 p-4 mb-4">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-400 mb-1">Found</p>
                <p className="text-lg font-bold text-slate-800">{school.name}</p>
                <p className="text-sm text-slate-500 font-mono">{school.code}</p>
              </div>
              <button onClick={handleConfirm}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm bg-blue-600 hover:bg-blue-700 transition-colors">
                Confirm &amp; Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
