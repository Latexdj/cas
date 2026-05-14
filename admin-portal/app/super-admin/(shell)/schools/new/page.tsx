'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saApi } from '@/lib/super-admin-api';

interface CreatedResult {
  school: { id: string; name: string; code: string; email: string };
  admin: { id: string; name: string };
  subscription: { ends_at: string };
  message: string;
}

const CHECKLIST = [
  'School account created in system',
  'School code noted and ready to share',
  'Admin credentials prepared for handoff',
  '14-day trial subscription activated',
];

export default function NewSchoolPage() {
  const router = useRouter();

  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [address,   setAddress]   = useState('');
  const [adminName,     setAdminName]     = useState('');
  const [adminPin,      setAdminPin]      = useState('');
  const [teacherLimit,  setTeacherLimit]  = useState('10');
  const [loading,       setLoading]       = useState(false);
  const [error,     setError]     = useState('');
  const [result,    setResult]    = useState<CreatedResult | null>(null);
  const [checked,   setChecked]   = useState<Set<number>>(new Set());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim())      { setError('School name is required.'); return; }
    if (!email.trim())     { setError('Email is required.'); return; }
    if (!adminName.trim()) { setError('Admin name is required.'); return; }
    if (adminPin && !/^\d{4,8}$/.test(adminPin)) { setError('PIN must be 4–8 digits.'); return; }
    const limitNum = parseInt(teacherLimit);
    if (!limitNum || limitNum < 10) { setError('Teacher limit must be at least 10.'); return; }

    setLoading(true);
    try {
      const res = await saApi.post('/api/schools', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        adminName: adminName.trim(),
        adminPin: adminPin.trim() || undefined,
        teacherLimit: limitNum,
      });
      setResult(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to create school. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const fmtDate = (iso: string) => {
      const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-green-900/30 border border-green-700 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-green-700 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} className="w-5 h-5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-white">School Created!</p>
              <p className="text-xs text-green-300">All systems are ready</p>
            </div>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">School Name</span>
              <span className="font-semibold text-white">{result.school.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">School Code</span>
              <span className="font-mono font-bold text-indigo-400 text-base">{result.school.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Admin Name</span>
              <span className="font-semibold text-white">{result.admin.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Admin PIN</span>
              <span className="font-mono font-bold text-yellow-400">{adminPin || '1234 (default)'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Teacher Limit</span>
              <span className="font-semibold text-white">{limitNum} teachers</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Trial Ends</span>
              <span className="text-white">{fmtDate(result.subscription.ends_at)}</span>
            </div>
          </div>
        </div>

        {/* Onboarding checklist */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 mb-6">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Onboarding Checklist</p>
          <div className="space-y-3">
            {CHECKLIST.map((item, i) => (
              <button
                key={i}
                onClick={() => {
                  const next = new Set(checked);
                  next.has(i) ? next.delete(i) : next.add(i);
                  setChecked(next);
                }}
                className="flex items-center gap-3 w-full text-left"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  checked.has(i) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-700'
                }`}>
                  {checked.has(i) && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-3 h-3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm ${checked.has(i) ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                  {item}
                </span>
              </button>
            ))}
          </div>
          {checked.size === CHECKLIST.length && (
            <p className="text-xs text-green-400 bg-green-900/30 border border-green-800 rounded-lg px-3 py-2 mt-4">
              All steps complete — school is fully onboarded!
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/super-admin/schools/${result.school.id}`)}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
          >
            View School
          </button>
          <button
            onClick={() => router.push('/super-admin/schools')}
            className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-sm transition-colors"
          >
            All Schools
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-7">
        <button onClick={() => router.push('/super-admin/schools')}
          className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-300">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Add New School</h1>
          <p className="text-xs text-slate-400">Creates account + 14-day trial</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">School Info</p>
          <div className="space-y-3">
            {[
              { label: 'School Name *', value: name, set: setName, placeholder: 'e.g. Accra Academy' },
              { label: 'Email *', value: email, set: setEmail, placeholder: 'contact@school.edu', type: 'email' },
              { label: 'Phone', value: phone, set: setPhone, placeholder: '+233 20 000 0000' },
              { label: 'Address', value: address, set: setAddress, placeholder: 'City, Region, Country' },
            ].map(f => (
              <div key={f.label}>
                <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
                <input
                  type={f.type ?? 'text'}
                  value={f.value}
                  onChange={e => { f.set(e.target.value); setError(''); }}
                  placeholder={f.placeholder}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Admin Account</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Admin Full Name *</label>
              <input
                type="text" value={adminName} onChange={e => { setAdminName(e.target.value); setError(''); }}
                placeholder="e.g. Kofi Mensah"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Admin PIN (4–8 digits, leave blank for 1234)</label>
              <input
                type="text" value={adminPin} onChange={e => { setAdminPin(e.target.value); setError(''); }}
                placeholder="e.g. 5678" maxLength={8}
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Teacher Limit</p>
          <p className="text-xs text-slate-500 mb-4">Maximum number of Active teachers this school can register. Applies to both trial and paid plan.</p>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Number of Teachers *</label>
            <input
              type="number" value={teacherLimit}
              onChange={e => { setTeacherLimit(e.target.value); setError(''); }}
              min="10" placeholder="Minimum 10"
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-xl px-4 py-3">{error}</p>
        )}

        <button type="submit" disabled={loading}
          className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors disabled:opacity-40">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Creating...
            </span>
          ) : 'Create School & Start Trial'}
        </button>
      </form>
    </div>
  );
}
