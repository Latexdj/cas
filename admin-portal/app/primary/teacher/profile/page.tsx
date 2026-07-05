'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Profile {
  id: string; name: string; teacher_code: string; email: string;
  phone: string | null; gender: string | null; date_of_birth: string | null;
  religion: string | null; religious_denomination: string | null;
  hometown: string | null; residential_address: string | null;
  emergency_contact_name: string | null; emergency_contact_phone: string | null;
  photo_url: string | null; department: string | null;
  academic_qualification: string | null; professional_qualification: string | null;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5">{value || <span className="italic text-slate-300">Not set</span>}</p>
    </div>
  );
}

export default function TeacherProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    phone: '', gender: '', date_of_birth: '', religion: '', religious_denomination: '',
    hometown: '', residential_address: '', emergency_contact_name: '', emergency_contact_phone: '',
  });
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<Profile>('/api/teachers/me')
      .then(r => {
        setProfile(r.data);
        setForm({
          phone:                   r.data.phone ?? '',
          gender:                  r.data.gender ?? '',
          date_of_birth:           r.data.date_of_birth ? r.data.date_of_birth.split('T')[0] : '',
          religion:                r.data.religion ?? '',
          religious_denomination:  r.data.religious_denomination ?? '',
          hometown:                r.data.hometown ?? '',
          residential_address:     r.data.residential_address ?? '',
          emergency_contact_name:  r.data.emergency_contact_name ?? '',
          emergency_contact_phone: r.data.emergency_contact_phone ?? '',
        });
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError(''); setSuccess('');
    try {
      const { data } = await api.patch<Profile>('/api/teachers/me/profile', form);
      setProfile(prev => ({ ...prev!, ...data }));
      setEditing(false);
      setSuccess('Profile updated successfully.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true); setError('');
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((res, rej) => {
        reader.onload = ev => res(ev.target!.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const { data } = await api.patch<{ photo_url: string }>('/api/teachers/me/photo', { imageBase64: base64 });
      setProfile(prev => prev ? { ...prev, photo_url: data.photo_url } : prev);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to upload photo');
    } finally { setPhotoUploading(false); if (photoRef.current) photoRef.current.value = ''; }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
    </div>
  );

  if (!profile) return <div className="text-center py-20 text-slate-400">{error || 'Profile not found.'}</div>;

  return (
    <div className="space-y-5 max-w-xl">
      <h1 className="text-xl font-bold text-slate-900">My Profile</h1>

      {error   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
      {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">{success}</p>}

      {/* Photo + identity */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
            {profile.photo_url ? (
              <img src={profile.photo_url} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-black text-gray-300">{profile.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <button onClick={() => photoRef.current?.click()}
            disabled={photoUploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-slate-500 hover:text-slate-800 disabled:opacity-50">
            {photoUploading
              ? <div className="w-3.5 h-3.5 border-2 border-t-transparent border-current rounded-full animate-spin" />
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>}
          </button>
          <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{profile.name}</p>
          <p className="text-sm text-slate-500">{profile.teacher_code}</p>
          {profile.department && <p className="text-xs text-slate-400 mt-0.5">{profile.department}</p>}
        </div>
      </div>

      {/* Read-only fields */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">School Details</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email"    value={profile.email} />
          <Field label="Status"   value={profile.department ?? undefined} />
          <Field label="Academic Qualification"     value={profile.academic_qualification} />
          <Field label="Professional Qualification" value={profile.professional_qualification} />
        </div>
      </div>

      {/* Editable fields */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-700">Personal Information</p>
          {!editing && (
            <button onClick={() => setEditing(true)}
              className="text-xs font-semibold hover:underline" style={{ color: '#15803D' }}>
              Edit
            </button>
          )}
        </div>
        <div className="p-5">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 0244000000" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Gender</label>
                  <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Religion</label>
                  <input value={form.religion} onChange={e => setForm(f => ({ ...f, religion: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Christianity" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Denomination</label>
                  <input value={form.religious_denomination} onChange={e => setForm(f => ({ ...f, religious_denomination: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Catholic" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Hometown</label>
                  <input value={form.hometown} onChange={e => setForm(f => ({ ...f, hometown: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Residential Address</label>
                <input value={form.residential_address} onChange={e => setForm(f => ({ ...f, residential_address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Emergency Contact Name</label>
                  <input value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Emergency Contact Phone</label>
                  <input value={form.emergency_contact_phone} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-slate-600">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#15803D' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone"             value={profile.phone} />
              <Field label="Gender"            value={profile.gender} />
              <Field label="Date of Birth"     value={profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null} />
              <Field label="Religion"          value={profile.religion} />
              <Field label="Denomination"      value={profile.religious_denomination} />
              <Field label="Hometown"          value={profile.hometown} />
              <Field label="Residential Address" value={profile.residential_address} />
              <Field label="Emergency Contact" value={profile.emergency_contact_name} />
              <Field label="Emergency Phone"   value={profile.emergency_contact_phone} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
