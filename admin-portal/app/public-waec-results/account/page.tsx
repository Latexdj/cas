'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { publicWaecApi } from '@/lib/public-waec-api';
import { clearPublicWaecUser, getPublicWaecUser, PublicWaecUser } from '@/lib/public-waec-auth';
import { isNetworkError } from '@/lib/retry';

interface Purchase {
  id: string;
  status: 'pending' | 'paid' | 'completed' | 'failed';
  paid_at: string | null;
  created_at: string;
  school_name: string | null;
  year: string | null;
  total_candidates: string | null;
}

const C = {
  forest: '#0B3D2E', mid: '#145C44',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
};

export default function PublicWaecAccountDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<PublicWaecUser | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getPublicWaecUser();
    if (!u) {
      router.replace('/public-waec-results/account/login');
      return;
    }
    setUser(u);
  }, [router]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await publicWaecApi.get('/api/public/waec-results/account/purchases');
      setPurchases(data?.purchases ?? []);
    } catch (err: any) {
      setError(isNetworkError(err) ? 'Could not reach the server.' : err?.response?.data?.error || 'Could not load your purchases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function startNewAnalysis() {
    setError('');
    try {
      setStarting(true);
      const { data } = await publicWaecApi.post('/api/public/waec-results/account/initialize', {});
      if (data?.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }
      if (data?.id) {
        router.push(`/public-waec-results/paste?id=${data.id}`);
        return;
      }
      setError(data?.error || 'Could not start a new analysis.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not start a new analysis right now.');
    } finally {
      setStarting(false);
    }
  }

  function logout() {
    clearPublicWaecUser();
    router.push('/public-waec-results/account/login');
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 56px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.forest, margin: 0 }}>Hi, {user.name}</h1>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Your WAEC analyses, all in one place.</p>
          </div>
          <button
            onClick={logout}
            style={{ fontSize: 12, fontWeight: 600, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 14px', background: '#fff', cursor: 'pointer' }}
          >
            Log out
          </button>
        </div>

        <button
          onClick={startNewAnalysis}
          disabled={starting}
          style={{
            marginTop: 20, padding: '11px 20px', borderRadius: 6, border: 'none',
            background: C.mid, color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: starting ? 'default' : 'pointer', opacity: starting ? 0.6 : 1,
          }}
        >
          {starting ? 'Starting…' : 'New analysis (GHS 30)'}
        </button>

        {error && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 6, background: C.dangerBg, border: '1px solid #F3C6C6', color: C.danger, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 28 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.mid2, margin: '0 0 12px' }}>Past analyses</p>
          {loading ? (
            <p style={{ fontSize: 13, color: C.muted }}>Loading…</p>
          ) : purchases.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted }}>No analyses yet. Start your first one above.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {purchases.map((p) => (
                <div
                  key={p.id}
                  style={{
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                  }}
                >
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.dark, margin: 0 }}>
                      {p.school_name || 'WAEC analysis'}{p.year ? ` · ${p.year}` : ''}
                    </p>
                    <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
                      {new Date(p.created_at).toLocaleDateString()} · {p.status}
                      {p.total_candidates ? ` · ${p.total_candidates} candidates` : ''}
                    </p>
                  </div>
                  {p.status === 'completed' && (
                    <a
                      href={`/public-waec-results/${p.id}`}
                      style={{ fontSize: 12, fontWeight: 600, color: C.mid, border: `1px solid ${C.mid}`, borderRadius: 6, padding: '7px 14px', textDecoration: 'none' }}
                    >
                      View report
                    </a>
                  )}
                  {p.status === 'paid' && (
                    <a
                      href={`/public-waec-results/paste?id=${p.id}`}
                      style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: C.mid, borderRadius: 6, padding: '7px 14px', textDecoration: 'none' }}
                    >
                      Continue
                    </a>
                  )}
                  {p.status === 'pending' && (
                    <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Payment incomplete</span>
                  )}
                  {p.status === 'failed' && (
                    <span style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>Failed</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
