'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { saveSchoolCode, saveTeacherColors } from '@/lib/teacher-auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface SchoolInfo {
  name: string;
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string | null;
  code: string;
}

export default function TeacherSetupPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [school, setSchool] = useState<SchoolInfo | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter a school code.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await axios.get(`${BASE}/api/auth/school/${code.trim().toUpperCase()}`);
      const d = res.data;
      setSchool({
        name:       d.name,
        code:       d.code ?? code.trim().toUpperCase(),
        primaryColor: d.primary_color,
        accentColor:  d.accent_color,
        logoUrl:      d.logo_url ?? null,
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message ?? err.response?.data?.error ?? 'School not found. Check the code and try again.');
      } else {
        setError('School not found. Check the code and try again.');
      }
      setSchool(null);
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    if (!school) return;
    saveSchoolCode(school.code ?? code.trim().toUpperCase());
    saveTeacherColors(school.primaryColor ?? '#2ab289', school.accentColor ?? '#1a8a6a', school.logoUrl);
    router.push('/teacher/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#F4EFE6' }}>
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: '#2ab289' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#2C2218]">Setup School</h1>
          <p className="text-sm text-[#8C7E6E] mt-1">Enter your school code to get started</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-6">
          <form onSubmit={handleLookup} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1.5">
                School Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError('');
                  setSchool(null);
                }}
                placeholder="e.g. ABC123"
                maxLength={20}
                className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-[#2ab289] bg-white text-[#2C2218]"
                autoComplete="off"
                autoCapitalize="characters"
              />
            </div>

            {error && (
              <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-40"
              style={{ background: '#2ab289' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Looking up...
                </span>
              ) : 'Find School'}
            </button>
          </form>

          {/* Confirmation panel */}
          {school && (
            <div className="mt-5 pt-5 border-t border-[#E2D9CC]">
              <div className="rounded-xl p-4 mb-4" style={{ background: '#F4EFE6' }}>
                <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-1">Found</p>
                <p className="text-lg font-bold text-[#2C2218]">{school.name}</p>
                <p className="text-sm text-[#8C7E6E] font-mono">{school.code ?? code.trim().toUpperCase()}</p>
              </div>
              <button
                onClick={handleConfirm}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm"
                style={{ background: school.primaryColor ?? '#2ab289' }}
              >
                Confirm &amp; Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
