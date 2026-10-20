'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { publicWaecApi } from '@/lib/public-waec-api';
import { savePublicWaecUser } from '@/lib/public-waec-auth';

const C = {
  forest: '#0B3D2E', mid: '#145C44', gold: '#C8973A',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`,
  borderRadius: 6, fontSize: 14, background: '#fff', color: C.dark,
  outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: C.mid2, marginBottom: 6,
};

export default function PublicWaecSignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email and password are required.');
      return;
    }

    try {
      setLoading(true);
      const { data } = await publicWaecApi.post('/api/public/waec-auth/signup', {
        name, email, password, phone: phone || undefined,
      });
      savePublicWaecUser({ id: data.id, name: data.name, email: data.email, token: data.token });
      router.push('/public-waec-results/account');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not create your account right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.forest, margin: 0 }}>Create an account</h1>
        <p style={{ fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
          Track every WAEC analysis you buy and come back to them anytime, no more juggling separate links.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={labelStyle}>Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu.gh" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone (optional)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 xxx xxxx" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" style={inputStyle} />
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 6, background: C.dangerBg, border: '1px solid #F3C6C6', color: C.danger, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 20, padding: '11px 20px', borderRadius: 6, border: 'none', width: '100%',
              background: C.mid, color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 14, textAlign: 'center' }}>
            Already have an account?{' '}
            <a href="/public-waec-results/account/login" style={{ color: C.mid, fontWeight: 600 }}>Log in</a>
          </p>
        </form>
      </div>
    </div>
  );
}
