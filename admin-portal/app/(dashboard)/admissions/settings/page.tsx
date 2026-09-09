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
  admission_letter_template?: string; admission_reporting_date?: string;
}

interface SchoolIdentity {
  name?: string | null;
  vision?: string | null; mission?: string | null; core_values?: string | null;
}

const KNOWN_TOKENS = new Set([
  'name','admissionNo','indexNumber','program','house',
  'residentialStatus','gender','aggregate',
  'date','reportingDate','parentName','parentMobile','schoolName','academicYear',
]);

const PLACEHOLDER_REFERENCE = [
  ['{name}',             'Student full name'],
  ['{admissionNo}',      'Admission number'],
  ['{indexNumber}',      'BECE index number'],
  ['{program}',          'Admitted programme'],
  ['{house}',            'Assigned house'],
  ['{residentialStatus}','Boarding / Day'],
  ['{gender}',           'Male / Female'],
  ['{aggregate}',        'BECE aggregate score'],
  ['{date}',             "Today's date"],
  ['{reportingDate}',    'School reporting date (set below)'],
  ['{parentName}',       'Guardian / parent name'],
  ['{parentMobile}',     'Guardian mobile number'],
  ['{schoolName}',       'Your school name'],
  ['{academicYear}',     'e.g. 2025/2026'],
] as const;

const DEFAULT_LETTER_TEMPLATE =
`OFFER OF ADMISSION

Date: {date}

Dear {name},

We are pleased to inform you that you have been offered admission to {schoolName} for the {academicYear} academic year, subject to verification of the information provided.

Your Admission Details

  Admission Number:    {admissionNo}
  Full Name:           {name}
  Index Number:        {indexNumber}
  Programme:           {program}
  House:               {house}
  Residential Status:  {residentialStatus}
  Gender:              {gender}
  Aggregate:           {aggregate}

Reporting Requirements

  • Report to the school on the designated reporting date with this admission letter.
  • Bring your original BECE result slip for verification.
  • Bring your Ghana Card or Birth Certificate (original and photocopy).
  • Pay the required fees at the Finance Office upon arrival.
  • Report on the date announced by the school authorities.

We look forward to welcoming you to our school community.`;

