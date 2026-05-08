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
  const [name, setName]         = useState('');
  const [pin, setPin]           = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">C</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">CAS Admin Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in with your admin account</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="School ID"
            placeholder="e.g. sch_abc123"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            required
            autoComplete="off"
          />
          <Input
            label="Your Name"
            placeholder="As registered in the system"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
          <Input
            label="PIN"
            type="password"
            inputMode="numeric"
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <Button type="submit" loading={loading} size="lg" className="mt-2 w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
