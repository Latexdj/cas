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
    school_name: string; portal_primary_color: string; portal_logo_url: string | null; admission_year: number;
    programs: { id: string; name: string }[];
  };
}

const inputCls = 'mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';
const labelCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

const STEPS = ['Personal Info', 'Academic & Programme', 'Guardian Info', 'Documents', 'Review & Submit'];

export default function ApplicationFormPage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const router          = useRouter();
  const [app,     setApp]     = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [step,    setStep]    = useState(1);
  const [form,    setForm]    = useState<Record<string, string>>({});
  const pictureRef = useRef<HTMLInputElement>(null);
  const beceRef    = useRef<HTMLInputElement>(null);
  const [picB64,  setPicB64]  = useState('');
  const [beceB64, setBeceB64] = useState('');
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
        date_of_birth:          data.date_of_birth          ? data.date_of_birth.slice(0, 10) : '',
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
      });
    } catch { setError('Application not found. Please check your index number and try again.'); }
    finally { setLoading(false); }
  }, [slug, token, router]);

  useEffect(() => { load(); }, [load]);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  async function saveAndNext() {
    setSaving(true); setError('');
    try {
      const payload = { ...form, form_step: Math.max(step + 1, (app?.form_step ?? 1)) };
      const { data } = await publicApi.patch(`/api/admissions/${slug}/apply/${token}`, payload);
      setApp(data);
      if (step < 5) setStep(step + 1);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed. Please try again.');
    } finally { setSaving(false); }
  }

  async function uploadDocs() {
    if (!picB64 && !beceB64) { setStep(5); return; }
    setUploading(true); setError('');
    try {
      await publicApi.post(`/api/admissions/${slug}/apply/${token}/upload`, {
        picture_data: picB64 || undefined,
        bece_data:    beceB64 || undefined,
      });
      await publicApi.patch(`/api/admissions/${slug}/apply/${token}`, { form_step: 5 });
      await load(); setStep(5);
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
      <div className="w-10 h-10 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
    </div>
  );
  if (error && !app) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center space-y-3 max-w-sm">
        <p className="text-xl font-bold text-red-700">Error</p>
        <p className="text-slate-500 text-sm">{error}</p>
        <button onClick={() => router.back()} className="text-sm text-green-700 underline">Go back</button>
      </div>
    </div>
  );
  if (!app) return null;

  const primary  = app.school.portal_primary_color || '#16A34A';
  const programs = app.school.programs ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          {app.school.portal_logo_url && (
            <img src={app.school.portal_logo_url} alt="Logo" className="w-8 h-8 object-contain rounded" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500">{app.school.school_name}</p>
            <p className="text-sm font-bold text-slate-900 truncate">{app.full_name || 'Admission Application'}</p>
          </div>
          <span className="font-mono text-xs text-slate-400">{app.admission_number}</span>
        </div>
        {/* Step bar */}
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 h-1.5 rounded-full transition-colors"
                style={{ backgroundColor: i < step ? primary : '#E2E8F0' }} />
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">Step {step} of {STEPS.length}: {STEPS[step - 1]}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Step 1: Personal Info */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Personal Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Full Name *</label>
                <input value={form.full_name} onChange={f('full_name')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date of Birth *</label>
                <input type="date" value={form.date_of_birth} onChange={f('date_of_birth')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Gender *</label>
                <select value={form.gender} onChange={f('gender')} className={inputCls}>
                  <option value="">Select…</option>
                  <option>Male</option><option>Female</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Hometown</label>
                <input value={form.hometown} onChange={f('hometown')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Mobile Number</label>
                <input value={form.mobile_number} onChange={f('mobile_number')} maxLength={10} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Residential Address</label>
                <input value={form.residential_address} onChange={f('residential_address')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Ghana Card No.</label>
                <input value={form.ghana_card_number} onChange={f('ghana_card_number')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>NHIA No.</label>
                <input value={form.nhia_number} onChange={f('nhia_number')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Religion</label>
                <input value={form.religion} onChange={f('religion')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Religious Denomination</label>
                <input value={form.religious_denomination} onChange={f('religious_denomination')} className={inputCls} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Academic */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Academic & Programme</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>BECE Index Number</label>
                <input value={app.index_number} disabled className={`${inputCls} bg-slate-50 text-slate-400`} />
              </div>
              <div>
                <label className={labelCls}>Aggregate</label>
                <input type="number" value={form.aggregate ?? app.aggregate ?? ''} onChange={f('aggregate')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Programme *</label>
                <select value={form.program_id} onChange={f('program_id')} className={inputCls}>
                  <option value="">Select programme…</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Residential Status *</label>
                <select value={form.residential_status} onChange={f('residential_status')} className={inputCls}>
                  <option value="">Select…</option>
                  <option>Boarding</option><option>Day</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Guardian */}
        {step === 3 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Guardian Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Guardian Full Name *</label>
                <input value={form.guardian_name} onChange={f('guardian_name')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Relationship *</label>
                <select value={form.guardian_relationship} onChange={f('guardian_relationship')} className={inputCls}>
                  <option value="">Select…</option>
                  {['Parent','Father','Mother','Guardian','Sibling','Relative','Other'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Occupation</label>
                <input value={form.guardian_occupation} onChange={f('guardian_occupation')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Mobile Number *</label>
                <input value={form.guardian_mobile} onChange={f('guardian_mobile')} maxLength={10} className={inputCls} />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Documents */}
        {step === 4 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
            <h2 className="text-lg font-bold text-slate-900">Upload Documents</h2>
            <div>
              <label className={labelCls}>Passport Photo *</label>
              <p className="text-xs text-slate-400 mt-0.5 mb-2">Recent passport-sized photograph (JPG or PNG, max 5MB)</p>
              {app.picture_url && (
                <img src={app.picture_url} alt="Current photo" className="w-24 h-24 rounded-xl object-cover border border-slate-200 mb-2" />
              )}
              <input ref={pictureRef} type="file" accept="image/*" className="text-sm text-slate-600 w-full"
                onChange={async e => { if (e.target.files?.[0]) setPicB64(await fileToBase64(e.target.files[0])); }} />
              {picB64 && <p className="text-xs text-green-700 mt-1">New photo selected — will be uploaded when you click Next.</p>}
            </div>
            <div>
              <label className={labelCls}>BECE Results Slip (image or PDF)</label>
              <p className="text-xs text-slate-400 mt-0.5 mb-2">Upload a clear scan or photo of your BECE results slip.</p>
              {app.bece_results_url && (
                <a href={app.bece_results_url} target="_blank" className="text-sm text-green-700 underline block mb-2">View existing document</a>
              )}
              <input ref={beceRef} type="file" accept="image/*,.pdf" className="text-sm text-slate-600 w-full"
                onChange={async e => { if (e.target.files?.[0]) setBeceB64(await fileToBase64(e.target.files[0])); }} />
              {beceB64 && <p className="text-xs text-green-700 mt-1">File selected — will be uploaded when you click Next.</p>}
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Review Your Application</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Admission No.',     app.admission_number],
                  ['Full Name',         app.full_name],
                  ['Index Number',      app.index_number],
                  ['Gender',            app.gender],
                  ['Date of Birth',     app.date_of_birth ? new Date(app.date_of_birth).toLocaleDateString('en-GB') : '—'],
                  ['Hometown',          app.hometown],
                  ['Mobile',            app.mobile_number],
                  ['Programme',         app.program_name],
                  ['Residential',       app.residential_status],
                  ['Guardian',          app.guardian_name],
                  ['Guardian Mobile',   app.guardian_mobile],
                  ['Photo',             app.picture_url ? 'Uploaded' : 'Not uploaded'],
                  ['BECE Slip',         app.bece_results_url ? 'Uploaded' : 'Not uploaded'],
                ].map(([label, val]) => val ? (
                  <div key={String(label)}>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
                    <p className="font-medium text-slate-800">{val}</p>
                  </div>
                ) : null)}
              </div>
            </div>
            {!app.picture_url && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                A passport photo is required. Please go back to Step 4 and upload your photo.
              </div>
            )}
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500">
              By submitting this form you confirm that all information provided is accurate and complete.
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <button onClick={() => { if (step > 1) setStep(step - 1); else router.push(`/admissions/${slug}`); }}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">
            ← {step === 1 ? 'Back to portal' : 'Previous'}
          </button>
          {step < 4 && (
            <button onClick={saveAndNext} disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-50"
              style={{ backgroundColor: primary }}>
              {saving ? 'Saving…' : 'Save & Continue →'}
            </button>
          )}
          {step === 4 && (
            <button onClick={uploadDocs} disabled={uploading}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-50"
              style={{ backgroundColor: primary }}>
              {uploading ? 'Uploading…' : (picB64 || beceB64 ? 'Upload & Continue →' : 'Continue →')}
            </button>
          )}
          {step === 5 && (
            <button onClick={submit} disabled={saving || !app.picture_url}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-50"
              style={{ backgroundColor: primary }}>
              {saving ? 'Submitting…' : 'Submit Application'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
