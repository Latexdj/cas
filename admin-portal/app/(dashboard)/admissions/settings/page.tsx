'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface Settings {
  school_id?: string; portal_slug?: string; admission_prefix?: string;
  admission_year?: number; is_portal_open?: boolean; application_deadline?: string;
  website_title?: string; website_tagline?: string; welcome_text?: string;
  banner_image_url?: string; portal_logo_url?: string;
  contact_email?: string; contact_phone?: string; contact_address?: string;
  portal_primary_color?: string; portal_accent_color?: string;
}

const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function AdmissionSettingsPage() {
  const [settings, setSettings]   = useState<Settings>({});
  const [saving,   setSaving]     = useState(false);
  const [saved,    setSaved]      = useState(false);
  const [error,    setError]      = useState('');
  const [bannerB64, setBannerB64] = useState('');
  const [logoB64,   setLogoB64]   = useState('');
  const bannerRef = useRef<HTMLInputElement>(null);
  const logoRef   = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/api/admin/admissions/settings'); setSettings(data); }
    catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setSettings(s => ({ ...s, [k]: e.target.value }));

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const payload: Record<string, unknown> = { ...settings };
      if (bannerB64) payload.banner_image_data = bannerB64;
      if (logoB64)   payload.portal_logo_data  = logoB64;
      const { data } = await api.patch('/api/admin/admissions/settings', payload);
      setSettings(data); setBannerB64(''); setLogoB64('');
      if (bannerRef.current) bannerRef.current.value = '';
      if (logoRef.current)   logoRef.current.value   = '';
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const portalUrl = settings.portal_slug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/admissions/${settings.portal_slug}`
    : null;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admission Portal Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configure the public admission portal for your school.</p>
      </div>

      {/* Portal Toggle */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Portal Access</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800">Portal is {settings.is_portal_open ? 'Open' : 'Closed'}</p>
            <p className="text-xs text-slate-400 mt-0.5">When open, prospective students can submit their forms.</p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, is_portal_open: !s.is_portal_open }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.is_portal_open ? 'bg-green-600' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.is_portal_open ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {portalUrl && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800 flex items-center justify-between gap-2">
            <span>Public URL: <a href={portalUrl} target="_blank" className="font-mono underline">{portalUrl}</a></span>
            <button onClick={() => navigator.clipboard.writeText(portalUrl)} className="text-green-600 font-semibold">Copy</button>
          </div>
        )}
      </section>

      {/* Admission Number Config */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admission Number</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Portal URL Slug *</label>
            <input className={inputCls} placeholder="e.g. st-augustines" value={settings.portal_slug ?? ''} onChange={set('portal_slug')} />
            <p className="mt-1 text-xs text-slate-400">Only letters, numbers and hyphens. Must be unique.</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prefix *</label>
            <input className={inputCls} placeholder="e.g. SASHTS" value={settings.admission_prefix ?? ''} onChange={set('admission_prefix')} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admission Year (2-digit) *</label>
            <input className={inputCls} type="number" min="0" max="99" placeholder="25" value={settings.admission_year ?? ''} onChange={set('admission_year')} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application Deadline</label>
            <input className={inputCls} type="date" value={settings.application_deadline ?? ''} onChange={set('application_deadline')} />
          </div>
        </div>
        {settings.admission_prefix && settings.admission_year !== undefined && (
          <p className="text-xs text-slate-500">
            Example number: <span className="font-mono font-semibold text-slate-800">{settings.admission_prefix}0001{String(settings.admission_year).padStart(2,'0')}</span>
          </p>
        )}
      </section>

      {/* Website Content */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Website Content</h2>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Portal Title</label>
          <input className={inputCls} placeholder="e.g. St. Augustine's College Admissions 2025" value={settings.website_title ?? ''} onChange={set('website_title')} />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tagline</label>
          <input className={inputCls} placeholder="e.g. Welcome to the gateway of excellence" value={settings.website_tagline ?? ''} onChange={set('website_tagline')} />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Welcome Message</label>
          <textarea rows={4} className={`${inputCls} resize-none`} placeholder="Write a welcome message for prospective students..." value={settings.welcome_text ?? ''} onChange={set('welcome_text')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Primary Colour</label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={settings.portal_primary_color ?? '#16A34A'}
                onChange={e => setSettings(s => ({ ...s, portal_primary_color: e.target.value }))}
                className="h-9 w-12 rounded border border-slate-200 cursor-pointer" />
              <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={settings.portal_primary_color ?? ''} onChange={set('portal_primary_color')} placeholder="#16A34A" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accent Colour</label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={settings.portal_accent_color ?? '#15803D'}
                onChange={e => setSettings(s => ({ ...s, portal_accent_color: e.target.value }))}
                className="h-9 w-12 rounded border border-slate-200 cursor-pointer" />
              <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={settings.portal_accent_color ?? ''} onChange={set('portal_accent_color')} placeholder="#15803D" />
            </div>
          </div>
        </div>
      </section>

      {/* Images */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Images</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Banner Image</label>
            {settings.banner_image_url && (
              <img src={settings.banner_image_url} alt="Banner" className="mt-1 w-full h-24 object-cover rounded-lg border border-slate-200" />
            )}
            <input ref={bannerRef} type="file" accept="image/*" className="mt-1 text-xs text-slate-600 w-full"
              onChange={async e => { if (e.target.files?.[0]) setBannerB64(await fileToBase64(e.target.files[0])); }} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Portal Logo</label>
            {settings.portal_logo_url && (
              <img src={settings.portal_logo_url} alt="Logo" className="mt-1 w-20 h-20 object-contain rounded-lg border border-slate-200" />
            )}
            <input ref={logoRef} type="file" accept="image/*" className="mt-1 text-xs text-slate-600 w-full"
              onChange={async e => { if (e.target.files?.[0]) setLogoB64(await fileToBase64(e.target.files[0])); }} />
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Contact Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
            <input className={inputCls} type="email" value={settings.contact_email ?? ''} onChange={set('contact_email')} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label>
            <input className={inputCls} value={settings.contact_phone ?? ''} onChange={set('contact_phone')} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</label>
          <input className={inputCls} value={settings.contact_address ?? ''} onChange={set('contact_address')} />
        </div>
      </section>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}
      {saved && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">Settings saved successfully.</p>}

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>Save Settings</Button>
      </div>
    </div>
  );
}
