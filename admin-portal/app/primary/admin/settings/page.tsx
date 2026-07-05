'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';

interface SchoolSettings {
  id: string; name: string; code: string; address: string | null; phone: string | null;
  email: string | null; school_type: string | null; school_category: string | null;
  primary_color: string | null; accent_color: string | null; logo_url: string | null;
  motto: string | null; region: string | null; district: string | null;
}

const GHANA_REGIONS = ['Ahafo','Ashanti','Bono','Bono East','Central','Eastern','Greater Accra','North East','Northern','Oti','Savannah','Upper East','Upper West','Volta','Western','Western North'];
const SCHOOL_TYPES  = ['Nursery','KG','Primary','JHS'];

export default function PrimarySettingsPage() {
  const [data,    setData]    = useState<SchoolSettings | null>(null);
  const [form,    setForm]    = useState<Partial<SchoolSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    const user = getUser();
    if (!user) return;
    api.get<SchoolSettings>(`/api/schools/${user.schoolId}`)
      .then(r => { setData(r.data); setForm(r.data); })
      .catch(() => setError('Failed to load school settings.'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!data) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.put(`/api/schools/${data.id}`, {
        name:            form.name,
        address:         form.address,
        phone:           form.phone,
        email:           form.email,
        school_type:     form.school_type,
        school_category: form.school_category,
        primary_color:   form.primary_color,
        accent_color:    form.accent_color,
        motto:           form.motto,
        region:          form.region,
        district:        form.district,
      });
      setSaved(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  const F = (label: string, key: keyof SchoolSettings, type = 'text', opts?: string[]) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {opts ? (
        <select value={String(form[key] ?? '')} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">Select…</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={String(form[key] ?? '')} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500" />
      )}
    </div>
  );

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">School Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Update your school's information and preferences</p>
        </div>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 shadow-sm"
          style={{ backgroundColor: '#15803D' }}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {/* School Info */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide border-b border-gray-100 pb-2">School Information</h2>
        <div className="grid grid-cols-2 gap-4">
          {F('School Name', 'name')}
          {F('School Code', 'code')}
          {F('School Type', 'school_type', 'text', SCHOOL_TYPES)}
          {F('Category', 'school_category', 'text', ['Public','Private','International'])}
          {F('Phone', 'phone', 'tel')}
          {F('Email', 'email', 'email')}
          {F('Region', 'region', 'text', GHANA_REGIONS)}
          {F('District', 'district')}
          <div className="col-span-full">{F('Address', 'address')}</div>
          <div className="col-span-full">{F('School Motto', 'motto')}</div>
        </div>
      </div>

      {/* Branding */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide border-b border-gray-100 pb-2">Branding</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Primary Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.primary_color ?? '#15803D'}
                onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
              <input value={form.primary_color ?? ''} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" placeholder="#15803D" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Accent Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.accent_color ?? '#C8973A'}
                onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
              <input value={form.accent_color ?? ''} onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" placeholder="#C8973A" />
            </div>
          </div>
        </div>
        {form.logo_url && (
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Current Logo</p>
            <img src={form.logo_url} alt="School logo" className="h-16 w-16 rounded-xl object-cover border border-gray-200" />
          </div>
        )}
      </div>

      {/* Read-only info */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 px-5 py-4 text-xs text-slate-500 space-y-1">
        <p>School ID: <span className="font-mono text-slate-700">{data?.id}</span></p>
        <p>School Code: <span className="font-mono font-bold text-slate-700">{data?.code}</span></p>
        <p className="text-slate-400 pt-1">Contact your system administrator to change the school code or subscription details.</p>
      </div>
    </div>
  );
}
