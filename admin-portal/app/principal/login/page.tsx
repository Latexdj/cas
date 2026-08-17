'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { principalApi } from '@/lib/principal-api';
import { savePrincipal, type PrincipalUser } from '@/lib/principal-auth';

export default function PrincipalLoginPage() {
  const router = useRouter();
  const [schoolCode,      setSchoolCode]      = useState('');
  const [managementCode,  setManagementCode]  = useState('');
  const [pin,             setPin]             = useState('');
  const [error,           setError]           = useState('');
  const [loading,         setLoading]         = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!schoolCode.trim() || !managementCode.trim() || !pin.trim())
      return setError('All fields are required');
    setLoading(true); setError('');
    try {
      const r = await principalApi.post('/api/principal/auth/login', {
        schoolCode: schoolCode.trim(),
        managementCode: managementCode.trim(),
        pin: pin.trim(),
      });
      savePrincipal(r.data.token, {
        ...r.data.user,
        schoolId: r.data.user.schoolId ?? '',
        school:   r.data.school,
      } as PrincipalUser);
      router.push('/principal');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Login failed. Check your credentials.');
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#F5F0E8',
      padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            backgroundColor: '#0B3D2E',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#C8973A" style={{ width: 26, height: 26 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1208', marginBottom: 6 }}>Management Portal</h1>
          <p style={{ fontSize: 13, color: '#8C7E6E' }}>Sign in with your Teacher ID and PIN</p>
        </div>

        <div style={{
          background: '#FFFFFF', borderRadius: 14, padding: 32, width: '100%',
          border: '1px solid #E2D9CC', boxShadow: '0 4px 20px rgba(11,61,46,0.08)',
          boxSizing: 'border-box',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
                padding: '10px 14px', fontSize: 13, color: '#DC2626',
              }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8C7E6E', marginBottom: 6 }}>
                School Code
              </label>
              <input
                type="text"
                value={schoolCode}
                onChange={e => setSchoolCode(e.target.value)}
                placeholder="e.g. CAS000"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
                  border: '1.5px solid #E2D9CC', outline: 'none', boxSizing: 'border-box',
                  color: '#1E293B', backgroundColor: '#fff',
                }}
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8C7E6E', marginBottom: 6 }}>
                Teacher ID
              </label>
              <input
                type="text"
                value={managementCode}
                onChange={e => setManagementCode(e.target.value.toUpperCase())}
                placeholder="Your Teacher ID"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
                  border: '1.5px solid #E2D9CC', outline: 'none', boxSizing: 'border-box',
                  color: '#1E293B', fontFamily: 'monospace', backgroundColor: '#fff',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8C7E6E', marginBottom: 6 }}>
                Password / PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="Enter your password or PIN"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
                  border: '1.5px solid #E2D9CC', outline: 'none', boxSizing: 'border-box',
                  color: '#1E293B', backgroundColor: '#fff',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                backgroundColor: loading ? '#8CAF9C' : '#0B3D2E', color: '#FFFFFF', border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4,
                transition: 'background-color 0.2s',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#B0A090', marginTop: 20 }}>
          CAS Management Portal
        </p>
      </div>
    </div>
  );
}
