// Class tests from the CAS School Server (the offline LMS on the school
// Wi-Fi). Students sign in with their CAS student ID and password; the
// school server checks it, so no internet is needed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { findSchoolServer } from './schoolServer';

const K_SESSION = 'cas_s_ct_session';
const K_PENDING = 'cas_s_ct_pending';

export interface CtSession { token: string; name: string; class_name: string; base: string; expires: number }
export interface CtTest {
  id: string; title: string; subject: string; teacher: string | null; time_limit_mins: number | null;
  question_count: number; total_marks: number; open: boolean;
  state: 'not_started' | 'in_progress' | 'submitted'; can_start: boolean;
  result: { attempt_id: string; score: number | null; max_score: number | null; needs_marking: boolean } | null;
}
export interface CtQuestion { id: string; type: 'mcq' | 'short'; text: string; options: string[]; marks: number }
export interface CtAttempt {
  attempt: { id: string; status: string; started_at: string; deadline_at: string | null; server_now: string };
  quiz: { id: string; title: string; subject: string; instructions: string | null; time_limit_mins: number | null; total_marks: number };
  questions: CtQuestion[];
  answers: Record<string, { selected: string | null; text: string | null }>;
}
export interface CtResult {
  attempt_id: string; score: number | null; max_score: number | null; needs_marking: boolean; show_answers: boolean; late?: boolean;
  review: { id: string; type: 'mcq' | 'short'; text: string; options: string[]; correct: string | null; explanation: string | null;
    marks: number; your_answer: string | null; marks_awarded: number | null }[] | null;
}
export type CtAnswer = { question_id: string; selected?: string | null; text?: string | null };

export class CtError extends Error { status: number; constructor(msg: string, status: number) { super(msg); this.status = status; } }

export async function getSession(): Promise<CtSession | null> {
  try {
    const s = JSON.parse((await AsyncStorage.getItem(K_SESSION)) || 'null') as CtSession | null;
    return s && s.expires > Date.now() ? s : null;
  } catch { return null; }
}

async function call<T>(base: string, path: string, opts: { method?: string; body?: unknown; token?: string; timeout?: number } = {}): Promise<T> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opts.timeout ?? 15000);
  let r: Response;
  try {
    r = await fetch(`${base}${path}`, {
      method: opts.method ?? 'GET', signal: ctl.signal,
      headers: { ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch { throw new CtError('Could not reach the school server. Check this tablet is on the school Wi-Fi.', 0); }
  finally { clearTimeout(t); }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && opts.token) { await AsyncStorage.removeItem(K_SESSION).catch(() => {}); }
  if (!r.ok) throw new CtError(data.error || 'Something went wrong. Try again.', r.status);
  return data as T;
}

export async function signIn(code: string, password: string): Promise<CtSession> {
  const server = await findSchoolServer();
  if (!server) throw new CtError('No school server was found. Offline Assessment works on the school Wi-Fi.', 0);
  const d = await call<{ token: string; name: string; class_name: string; expires_in_hours: number }>(server.base, '/lms/login', {
    method: 'POST', body: { role: 'student', code: code.trim(), password }, timeout: 20000,
  });
  const s: CtSession = { token: d.token, name: d.name, class_name: d.class_name, base: server.base, expires: Date.now() + d.expires_in_hours * 3600 * 1000 };
  await AsyncStorage.setItem(K_SESSION, JSON.stringify(s));
  return s;
}

export async function signOut() {
  const s = await getSession();
  await AsyncStorage.multiRemove([K_SESSION, K_PENDING]).catch(() => {});
  if (s) call(s.base, '/lms/logout', { method: 'POST', token: s.token }).catch(() => {});
}

async function withSession<T>(fn: (s: CtSession) => Promise<T>): Promise<T> {
  const s = await getSession();
  if (!s) throw new CtError('Sign in again.', 401);
  return fn(s);
}

export const listTests = () => withSession(s => call<{ student: { name: string; class_name: string }; tests: CtTest[] }>(s.base, '/lms/tests', { token: s.token }));
export const startTest = (id: string) => withSession(s => call<CtAttempt>(s.base, `/lms/tests/${id}/start`, { method: 'POST', token: s.token }));
export const getResult = (attemptId: string) => withSession(s => call<CtResult>(s.base, `/lms/attempts/${attemptId}/result`, { token: s.token }));

// Answers waiting to reach the server (Wi-Fi dropped), kept across restarts.
async function readPending(): Promise<Record<string, Record<string, CtAnswer>>> {
  try { return JSON.parse((await AsyncStorage.getItem(K_PENDING)) || '{}'); } catch { return {}; }
}
async function writePending(p: Record<string, Record<string, CtAnswer>>) {
  try { await AsyncStorage.setItem(K_PENDING, JSON.stringify(p)); } catch { /* storage full */ }
}

/** Saves answers; if the server can't be reached they wait on the tablet. Returns true when saved. */
export async function saveAnswers(attemptId: string, answers: CtAnswer[]): Promise<boolean> {
  const pending = await readPending();
  const mine = { ...(pending[attemptId] || {}) };
  for (const a of answers) mine[a.question_id] = a;
  try {
    await withSession(s => call(s.base, `/lms/attempts/${attemptId}/answers`, { method: 'PUT', token: s.token, body: { answers: Object.values(mine) } }));
    delete pending[attemptId]; await writePending(pending);
    return true;
  } catch (e) {
    if (e instanceof CtError && e.status !== 0) { delete pending[attemptId]; await writePending(pending); throw e; }
    pending[attemptId] = mine; await writePending(pending);
    return false;
  }
}

export async function submitTest(attemptId: string, answers: CtAnswer[]): Promise<CtResult> {
  const pending = await readPending();
  const all = { ...(pending[attemptId] || {}) };
  for (const a of answers) all[a.question_id] = a;
  const r = await withSession(s => call<CtResult>(s.base, `/lms/attempts/${attemptId}/submit`, { method: 'POST', token: s.token, body: { answers: Object.values(all) }, timeout: 30000 }));
  delete pending[attemptId]; await writePending(pending);
  return r;
}
