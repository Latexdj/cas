'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { publicApi } from '@/lib/api';

interface Application {
  id: string; admission_number: string; form_token: string; status: string; form_step: number;
  index_number: string; full_name: string; gender: string; date_of_birth: string | null;
  aggregate: number | null; residential_status: string; program_id: string | null; program_name: string | null;
  hometown: string | null; residential_address: string | null; mobile_number: string | null;
  ghana_card_number: string | null; nhia_number: string | null;
  religion: string | null; religious_denomination: string | null;
  guardian_name: string | null; guardian_relationship: string | null;
  guardian_occupation: string | null; guardian_mobile: string | null;
  picture_url: string | null; bece_results_url: string | null; house: string | null;
  school: {
    school_name: string; portal_primary_color: string; portal_accent_color: string;
    portal_logo_url: string | null; admission_year: number;
    programs: { id: string; name: string }[];
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

const STEPS = [
  { label: 'Personal Info', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { label: 'Academic',      icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { label: 'Guardian',      icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Documents',     icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Review',        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
];

const inputCls = 'w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-current transition-colors bg-white placeholder:text-slate-300';
const labelCls = 'block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2';

export default function ApplicationFormPage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const router          = useRouter();
  const [app,      setApp]      = useState<Application | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [step,     setStep]     = useState(1);
  const [form,     setForm]     = useState<Record<string, string>>({});
  const pictureRef = useRef<HTMLInputElement>(null);
  const beceRef    = useRef<HTMLInputElement>(null);
  const [picB64,   setPicB64]   = useState('');
  const [beceB64,  setBeceB64]  = useState('');
  const [picPreview, setPicPreview] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await publicApi.get(`/api/admissions/${slug}/apply/${token}`);
      if (['completed','reported','migrated'].includes(data.status)) {
        router.replace(`/admissions/${slug}/apply/${token}/complete`);
        return;
      }
      setApp(data);
      setStep(Math.max(1, data.form_step ?? 1));
      setForm({
        full_name:              data.full_name              ?? '',
        date_of_birth:          data.date_of_birth ? data.date_of_birth.slice(0,10) : '',
        gender:                 data.gender                 ?? '',
        hometown:               data.hometown               ?? '',
        residential_address:    data.residential_address    ?? '',
        mobile_number:          data.mobile_number          ?? '',
        ghana_card_number:      data.ghana_card_number      ?? '',
        nhia_number:            data.nhia_number            ?? '',
        residential_status:     data.residential_status     ?? '',
        religion:               data.religion               ?? '',
        religious_denomination: data.religious_denomination ?? '',
        guardian_name:          data.guardian_name          ?? '',
        guardian_relationship:  data.guardian_relationship  ?? '',
        guardian_occupation:    data.guardian_occupation    ?? '',
        guardian_mobile:        data.guardian_mobile        ?? '',
        program_id:             data.program_id             ?? '',
        aggregate:              data.aggregate != null ? String(data.aggregate) : '',
      });
    } catch { setError('Application not found.'); }
    finally { setLoading(false); }
  }, [slug, token, router]);

  useEffect(() => { load(); }, [load]);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  async function saveAndNext() {
    setSaving(true); setError('');
    try {
      const { data } = await publicApi.patch(`/api/admissions/${slug}/apply/${token}`, {
        ...form, form_step: Math.max(step + 1, (app?.form_step ?? 1)),
      });
      setApp(data);
      setStep(s => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed. Please try again.');
    } finally { setSaving(false); }
  }

  async function uploadDocs() {
    if (!picB64 && !beceB64) { setStep(5); return; }
    setUploading(true); setError('');
    try {
      await publicApi.post(`/api/admissions/${slug}/apply/${token}/upload`, {
        picture_data: picB64 || undefined, bece_data: beceB64 || undefined,
      });
      await publicApi.patch(`/api/admissions/${slug}/apply/${token}`, { form_step: 5 });
      await load(); setStep(5);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed.');
    } finally { setUploading(false); }
  }

  async function submit() {
    setSaving(true); setError('');
    try {
      await publicApi.post(`/api/admissions/${slug}/apply/${token}/submit`, {});
      router.push(`/admissions/${slug}/apply/${token}/complete`);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Submission failed.');
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-green-600 border-t-transparent animate-spin mx-auto" />
        <p className="text-sm text-slate-500 font-medium">Loading your application…</p>
      </div>
    </div>
  );
  if (error && !app) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <p className="text-xl font-bold text-red-700">Error</p>
        <p className="text-slate-500 text-sm">{error}</p>
        <button onClick={() => router.back()} className="text-sm text-green-700 underline">Go back</button>
      </div>
    </div>
  );
  if (!app) return null;

  const primary  = app.school.portal_primary_color || '#16A34A';
  const accent   = app.school.portal_accent_color  || '#15803D';
  const programs = app.school.programs ?? [];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4">
          <div className="h-14 flex items-center gap-3">
            {app.school.portal_logo_url
              ? <img src={app.school.portal_logo_url} alt="Logo" className="w-7 h-7 object-contain rounded" />
              : <div className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: primary }}>{app.school.school_name[0]}</div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 truncate">{app.school.school_name}</p>
            </div>
            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">{app.admission_number}</span>
          </div>

          {/* Step progress bar */}
          <div className="pb-3 hidden sm:block">
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => {
                const n = i + 1;
                const done = n < step;
                const active = n === step;
                return (
                  <div key={s.label} className="flex items-center gap-1 flex-1">
                    <button
                      onClick={() => n < step && setStep(n)}
                      disabled={n >= step}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${active ? 'text-white shadow-md' : done ? 'text-white/90 opacity-80' : 'text-slate-400 bg-slate-100'}`}
                      style={active || done ? { backgroundColor: primary } : {}}>
                      {done
                        ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        : <span className="w-3 h-3 flex items-center justify-center">{n}</span>
                      }
                      <span className="hidden md:inline">{s.label}</span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 h-0.5 rounded" style={{ backgroundColor: done ? primary : '#E2E8F0' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile step indicator */}
          <div className="pb-3 sm:hidden flex items-center gap-2">
            <div className="flex gap-1 flex-1">
              {STEPS.map((_, i) => (
                <div key={i} className="flex-1 h-1 rounded-full" style={{ backgroundColor: i < step ? primary : '#E2E8F0' }} />
              ))}
            </div>
            <p className="text-xs text-slate-500 font-medium whitespace-nowrap">Step {step}/{STEPS.length}</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Section heading */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: `linear-gradient(135deg,${primary},${accent})` }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={STEPS[step-1].icon} />
            </svg>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Step {step} of {STEPS.length}</p>
            <h2 className="text-xl font-black text-slate-900">{STEPS[step-1].label}</h2>
          </div>
        </div>

        {/* ── Step 1: Personal ── */}
        {step === 1 && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 space-y-5">
              <div>
                <label className={labelCls}>Full Name *</label>
                <input value={form.full_name} onChange={f('full_name')} className={inputCls} style={{ '--tw-ring-color': primary } as React.CSSProperties} placeholder="Enter your full legal name" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className={labelCls}>Date of Birth *</label>
                  <input type="date" value={form.date_of_birth} onChange={f('date_of_birth')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Gender *</label>
                  <select value={form.gender} onChange={f('gender')} className={inputCls}>
                    <option value="">Select gender…</option>
                    <option>Male</option><option>Female</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Hometown</label>
                  <input value={form.hometown} onChange={f('hometown')} className={inputCls} placeholder="Your hometown" />
                </div>
                <div>
                  <label className={labelCls}>Mobile Number</label>
                  <input value={form.mobile_number} onChange={f('mobile_number')} maxLength={10} className={inputCls} placeholder="0XX XXX XXXX" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Residential Address</label>
                <input value={form.residential_address} onChange={f('residential_address')} className={inputCls} placeholder="Your current address" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className={labelCls}>Ghana Card No.</label>
                  <input value={form.ghana_card_number} onChange={f('ghana_card_number')} className={inputCls} placeholder="GHA-XXXXXXXXX-X" />
                </div>
                <div>
                  <label className={labelCls}>NHIA No.</label>
                  <input value={form.nhia_number} onChange={f('nhia_number')} className={inputCls} placeholder="National health ID" />
                </div>
                <div>
                  <label className={labelCls}>Religion</label>
                  <input value={form.religion} onChange={f('religion')} className={inputCls} placeholder="e.g. Christianity" />
                </div>
                <div>
                  <label className={labelCls}>Denomination</label>
                  <input value={form.religious_denomination} onChange={f('religious_denomination')} className={inputCls} placeholder="e.g. Catholic" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Academic ── */}
        {step === 2 && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 space-y-5">
              {/* Pre-filled from CSSPS */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Pre-filled from CSSPS Placement</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Index Number</p>
                    <p className="font-bold font-mono text-slate-800">{app.index_number}</p>
                  </div>
                  {app.aggregate && (
                    <div>
                      <p className="text-xs text-slate-400">Aggregate</p>
                      <p className="font-bold text-slate-800">{app.aggregate}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Programme *</label>
                  <select value={form.program_id} onChange={f('program_id')} className={inputCls}>
                    <option value="">Select your programme…</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Residential Status *</label>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    {['Boarding','Day'].map(opt => (
                      <label key={opt} className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${form.residential_status === opt ? 'border-current bg-opacity-5' : 'border-slate-200 hover:border-slate-300'}`}
                        style={form.residential_status === opt ? { borderColor: primary, backgroundColor: `${primary}0D` } : {}}>
                        <input type="radio" name="residential_status" value={opt} checked={form.residential_status === opt} onChange={f('residential_status')} className="sr-only" />
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${form.residential_status === opt ? 'border-current' : 'border-slate-300'}`} style={form.residential_status === opt ? { borderColor: primary } : {}}>
                          {form.residential_status === opt && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: primary }} />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{opt}</p>
                          <p className="text-xs text-slate-400">{opt === 'Boarding' ? 'Live on campus' : 'Commute daily'}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Guardian ── */}
        {step === 3 && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 space-y-5">
              <div>
                <label className={labelCls}>Guardian Full Name *</label>
                <input value={form.guardian_name} onChange={f('guardian_name')} className={inputCls} placeholder="Guardian's full name" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className={labelCls}>Relationship *</label>
                  <select value={form.guardian_relationship} onChange={f('guardian_relationship')} className={inputCls}>
                    <option value="">Select…</option>
                    {['Parent','Father','Mother','Guardian','Sibling','Relative','Other'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Occupation</label>
                  <input value={form.guardian_occupation} onChange={f('guardian_occupation')} className={inputCls} placeholder="e.g. Farmer, Teacher" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Guardian Mobile *</label>
                  <input value={form.guardian_mobile} onChange={f('guardian_mobile')} maxLength={10} className={inputCls} placeholder="0XX XXX XXXX" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Documents ── */}
        {step === 4 && (
          <div className="space-y-4">
            {/* Photo upload */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: primary }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-slate-900">Passport Photo *</p>
                  <p className="text-xs text-slate-400">Recent passport-sized photo · JPG or PNG · Max 5 MB</p>
                </div>
              </div>
              <div className="flex items-start gap-5">
                <div className="w-28 h-28 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {picPreview || app.picture_url ? (
                    <img src={picPreview || app.picture_url!} alt="Photo" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block w-full py-3 px-4 rounded-2xl border-2 border-dashed border-slate-200 text-center cursor-pointer hover:border-current transition-colors text-sm font-semibold text-slate-600" style={{ '--tw-border-opacity': 1 } as React.CSSProperties}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = primary)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
                    {picB64 ? '✓ Photo selected — change?' : 'Choose Photo'}
                    <input ref={pictureRef} type="file" accept="image/*" className="sr-only"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (file) { const b64 = await fileToBase64(file); setPicB64(b64); setPicPreview(URL.createObjectURL(file)); }
                      }} />
                  </label>
                  {picB64 && <p className="mt-2 text-xs font-semibold" style={{ color: primary }}>New photo selected — will upload when you continue.</p>}
                  {app.picture_url && !picB64 && <p className="mt-2 text-xs text-green-600 font-semibold">Photo already uploaded.</p>}
                </div>
              </div>
            </div>

            {/* BECE Slip */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: primary }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-slate-900">BECE Results Slip</p>
                  <p className="text-xs text-slate-400">Photo or scan of your result slip · Image or PDF</p>
                </div>
              </div>
              {app.bece_results_url && !beceB64 && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-50 border border-green-200">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-xs text-green-700 font-semibold">Document already uploaded</p>
                  <a href={app.bece_results_url} target="_blank" className="text-xs text-green-600 underline ml-auto">View</a>
                </div>
              )}
              <label className="block w-full py-3 px-4 rounded-2xl border-2 border-dashed border-slate-200 text-center cursor-pointer text-sm font-semibold text-slate-600 transition-colors"
                onMouseEnter={e => (e.currentTarget.style.borderColor = primary)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
                {beceB64 ? '✓ File selected — change?' : (app.bece_results_url ? 'Replace Document' : 'Choose File')}
                <input ref={beceRef} type="file" accept="image/*,.pdf" className="sr-only"
                  onChange={async e => { if (e.target.files?.[0]) setBeceB64(await fileToBase64(e.target.files[0])); }} />
              </label>
              {beceB64 && <p className="text-xs font-semibold" style={{ color: primary }}>File selected — will upload when you continue.</p>}
            </div>
          </div>
        )}

        {/* ── Step 5: Review ── */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Photo header */}
              <div className="p-6 flex items-center gap-4 border-b border-slate-100">
                {app.picture_url
                  ? <img src={app.picture_url} alt="Photo" className="w-20 h-20 rounded-2xl object-cover border-2 border-slate-100 shadow-sm flex-shrink-0" />
                  : <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                }
                <div className="min-w-0">
                  <p className="text-xl font-black text-slate-900">{app.full_name}</p>
                  <p className="text-sm font-mono font-bold mt-0.5" style={{ color: primary }}>{app.admission_number}</p>
                  <p className="text-xs text-slate-400 mt-1">{app.index_number}</p>
                </div>
              </div>
              {/* Detail grid */}
              <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-4">
                {[
                  ['Programme',        app.program_name],
                  ['Residential',      app.residential_status],
                  ['Gender',           app.gender],
                  ['Date of Birth',    app.date_of_birth ? new Date(app.date_of_birth).toLocaleDateString('en-GB') : null],
                  ['Mobile',           app.mobile_number],
                  ['Hometown',         app.hometown],
                  ['Guardian',         app.guardian_name],
                  ['Guardian Mobile',  app.guardian_mobile],
                  ['Ghana Card',       app.ghana_card_number],
                  ['BECE Results',     app.bece_results_url ? 'Uploaded' : null],
                ].filter(([,v]) => v).map(([label, val]) => (
                  <div key={String(label)}>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">{label}</p>
                    <p className="mt-0.5 font-semibold text-slate-800 text-sm">{val}</p>
                  </div>
                ))}
              </div>
            </div>

            {!app.picture_url && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-bold text-red-700 text-sm">Passport photo required</p>
                  <p className="text-xs text-red-600 mt-0.5">Please go back to Step 4 and upload your passport photo before submitting.</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-amber-700">By submitting you confirm all information is accurate. You will not be able to edit your application after submission.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <button
            onClick={() => { if (step > 1) { setStep(step - 1); window.scrollTo({ top:0, behavior:'smooth' }); } else router.push(`/admissions/${slug}`); }}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-slate-600 bg-white border-2 border-slate-200 hover:border-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            {step === 1 ? 'Back to portal' : 'Previous'}
          </button>

          {step < 4 && (
            <button onClick={saveAndNext} disabled={saving}
              className="flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-bold text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
              style={{ background: `linear-gradient(135deg,${primary},${accent})` }}>
              {saving ? <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Saving…</> : <>Save & Continue <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>}
            </button>
          )}
          {step === 4 && (
            <button onClick={uploadDocs} disabled={uploading}
              className="flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-bold text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg,${primary},${accent})` }}>
              {uploading ? <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Uploading…</> : <>{(picB64 || beceB64) ? 'Upload & Continue' : 'Continue'} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>}
            </button>
          )}
          {step === 5 && (
            <button onClick={submit} disabled={saving || !app.picture_url}
              className="flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-bold text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg,${primary},${accent})` }}>
              {saving ? <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Submitting…</> : <>Submit Application <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
