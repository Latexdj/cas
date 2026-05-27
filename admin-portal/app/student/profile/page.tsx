'use client';

import { useEffect, useState } from 'react';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface Profile {
  id: string; name: string; student_code: string; class_name: string; status: string;
  program_name: string | null; gender: string | null; picture_url: string | null;
  date_of_birth: string | null; age: number | null; hometown: string | null;
  residential_address: string | null; mobile_number: string | null;
  house: string | null; residential_status: string | null;
  religion: string | null; guardian_name: string | null;
  guardian_mobile: string | null; guardian_occupation: string | null;
  form_teacher: { teacher_name: string; teacher_code: string } | null;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 w-36 shrink-0 font-medium">{label}</span>
      <span className="text-sm text-slate-700 font-medium">{value}</span>
    </div>
  );
}

export default function StudentProfilePage() {
  const [profile,   setProfile]   = useState<Profile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [pwdMode,    setPwdMode]    = useState(false);
  const [curPwd,     setCurPwd]    = useState('');
  const [newPwd,     setNewPwd]    = useState('');
  const [pwdMsg,     setPwdMsg]    = useState('');
  const [pwdLoading, setPwdLoading]= useState(false);
  const colors = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  useEffect(() => {
    studentApi.get<Profile>('/api/student/profile')
      .then(r => setProfile(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!curPwd || !newPwd) { setPwdMsg('Both fields are required.'); return; }
    if (newPwd.length < 4)  { setPwdMsg('New password must be at least 4 characters.'); return; }
    setPwdLoading(true); setPwdMsg('');
    try {
      await studentApi.post('/api/student/change-pin', { currentPin: curPwd, newPin: newPwd });
      setPwdMsg('Password changed successfully!'); setCurPwd(''); setNewPwd('');
      setTimeout(() => { setPwdMode(false); setPwdMsg(''); }, 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPwdMsg(msg ?? 'Failed to change password.');
    } finally { setPwdLoading(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!profile) {
    return <div className="p-6 text-center text-slate-400">Could not load profile.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-xl mx-auto">

      {/* Identity card */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="h-20 w-full" style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }} />
        <div className="px-5 pb-5">
          <div className="flex items-end gap-4 -mt-10 mb-4">
            {profile.picture_url ? (
              <img src={profile.picture_url} alt=""
                className="w-20 h-20 rounded-2xl object-cover border-4 border-white shadow-sm" />
            ) : (
              <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-sm flex items-center justify-center text-3xl font-black text-white"
                style={{ background: primary }}>{profile.name[0]}</div>
            )}
            <div className="pb-1 flex-1 min-w-0">
              <p className="text-lg font-black text-slate-800 leading-tight truncate">{profile.name}</p>
              <p className="text-sm text-slate-400 font-mono">{profile.student_code}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">{profile.class_name}</span>
            {profile.program_name && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{profile.program_name}</span>}
            {profile.residential_status && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700">{profile.residential_status}</span>}
            {profile.house && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">{profile.house} House</span>}
          </div>
        </div>
      </div>

      {/* Personal info */}
      <div className="bg-white rounded-xl border border-slate-100 px-5 py-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide py-2">Personal Information</p>
        <Row label="Gender"       value={profile.gender} />
        <Row label="Date of Birth" value={profile.date_of_birth ? `${profile.date_of_birth}${profile.age ? ` (${profile.age} yrs)` : ''}` : null} />
        <Row label="Hometown"     value={profile.hometown} />
        <Row label="Address"      value={profile.residential_address} />
        <Row label="Mobile"       value={profile.mobile_number} />
        <Row label="Religion"     value={profile.religion} />
      </div>

      {/* Guardian */}
      {(profile.guardian_name || profile.guardian_mobile) && (
        <div className="bg-white rounded-xl border border-slate-100 px-5 py-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide py-2">Guardian / Parent</p>
          <Row label="Name"       value={profile.guardian_name} />
          <Row label="Occupation" value={profile.guardian_occupation} />
          <Row label="Mobile"     value={profile.guardian_mobile} />
        </div>
      )}

      {/* Form teacher */}
      {profile.form_teacher && (
        <div className="bg-white rounded-xl border border-slate-100 px-5 py-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide py-2">Form Teacher</p>
          <Row label="Name" value={profile.form_teacher.teacher_name} />
          <Row label="Code" value={profile.form_teacher.teacher_code} />
        </div>
      )}

      {/* Change PIN */}
      <div className="bg-white rounded-xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-slate-700">Portal Password</p>
            <p className="text-xs text-slate-400">Change your login password</p>
          </div>
          <button onClick={() => { setPwdMode(m => !m); setPwdMsg(''); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={pwdMode ? { background: '#f1f5f9', color: '#64748b' } : { background: `${primary}15`, color: primary }}>
            {pwdMode ? 'Cancel' : 'Change Password'}
          </button>
        </div>
        {pwdMode && (
          <form onSubmit={handleChangePassword} className="space-y-3 mt-3 pt-3 border-t border-slate-100">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Current Password</label>
              <input type="password" value={curPwd} onChange={e => { setCurPwd(e.target.value); setPwdMsg(''); }}
                placeholder="Current password"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">New Password</label>
              <input type="password" value={newPwd} onChange={e => { setNewPwd(e.target.value); setPwdMsg(''); }}
                placeholder="New password (min 4 characters)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {pwdMsg && (
              <p className={`text-xs ${pwdMsg.includes('success') ? 'text-green-600' : 'text-red-500'}`}>{pwdMsg}</p>
            )}
            <button type="submit" disabled={pwdLoading}
              className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: primary }}>
              {pwdLoading ? 'Saving...' : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