function clientValidateTemplate(tpl: string): string[] {
  return [...tpl.matchAll(/\{([^}]+)\}/g)].map(m => m[1]).filter(t => !KNOWN_TOKENS.has(t));
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
  const [settings, setSettings]         = useState<Settings>({});
  const [saving,   setSaving]           = useState(false);
  const [saved,    setSaved]            = useState(false);
  const [error,    setError]            = useState('');
  const [unknownTokens, setUnknownTokens] = useState<string[]>([]);
  const [bannerB64, setBannerB64]       = useState('');
  const [logoB64,   setLogoB64]         = useState('');
  const [showPreview, setShowPreview]   = useState(false);
  const [schoolName,  setSchoolName]    = useState('');
  const bannerRef = useRef<HTMLInputElement>(null);
  const logoRef   = useRef<HTMLInputElement>(null);

  // School identity (stored in schools table, saved separately)
  const [vision,         setVision]         = useState('');
  const [mission,        setMission]        = useState('');
  const [coreValues,     setCoreValues]     = useState('');
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identitySaved,  setIdentitySaved]  = useState(false);
  const [identityError,  setIdentityError]  = useState('');

  const load = useCallback(async () => {
    try {
      const [admRes, schoolRes] = await Promise.all([
        api.get('/api/admin/admissions/settings'),
        api.get<SchoolIdentity>('/api/admin/settings'),
      ]);
      setSettings(admRes.data);
      setSchoolName(schoolRes.data.name ?? '');
      setVision(schoolRes.data.vision ?? '');
      setMission(schoolRes.data.mission ?? '');
      setCoreValues(schoolRes.data.core_values ?? '');
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setSettings(s => ({ ...s, [k]: e.target.value }));

  async function saveIdentity() {
    setIdentitySaving(true); setIdentityError(''); setIdentitySaved(false);
    try {
      await api.patch('/api/admin/settings/info', { vision, mission, core_values: coreValues });
      setIdentitySaved(true);
      setTimeout(() => setIdentitySaved(false), 3000);
    } catch (e: unknown) {
      setIdentityError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save.');
    } finally { setIdentitySaving(false); }
  }

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
      setUnknownTokens(data.unknown_tokens ?? []);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
  }

  function previewMerge(template: string): string {
    const yr = 2000 + (settings.admission_year ?? new Date().getFullYear() % 100);
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const sample: Record<string, string> = {
      name:             'Kofi Mensah',
      admissionNo:      `${settings.admission_prefix ?? 'STU'}002525`,
      indexNumber:      '4010101234',
      program:          'General Science',
      house:            'St. Augustine House',
      residentialStatus:'Boarding',
      gender:           'Male',
      aggregate:        '8',
      date:             today,
      reportingDate:    settings.admission_reporting_date || '14th September 2025',
      parentName:       'Emmanuel Mensah',
      parentMobile:     '0244 123 456',
      schoolName:       schoolName || 'Your School',
      academicYear:     `${yr}/${yr + 1}`,
    };
    return template.replace(/\{([^}]+)\}/g, (_, token: string) => {
      if (!KNOWN_TOKENS.has(token)) return '';
      return sample[token] ?? '—';
    });
  }

  const portalUrl = settings.portal_slug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/admissions/${settings.portal_slug}`
    : null;

  const primaryColor = settings.portal_primary_color || '#145C44';

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admission Portal Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configure the public admission portal for your school.</p>
      </div>

      {/* Portal Toggle */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold font-medium text-slate-500">Portal Access</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800">Portal is {settings.is_portal_open ? 'Open' : 'Closed'}</p>
            <p className="text-xs text-slate-400 mt-0.5">When open, prospective students can submit their forms.</p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, is_portal_open: !s.is_portal_open }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.is_portal_open ? 'bg-[#145C44]' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.is_portal_open ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {portalUrl && (
          <div className="rounded-lg bg-[#E8F4EE] border border-[#B8D9C8] px-3 py-2 text-xs text-[#0B3D2E] flex items-center justify-between gap-2">
            <span>Public URL: <a href={portalUrl} target="_blank" className="font-mono underline">{portalUrl}</a></span>
            <button onClick={() => navigator.clipboard.writeText(portalUrl)} className="text-[#145C44] font-semibold">Copy</button>
          </div>
        )}
      </section>

      {/* Admission Number Config */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold font-medium text-slate-500">Admission Number</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Portal URL Slug *</label>
            <input className={inputCls} placeholder="e.g. st-augustines" value={settings.portal_slug ?? ''} onChange={set('portal_slug')} />
            <p className="mt-1 text-xs text-slate-400">Only letters, numbers and hyphens. Must be unique.</p>
          </div>
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Prefix *</label>
            <input className={inputCls} placeholder="e.g. SASHTS" value={settings.admission_prefix ?? ''} onChange={set('admission_prefix')} />
          </div>
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Admission Year (2-digit) *</label>
            <input className={inputCls} type="number" min="0" max="99" placeholder="25" value={settings.admission_year ?? ''} onChange={set('admission_year')} />
          </div>
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Application Deadline</label>
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
        <h2 className="text-sm font-semibold font-medium text-slate-500">Website Content</h2>
        <div>
          <label className="text-xs font-semibold font-medium text-slate-500">Portal Title</label>
          <input className={inputCls} placeholder="e.g. St. Augustine's College Admissions 2025" value={settings.website_title ?? ''} onChange={set('website_title')} />
        </div>
        <div>
          <label className="text-xs font-semibold font-medium text-slate-500">Tagline</label>
          <input className={inputCls} placeholder="e.g. Welcome to the gateway of excellence" value={settings.website_tagline ?? ''} onChange={set('website_tagline')} />
        </div>
        <div>
          <label className="text-xs font-semibold font-medium text-slate-500">Welcome Message</label>
          <textarea rows={4} className={`${inputCls} resize-none`} placeholder="Write a welcome message for prospective students..." value={settings.welcome_text ?? ''} onChange={set('welcome_text')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Primary Colour</label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={settings.portal_primary_color ?? '#16A34A'}
                onChange={e => setSettings(s => ({ ...s, portal_primary_color: e.target.value }))}
                className="h-9 w-12 rounded border border-slate-200 cursor-pointer" />
              <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={settings.portal_primary_color ?? ''} onChange={set('portal_primary_color')} placeholder="#16A34A" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Accent Colour</label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={settings.portal_accent_color ?? '#145C44'}
                onChange={e => setSettings(s => ({ ...s, portal_accent_color: e.target.value }))}
                className="h-9 w-12 rounded border border-slate-200 cursor-pointer" />
              <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={settings.portal_accent_color ?? ''} onChange={set('portal_accent_color')} placeholder="#145C44" />
            </div>
          </div>
        </div>
      </section>

      {/* School Identity */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold font-medium text-slate-500">School Identity</h2>
          <p className="text-xs text-slate-400 mt-0.5">Displayed on your school&apos;s admission website. Also appears in report cards and certificates.</p>
        </div>
        <div>
          <label className="text-xs font-semibold font-medium text-slate-500">Vision Statement</label>
          <textarea rows={3} className={`${inputCls} resize-y`}
            placeholder="e.g. To be a centre of excellence in holistic education…"
            value={vision} onChange={e => setVision(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold font-medium text-slate-500">Mission Statement</label>
          <textarea rows={3} className={`${inputCls} resize-y`}
            placeholder="e.g. To nurture confident, creative and responsible learners…"
            value={mission} onChange={e => setMission(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold font-medium text-slate-500">Core Values</label>
          <textarea rows={2} className={`${inputCls} resize-y`}
            placeholder="e.g. Integrity, Excellence, Discipline, Respect, Innovation"
            value={coreValues} onChange={e => setCoreValues(e.target.value)} />
        </div>
        {identityError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{identityError}</p>}
        {identitySaved && <p className="text-sm text-[#145C44] bg-[#E8F4EE] rounded-lg px-3 py-2">✓ School identity saved.</p>}
        <div className="flex justify-end">
          <Button onClick={saveIdentity} loading={identitySaving}>Save Identity</Button>
        </div>
      </section>

      {/* Images */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold font-medium text-slate-500">Images</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Banner Image</label>
            {settings.banner_image_url && (
              <img src={settings.banner_image_url} alt="Banner" className="mt-1 w-full h-24 object-cover rounded-lg border border-slate-200" />
            )}
            <input ref={bannerRef} type="file" accept="image/*" className="mt-1 text-xs text-slate-600 w-full"
              onChange={async e => { if (e.target.files?.[0]) setBannerB64(await fileToBase64(e.target.files[0])); }} />
          </div>
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Portal Logo</label>
            {settings.portal_logo_url && (
              <img src={settings.portal_logo_url} alt="Logo" className="mt-1 w-20 h-20 object-contain rounded-lg border border-slate-200" />
            )}
            <input ref={logoRef} type="file" accept="image/*" className="mt-1 text-xs text-slate-600 w-full"
              onChange={async e => { if (e.target.files?.[0]) setLogoB64(await fileToBase64(e.target.files[0])); }} />
          </div>
        </div>
      </section>

      {/* Admission Letter Template */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-500">Admission Letter Template</h2>
            <p className="text-xs text-slate-400 mt-0.5">Customise the body of the admission letter PDF. Use the placeholders below.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview Letter
          </button>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500">Reporting Date</label>
          <input className={inputCls} placeholder="e.g. 14th September 2025"
            value={settings.admission_reporting_date ?? ''}
            onChange={set('admission_reporting_date')} />
          <p className="mt-1 text-xs text-slate-400">Used by the <code className="font-mono bg-slate-100 px-1 rounded">{'{reportingDate}'}</code> placeholder in the template.</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500">Letter Body Template</label>
          <textarea
            rows={18}
            className={`${inputCls} font-mono text-xs resize-y`}
            placeholder="Leave blank to use the built-in default template."
            value={settings.admission_letter_template ?? ''}
            onChange={e => {
              setSettings(s => ({ ...s, admission_letter_template: e.target.value }));
              setUnknownTokens(clientValidateTemplate(e.target.value));
            }}
          />
          {unknownTokens.length > 0 && (
            <div className="mt-2 flex gap-2 items-start rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>Unknown placeholders will be stripped from the PDF: {unknownTokens.map(t => <code key={t} className="font-mono bg-amber-100 rounded px-1 mx-0.5">{`{${t}}`}</code>)}</span>
            </div>
          )}
        </div>

        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer font-semibold text-slate-600 hover:text-slate-800">Available placeholders</summary>
          <table className="mt-2 w-full border-collapse text-left">
            <thead><tr className="border-b border-slate-200">
              <th className="py-1 pr-4 font-semibold text-slate-600">Placeholder</th>
              <th className="py-1 font-semibold text-slate-600">Replaced with</th>
            </tr></thead>
            <tbody>
              {PLACEHOLDER_REFERENCE.map(([ph, desc]) => (
                <tr key={ph} className="border-b border-slate-100">
                  <td className="py-1 pr-4 font-mono text-slate-700">{ph}</td>
                  <td className="py-1 text-slate-500">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-slate-400">Unknown placeholders are silently removed. Blank fields become —.</p>
        </details>
      </section>

      {/* Contact */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold font-medium text-slate-500">Contact Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Email</label>
            <input className={inputCls} type="email" value={settings.contact_email ?? ''} onChange={set('contact_email')} />
          </div>
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Phone</label>
            <input className={inputCls} value={settings.contact_phone ?? ''} onChange={set('contact_phone')} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold font-medium text-slate-500">Address</label>
          <input className={inputCls} value={settings.contact_address ?? ''} onChange={set('contact_address')} />
        </div>
      </section>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}
      {saved && <p className="text-sm text-[#145C44] bg-[#E8F4EE] rounded-lg px-4 py-3">Settings saved successfully.</p>}

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>Save Settings</Button>
      </div>

      {/* ── Letter Preview Modal ───────────────────────────────────────────────── */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8 pb-16"
          onClick={e => { if (e.target === e.currentTarget) setShowPreview(false); }}
        >
          <div className="w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden" style={{ background: '#f1f5f4' }}>

            {/* Modal header */}
            <div className="bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Letter Preview</h3>
                <p className="text-xs text-slate-400 mt-0.5">Sample student data — font and layout match the generated PDF</p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Sample data badge */}
            <div className="flex items-center gap-2 px-6 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Placeholders filled with sample values: Kofi Mensah · {settings.admission_prefix ?? 'STU'}002525 · General Science
            </div>

            {/* Scrollable paper area */}
            <div className="p-8 overflow-y-auto" style={{ maxHeight: '78vh' }}>
              {/* A4-proportioned paper card */}
              <div
                className="mx-auto bg-white shadow-lg"
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: '11pt',
                  lineHeight: '1.7',
                  color: '#000',
                  padding: '48px 56px',
                  maxWidth: 640,
                  minHeight: 600,
                }}
              >
                {/* Mock letterhead */}
                <div style={{ textAlign: 'center', marginBottom: 28, paddingBottom: 16, borderBottom: `3px solid ${primaryColor}` }}>
                  <div style={{ fontWeight: 'bold', fontSize: '15pt', letterSpacing: '0.05em', color: primaryColor, textTransform: 'uppercase' }}>
                    {schoolName || 'YOUR SCHOOL NAME'}
                  </div>
                  <div style={{ fontSize: '7.5pt', color: '#888', marginTop: 6, fontStyle: 'italic', borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
                    School letterhead &amp; seal appear here in the generated PDF
                  </div>
                </div>

                {/* Merged letter body */}
                <div style={{ whiteSpace: 'pre-line' }}>
                  {previewMerge(settings.admission_letter_template || DEFAULT_LETTER_TEMPLATE)}
                </div>

                {/* Sign-off */}
                <div style={{ marginTop: 44 }}>
                  <p style={{ margin: '0 0 6px', fontSize: '11pt' }}>Yours faithfully,</p>
                  <div style={{
                    width: 160, height: 44,
                    borderBottom: '1px dashed #ccc',
                    marginBottom: 8,
                    display: 'flex', alignItems: 'flex-end',
                  }}>
                    <span style={{ fontSize: '7.5pt', color: '#bbb', fontStyle: 'italic' }}>headmaster signature</span>
                  </div>
                  <div style={{ borderTop: '1px solid #000', width: 220, paddingTop: 8 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>Admissions Office</div>
                    <div style={{ fontSize: '10pt', color: '#4A3F32' }}>{schoolName || 'Your School'}</div>
                  </div>
                </div>

                {/* Footer band — mirrors the Puppeteer footerTemplate */}
                {(vision || mission) && (
                  <div style={{
                    marginTop: 36,
                    paddingTop: 6,
                    borderTop: `1.5px solid ${primaryColor}`,
                    fontSize: '7.5pt',
                    color: '#444',
                    display: 'grid',
                    gridTemplateColumns: '55% 40% 5%',
                    gap: 8,
                    lineHeight: 1.5,
                  }}>
                    <div>
                      {vision  && <div><strong style={{ color: primaryColor }}>Our Vision:</strong> {vision}</div>}
                      {mission && <div style={{ marginTop: 2 }}><strong style={{ color: primaryColor }}>Our Mission:</strong> {mission}</div>}
                    </div>
                    <div style={{ textAlign: 'right', color: '#555' }}>
                      {settings.contact_address && <div>{settings.contact_address}</div>}
                      {settings.contact_phone   && <div>Tel: {settings.contact_phone}</div>}
                      {settings.contact_email   && <div>{settings.contact_email}</div>}
                    </div>
                    <div style={{ textAlign: 'right', color: '#888' }}>1</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
