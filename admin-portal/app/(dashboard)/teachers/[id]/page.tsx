'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/lib/api';
import type { TeacherProfile } from '@/types/api';

const GES_RANKS = [
  'Pupil Teacher', 'Teacher II', 'Teacher I',
  'Senior Teacher II', 'Senior Teacher I',
  'Assistant Superintendent II', 'Assistant Superintendent I',
  'Superintendent', 'Senior Superintendent', 'Principal Superintendent',
  'Assistant Director II', 'Assistant Director I',
  'Deputy Director', 'Director',
];
const ASSOCIATIONS   = ['GNAT', 'NAGRAT', 'CCT', 'TEWU', 'Non-member'];
const GENDERS        = ['Male', 'Female'];
const RELIGIONS      = ['Christianity', 'Islam', 'Traditional', 'Other'];

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
      <p className="text-sm text-gray-800">{value || <span className="text-gray-300 italic">—</span>}</p>
    </div>
  );
}

function EditField({
  label, name, value, onChange, type = 'text', options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (n: string, v: string) => void;
  type?: string;
  options?: string[];
}) {
  if (options) {
    return (
      <div>
        <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
        <select
          value={value}
          onChange={e => onChange(name, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">— select —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div>
      <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(name, e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function fmt(iso?: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function TeacherProfilePage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();

  const [profile,  setProfile]  = useState<TeacherProfile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [form,     setForm]     = useState<Record<string, string>>({});
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState('');

  const photoRef = useRef<HTMLInputElement>(null);
  const certRef  = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [certUploading,  setCertUploading]  = useState(false);
  const [uploadErr,      setUploadErr]      = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<TeacherProfile>(`/api/teachers/${id}`);
      setProfile(data);
      setForm(toForm(data));
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function toForm(p: TeacherProfile): Record<string, string> {
    return {
      name: p.name ?? '',
      email: p.email ?? '',
      phone: p.phone ?? '',
      department: p.department ?? '',
      rank: p.rank ?? '',
      gov_staff_id: p.gov_staff_id ?? '',
      gender: p.gender ?? '',
      date_of_birth: p.date_of_birth?.slice(0, 10) ?? '',
      registered_number: p.registered_number ?? '',
      ntc_number: p.ntc_number ?? '',
      ssf_number: p.ssf_number ?? '',
      academic_qualification: p.academic_qualification ?? '',
      professional_qualification: p.professional_qualification ?? '',
      additional_responsibility: p.additional_responsibility ?? '',
      bank: p.bank ?? '',
      bank_branch: p.bank_branch ?? '',
      account_number: p.account_number ?? '',
      religion: p.religion ?? '',
      religious_denomination: p.religious_denomination ?? '',
      hometown: p.hometown ?? '',
      residential_address: p.residential_address ?? '',
      association: p.association ?? '',
      ghana_card_number: p.ghana_card_number ?? '',
      emergency_contact_name: p.emergency_contact_name ?? '',
      emergency_contact_phone: p.emergency_contact_phone ?? '',
      status: p.status ?? 'Active',
      is_admin: p.is_admin ? 'true' : 'false',
      notes: p.notes ?? '',
    };
  }

  function set(name: string, value: string) {
    setForm(f => ({ ...f, [name]: value }));
  }

  async function save() {
    setSaving(true); setSaveErr('');
    try {
      const body = { ...form, is_admin: form.is_admin === 'true' };
      const { data } = await api.put<TeacherProfile>(`/api/teachers/${id}`, body);
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
      const { data } = await api.post<{ photo_url: string }>(`/api/teachers/${id}/photo`, { imageBase64: b64 });
      setProfile(p => p ? { ...p, photo_url: data.photo_url } : p);
    } catch { setUploadErr('Photo upload failed'); }
    finally { setPhotoUploading(false); }
  }

  async function uploadCert(file: File) {
    setCertUploading(true); setUploadErr('');
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej;
        r.readAsDataURL(file);
      });
      const { data } = await api.post<{ certificate_url: string; certificate_filename: string }>(
        `/api/teachers/${id}/certificate`,
        { documentBase64: b64, documentFilename: file.name }
      );
      setProfile(p => p ? { ...p, certificate_url: data.certificate_url, certificate_filename: data.certificate_filename } : p);
    } catch { setUploadErr('Certificate upload failed'); }
    finally { setCertUploading(false); }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-6" />
        {[1,2,3].map(i => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse mb-5" />)}
      </div>
    );
  }

  if (!profile) {
    return <div className="p-6 text-sm text-gray-500">Teacher not found.</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back + header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/teachers')}
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-gray-500">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{profile.name}</h1>
          <p className="text-sm text-gray-500">{profile.teacher_code} · {profile.rank ?? 'No rank'} · {profile.department ?? 'No department'}</p>
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
            {profile.photo_url
              ? <Image src={profile.photo_url} alt={profile.name} width={96} height={96} className="w-full h-full object-cover" />
              : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-300">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )
            }
          </div>
          <button
            onClick={() => photoRef.current?.click()}
            className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center border-2 border-white"
            title="Upload photo"
          >
            {photoUploading
              ? <span className="block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} className="w-3.5 h-3.5"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
            }
          </button>
          <input ref={photoRef} type="file" accept="image/*" className="hidden"
            onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0]); }} />
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Status" value={profile.status} />
          <Field label="Admin Access" value={profile.is_admin ? 'Yes' : 'No'} />
          <Field label="Total Periods / Week" value={String(profile.total_periods ?? 0)} />
          <Field label="Email" value={profile.email} />
          <Field label="Phone" value={profile.phone} />
        </div>
      </div>

      {/* Personal Information */}
      {editing ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Personal Information</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="Full Name"  name="name"  value={form.name}  onChange={set} />
            <EditField label="Email"      name="email" value={form.email} onChange={set} type="email" />
            <EditField label="Phone"      name="phone" value={form.phone} onChange={set} />
            <EditField label="Gender"     name="gender" value={form.gender} onChange={set} options={GENDERS} />
            <EditField label="Date of Birth" name="date_of_birth" value={form.date_of_birth} onChange={set} type="date" />
            <EditField label="Hometown"   name="hometown" value={form.hometown} onChange={set} />
            <div className="sm:col-span-2 lg:col-span-2">
              <EditField label="Residential Address" name="residential_address" value={form.residential_address} onChange={set} />
            </div>
            <EditField label="Religion"   name="religion" value={form.religion} onChange={set} options={RELIGIONS} />
            <EditField label="Religious Denomination" name="religious_denomination" value={form.religious_denomination} onChange={set} />
            <EditField label="Ghana Card Number" name="ghana_card_number" value={form.ghana_card_number} onChange={set} />
          </div>
        </div>
      ) : (
        <Section title="Personal Information">
          <Field label="Gender"       value={profile.gender} />
          <Field label="Date of Birth" value={fmt(profile.date_of_birth)} />
          <Field label="Hometown"     value={profile.hometown} />
          <Field label="Residential Address" value={profile.residential_address} />
          <Field label="Religion"     value={profile.religion} />
          <Field label="Religious Denomination" value={profile.religious_denomination} />
          <Field label="Ghana Card Number" value={profile.ghana_card_number} />
        </Section>
      )}

      {/* Professional Information */}
      {editing ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Professional Information</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="Department" name="department" value={form.department} onChange={set} />
            <EditField label="GES Rank"   name="rank"       value={form.rank}       onChange={set} options={GES_RANKS} />
            <EditField label="Gov Staff ID" name="gov_staff_id" value={form.gov_staff_id} onChange={set} />
            <EditField label="Registered Number" name="registered_number" value={form.registered_number} onChange={set} />
            <EditField label="NTC Number" name="ntc_number" value={form.ntc_number} onChange={set} />
            <EditField label="SSF Number" name="ssf_number" value={form.ssf_number} onChange={set} />
            <EditField label="Academic Qualification" name="academic_qualification" value={form.academic_qualification} onChange={set} />
            <EditField label="Professional Qualification" name="professional_qualification" value={form.professional_qualification} onChange={set} />
            <EditField label="Additional Responsibility" name="additional_responsibility" value={form.additional_responsibility} onChange={set} />
            <EditField label="Association" name="association" value={form.association} onChange={set} options={ASSOCIATIONS} />
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Admin Access</label>
              <select value={form.is_admin} onChange={e => set('is_admin', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        <Section title="Professional Information">
          <Field label="Department"   value={profile.department} />
          <Field label="GES Rank"     value={profile.rank} />
          <Field label="Gov Staff ID" value={profile.gov_staff_id} />
          <Field label="Registered Number" value={profile.registered_number} />
          <Field label="NTC Number"   value={profile.ntc_number} />
          <Field label="SSF Number"   value={profile.ssf_number} />
          <Field label="Academic Qualification" value={profile.academic_qualification} />
          <Field label="Professional Qualification" value={profile.professional_qualification} />
          <Field label="Additional Responsibility" value={profile.additional_responsibility} />
          <Field label="Association"  value={profile.association} />
        </Section>
      )}

      {/* Banking */}
      {editing ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Banking Details</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="Bank"           name="bank"           value={form.bank}           onChange={set} />
            <EditField label="Branch"         name="bank_branch"    value={form.bank_branch}    onChange={set} />
            <EditField label="Account Number" name="account_number" value={form.account_number} onChange={set} />
          </div>
        </div>
      ) : (
        <Section title="Banking Details">
          <Field label="Bank"           value={profile.bank} />
          <Field label="Branch"         value={profile.bank_branch} />
          <Field label="Account Number" value={profile.account_number} />
        </Section>
      )}

      {/* Emergency Contact */}
      {editing ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Emergency Contact</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="Contact Name"  name="emergency_contact_name"  value={form.emergency_contact_name}  onChange={set} />
            <EditField label="Contact Phone" name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={set} />
          </div>
        </div>
      ) : (
        <Section title="Emergency Contact">
          <Field label="Name"  value={profile.emergency_contact_name} />
          <Field label="Phone" value={profile.emergency_contact_phone} />
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Documents</h3>
        </div>
        <div className="p-5 flex flex-wrap gap-4">
          {/* Academic Certificate */}
          <div className="flex-1 min-w-[200px] border border-dashed border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">Academic Certificate</p>
            {profile.certificate_url ? (
              <div className="flex items-center gap-2 mb-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-green-600 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                <a href={profile.certificate_url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline truncate max-w-[180px]">
                  {profile.certificate_filename ?? 'View Certificate'}
                </a>
              </div>
            ) : (
              <p className="text-xs text-gray-300 italic mb-2">No certificate uploaded</p>
            )}
            <button onClick={() => certRef.current?.click()} disabled={certUploading}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold disabled:opacity-50">
              {certUploading ? 'Uploading…' : profile.certificate_url ? 'Replace' : 'Upload Certificate'}
            </button>
            <input ref={certRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
              onChange={e => { if (e.target.files?.[0]) uploadCert(e.target.files[0]); }} />
          </div>
        </div>
      </div>
    </div>
  );
}
