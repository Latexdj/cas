'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { saveUser } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const [schoolCode, setSchoolCode] = useState('');
  const [teacherId,  setTeacherId]  = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', {
        type: 'admin',
        username: teacherId.trim(),
        password,
        schoolCode: schoolCode.trim().toUpperCase(),
      });
      saveUser({ id: data.id, name: data.name, role: data.role, schoolId: data.schoolId, token: data.token });
      // Hard navigation — clears Next.js router cache and all component state,
      // so the new school's data is always fetched fresh.
      if (data.school_level === 'primary') {
        localStorage.setItem('cas_school_level', 'primary');
        window.location.href = '/primary/admin/dashboard';
      } else {
        localStorage.removeItem('cas_school_level');
        window.location.href = '/dashboard';
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Login failed. Check your Teacher ID, password and School Code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: '#0B3D2E' }}
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#C8973A' }}>
              <span className="font-bold text-lg" style={{ color: '#0B3D2E' }}>C</span>
            </div>
            <span className="text-white font-bold text-lg tracking-tight">CAS Admin Portal</span>
          </div>

          <h2 className="text-4xl font-bold leading-tight mb-5" style={{ color: '#F5F0E8' }}>
            School management that works the way you do
          </h2>
          <p className="text-base leading-relaxed" style={{ color: 'rgba(245,240,232,0.65)' }}>
            Teacher and student attendance, timetables, curriculum, remedials, library, clearance and more — built for Ghanaian schools.
          </p>
        </div>

        <div className="relative z-10 space-y-3">
          {[
            'Teacher and student attendance',
            'Timetable and curriculum management',
            'Absences, remedials and reporting',
          ].map(label => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#C8973A' }} />
              <span className="text-sm" style={{ color: 'rgba(245,240,232,0.75)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#C8973A' }}>
              <span className="font-bold" style={{ color: '#0B3D2E' }}>C</span>
            </div>
            <span className="font-bold text-lg" style={{ color: '#1C1208' }}>CAS Admin</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1C1208' }}>Admin Portal</h1>
            <p className="text-sm" style={{ color: '#8C7E6E' }}>Sign in with your Teacher ID and password</p>
          </div>

          <div className="bg-white rounded-xl p-8" style={{ border: '1px solid #E2D9CC', boxShadow: '0 4px 24px rgba(11,61,46,0.08)' }}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <Input
                label="School Code"
                placeholder="e.g. CAS001"
                value={schoolCode}
                onChange={e => setSchoolCode(e.target.value.toUpperCase())}
                required
                autoComplete="off"
              />
              <Input
                label="Teacher ID"
                placeholder="e.g. T001"
                value={teacherId}
                onChange={e => setTeacherId(e.target.value)}
                required
                autoComplete="username"
              />
              <Input
                label="Password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />

              {error && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" className="w-4 h-4 flex-shrink-0 mt-0.5">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
                  </svg>
                  <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>
                </div>
              )}

              <Button type="submit" loading={loading} size="lg" className="mt-1 w-full">
                Sign in
              </Button>
            </form>
          </div>

          <p className="text-center text-xs mt-6" style={{ color: '#8C7E6E' }}>
            CAS Admin Portal
          </p>
        </div>
      </div>
    </div>
  );
}
