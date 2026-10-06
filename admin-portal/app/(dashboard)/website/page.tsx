'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface Settings {
  school_id?: string;
  slug?: string;
  is_published?: boolean;
  hero_image_url?: string;
  hero_tagline?: string;
  show_programs?: boolean;
  show_admissions_cta?: boolean;
  show_stats?: boolean;
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

export default function WebsiteSettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');
  const [heroB64,  setHeroB64]  = useState('');
  const heroRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/website/settings');
      setSettings(data);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings(s => ({ ...s, [k]: e.target.value }));

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const payload: Record<string, unknown> = { ...settings };
      if (heroB64) payload.hero_image_data = heroB64;
      const { data } = await api.patch('/api/admin/website/settings', payload);
      setSettings(data); setHeroB64('');
      if (heroRef.current) heroRef.current.value = '';
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const siteUrl = settings.slug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/site/${settings.slug}`
    : null;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Website</h1>
        <p className="text-sm text-slate-400 mt-0.5">Your school's public website — separate from the Admissions portal, visible whether or not Admissions is open.</p>
      </div>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-500">Publish</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800">Website is {settings.is_published ? 'Published' : 'Unpublished'}</p>
            <p className="text-xs text-slate-400 mt-0.5">When published, anyone with the link can view your website.</p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, is_published: !s.is_published }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.is_published ? 'bg-[#145C44]' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.is_published ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500">URL Slug</label>
          <input className={inputCls} value={settings.slug ?? ''} onChange={set('slug')} placeholder="your-school-name" />
        </div>
        {siteUrl && (
          <div className="rounded-lg bg-[#E8F4EE] border border-[#B8D9C8] px-3 py-2 text-xs text-[#0B3D2E] flex items-center justify-between gap-2">
            <span>Public URL: <a href={siteUrl} target="_blank" className="font-mono underline">{siteUrl}</a></span>
            <button onClick={() => navigator.clipboard.writeText(siteUrl)} className="text-[#145C44] font-semibold">Copy</button>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-500">Hero Section</h2>
        <div>
          <label className="block text-xs font-semibold text-slate-500">Tagline</label>
          <input className={inputCls} value={settings.hero_tagline ?? ''} onChange={set('hero_tagline')} placeholder="e.g. Nurturing excellence since 1985" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500">Hero Image</label>
          {settings.hero_image_url && (
            <img src={settings.hero_image_url} className="mt-1 w-full h-24 object-cover rounded-lg border border-slate-200" />
          )}
          <input ref={heroRef} type="file" accept="image/*" className="mt-1 text-xs"
            onChange={async e => { if (e.target.files?.[0]) setHeroB64(await fileToBase64(e.target.files[0])); }} />
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-500">Sections</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800">Show Academic Programmes</p>
            <p className="text-xs text-slate-400 mt-0.5">Lists the programmes set up under Programs.</p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, show_programs: !s.show_programs }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.show_programs ? 'bg-[#145C44]' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.show_programs ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800">Show "Apply Now" button</p>
            <p className="text-xs text-slate-400 mt-0.5">Only appears if your Admissions portal is also enabled and open.</p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, show_admissions_cta: !s.show_admissions_cta }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.show_admissions_cta ? 'bg-[#145C44]' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.show_admissions_cta ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800">Show live stats bar</p>
            <p className="text-xs text-slate-400 mt-0.5">Displays your current active student count, faculty count and number of programmes. Updates automatically — off by default.</p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, show_stats: !s.show_stats }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.show_stats ? 'bg-[#145C44]' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.show_stats ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">School Identity</h2>
        <p className="text-xs text-slate-400">Your logo, brand colors, motto, vision, mission and core values are shown on your website automatically, pulled from <Link href="/settings" className="underline font-medium text-slate-600">Settings</Link> — edit them there.</p>
      </section>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}
      {saved && <p className="text-sm text-[#145C44] bg-[#E8F4EE] rounded-lg px-4 py-3">Settings saved successfully.</p>}
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>Save Settings</Button>
      </div>
    </div>
  );
}
