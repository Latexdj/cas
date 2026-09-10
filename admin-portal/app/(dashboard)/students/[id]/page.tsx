'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/lib/api';
import { validateStudentForm } from '@/lib/validations';
import type { StudentProfile, Program, House } from '@/types/api';

const GENDERS   = ['Male', 'Female'];
const RELIGIONS = ['Christianity', 'Islam', 'Traditional', 'Other'];
const RES_STATUSES = ['Day', 'Boarding'];

interface IdCard {
  id: string;
  token: string;
  issue_number: number;
  status: 'active' | 'revoked' | 'expired';
  issued_at: string | null;
  expires_at: string | null;
  created_at: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h3>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value ?? <span className="text-gray-300 italic">—</span>}</p>
    </div>
  );
}

function EditField({
  label, name, value, onChange, type = 'text', options, error,
}: {
  label: string; name: string; value: string;
  onChange: (n: string, v: string) => void;
  type?: string; options?: string[]; error?: string;
}) {
  const borderClass = error ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-blue-500';
  if (options) {
    return (
      <div>
        <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
        <select value={value} onChange={e => onChange(name, e.target.value)}
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white ${borderClass}`}>
          <option value="">— select —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }
  return (
    <div>
      <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(name, e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${borderClass}`} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

const SCAN_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  valid_auth:   { bg: '#DCFCE7', color: '#145C44', label: 'Valid (auth)' },
  valid_public: { bg: '#DCFCE7', color: '#145C44', label: 'Valid' },
  revoked:      { bg: '#FEE2E2', color: '#991B1B', label: 'Revoked' },
  expired:      { bg: '#FEF3C7', color: '#92400E', label: 'Expired' },
  unknown:      { bg: '#F1F5F9', color: '#64748B', label: 'Unknown token' },
};

function fmt(iso?: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [profile,   setProfile]  = useState<StudentProfile | null>(null);
  const [programs,  setPrograms] = useState<Program[]>([]);
  const [houses,    setHouses]   = useState<House[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [loadErr,   setLoadErr]  = useState('');
  const [editing,   setEditing]  = useState(false);
  const [form,     setForm]     = useState<Record<string, string>>({});
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const photoRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [uploadErr,      setUploadErr]      = useState('');

  const [activeCard,   setActiveCard]   = useState<IdCard | null | undefined>(undefined); // undefined = not yet loaded
  const [cardLoading,  setCardLoading]  = useState(false);
  const [cardErr,      setCardErr]      = useState('');
  const [cardIssueDate,  setCardIssueDate]  = useState(() => new Date().toISOString().slice(0, 10));
  const [cardExpiresAt,  setCardExpiresAt]  = useState(() => `${new Date().getFullYear()}-12-31`);

  interface ScanEvent {
    token_queried: string; response_status: string;
    scanned_at: string; ip_address: string | null;
    issue_number: number; card_status: string;
    scanned_by_name: string | null;
  }
  const [scanHistory,        setScanHistory]        = useState<ScanEvent[]>([]);
  const [scanHistoryLoading, setScanHistoryLoading] = useState(false);

  interface AdmissionApp {
    id: string; full_name: string; admission_number: string | null;
    letter_url: string | null; letter_generated_at: string | null;
    status: string;
  }
  const [admApp,        setAdmApp]        = useState<AdmissionApp | null | undefined>(undefined);
  const [letterLoading, setLetterLoading] = useState(false);
  const [letterErr,     setLetterErr]     = useState('');

  const loadAdmissionApp = useCallback(async () => {
    try {
      const { data } = await api.get<AdmissionApp>(`/api/admin/admissions/by-student/${id}`);
      setAdmApp(data);
    } catch { setAdmApp(null); }
  }, [id]);

  const loadCard = useCallback(async () => {
    try {
      const { data } = await api.get<{ active_card: IdCard | null }>(`/api/id-cards/student/${id}`);
      setActiveCard(data.active_card);
      // Prefill date inputs from the card's stored dates so re-downloading preserves them.
      if (data.active_card) {
        if (data.active_card.issued_at)
          setCardIssueDate(String(data.active_card.issued_at).slice(0, 10));
        if (data.active_card.expires_at)
          setCardExpiresAt(String(data.active_card.expires_at).slice(0, 10));
      }
    } catch { setActiveCard(null); }
  }, [id]);

  const loadScanHistory = useCallback(async () => {
    setScanHistoryLoading(true);
    try {
      const { data } = await api.get<{ scans: ScanEvent[] }>(`/api/id-cards/student/${id}/scans`);
      setScanHistory(data.scans ?? []);
    } catch { setScanHistory([]); }
    finally { setScanHistoryLoading(false); }
  }, [id]);

  const load = useCallback(async () => {
    try {
      const [{ data: s }, { data: progs }, { data: hs }] = await Promise.all([
        api.get<StudentProfile>(`/api/students/${id}`),
        api.get<Program[]>('/api/programs'),
        api.get<House[]>('/api/houses'),
      ]);
      setProfile(s);
      setPrograms(progs);
      setHouses(hs);
      setForm(toForm(s));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setLoadErr(msg ?? 'Could not load student profile.');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); loadCard(); loadScanHistory(); loadAdmissionApp(); }, [load, loadCard, loadScanHistory, loadAdmissionApp]);

  function toForm(p: StudentProfile): Record<string, string> {
    return {
      name: p.name ?? '',
      class_name: p.class_name ?? '',
      program_id: p.program_id ?? '',
      status: p.status ?? 'Active',
      jhs_index_number: p.jhs_index_number ?? '',
      date_of_birth: p.date_of_birth?.slice(0, 10) ?? '',
      gender: p.gender ?? '',
      hometown: p.hometown ?? '',
      residential_address: p.residential_address ?? '',
      ghana_card_number: p.ghana_card_number ?? '',
      nhia_number: p.nhia_number ?? '',
      mobile_number: p.mobile_number ?? '',
      aggregate: p.aggregate != null ? String(p.aggregate) : '',
      house: p.house ?? '',
      residential_status: p.residential_status ?? '',
      religion: p.religion ?? '',
      religious_denomination: p.religious_denomination ?? '',
      guardian_name: p.guardian_name ?? '',
      guardian_occupation: p.guardian_occupation ?? '',
      guardian_mobile: p.guardian_mobile ?? '',
      notes: p.notes ?? '',
    };
  }

  function set(name: string, value: string) {
    setForm(f => ({ ...f, [name]: value }));
  }

  async function save() {
    const errs = validateStudentForm(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true); setSaveErr('');
    try {
      const body = {
        ...form,
        aggregate: form.aggregate ? parseInt(form.aggregate) : null,
        program_id: form.program_id || null,
      };
      const { data } = await api.put<StudentProfile>(`/api/students/${id}`, body);
      setProfile(data);
      setEditing(false);
      setFieldErrors({});
    } catch (err: unknown) {
      setSaveErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
  }

  async function downloadCard(endpoint: string, filename: string, body: Record<string, unknown> = {}) {
    setCardLoading(true); setCardErr('');
    try {
      const response = await api.post(endpoint, body, { responseType: 'blob' });
      const blob = response.data as Blob;
      const mime = filename.endsWith('.png') ? 'image/png' : 'application/pdf';
      const url  = URL.createObjectURL(new Blob([blob], { type: mime }));
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await loadCard();
    } catch {
      setCardErr('Could not generate ID card. Please try again.');
    } finally {
      setCardLoading(false);
    }
  }

  async function generateLetter() {
    if (!admApp) return;
    setLetterLoading(true); setLetterErr('');
    try {
      await api.post(`/api/admin/admissions/applications/${admApp.id}/letter`);
      await loadAdmissionApp();
    } catch (err: unknown) {
      setLetterErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not generate letter.');
    } finally { setLetterLoading(false); }
  }

  async function downloadLetter() {
    if (!admApp?.letter_url) return;
    setLetterLoading(true); setLetterErr('');
    try {
      const response = await api.get(`/api/admin/admissions/applications/${admApp.id}/letter/download`, { responseType: 'blob' });
      const blob = response.data as Blob;
      const url  = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const safeName = (admApp.full_name || profile?.name || 'Student').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
      const admNo    = (admApp.admission_number || 'UNKNOWN').replace(/[^A-Za-z0-9]/g, '');
      const a = document.createElement('a');
      a.href = url; a.download = `${safeName}_${admNo}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch {
      setLetterErr('Could not download letter. Please try again.');
    } finally { setLetterLoading(false); }
  }

  async function uploadPhoto(file: File) {
    setPhotoUploading(true); setUploadErr('');
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej;
        r.readAsDataURL(file);
      });
      const { data } = await api.post<{ picture_url: string }>(`/api/students/${id}/picture`, { imageBase64: b64 });
      setProfile(p => p ? { ...p, picture_url: data.picture_url } : p);
    } catch { setUploadErr('Photo upload failed'); }
    finally { setPhotoUploading(false); }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-6" />
        {[1,2,3].map(i => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse mb-5" />)}
      </div>
    );
  }

  if (loadErr)   return <div className="p-6 text-sm text-red-500">{loadErr}</div>;
  if (!profile)  return <div className="p-6 text-sm text-gray-500">Student not found.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back + header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/students')}
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-50">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-gray-500">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{profile.name}</h1>
          <p className="text-sm text-gray-500">
            {profile.student_code} · {profile.class_name}
            {profile.program_name ? ` · ${profile.program_name}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => { setEditing(false); setForm(toForm(profile)); setSaveErr(''); }}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {saveErr && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{saveErr}</div>
      )}
      {uploadErr && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{uploadErr}</div>
      )}

      {/* Photo + quick info */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5 flex items-start gap-5">
        <div className="relative shrink-0">
          <div className="w-24 h-24 rounded-xl bg-gray-100 overflow-hidden border border-gray-200">
            {profile.picture_url
              ? <Image src={profile.picture_url} alt={profile.name} width={96} height={96} className="w-full h-full object-cover" />
              : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-300">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )
            }
          </div>
          <button onClick={() => photoRef.current?.click()}
            className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center border-2 border-white"
            title="Upload photo">
            {photoUploading
              ? <span className="block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} className="w-3.5 h-3.5"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
            }
          </button>
          <input ref={photoRef} type="file" accept="image/*" className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 30 * 1024) { setUploadErr('Photo must be 30 KB or smaller.'); e.target.value = ''; return; }
              uploadPhoto(file);
            }} />
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Status"  value={profile.status} />
          <Field label="House"   value={profile.house} />
          <Field label="Residential" value={profile.residential_status} />
          <Field label="Program" value={profile.program_name} />
          <Field label="Age"     value={profile.age != null ? `${profile.age} years` : null} />
        </div>
      </div>

      {/* Personal Information */}
      {editing ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Personal Information</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="Full Name"    name="name"           value={form.name}           onChange={set} />
            <EditField label="Class"        name="class_name"     value={form.class_name}     onChange={set} />
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Program</label>
              <select value={form.program_id} onChange={e => set('program_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">— none —</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="Active">Active</option>
                <option value="Graduated">Graduated</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <EditField label="Gender"       name="gender"         value={form.gender}         onChange={set} options={GENDERS} />
            <EditField label="Date of Birth" name="date_of_birth" value={form.date_of_birth}  onChange={set} type="date" />
            <EditField label="JHS Index No." name="jhs_index_number" value={form.jhs_index_number} onChange={set} />
            <EditField label="Aggregate"    name="aggregate"      value={form.aggregate}      onChange={set} type="number" />
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">House</label>
              <select value={form.house} onChange={e => set('house', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">— none —</option>
                {houses.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
              </select>
            </div>
            <EditField label="Residential Status" name="residential_status" value={form.residential_status} onChange={set} options={RES_STATUSES} />
            <EditField label="Mobile No."   name="mobile_number"  value={form.mobile_number}  onChange={set} error={fieldErrors.mobile_number} />
            <EditField label="Hometown"     name="hometown"       value={form.hometown}       onChange={set} />
            <div className="sm:col-span-2">
              <EditField label="Residential Address" name="residential_address" value={form.residential_address} onChange={set} />
            </div>
            <EditField label="Ghana Card No." name="ghana_card_number" value={form.ghana_card_number} onChange={set} error={fieldErrors.ghana_card_number} />
            <EditField label="NHIA No."     name="nhia_number"    value={form.nhia_number}    onChange={set} />
            <EditField label="Religion"     name="religion"       value={form.religion}       onChange={set} options={RELIGIONS} />
            <EditField label="Religious Denomination" name="religious_denomination" value={form.religious_denomination} onChange={set} />
          </div>
        </div>
      ) : (
        <Section title="Personal Information">
          <Field label="Gender"       value={profile.gender} />
          <Field label="Date of Birth" value={fmt(profile.date_of_birth)} />
          <Field label="Age"          value={profile.age != null ? `${profile.age} years` : null} />
          <Field label="JHS Index No." value={profile.jhs_index_number} />
          <Field label="Aggregate"    value={profile.aggregate} />
          <Field label="House"        value={profile.house} />
          <Field label="Residential Status" value={profile.residential_status} />
          <Field label="Mobile No."   value={profile.mobile_number} />
          <Field label="Hometown"     value={profile.hometown} />
          <Field label="Residential Address" value={profile.residential_address} />
          <Field label="Ghana Card No." value={profile.ghana_card_number} />
          <Field label="NHIA No."     value={profile.nhia_number} />
          <Field label="Religion"     value={profile.religion} />
          <Field label="Religious Denomination" value={profile.religious_denomination} />
        </Section>
      )}

      {/* Guardian Information */}
      {editing ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Parent / Guardian</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="Guardian Name"       name="guardian_name"       value={form.guardian_name}       onChange={set} />
            <EditField label="Occupation"          name="guardian_occupation" value={form.guardian_occupation} onChange={set} />
            <EditField label="Guardian Mobile"     name="guardian_mobile"     value={form.guardian_mobile}     onChange={set} error={fieldErrors.guardian_mobile} />
          </div>
        </div>
      ) : (
        <Section title="Parent / Guardian">
          <Field label="Name"       value={profile.guardian_name} />
          <Field label="Occupation" value={profile.guardian_occupation} />
          <Field label="Mobile"     value={profile.guardian_mobile} />
        </Section>
      )}

      {/* Notes */}
      {editing && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Notes</h3>
          </div>
          <div className="p-5">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
      )}

      {/* ID Card */}
      {!editing && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">ID Card</h3>
            {activeCard && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                Issue #{activeCard.issue_number} · Active
              </span>
            )}
          </div>
          <div className="p-5">
            {cardErr && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{cardErr}</div>
            )}

            {/* Card info row */}
            {activeCard === undefined ? (
              <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-4" />
            ) : activeCard ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Issue Number</p>
                  <p className="text-sm text-gray-800">#{activeCard.issue_number}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Issued</p>
                  <p className="text-sm text-gray-800">
                    {new Date(activeCard.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Valid Until</p>
                  <p className="text-sm text-gray-800">
                    {activeCard.expires_at
                      ? new Date(activeCard.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : <span className="text-gray-400 italic">No expiry</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Token</p>
                  <p className="text-xs text-gray-400 font-mono truncate" title={activeCard.token}>
                    {activeCard.token.slice(0, 8)}…
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-5">No active card. Click Generate to issue one.</p>
            )}

            {/* Date override fields */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <p className="text-xs text-gray-400 font-medium mb-0.5">Issue Date</p>
                <input type="date" value={cardIssueDate} onChange={e => setCardIssueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 font-medium mb-0.5">Valid Until</p>
                <input type="date" value={cardExpiresAt} onChange={e => setCardExpiresAt(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {activeCard && (
              <p className="text-xs text-gray-400 mb-3 -mt-2">Dates apply only if a new card is minted. Existing active cards retain their stored dates.</p>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                disabled={cardLoading}
                onClick={() => downloadCard(
                  `/api/id-cards/pdf/${id}`,
                  `ID_${profile.name.replace(/\s+/g, '_')}_Issue${(activeCard?.issue_number ?? 1)}.pdf`,
                  { issued_at: cardIssueDate, expires_at: cardExpiresAt }
                )}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {cardLoading ? (
                  <span className="block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
                {activeCard ? 'Download PDF' : 'Generate ID Card'}
              </button>

              {activeCard && (
                <button
                  disabled={cardLoading}
                  onClick={() => downloadCard(
                    `/api/id-cards/png/${id}`,
                    `ID_${profile.name.replace(/\s+/g, '_')}_Issue${activeCard.issue_number}.png`,
                    { issued_at: cardIssueDate, expires_at: cardExpiresAt }
                  )}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                  Download PNG
                </button>
              )}

              {activeCard && (
                <button
                  disabled={cardLoading}
                  onClick={() => {
                    if (!confirm('Reissue card? The current card will be revoked immediately and a new one generated.')) return;
                    downloadCard(
                      `/api/id-cards/reissue-pdf/${id}`,
                      `ID_${profile.name.replace(/\s+/g, '_')}_Issue${activeCard.issue_number + 1}.pdf`,
                      { issued_at: cardIssueDate, expires_at: cardExpiresAt }
                    );
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reissue Card
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scan History */}
      {!editing && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Scan History</h3>
            {scanHistory.length > 0 && (
              <span className="text-xs text-gray-400">{scanHistory.length} event{scanHistory.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="overflow-x-auto">
            {scanHistoryLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#145C44', borderTopColor: 'transparent' }} />
              </div>
            ) : scanHistory.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No scans recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">Time</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">Result</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">Card</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">Scanned by</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {scanHistory.map((s, i) => {
                    const style = SCAN_STATUS_STYLE[s.response_status] ?? SCAN_STATUS_STYLE.unknown;
                    return (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-2.5 text-gray-700 whitespace-nowrap">
                          {new Date(s.scanned_at).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="px-5 py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ background: style.bg, color: style.color }}>
                            {style.label}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-gray-500 text-xs">
                          Issue #{s.issue_number}
                          {s.card_status !== 'active' && (
                            <span className="ml-1.5 text-amber-600">({s.card_status})</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-gray-500 text-xs">
                          {s.scanned_by_name ?? <span className="text-gray-300 italic">public</span>}
                        </td>
                        <td className="px-5 py-2.5 text-gray-400 text-xs font-mono">
                          {s.ip_address ?? <span className="text-gray-300 italic">purged</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Admission Letter */}
      {!editing && admApp !== undefined && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Admission Letter</h3>
            {admApp?.letter_generated_at && (
              <span className="text-xs text-gray-400">
                Last generated {new Date(admApp.letter_generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
          <div className="p-5">
            {admApp === null ? (
              <p className="text-sm text-gray-400">No admission application linked to this student.</p>
            ) : (
              <>
                {admApp.letter_url ? (
                  <p className="text-sm text-gray-600 mb-4">
                    A letter has been generated for this student. Use the buttons below to view, download, or regenerate it.
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 mb-4">No letter generated yet. Click Generate to create one.</p>
                )}
                {letterErr && <p className="text-sm text-red-500 mb-3">{letterErr}</p>}
                <div className="flex flex-wrap gap-3">
                  {admApp.letter_url && (
                    <a
                      href={admApp.letter_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
                      </svg>
                      View Letter
                    </a>
                  )}
                  {admApp.letter_url && (
                    <button
                      disabled={letterLoading}
                      onClick={downloadLetter}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {letterLoading ? (
                        <span className="block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                      Download PDF
                    </button>
                  )}
                  <button
                    disabled={letterLoading}
                    onClick={generateLetter}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {letterLoading && !admApp.letter_url ? (
                      <span className="block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    {admApp.letter_url ? 'Regenerate Letter' : 'Generate Letter'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
