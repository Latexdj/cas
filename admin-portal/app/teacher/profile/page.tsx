'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors, clearTeacher } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

export default function ProfilePage() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [schoolId, setSchoolId] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    const teacher = getTeacher();
    if (teacher) {
      setName(teacher.name);
      setRole(teacher.role);
      setSchoolId(teacher.schoolId);
    }
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (!currentPassword) { setPwError('Current password is required.'); return; }
    if (!newPassword) { setPwError('New password is required.'); return; }
    if (newPassword.length < 6) { setPwError('New password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return; }

    setPwLoading(true);
    try {
      await teacherApi.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setPwSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        setPwError(axiosErr.response?.data?.message ?? 'Failed to change password.');
      } else {
        setPwError('Failed to change password.');
      }
    } finally {
      setPwLoading(false);
    }
  }

  function handleLogout() {
    clearTeacher();
    router.push('/teacher/login');
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-6" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#2C2218]">Profile</h1>
        <p className="text-sm text-[#8C7E6E]">Your account details</p>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5 mb-5">
        <div className="flex items-center gap-4 mb-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0"
            style={{ background: primary }}
          >
            {name ? name.charAt(0).toUpperCase() : 'T'}
          </div>
          <div>
            <p className="text-base font-bold text-[#2C2218]">{name || 'Teacher'}</p>
            <p className="text-xs text-[#8C7E6E] mt-0.5">{role}</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-t border-[#F4EFE6]">
            <p className="text-xs text-[#8C7E6E]">School ID</p>
            <p className="text-xs font-medium text-[#2C2218] font-mono">{schoolId || '—'}</p>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-[#F4EFE6]">
            <p className="text-xs text-[#8C7E6E]">Role</p>
            <p className="text-xs font-medium text-[#2C2218]">{role || '—'}</p>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5 mb-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-4">Change Password</p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="text-xs text-[#8C7E6E] block mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              autoComplete="current-password"
              className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-[#8C7E6E] block mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-[#8C7E6E] block mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none"
            />
          </div>

          {pwError && (
            <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwError}</p>
          )}
          {pwSuccess && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{pwSuccess}</p>
          )}

          <button
            type="submit"
            disabled={pwLoading}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
            style={{ background: primary }}
          >
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
      <button
        onClick={handleLogout}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm border-2"
        style={{ borderColor: '#B83232', color: '#B83232', background: 'white' }}
      >
        Sign Out
      </button>
    </div>
  );
}
