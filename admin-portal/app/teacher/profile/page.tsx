'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors, clearTeacher } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

function compressToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
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

export default function ProfilePage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [primary,     setPrimary]     = useState('#2ab289');
  const [name,        setName]        = useState('');
  const [role,        setRole]        = useState('');
  const [teacherCode, setTeacherCode] = useState('');
  const [photoUrl,    setPhotoUrl]    = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError,   setPhotoError]   = useState('');

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
    if (teacher) {
      setName(teacher.name);
      setRole(teacher.role);
    }
    teacherApi.get('/api/teachers/me').then(r => {
      setPhotoUrl(r.data.photo_url ?? null);
      setTeacherCode(r.data.teacher_code ?? '');
    }).catch(() => {});
  }, []);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setPhotoError('');
    try {
      const dataUrl = await compressToBase64(file);
      const res = await teacherApi.patch('/api/teachers/me/photo', { imageBase64: dataUrl });
      setPhotoUrl(res.data.photo_url);
    } catch {
      setPhotoError('Failed to upload photo. Please try again.');
    } finally {
      setPhotoLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(''); setPwSuccess('');
    if (!currentPassword)            { setPwError('Current password is required.'); return; }
    if (!newPassword)                { setPwError('New password is required.'); return; }
    if (newPassword.length < 6)      { setPwError('New password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return; }
    setPwLoading(true);
    try {
      await teacherApi.post('/api/auth/change-password', { currentPassword, newPassword });
      setPwSuccess('Password changed successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; error?: string } } };
      setPwError(axiosErr.response?.data?.message ?? axiosErr.response?.data?.error ?? 'Failed to change password.');
    } finally { setPwLoading(false); }
  }

  function handleLogout() {
    clearTeacher();
    router.push('/teacher/login');
  }

  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'T';

  return (
    <div className="min-h-screen px-4 pt-6 pb-6" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#2C2218]">Profile</h1>
        <p className="text-sm text-[#8C7E6E]">Your account details</p>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5 mb-5">
        {/* Avatar + photo upload */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative shrink-0">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            {photoUrl ? (
              <img src={photoUrl} alt="Profile" className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold"
                style={{ background: primary }}>
                {initials}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={photoLoading}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-white border-2 border-white flex items-center justify-center shadow-sm disabled:opacity-50"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
            >
              {photoLoading ? (
                <span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5" style={{ color: primary }}>
                  <path strokeLinecap="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              )}
            </button>
          </div>
          <div>
            <p className="text-base font-bold text-[#2C2218]">{name || 'Teacher'}</p>
            <p className="text-xs text-[#8C7E6E] mt-0.5 capitalize">{role}</p>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={photoLoading}
              className="text-xs font-semibold mt-1 disabled:opacity-50"
              style={{ color: primary }}
            >
              {photoUrl ? 'Change photo' : 'Upload photo'}
            </button>
          </div>
        </div>

        {photoError && (
          <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{photoError}</p>
        )}

        <div className="space-y-2">
          {teacherCode && (
            <div className="flex items-center justify-between py-2 border-t border-[#F4EFE6]">
              <p className="text-xs text-[#8C7E6E]">Teacher ID</p>
              <p className="text-xs font-bold text-[#2C2218] font-mono">{teacherCode}</p>
            </div>
          )}
          <div className="flex items-center justify-between py-2 border-t border-[#F4EFE6]">
            <p className="text-xs text-[#8C7E6E]">Role</p>
            <p className="text-xs font-medium text-[#2C2218] capitalize">{role || '—'}</p>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5 mb-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-4">Change Password</p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          {[
            { label: 'Current Password', value: currentPassword, set: setCurrentPassword, autocomplete: 'current-password' },
            { label: 'New Password',     value: newPassword,     set: setNewPassword,     autocomplete: 'new-password' },
            { label: 'Confirm New Password', value: confirmPassword, set: setConfirmPassword, autocomplete: 'new-password' },
          ].map(({ label, value, set, autocomplete }) => (
            <div key={label}>
              <label className="text-xs text-[#8C7E6E] block mb-1">{label}</label>
              <input type="password" value={value} onChange={e => set(e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}`} autoComplete={autocomplete}
                className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none" />
            </div>
          ))}

          {pwError   && <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwError}</p>}
          {pwSuccess && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{pwSuccess}</p>}

          <button type="submit" disabled={pwLoading}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
            style={{ background: primary }}>
            {pwLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Updating...
              </span>
            ) : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Logout */}
      <button onClick={handleLogout}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm border-2"
        style={{ borderColor: '#B83232', color: '#B83232', background: 'white' }}>
        Sign Out
      </button>
    </div>
  );
}
