'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { publicApi } from '@/lib/api';

export default function CheckPlacementPage() {
  const { slug }    = useParams<{ slug: string }>();
  const router      = useRouter();
  const [idx,       setIdx]     = useState('');
  const [loading,   setLoading] = useState(false);
  const [error,     setError]   = useState('');

  async function check(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = idx.trim().toUpperCase();
    if (trimmed.length !== 12) { setError('Index number must be exactly 12 characters.'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await publicApi.post(`/api/admissions/${slug}/check`, { index_number: trimmed });

      if (data.already_submitted) {
        router.push(`/admissions/${slug}/apply/${data.token}/complete`);
        return;
      }
      router.push(`/admissions/${slug}/apply/${data.token}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Something went wrong. Please try again.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Check Placement</h1>
          <p className="text-sm text-slate-400 mt-1">Enter your 12-digit BECE index number to verify your placement and begin your application.</p>
        </div>
        <form onSubmit={check} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Index Number</label>
            <input
              value={idx}
              onChange={e => { setIdx(e.target.value.toUpperCase()); setError(''); }}
              maxLength={12}
              placeholder="e.g. 012345678901"
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-green-600"
              autoFocus
            />
            <p className="mt-1 text-xs text-slate-400">{idx.length}/12 characters</p>
          </div>
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl bg-green-600 text-white font-bold text-sm shadow-sm hover:bg-green-700 transition-colors disabled:opacity-50">
            {loading ? 'Checking…' : 'Check Placement'}
          </button>
        </form>
        <button onClick={() => router.back()} className="text-xs text-slate-400 hover:text-slate-600 w-full text-center">
          ← Back to portal
        </button>
      </div>
    </div>
  );
}
