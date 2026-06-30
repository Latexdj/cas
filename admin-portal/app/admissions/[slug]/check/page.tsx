'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { publicApi } from '@/lib/api';

interface PortalInfo {
  school_name: string; portal_logo_url: string | null;
  portal_primary_color: string; portal_accent_color: string;
  website_title: string;
}

export default function CheckPlacementPage() {
  const { slug }   = useParams<{ slug: string }>();
  const router     = useRouter();
  const [info,     setInfo]    = useState<PortalInfo | null>(null);
  const [idx,      setIdx]     = useState('');
  const [loading,  setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error,    setError]   = useState('');
  const [focused,  setFocused] = useState(false);

  useEffect(() => {
    publicApi.get(`/api/admissions/${slug}`)
      .then(({ data }) => setInfo(data))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [slug]);

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
      setLoading(false);
    }
  }

  const primary = info?.portal_primary_color || '#16A34A';
  const accent  = info?.portal_accent_color  || '#15803D';
  const chars   = idx.replace(/\s/g, '').length;
  const filled  = chars === 12;

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%)' }}>

      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-2/5 flex-col items-center justify-center p-12 text-white relative overflow-hidden"
        style={{ background: `linear-gradient(160deg, ${primary} 0%, ${accent} 100%)` }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/10 blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-white/5 blur-3xl translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10 text-center space-y-6 max-w-xs">
          {info?.portal_logo_url && (
            <img src={info.portal_logo_url} alt="Logo" className="w-20 h-20 object-contain rounded-2xl bg-white/15 p-2 mx-auto shadow-2xl" />
          )}
          <div>
            <h2 className="text-2xl font-black leading-tight">{info?.website_title || info?.school_name || 'School Admissions'}</h2>
            <p className="mt-2 text-white/70 text-sm">Online Admission Portal</p>
          </div>
          <div className="space-y-3 text-left">
            {[
              'Verify your CSSPS placement',
              'Fill in your admission form',
              'Upload your documents',
              'Download your admission letter',
            ].map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</div>
                <p className="text-sm text-white/80">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-8">

          {/* Back link */}
          <button onClick={() => router.push(`/admissions/${slug}`)} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to portal
          </button>

          <div className="space-y-2">
            <h1 className="text-3xl font-black text-slate-900">Check Placement</h1>
            <p className="text-slate-500">Enter your 12-digit BECE index number to verify your placement and begin your application.</p>
          </div>

          <form onSubmit={check} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Your Index Number</label>

              {/* Segmented-style input */}
              <div className={`relative rounded-2xl border-2 transition-all duration-200 ${focused ? 'shadow-lg' : 'border-slate-200'}`}
                style={{ borderColor: focused ? primary : undefined }}>
                <input
                  value={idx}
                  onChange={e => { setIdx(e.target.value.toUpperCase().slice(0,12)); setError(''); }}
                  maxLength={12}
                  placeholder="E.g.  0 1 2 3 4 5 6 7 8 9 0 1"
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  className="w-full px-5 py-5 text-xl font-mono font-bold tracking-[0.3em] text-slate-900 bg-transparent focus:outline-none rounded-2xl placeholder:text-slate-300 placeholder:text-base placeholder:tracking-normal placeholder:font-normal"
                  autoFocus
                />
                {filled && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: primary }}>
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* Character progress */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(chars / 12) * 100}%`, backgroundColor: chars === 12 ? primary : '#94A3B8' }} />
                </div>
                <span className={`text-xs font-semibold tabular-nums ${chars === 12 ? 'text-green-600' : 'text-slate-400'}`}>{chars}/12</span>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-100">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit" disabled={loading || chars < 12}
              className="relative w-full py-4 rounded-2xl text-white font-bold text-base shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
              style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-200 rounded-2xl" />
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Verifying Placement…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Verify & Continue
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              )}
            </button>
          </form>

          <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 flex gap-3">
            <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-blue-700 leading-relaxed">Your index number is the 12-digit number on your BECE result slip, provided by CSSPS. Only students on the placement list can apply.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
