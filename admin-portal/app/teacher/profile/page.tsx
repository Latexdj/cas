'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors, clearTeacher } from '@/lib/teacher-auth';
import { validatePhone } from '@/lib/validations';
import { teacherApi } from '@/lib/teacher-api';

const GENDERS   = ['Male', 'Female'];
const RELIGIONS = ['Christianity', 'Islam', 'Traditional', 'Other'];

interface TeacherProfile {
  id: string;
  teacher_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  rank: string | null;
  gov_staff_id: string | null;
  gender: string | null;
  date_of_birth: string | null;
  registered_number: string | null;
  ntc_number: string | null;
  ssf_number: string | null;
  academic_qualification: string | null;
  professional_qualification: string | null;
  additional_responsibility: string | null;
  bank: string | null;
  bank_branch: string | null;
  account_number: string | null;
  religion: string | null;
  religious_denomination: string | null;
  hometown: string | null;
  residential_address: string | null;
  association: string | null;
  ghana_card_number: string | null;
  certificate_url: string | null;
  certificate_filename: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_url: string | null;
}

function compressToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 400 / Math.max(img.width, img.height));
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-[#F4EFE6] last:border-0">
      <p className="text-xs text-[#8C7E6E] shrink-0 w-40">{label}</p>
      <p className="text-xs font-semibold text-[#2C2218] text-right flex-1">{value || '—'}</p>
    </div>
  );
}

