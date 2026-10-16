'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { isNetworkError, withRetry } from '@/lib/retry';

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

export default function PublicWaecResultsCheckoutPage() {
  const router = useRouter();
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [schoolNameHint, setSchoolNameHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentRequired, setPaymentRequired] = useState(true);

  useEffect(() => {
    withRetry(() => publicApi.get('/api/public/waec-results/config'))
      .then(({ data }) => setPaymentRequired(data?.payment_required !== false))
      .catch(() => {});
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!contactName.trim() || !contactEmail.trim()) {
      setError('Your name and email are required.');
      return;
    }

    try {
      setLoading(true);
      // The backend can be slow to wake up on its very first request after
      // sitting idle — retry on a connection-level failure (nothing came
      // back to catch) rather than failing outright on the visitor's
      // very first attempt. A directly-measured cold spell ran a full 32s
      // with every connection refused outright, so this gets a wider
      // budget than the 3-attempt default.
      const { data } = await withRetry(
        () => publicApi.post('/api/public/waec-results/initialize', {
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: contactPhone || undefined,
          school_name_hint: schoolNameHint || undefined,
        }, { timeout: 30000 }),
        [3000, 6000, 10000, 15000, 20000]
      );

      if (data?.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }

      if (data?.id) {
        router.push(`/public-waec-results/paste?id=${data.id}`);
        return;
      }

      setError(data?.error || 'The checkout could not be started.');
    } catch (err: any) {
      setError(
        isNetworkError(err)
          ? 'Could not reach the server. Please check your connection and try again.'
          : err?.response?.data?.error || 'Could not start the checkout right now.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.forest, margin: 0 }}>
          Get a WASSCE results analysis
        </h1>
        <p style={{ fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
          {paymentRequired
            ? "Pay GHS 30, then paste your school's WAEC results listing for an instant subject-by-subject pass rate and grade breakdown."
            : "Paste your school's WAEC results listing for an instant subject-by-subject pass rate and grade breakdown."}
        </p>

        {!paymentRequired && (
          <div style={{ marginTop: 14, padding: '8px 14px', borderRadius: 6, background: '#FDF3E3', border: '1px solid #EBD3A0', color: '#8A5A08', fontSize: 12, fontWeight: 600 }}>
            Test mode: no payment is being collected right now.
          </div>
        )}

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginTop: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.mid2, margin: '0 0 10px' }}>What's in the report</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.dark, lineHeight: 1.8 }}>
            <li>Subject-by-subject pass percentages</li>
            <li>Total candidate summary and no-result counts</li>
            <li>Grade distribution across A1 to F9</li>
            <li>A comparison against WAEC's own printed summary</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={labelStyle}>Your name</label>
              <input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Full name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="you@school.edu.gh"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Phone (optional)</label>
              <input
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                placeholder="024 xxx xxxx"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>School name (optional)</label>
              <input
                value={schoolNameHint}
                onChange={(event) => setSchoolNameHint(event.target.value)}
                placeholder="Your school's name"
                style={inputStyle}
              />
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 6, background: C.dangerBg, border: `1px solid #F3C6C6`, color: C.danger, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 20, padding: '11px 20px', borderRadius: 6, border: 'none',
              background: C.mid, color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Starting…' : paymentRequired ? 'Pay GHS 30 and continue' : 'Continue'}
          </button>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>
            {paymentRequired
              ? "You'll paste the results listing right after payment. Nothing is saved until then."
              : "You'll paste the results listing on the next screen. Nothing is saved until then."}
          </p>
        </form>
      </div>
    </div>
  );
}
