// Marks a request as one whose failure shouldn't force-logout the user —
// for background checks (unread-notification polling) that already intend
// to fail silently on their own calling side. Without this, the shared
// axios response interceptor still fires on a 401 from these regardless of
// how the caller's own try/catch treats it, hard-redirecting mid-task with
// no connection to anything the user actually did — confirmed as the actual
// mechanism behind "logged out without warning while working."
const SILENT_HEADER = 'X-Silent-Auth';

export function silentRequestConfig<T extends { headers?: Record<string, string> }>(config?: T) {
  return { ...config, headers: { ...config?.headers, [SILENT_HEADER]: '1' } };
}

export function isSilentRequest(headers: unknown): boolean {
  if (!headers) return false;
  if (typeof (headers as { get?: (k: string) => unknown }).get === 'function') {
    return (headers as { get: (k: string) => unknown }).get(SILENT_HEADER) === '1';
  }
  return (headers as Record<string, unknown>)[SILENT_HEADER] === '1';
}

// Set by an api client right before it force-redirects to login on a real
// 401, read once by that portal's login page to explain why it landed there
// instead of showing a bare form with no context. sessionStorage (not
// localStorage) so it doesn't linger across an unrelated future visit.
export const SESSION_EXPIRED_KEY = 'cas_session_expired_notice';

export function markSessionExpired() {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(SESSION_EXPIRED_KEY, '1'); } catch { /* ignore */ }
}

// Login pages call this once on mount: true means show "your session
// expired, please log in again" — and it clears itself so a plain manual
// logout→login right after doesn't keep showing a stale notice.
export function consumeSessionExpiredNotice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const was = sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1';
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    return was;
  } catch {
    return false;
  }
}

// Decodes a JWT's `exp` claim client-side — no signature verification (the
// backend already verifies it on every request), just reading the payload
// to know when THIS browser's copy of the token stops being valid, so the
// session-expiry warning can count down to the real moment rather than a
// client-guessed one.
export function getTokenExpiryMs(token: string): number | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// `exp` is an absolute timestamp set by the SERVER's clock; comparing it
// against `Date.now()` silently assumes the device's own clock agrees with
// the server's. On a device whose clock is wrong (confirmed real-world
// cause: a laptop with a several-hour-fast system clock saw every 8h
// session appear to expire in ~10 minutes, every time, since the "remaining
// time" was computed as 8h minus the clock's own skew) that assumption
// breaks completely, forcing a premature logout with no server disagreement
// at all — the server would have accepted the token the whole time.
//
// Every axios response carries a standard `Date` header stamped by the
// server, so each api client's response interceptor calls recordServerTime()
// on every successful response to keep this offset fresh; adjustedNow() is
// then a drop-in replacement for Date.now() wherever "now" needs to mean
// "the server's now," not whatever the device's own clock says.
let clockOffsetMs = 0;

export function recordServerTime(dateHeader: unknown) {
  if (typeof dateHeader !== 'string') return;
  const serverMs = Date.parse(dateHeader);
  if (Number.isNaN(serverMs)) return;
  clockOffsetMs = serverMs - Date.now();
}

export function adjustedNow(): number {
  return Date.now() + clockOffsetMs;
}
