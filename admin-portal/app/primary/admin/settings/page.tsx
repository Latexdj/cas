'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface SchoolSettings {
  id: string; name: string; code: string; address: string | null; phone: string | null;
  email: string | null; school_type: string | null; school_category: string | null;
  primary_color: string | null; accent_color: string | null; logo_url: string | null;
  motto: string | null; region: string | null; district: string | null;
  admission_prefix: string | null; admission_year: string | null;
  school_latitude: string | null; school_longitude: string | null; school_gps_radius: number | null;
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
    api.get<SchoolSettings>('/api/admin/settings')
      .then(r => { setData(r.data); setForm(r.data); })
      .catch(() => setError('Failed to load school settings.'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!data) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.patch('/api/admin/settings/info', {
        name:               form.name,
        address:            form.address,
        phone:              form.phone,
        email:              form.email,
        school_type:        form.school_type,
        school_category:    form.school_category,
        motto:              form.motto,
        region:             form.region,
        district:           form.district,
        admission_prefix:   form.admission_prefix,
        admission_year:     form.admission_year,
        school_latitude:    form.school_latitude,
        school_longitude:   form.school_longitude,
        school_gps_radius:  form.school_gps_radius,
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

      {/* Student Admission Numbers */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="border-b border-gray-100 pb-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Student Admission Numbers</h2>
          <p className="text-xs text-slate-400 mt-0.5">Used to auto-generate IDs when importing students via Excel</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Admission Prefix</label>
            <input value={form.admission_prefix ?? ''} onChange={e => setForm(f => ({ ...f, admission_prefix: e.target.value.toUpperCase() }))}
              placeholder="e.g. SASHTS"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Admission Year (2 digits)</label>
            <input value={form.admission_year ?? ''} onChange={e => setForm(f => ({ ...f, admission_year: e.target.value }))}
              placeholder={`e.g. ${String(new Date().getFullYear()).slice(2)}`} maxLength={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
        {(form.admission_prefix || form.admission_year) && (
          <p className="text-xs text-slate-400">
            Example ID: <span className="font-mono font-semibold text-slate-600">{form.admission_prefix ?? ''}001{form.admission_year ?? ''}</span>
          </p>
        )}
      </div>

      {/* School GPS Location */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="border-b border-gray-100 pb-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">School GPS Location</h2>
          <p className="text-xs text-slate-400 mt-0.5">Required for teacher clock-in/out verification. Teachers must be within the radius to clock in.</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Latitude</label>
            <input type="number" step="any" value={form.school_latitude ?? ''}
              onChange={e => setForm(f => ({ ...f, school_latitude: e.target.value || null }))}
              placeholder="e.g. 5.614582"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Longitude</label>
            <input type="number" step="any" value={form.school_longitude ?? ''}
              onChange={e => setForm(f => ({ ...f, school_longitude: e.target.value || null }))}
              placeholder="e.g. -0.205874"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Radius (metres)</label>
            <input type="number" min={10} max={500} value={form.school_gps_radius ?? 100}
              onChange={e => setForm(f => ({ ...f, school_gps_radius: parseInt(e.target.value) || 100 }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!navigator.geolocation) return alert('Geolocation not supported by your browser.');
            navigator.geolocation.getCurrentPosition(
              pos => setForm(f => ({ ...f, school_latitude: pos.coords.latitude.toFixed(7), school_longitude: pos.coords.longitude.toFixed(7) })),
              () => alert('Could not get your location. Please enter coordinates manually.')
            );
          }}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
          </svg>
          Use My Current Location
        </button>
        {form.school_latitude && form.school_longitude && (
          <p className="text-xs text-slate-400">
            Location set: <span className="font-mono text-slate-600">{form.school_latitude}, {form.school_longitude}</span>
            {' '}— teachers must be within <span className="font-semibold">{form.school_gps_radius ?? 100}m</span> to clock in.
          </p>
        )}
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
