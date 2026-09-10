'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

const RichTextEditor = dynamic(
  () => import('@/components/RichTextEditor').then(m => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-[360px] rounded-lg border border-slate-200 bg-slate-50 animate-pulse" /> },
);

interface Settings {
  school_id?: string; portal_slug?: string; admission_prefix?: string;
  admission_year?: number; is_portal_open?: boolean; application_deadline?: string;
  website_title?: string; website_tagline?: string; welcome_text?: string;
  banner_image_url?: string; portal_logo_url?: string;
  contact_email?: string; contact_phone?: string; contact_address?: string;
  portal_primary_color?: string; portal_accent_color?: string;
  admission_letter_template?: string; admission_reporting_date?: string;
}

interface SchoolInfo {
  name?: string | null; motto?: string | null;
  vision?: string | null; mission?: string | null; core_values?: string | null;
  letterhead_url?: string | null; headmaster_signature_url?: string | null;
  address?: string | null; phone?: string | null; email?: string | null;
  primary_color?: string | null; logo_url?: string | null;
  headmaster_name?: string | null;
}

// ── Merge-field validation (mirrors the server) ───────────────────────────────
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
  ['{date}',             "Today's date (auto-shown in header row)"],
  ['{reportingDate}',    'School reporting date (set below)'],
  ['{parentName}',       'Guardian / parent name'],
  ['{parentMobile}',     'Guardian mobile number'],
  ['{schoolName}',       'Your school name'],
  ['{academicYear}',     'e.g. 2025/2026'],
] as const;

// Default HTML template (matches the server-side DEFAULT_ADMISSION_LETTER_TEMPLATE)
const DEFAULT_LETTER_HTML =
`<p>Dear <strong>{name}</strong>,</p>
<p style="text-align: justify">We are pleased to inform you that you have been offered admission to <strong>{schoolName}</strong> for the <strong>{academicYear}</strong> academic year, subject to verification of the information provided.</p>
<p><strong>Your Admission Details</strong></p>
<p>
  Admission Number: <strong>{admissionNo}</strong><br>
  Full Name: <strong>{name}</strong><br>
  Index Number: <strong>{indexNumber}</strong><br>
  Programme: <strong>{program}</strong><br>
  House: <strong>{house}</strong><br>
  Residential Status: <strong>{residentialStatus}</strong><br>
  Gender: <strong>{gender}</strong><br>
  Aggregate: <strong>{aggregate}</strong>
</p>
<p><strong>Reporting Requirements</strong></p>
<ul>
  <li>Report to the school on or before <strong>{reportingDate}</strong> with this admission letter.</li>
  <li>Bring your original BECE result slip for verification.</li>
  <li>Bring your Ghana Card or Birth Certificate (original and photocopy).</li>
  <li>Pay the required fees at the Finance Office upon arrival.</li>
</ul>
<p style="text-align: justify">We look forward to welcoming you to our school community.</p>`;

function clientValidateTemplate(html: string): string[] {
  return [...html.matchAll(/\{([^}]+)\}/g)].map(m => m[1]).filter(t => !KNOWN_TOKENS.has(t));
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

// ── Preview helpers ───────────────────────────────────────────────────────────
function previewRefNumber(school: SchoolInfo, settings: Settings): string {
  const prefix = settings.admission_prefix ?? school.name?.slice(0, 6).toUpperCase() ?? 'SCH';
  const yr = String(2000 + (settings.admission_year ?? new Date().getFullYear() % 100)).slice(-2);
  return `ADM/${prefix}/${yr}/0025`;
}

