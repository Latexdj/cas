'use client';

import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { isNetworkError, withRetry } from '@/lib/retry';

type Status = 'checking' | 'pending' | 'paid' | 'failed' | 'completed' | 'not_found';

const POLL_DELAYS_MS = [1000, 2000, 3000, 5000, 5000, 5000]; // backs off, tolerates Mobile Money lag

const C = {
  forest: '#0B3D2E', mid: '#145C44',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
  success: '#2D7A4F',
};

export default function PublicWaecPastePage() {
  return (
    <Suspense fallback={<Centered><p style={{ fontSize: 13, color: C.muted }}>Loading.</p></Centered>}>
      <PastePageContent />
    </Suspense>
  );
}

function PastePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [status, setStatus] = useState<Status>('checking');
  const [rawText, setRawText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const attemptRef = useRef(0);

  const checkStatus = useCallback(async () => {
    if (!id) {
      setStatus('not_found');
      return;
    }
    try {
      const { data } = await publicApi.get(`/api/public/waec-results/${id}/status`);
      setStatus(data.status);
      if (data.status === 'pending' && attemptRef.current < POLL_DELAYS_MS.length) {
        const delay = POLL_DELAYS_MS[attemptRef.current];
        attemptRef.current += 1;
        setTimeout(checkStatus, delay);
      }
    } catch (err) {
      // A connection-level failure (backend asleep/cold) is not the same as
      // a genuine 404 — retry on the same backoff schedule instead of
      // telling a visitor their payment "wasn't found" when the real
      // problem is the server hadn't woken up yet.
      if (isNetworkError(err) && attemptRef.current < POLL_DELAYS_MS.length) {
        const delay = POLL_DELAYS_MS[attemptRef.current];
        attemptRef.current += 1;
        setTimeout(checkStatus, delay);
        return;
      }
      setStatus('not_found');
    }
  }, [id]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!rawText.trim()) {
      setError('Paste the WAEC results listing first.');
      return;
    }

    try {
      setSubmitting(true);
      // A large listing (many hundreds of candidates) plus a cold/slow
      // backend instance can take longer than the client's default 15s
      // timeout to parse, compute, and transfer back — this is the one
      // call in the flow that does real work, so it gets more headroom.
      // withRetry additionally absorbs a connection-level failure (backend
      // asleep, not even responding yet) by retrying with backoff instead
      // of failing on the visitor's very first attempt. A directly-measured
      // Render cold spell ran a full 32s with every connection refused
      // outright, longer than the default retry budget (~19s) covers, so
      // this call gets a wider one (~74s of gaps across 5 attempts).
      const { data } = await withRetry(
        () => publicApi.post(`/api/public/waec-results/${id}/generate`, { raw_text: rawText }, { timeout: 60000 }),
        [3000, 6000, 10000, 15000, 20000, 20000]
      );
      if (data?.report) {
        router.push(`/public-waec-results/${id}`);
        return;
      }
      setError(data?.error || 'The report could not be generated.');
    } catch (err: any) {
      const isTimeout = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '');
      setError(
        isTimeout || isNetworkError(err)
          ? "This is taking longer than expected — the server may be slow to respond. Please try again; it's usually faster the second time."
          : err?.response?.data?.error || 'Could not generate the report right now.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'checking' || status === 'pending') {
    return (
      <Centered>
        <div
          className="w-8 h-8 rounded-full border-2 border-b-transparent animate-spin"
          style={{ borderColor: C.mid, borderBottomColor: 'transparent', margin: '0 auto' }}
        />
        <p style={{ marginTop: 16, fontSize: 13, color: C.muted }}>
          {status === 'pending' ? "Confirming your payment. Mobile Money can take a moment." : 'Checking your payment status.'}
        </p>
      </Centered>
    );
  }

  if (status === 'not_found' || status === 'failed') {
    return (
      <Centered>
        <p style={{ fontSize: 17, fontWeight: 700, color: C.dark, margin: 0 }}>Payment not found</p>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
          We couldn't confirm a payment for this link. If you were charged, contact us with your payment reference.
        </p>
        <a href="/public-waec-results" style={{ display: 'inline-block', marginTop: 16, fontSize: 13, fontWeight: 600, color: C.mid }}>
          Start again
        </a>
      </Centered>
    );
  }

  if (status === 'completed') {
    router.replace(`/public-waec-results/${id}`);
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: C.success, margin: 0 }}>Payment confirmed</p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.forest, margin: '6px 0 0' }}>
          Paste your WAEC results listing
        </h1>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
          Nothing is saved until you submit. The listing is used only to generate your report.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
          <textarea
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="Paste the full WAEC results text here…"
            style={{
              width: '100%', minHeight: 380, padding: '12px 14px', borderRadius: 8,
              border: `1px solid ${C.border}`, background: '#fff', color: C.dark,
              fontSize: 13, lineHeight: 1.6, outline: 'none', boxSizing: 'border-box',
              fontFamily: 'inherit', resize: 'vertical',
            }}
          />

          {error && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 6, background: C.dangerBg, border: '1px solid #F3C6C6', color: C.danger, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 16, padding: '11px 20px', borderRadius: 6, border: 'none',
              background: C.mid, color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Generating report…' : 'Generate my report'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>{children}</div>
    </div>
  );
}
