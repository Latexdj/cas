'use client';

const TOKEN_KEY         = 'cas_sa_token';
const ACTIVITY_KEY      = 'cas_sa_last_activity';
const TIMEOUT_MS        = 30 * 60 * 1000; // 30 minutes

export function getSAToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function saveSAToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  touchSAActivity();
}

export function clearSASession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
}

export function touchSAActivity() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
}

export function isSASessionExpired(): boolean {
  if (typeof window === 'undefined') return false;
  const last = localStorage.getItem(ACTIVITY_KEY);
  if (!last) return true;
  return Date.now() - parseInt(last) > TIMEOUT_MS;
}

export function isSALoggedIn(): boolean {
  return !!getSAToken() && !isSASessionExpired();
}
