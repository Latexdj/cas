'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/lib/api';
import type { StudentProfile, Program } from '@/types/api';

const GENDERS   = ['Male', 'Female'];
const RELIGIONS = ['Christianity', 'Islam', 'Traditional', 'Other'];
const RES_STATUSES = ['Day', 'Boarding'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
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
  label, name, value, onChange, type = 'text', options,
}: {
  label: string; name: string; value: string;
  onChange: (n: string, v: string) => void;
  type?: string; options?: string[];
}) {
  if (options) {
    return (
      <div>
        <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
        <select value={value} onChange={e => onChange(name, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">— select —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div>
      <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(name, e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}

function fmt(iso?: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [profile,  setProfile]  = useState<StudentProfile | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [form,     setForm]     = useState<Record<string, string>>({});
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState('');

  const photoRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [uploadErr,      setUploadErr]      = useState('');

  const load = useCallback(async () => {
    try {
      const [{ data: s }, { data: progs }] = await Promise.all([
        api.get<StudentProfile>(`/api/students/${id}`),
        api.get<Program[]>('/api/programs'),
      ]);
      setProfile(s);
      setPrograms(progs);
      setForm(toForm(s));
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
    } catch (err: unknown) {
      setSaveErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
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
        {[1,2,3].map(i => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse mb-5" />)}
      </div>
    );
  }

  if (!profile) return <div className="p-6 text-sm text-gray-500">Student not found.</div>;

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
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5 flex items-start gap-5">
        <div className="relative shrink-0">
          <div className="w-24 h-24 rounded-2xl bg-gray-100 overflow-hidden border border-gray-200">
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
            onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0]); }} />
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
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
            <EditField label="House"        name="house"          value={form.house}          onChange={set} />
            <EditField label="Residential Status" name="residential_status" value={form.residential_status} onChange={set} options={RES_STATUSES} />
            <EditField label="Mobile No."   name="mobile_number"  value={form.mobile_number}  onChange={set} />
            <EditField label="Hometown"     name="hometown"       value={form.hometown}       onChange={set} />
            <div className="sm:col-span-2">
              <EditField label="Residential Address" name="residential_address" value={form.residential_address} onChange={set} />
            </div>
            <EditField label="Ghana Card No." name="ghana_card_number" value={form.ghana_card_number} onChange={set} />
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Parent / Guardian</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="Guardian Name"       name="guardian_name"       value={form.guardian_name}       onChange={set} />
            <EditField label="Occupation"          name="guardian_occupation" value={form.guardian_occupation} onChange={set} />
            <EditField label="Guardian Mobile"     name="guardian_mobile"     value={form.guardian_mobile}     onChange={set} />
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Notes</h3>
          </div>
          <div className="p-5">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
      )}
    </div>
  );
}
