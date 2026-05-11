'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { saveUser } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const router = useRouter();
  const [schoolId, setSchoolId] = useState('');
  const [name,     setName]     = useState('');
  const [pin,      setPin]      = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', {
        type: 'admin',
        name: name.trim(),
        pin,
        schoolId: schoolId.trim(),
      });
      saveUser({ id: data.id, name: data.name, role: data.role, schoolId: data.schoolId, token: data.token });
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Login failed. Check your name, PIN and School ID.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: '#0F172A' }}
      >
        {/* Background grid pattern */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#15803D' }}>
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="text-white font-bold text-lg tracking-tight">CAS Admin Portal</span>
          </div>

          <h2 className="text-4xl font-bold leading-tight mb-5" style={{ color: '#F8FAFC' }}>
            Manage your school with confidence
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#94A3B8' }}>
            Track teacher attendance, manage timetables, monitor absences, and ensure every classroom is covered — all from one place.
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          {[
            { label: 'Real-time attendance tracking', icon: '✓' },
            { label: 'Automated absence detection',   icon: '✓' },
            { label: 'GPS-verified classroom check-ins', icon: '✓' },
          ].map(f => (
            <div key={f.label} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white" style={{ backgroundColor: '#15803D' }}>
                {f.icon}
              </div>
              <span className="text-sm" style={{ color: '#CBD5E1' }}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ backgroundColor: '#F8FAFC' }}>
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#15803D' }}>
              <span className="text-white font-bold">C</span>
            </div>
            <span className="font-bold text-lg" style={{ color: '#0F172A' }}>CAS Admin</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#0F172A' }}>Welcome back</h1>
            <p className="text-sm" style={{ color: '#94A3B8' }}>Sign in to your admin account</p>
          </div>

          <div className="bg-white rounded-2xl p-8" style={{ border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(15,23,42,0.08)' }}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <Input
                label="School ID"
                placeholder="Paste your school UUID"
                value={schoolId}
                onChange={e => setSchoolId(e.target.value)}
                required
                autoComplete="off"
              />
              <Input
                label="Admin Name"
                placeholder="As registered in the system"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
              />
              <Input
                label="PIN"
                type="password"
                inputMode="numeric"
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value)}
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

          <p className="text-center text-xs mt-6" style={{ color: '#CBD5E1' }}>
            Classroom Attendance System — Admin Portal
          </p>
        </div>
      </div>
    </div>
  );
}