function previewMerge(html: string, school: SchoolInfo, settings: Settings): string {
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
    schoolName:       school.name || 'Your School',
    academicYear:     `${yr}/${yr + 1}`,
  };
  return html.replace(/\{([^}]+)\}/g, (_, token: string) => {
    if (!KNOWN_TOKENS.has(token)) return '';
    return sample[token] ?? '—';
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdmissionSettingsPage() {
  const [settings, setSettings]           = useState<Settings>({});
  const [saving,   setSaving]             = useState(false);
  const [saved,    setSaved]              = useState(false);
  const [error,    setError]              = useState('');
  const [unknownTokens, setUnknownTokens] = useState<string[]>([]);
  const [bannerB64, setBannerB64]         = useState('');
  const [logoB64,   setLogoB64]           = useState('');
  const [showPreview, setShowPreview]     = useState(false);
  const [schoolInfo, setSchoolInfo]       = useState<SchoolInfo>({});
  const bannerRef = useRef<HTMLInputElement>(null);
  const logoRef   = useRef<HTMLInputElement>(null);

  // School identity (saved separately to schools table)
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
        api.get<SchoolInfo>('/api/admin/settings'),
      ]);
      setSettings(admRes.data);
      setSchoolInfo(schoolRes.data);
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

  const portalUrl = settings.portal_slug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/admissions/${settings.portal_slug}`
    : null;

  const primaryColor = settings.portal_primary_color || schoolInfo.primary_color || '#145C44';

  const templateHtml = settings.admission_letter_template || DEFAULT_LETTER_HTML;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admission Portal Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configure the public admission portal for your school.</p>
      </div>

      {/* Portal Toggle */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-500">Portal Access</h2>
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
        <h2 className="text-sm font-semibold text-slate-500">Admission Number</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500">Portal URL Slug *</label>
            <input className={inputCls} placeholder="e.g. st-augustines" value={settings.portal_slug ?? ''} onChange={set('portal_slug')} />
            <p className="mt-1 text-xs text-slate-400">Only letters, numbers and hyphens. Must be unique.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Prefix *</label>
            <input className={inputCls} placeholder="e.g. SASHTS" value={settings.admission_prefix ?? ''} onChange={set('admission_prefix')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Admission Year (2-digit) *</label>
            <input className={inputCls} type="number" min="0" max="99" placeholder="25" value={settings.admission_year ?? ''} onChange={set('admission_year')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Application Deadline</label>
            <input className={inputCls} type="date" value={settings.application_deadline ?? ''} onChange={set('application_deadline')} />
          </div>
        </div>
        {settings.admission_prefix && settings.admission_year !== undefined && (
          <p className="text-xs text-slate-500">
            Example admission number: <span className="font-mono font-semibold text-slate-800">{settings.admission_prefix}0001{String(settings.admission_year).padStart(2,'0')}</span>
            &nbsp;·&nbsp; Letter ref: <span className="font-mono font-semibold text-slate-800">ADM/{settings.admission_prefix}/{String(settings.admission_year).padStart(2,'0')}/0001</span>
          </p>
        )}
      </section>

      {/* Website Content */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-500">Website Content</h2>
        <div>
          <label className="text-xs font-semibold text-slate-500">Portal Title</label>
          <input className={inputCls} placeholder="e.g. St. Augustine's College Admissions 2025" value={settings.website_title ?? ''} onChange={set('website_title')} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Tagline</label>
          <input className={inputCls} placeholder="e.g. Welcome to the gateway of excellence" value={settings.website_tagline ?? ''} onChange={set('website_tagline')} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Welcome Message</label>
          <textarea rows={4} className={`${inputCls} resize-none`} placeholder="Write a welcome message for prospective students..." value={settings.welcome_text ?? ''} onChange={set('welcome_text')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500">Primary Colour</label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={settings.portal_primary_color ?? '#16A34A'}
                onChange={e => setSettings(s => ({ ...s, portal_primary_color: e.target.value }))}
                className="h-9 w-12 rounded border border-slate-200 cursor-pointer" />
              <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={settings.portal_primary_color ?? ''} onChange={set('portal_primary_color')} placeholder="#16A34A" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Accent Colour</label>
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
          <h2 className="text-sm font-semibold text-slate-500">School Identity</h2>
          <p className="text-xs text-slate-400 mt-0.5">Displayed on your school&apos;s admission website. Also appears in report cards and PDF footers.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Vision Statement</label>
          <textarea rows={3} className={`${inputCls} resize-y`}
            placeholder="e.g. To be a centre of excellence in holistic education…"
            value={vision} onChange={e => setVision(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Mission Statement</label>
          <textarea rows={3} className={`${inputCls} resize-y`}
            placeholder="e.g. To nurture confident, creative and responsible learners…"
            value={mission} onChange={e => setMission(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Core Values</label>
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
        <h2 className="text-sm font-semibold text-slate-500">Images</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500">Banner Image</label>
            {settings.banner_image_url && (
              <img src={settings.banner_image_url} alt="Banner" className="mt-1 w-full h-24 object-cover rounded-lg border border-slate-200" />
            )}
            <input ref={bannerRef} type="file" accept="image/*" className="mt-1 text-xs text-slate-600 w-full"
              onChange={async e => { if (e.target.files?.[0]) setBannerB64(await fileToBase64(e.target.files[0])); }} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Portal Logo</label>
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
            <p className="text-xs text-slate-400 mt-0.5">Write the body of the admission letter. Use the placeholders listed below.</p>
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
          <p className="mt-1 text-xs text-slate-400">Drives the <code className="font-mono bg-slate-100 px-1 rounded">{'{reportingDate}'}</code> placeholder. The reference number and date appear automatically above the letter body.</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Letter Body</label>
          <RichTextEditor
            value={templateHtml}
            onChange={html => {
              setSettings(s => ({ ...s, admission_letter_template: html }));
              setUnknownTokens(clientValidateTemplate(html));
            }}
            placeholder="Leave blank to use the built-in default template."
            minHeight={360}
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
        <h2 className="text-sm font-semibold text-slate-500">Contact Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500">Email</label>
            <input className={inputCls} type="email" value={settings.contact_email ?? ''} onChange={set('contact_email')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Phone</label>
            <input className={inputCls} value={settings.contact_phone ?? ''} onChange={set('contact_phone')} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Address</label>
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
          <div className="w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden" style={{ background: '#e8ede8' }}>

            {/* Modal header */}
            <div className="bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Letter Preview</h3>
                <p className="text-xs text-slate-400 mt-0.5">Sample student data — layout and fonts match the generated PDF</p>
              </div>
              <button onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Sample data notice */}
            <div className="flex items-center gap-2 px-6 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Sample values: Kofi Mensah · {settings.admission_prefix ?? 'STU'}002525 · General Science
            </div>

            {/* Paper */}
            <div className="p-8 overflow-y-auto" style={{ maxHeight: '82vh' }}>
              <div className="mx-auto bg-white shadow-lg" style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: '11pt', lineHeight: '1.7', color: '#000',
                padding: '40px 52px', maxWidth: 640, position: 'relative',
              }}>

                {/* ── Watermark crest ── */}
                {schoolInfo.logo_url && (
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 320, height: 320,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none', zIndex: 0,
                  }}>
                    <img src={schoolInfo.logo_url} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.07 }} />
                  </div>
                )}

                <div style={{ position: 'relative', zIndex: 1 }}>

                {/* ── Letterhead ── */}
                {schoolInfo.letterhead_url
                  ? <img src={schoolInfo.letterhead_url} alt="Letterhead"
                      style={{ width: '100%', display: 'block', marginBottom: 24 }} />
                  : <div style={{
                      textAlign: 'center', marginBottom: 24, paddingBottom: 16,
                      borderBottom: `3px solid ${primaryColor}`,
                    }}>
                      <div style={{ fontWeight: 'bold', fontSize: '15pt', color: primaryColor, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        {schoolInfo.name || 'YOUR SCHOOL NAME'}
                      </div>
                      {schoolInfo.motto && (
                        <div style={{ fontSize: '10pt', fontStyle: 'italic', color: '#4A3F32', marginTop: 4 }}>
                          {schoolInfo.motto}
                        </div>
                      )}
                      <div style={{ fontSize: '9pt', color: '#666', marginTop: 6 }}>
                        {[schoolInfo.address, schoolInfo.phone && `Tel: ${schoolInfo.phone}`, schoolInfo.email]
                          .filter(Boolean).join('  ·  ')}
                      </div>
                    </div>
                }

                {/* ── Ref / Date row ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: '10.5pt' }}>
                  <div><strong>Ref:</strong> {previewRefNumber(schoolInfo, settings)}</div>
                  <div><strong>Date:</strong> {today}</div>
                </div>

                {/* ── Merged body ── */}
                <style>{`
                  .letter-body p { margin: 0 0 12px; }
                  .letter-body ul { margin: 0 0 12px; padding-left: 28px; list-style-type: disc; }
                  .letter-body ol { margin: 0 0 12px; padding-left: 28px; list-style-type: decimal; }
                  .letter-body li { margin-bottom: 5px; display: list-item; }
                  .letter-body strong { font-weight: bold; }
                  .letter-body em { font-style: italic; }
                  .letter-body u  { text-decoration: underline; }
                `}</style>
                <div
                  className="letter-body"
                  style={{ marginBottom: 32 }}
                  dangerouslySetInnerHTML={{ __html: previewMerge(templateHtml, schoolInfo, settings) }}
                />

                {/* ── Sign-off: recipient left, signature right ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 40, gap: 24 }}>
                  {/* Left: recipient (sample guardian) */}
                  <div style={{ fontSize: '11pt', lineHeight: '1.8', minWidth: 180 }}>
                    <div style={{ fontWeight: 'bold' }}>Emmanuel Mensah</div>
                    <div>Tel: 0244 123 456</div>
                  </div>
                  {/* Right: complimentary close + signature */}
                  <div>
                    <p style={{ margin: '0 0 4px' }}>Yours faithfully,</p>
                    {schoolInfo.headmaster_signature_url
                      ? <img src={schoolInfo.headmaster_signature_url} alt="Signature"
                          style={{ display: 'block', maxHeight: 72, maxWidth: 200, marginBottom: 8 }} />
                      : <div style={{ width: 160, height: 44, borderBottom: '1px dashed #ccc', marginBottom: 8, display: 'flex', alignItems: 'flex-end' }}>
                          <span style={{ fontSize: '7.5pt', color: '#bbb', fontStyle: 'italic' }}>headmaster signature</span>
                        </div>
                    }
                    <div style={{ borderTop: '1px solid #000', width: 220, paddingTop: 8 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>
                        {schoolInfo.headmaster_name || 'The Headmaster'}
                      </div>
                      <div style={{ fontSize: '10pt', color: '#555' }}>Headmaster</div>
                    </div>
                  </div>
                </div>

                {/* ── Footer (mirrors PDF two-panel footer) ── */}
                {(vision || mission || settings.contact_email || settings.contact_phone || settings.contact_address || schoolInfo.logo_url) && (() => {
                  const h = primaryColor.replace('#', '');
                  const r = parseInt(h.slice(0,2),16)||0, g = parseInt(h.slice(2,4),16)||0, b = parseInt(h.slice(4,6),16)||0;
                  const tint8  = `rgba(${r},${g},${b},0.08)`;
                  const tint22 = `rgba(${r},${g},${b},0.22)`;
                  return (
                  <div style={{
                    marginTop: 36, display: 'flex', alignItems: 'stretch',
                    background: '#fafafa', borderTop: `3px solid ${primaryColor}`,
                    fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden',
                  }}>
                    {/* Left: badge + statements */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 14 }}>
                      <div style={{
                        width: 42, height: 42, flexShrink: 0, borderRadius: 9,
                        background: tint8, border: `1px solid ${tint22}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {schoolInfo.logo_url
                          ? <img src={schoolInfo.logo_url} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                          : <svg style={{ width: 24, height: 24 }} viewBox="0 0 24 24" fill={primaryColor}>
                              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM3.82 9L12 4.53 20.18 9 12 13.47 3.82 9zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
                            </svg>
                        }
                      </div>
                      <div style={{ borderLeft: `2px solid ${tint22}`, paddingLeft: 12, flex: 1 }}>
                        {vision && <p style={{ margin: '0 0 2px', fontSize: '6.5pt', color: '#444', lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 700, letterSpacing: '0.04em', color: primaryColor }}>VISION</span>
                          <span style={{ color: tint22, margin: '0 4px' }}>|</span>{vision}
                        </p>}
                        {mission && <p style={{ margin: 0, fontSize: '6.5pt', color: '#444', lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 700, letterSpacing: '0.04em', color: primaryColor }}>MISSION</span>
                          <span style={{ color: tint22, margin: '0 4px' }}>|</span>{mission}
                        </p>}
                      </div>
                    </div>
                    {/* Right: gradient panel with angled edge */}
                    <div style={{
                      background: `linear-gradient(to right, ${primaryColor} 0%, rgba(0,0,0,0.14) 100%), ${primaryColor}`,
                      color: '#fff', display: 'flex', alignItems: 'center', gap: 14,
                      padding: '10px 22px 10px 30px',
                      clipPath: 'polygon(16px 0, 100% 0, 100% 100%, 0 100%)',
                    }}>
                      <div>
                        {settings.contact_email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '6.5pt', marginBottom: 3, opacity: 0.95 }}>
                            <svg style={{ width: 10, height: 10, fill: '#fff', flexShrink: 0, opacity: 0.85 }} viewBox="0 0 24 24"><path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
                            <span>{settings.contact_email}</span>
                          </div>
                        )}
                        {settings.contact_phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '6.5pt', marginBottom: 3, opacity: 0.95 }}>
                            <svg style={{ width: 10, height: 10, fill: '#fff', flexShrink: 0, opacity: 0.85 }} viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
                            <span>Tel: {settings.contact_phone}</span>
                          </div>
                        )}
                        {settings.contact_address && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '6.5pt', opacity: 0.95 }}>
                            <svg style={{ width: 10, height: 10, fill: '#fff', flexShrink: 0, opacity: 0.85 }} viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
                            <span>{settings.contact_address}</span>
                          </div>
                        )}
                      </div>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: 'rgba(255,255,255,0.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '7pt', fontWeight: 700,
                      }}>1</div>
                    </div>
                  </div>
                  );
                })()}

                </div>{/* end z-index wrapper */}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