export default function ProfilePage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const certRef = useRef<HTMLInputElement>(null);

  const [primary,  setPrimary]  = useState('#2ab289');
  const [profile,  setProfile]  = useState<TeacherProfile | null>(null);
  const [role,     setRole]     = useState('');

  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError,   setPhotoError]   = useState('');
  const [certLoading,  setCertLoading]  = useState(false);

  const [showEdit, setShowEdit]   = useState(false);
  const [editForm, setEditForm]   = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState('');

  const [currentPassword,  setCurrentPassword]  = useState('');
  const [newPassword,      setNewPassword]      = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');
  const [pwLoading,        setPwLoading]        = useState(false);
  const [pwError,          setPwError]          = useState('');
  const [pwSuccess,        setPwSuccess]        = useState('');

  useEffect(() => {
    const colors  = getTeacherColors();
    const teacher = getTeacher();
    setPrimary(colors.primary);
    if (teacher) setRole(teacher.role);
    teacherApi.get<TeacherProfile>('/api/teachers/me').then(r => {
      setProfile(r.data);
    }).catch(() => {});
  }, []);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true); setPhotoError('');
    try {
      const dataUrl = await compressToBase64(file);
      const res = await teacherApi.patch('/api/teachers/me/photo', { imageBase64: dataUrl });
      setProfile(p => p ? { ...p, photo_url: res.data.photo_url } : p);
    } catch { setPhotoError('Failed to upload photo. Please try again.'); }
    finally { setPhotoLoading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleCertChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertLoading(true);
    try {
      const documentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await teacherApi.patch('/api/teachers/me/certificate', { documentBase64, documentFilename: file.name });
      setProfile(p => p ? { ...p, certificate_url: res.data.certificate_url, certificate_filename: res.data.certificate_filename } : p);
    } catch { alert('Failed to upload certificate.'); }
    finally { setCertLoading(false); if (certRef.current) certRef.current.value = ''; }
  }

  function openEdit() {
    if (!profile) return;
    setEditForm({
      phone:                   profile.phone ?? '',
      gender:                  profile.gender ?? '',
      date_of_birth:           profile.date_of_birth?.slice(0, 10) ?? '',
      religion:                profile.religion ?? '',
      religious_denomination:  profile.religious_denomination ?? '',
      hometown:                profile.hometown ?? '',
      residential_address:     profile.residential_address ?? '',
      emergency_contact_name:  profile.emergency_contact_name ?? '',
      emergency_contact_phone: profile.emergency_contact_phone ?? '',
    });
    setEditError('');
    setShowEdit(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    const phoneErr    = validatePhone(editForm.phone);
    const emrgPhErr   = validatePhone(editForm.emergency_contact_phone);
    if (phoneErr)  { setEditError(`Phone: ${phoneErr}`); return; }
    if (emrgPhErr) { setEditError(`Emergency contact phone: ${emrgPhErr}`); return; }
    setEditSaving(true); setEditError('');
    try {
      const res = await teacherApi.patch('/api/teachers/me/profile', editForm);
      setProfile(p => p ? { ...p, ...res.data } : p);
      setShowEdit(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setEditError(msg ?? 'Could not save profile.');
    } finally { setEditSaving(false); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(''); setPwSuccess('');
    if (!currentPassword)                  { setPwError('Current password is required.'); return; }
    if (!newPassword)                      { setPwError('New password is required.'); return; }
    if (newPassword.length < 6)            { setPwError('New password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword)   { setPwError('Passwords do not match.'); return; }
    setPwLoading(true);
    try {
      await teacherApi.post('/api/auth/change-password', { currentPassword, newPassword });
      setPwSuccess('Password changed successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { message?: string; error?: string } } };
      setPwError(axErr.response?.data?.message ?? axErr.response?.data?.error ?? 'Failed to change password.');
    } finally { setPwLoading(false); }
  }

  function handleLogout() { clearTeacher(); router.push('/teacher/login'); }

  const initials = profile?.name ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'T';

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#2C2218]">My Profile</h1>
        <p className="text-sm text-[#8C7E6E]">Your personal and professional information</p>
      </div>

      {/* Photo + identity card */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative shrink-0">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            {profile?.photo_url ? (
              <img src={profile.photo_url} alt="Profile" className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold"
                style={{ background: primary }}>{initials}</div>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={photoLoading}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-white border-2 border-white flex items-center justify-center shadow disabled:opacity-50"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
              {photoLoading
                ? <span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5" style={{ color: primary }}>
                    <path strokeLinecap="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
              }
            </button>
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-[#2C2218]">{profile?.name || 'Teacher'}</p>
            <p className="text-xs text-[#8C7E6E] mt-0.5">{profile?.rank ?? role}</p>
            {profile?.teacher_code && <p className="text-xs font-mono font-bold text-[#2C2218] mt-1">{profile.teacher_code}</p>}
          </div>
          <button onClick={openEdit}
            className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border"
            style={{ borderColor: primary, color: primary }}>
            Edit
          </button>
        </div>
        {photoError && <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2">{photoError}</p>}
      </div>

      {/* Personal Information */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Personal Information</p>
        <InfoRow label="Email"       value={profile?.email} />
        <InfoRow label="Phone"       value={profile?.phone} />
        <InfoRow label="Gender"      value={profile?.gender} />
        <InfoRow label="Date of Birth" value={profile?.date_of_birth?.slice(0, 10)} />
        <InfoRow label="Hometown"    value={profile?.hometown} />
        <InfoRow label="Address"     value={profile?.residential_address} />
        <InfoRow label="Religion"    value={profile?.religion} />
        <InfoRow label="Denomination" value={profile?.religious_denomination} />
        <InfoRow label="Ghana Card No." value={profile?.ghana_card_number} />
      </div>

      {/* Professional (read-only) */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Professional Information</p>
        <InfoRow label="Department"          value={profile?.department} />
        <InfoRow label="GES Rank"            value={profile?.rank} />
        <InfoRow label="Gov Staff ID"        value={profile?.gov_staff_id} />
        <InfoRow label="Registered No."      value={profile?.registered_number} />
        <InfoRow label="NTC Number"          value={profile?.ntc_number} />
        <InfoRow label="SSF Number"          value={profile?.ssf_number} />
        <InfoRow label="Academic Qual."      value={profile?.academic_qualification} />
        <InfoRow label="Professional Qual."  value={profile?.professional_qualification} />
        <InfoRow label="Responsibility"      value={profile?.additional_responsibility} />
        <InfoRow label="Association"         value={profile?.association} />
      </div>

      {/* Banking (read-only) */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Banking</p>
        <InfoRow label="Bank"        value={profile?.bank} />
        <InfoRow label="Branch"      value={profile?.bank_branch} />
        <InfoRow label="Account No." value={profile?.account_number} />
      </div>

      {/* Emergency Contact */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Emergency Contact</p>
        <InfoRow label="Name"  value={profile?.emergency_contact_name} />
        <InfoRow label="Phone" value={profile?.emergency_contact_phone} />
      </div>

      {/* Documents */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Documents</p>
        <div className="flex items-center justify-between">
          <div className="flex-1 mr-3">
            <p className="text-xs text-[#8C7E6E] mb-1">Academic Certificate</p>
            {profile?.certificate_url ? (
              <a href={profile.certificate_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: primary }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
                  <path strokeLinecap="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                {profile.certificate_filename ?? 'View Certificate'}
              </a>
            ) : (
              <p className="text-xs text-[#C0B5A5] italic">No certificate uploaded</p>
            )}
          </div>
          <input ref={certRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleCertChange} />
          <button onClick={() => certRef.current?.click()} disabled={certLoading}
            className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border disabled:opacity-40"
            style={{ borderColor: primary, color: primary }}>
            {certLoading ? 'Uploading…' : profile?.certificate_url ? 'Replace' : 'Upload'}
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5 mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-4">Change Password</p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          {[
            { label: 'Current Password', value: currentPassword, set: setCurrentPassword, ac: 'current-password' },
            { label: 'New Password',     value: newPassword,     set: setNewPassword,     ac: 'new-password' },
            { label: 'Confirm Password', value: confirmPassword, set: setConfirmPassword, ac: 'new-password' },
          ].map(({ label, value, set, ac }) => (
            <div key={label}>
              <label className="text-xs text-[#8C7E6E] block mb-1">{label}</label>
              <input type="password" value={value} onChange={e => set(e.target.value)} autoComplete={ac}
                className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none" />
            </div>
          ))}
          {pwError   && <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwError}</p>}
          {pwSuccess && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{pwSuccess}</p>}
          <button type="submit" disabled={pwLoading}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
            style={{ background: primary }}>
            {pwLoading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>

      <button onClick={handleLogout}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm border-2 mb-6"
        style={{ borderColor: '#B83232', color: '#B83232', background: 'white' }}>
        Sign Out
      </button>

      {/* Edit Profile slide-up */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full bg-white rounded-t-2xl p-6 max-h-[90vh] overflow-y-auto">
            <p className="text-base font-bold text-[#1C1208] mb-1">Edit My Profile</p>
            <p className="text-xs text-[#8C7E6E] mb-5">You can update personal and contact information</p>
            <form onSubmit={saveEdit} className="space-y-4">
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">Phone</label>
                <input type="tel" value={editForm.phone ?? ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-[#E2D9CC] rounded-xl px-4 py-2.5 text-sm text-[#2C2218] focus:outline-none" placeholder="+233..." />
              </div>
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1.5">Gender</label>
                <div className="flex flex-wrap gap-2">
                  {GENDERS.map(g => (
                    <button key={g} type="button" onClick={() => setEditForm(f => ({ ...f, gender: g }))}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                      style={editForm.gender === g ? { background: primary, borderColor: primary, color: 'white' } : { background: 'white', borderColor: '#E2D9CC', color: '#8C7E6E' }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">Date of Birth</label>
                <input type="date" value={editForm.date_of_birth ?? ''} onChange={e => setEditForm(f => ({ ...f, date_of_birth: e.target.value }))}
                  className="w-full border border-[#E2D9CC] rounded-xl px-4 py-2.5 text-sm text-[#2C2218] focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">Hometown</label>
                <input type="text" value={editForm.hometown ?? ''} onChange={e => setEditForm(f => ({ ...f, hometown: e.target.value }))}
                  className="w-full border border-[#E2D9CC] rounded-xl px-4 py-2.5 text-sm text-[#2C2218] focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">Residential Address</label>
                <textarea value={editForm.residential_address ?? ''} onChange={e => setEditForm(f => ({ ...f, residential_address: e.target.value }))} rows={2}
                  className="w-full border border-[#E2D9CC] rounded-xl px-4 py-2.5 text-sm text-[#2C2218] focus:outline-none resize-none" />
              </div>
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1.5">Religion</label>
                <div className="flex flex-wrap gap-2">
                  {RELIGIONS.map(r => (
                    <button key={r} type="button" onClick={() => setEditForm(f => ({ ...f, religion: r }))}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                      style={editForm.religion === r ? { background: primary, borderColor: primary, color: 'white' } : { background: 'white', borderColor: '#E2D9CC', color: '#8C7E6E' }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">Religious Denomination</label>
                <input type="text" value={editForm.religious_denomination ?? ''} onChange={e => setEditForm(f => ({ ...f, religious_denomination: e.target.value }))}
                  className="w-full border border-[#E2D9CC] rounded-xl px-4 py-2.5 text-sm text-[#2C2218] focus:outline-none" placeholder="e.g. Catholic, Methodist" />
              </div>
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">Emergency Contact Name</label>
                <input type="text" value={editForm.emergency_contact_name ?? ''} onChange={e => setEditForm(f => ({ ...f, emergency_contact_name: e.target.value }))}
                  className="w-full border border-[#E2D9CC] rounded-xl px-4 py-2.5 text-sm text-[#2C2218] focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">Emergency Contact Phone</label>
                <input type="tel" value={editForm.emergency_contact_phone ?? ''} onChange={e => setEditForm(f => ({ ...f, emergency_contact_phone: e.target.value }))}
                  className="w-full border border-[#E2D9CC] rounded-xl px-4 py-2.5 text-sm text-[#2C2218] focus:outline-none" placeholder="+233..." />
              </div>
              {editError && <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowEdit(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[#E2D9CC] text-[#8C7E6E] bg-white">
                  Cancel
                </button>
                <button type="submit" disabled={editSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: primary }}>
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
