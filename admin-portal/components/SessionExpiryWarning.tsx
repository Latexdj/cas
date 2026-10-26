'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { getTokenExpiryMs, adjustedNow } from '@/lib/session-expiry';

const WARN_BEFORE_MS = 5 * 60 * 1000; // show the countdown 5 minutes before expiry
const TICK_MS = 1000;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

// Mounted once per portal shell. Reads the token's own `exp` claim — not a
// client-guessed timeout — so the countdown always matches the real moment
// the backend will start rejecting requests. "Stay logged in" calls the
// matching refresh endpoint (gated on the account still being valid, so a
// deactivated account can't extend its way back in) and restarts the timer
// from the new token's own expiry.
export function SessionExpiryWarning({
  apiClient,
  tokenKey,
  refreshPath,
  onExpire,
}: {
  apiClient: AxiosInstance;
  tokenKey: string;
  refreshPath: string;
  onExpire: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiredRef = useRef(false);

  const tick = useCallback(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem(tokenKey);
    if (!token) return;
    const expiryMs = getTokenExpiryMs(token);
    if (expiryMs == null) return;
    const left = expiryMs - adjustedNow();
    if (left <= 0) {
      if (!expiredRef.current) {
        expiredRef.current = true;
        if (intervalRef.current) clearInterval(intervalRef.current);
        onExpire();
      }
      return;
    }
    setRemainingMs(left <= WARN_BEFORE_MS ? left : null);
  }, [tokenKey, onExpire]);

  useEffect(() => {
    tick();
    intervalRef.current = setInterval(tick, TICK_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tick]);

  async function stayLoggedIn() {
    setRefreshing(true);
    try {
      const { data } = await apiClient.post<{ token: string }>(refreshPath, {});
      localStorage.setItem(tokenKey, data.token);
      setDismissed(false);
      setRemainingMs(null);
      tick();
    } catch {
      // Refresh failing (account deactivated, network hiccup) just leaves
      // the countdown running — the user still sees it reach zero and gets
      // the normal expired-session handling via onExpire.
    } finally {
      setRefreshing(false);
    }
  }

  if (remainingMs == null || dismissed) return null;

  return (
    <div
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 1000,
        width: 300, borderRadius: 12, padding: '14px 16px',
        background: '#FFF8E1', border: '1px solid #FDE68A',
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', margin: 0 }}>
          Session expiring in {formatRemaining(remainingMs)}
        </p>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', fontSize: 14, lineHeight: 1, padding: 0 }}
        >
          ×
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#92400E', margin: '4px 0 10px' }}>
        You'll be logged out automatically. Save your work, or stay logged in.
      </p>
      <button
        onClick={stayLoggedIn}
        disabled={refreshing}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none',
          background: '#92400E', color: '#fff', fontSize: 12, fontWeight: 700,
          cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.6 : 1,
        }}
      >
        {refreshing ? 'Staying logged in…' : 'Stay logged in'}
      </button>
    </div>
  );
}
