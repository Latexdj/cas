// Learning games: the catalogue, when games are open, scores and leaderboards.
//
// Games are open only outside the student's lessons. The class's lessons come
// from CAS (signed in, online) or from the school server (tablets on the
// school Wi-Fi), and the last schedule is kept on the device for offline use.
// Scores are kept on the device and sent when CAS or the school server can be
// reached. Leaderboards are weekly (Monday reset), per class and per school.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { storage } from './storage';
import { getSession as getSchoolSession } from './classTests';
import { findSchoolServer } from './schoolServer';

export type GameLevel = 'JHS' | 'SHS' | 'CTVET';
export type GameType = 'quiz' | 'match' | 'order' | 'climb';
export interface GameInfo { key: string; title: string; level: GameLevel; type: GameType; blurb: string; exam?: string }

export const LEVELS: { key: GameLevel; label: string }[] = [
  { key: 'JHS', label: 'JHS' },
  { key: 'SHS', label: 'SHS' },
  { key: 'CTVET', label: 'CTVET' },
];

const CLIMB_BLURB = 'Climb 15 questions from every subject for up to GH₵ 750,000. Safe levels at questions 5 and 10, three helps, and you can walk away at any time.';
export const GAMES: GameInfo[] = [
  { key: 'cedi-climb-jhs', title: 'Cedi Climb', level: 'JHS', type: 'climb', exam: 'BECE', blurb: CLIMB_BLURB },
  { key: 'cedi-climb-shs', title: 'Cedi Climb', level: 'SHS', type: 'climb', exam: 'WASSCE', blurb: CLIMB_BLURB },
  { key: 'cedi-climb-ctvet', title: 'Cedi Climb', level: 'CTVET', type: 'climb', blurb: 'Climb 15 questions on tools and procedures from every trade for up to GH₵ 750,000. Safe levels at questions 5 and 10, three helps, and you can walk away at any time.' },
  { key: 'bece-challenge', title: 'BECE Challenge', level: 'JHS', type: 'quiz', exam: 'BECE',
    blurb: 'Ten BECE past questions against the clock. Fast, correct answers and streaks score more.' },
  { key: 'wassce-arena', title: 'WASSCE Arena', level: 'SHS', type: 'quiz', exam: 'WASSCE',
    blurb: 'Ten WASSCE past questions against the clock. Fast, correct answers and streaks score more.' },
  { key: 'tool-id', title: 'Tool ID', level: 'CTVET', type: 'match',
    blurb: 'Turn the cards and match each tool to its use. Fewer turns and less time score more.' },
  { key: 'right-order', title: 'Right Order', level: 'CTVET', type: 'order',
    blurb: 'Put the steps of real workshop jobs in the right order. Getting it right first time scores most.' },
];
export const gameByKey = (key: string) => GAMES.find(g => g.key === key) ?? null;
/** Scores as players see them: cedis for Cedi Climb, points for the rest. */
export const formatScore = (game: string, n: number) => (game.startsWith('cedi-climb') ? `GH₵ ${n.toLocaleString('en-GB')}` : String(n));

// ── When games are open ─────────────────────────────────────────────────────
export interface GameSchedule {
  class_name: string | null;
  lessons: Record<string, [string, string][]>;   // "1" = Monday … "7" = Sunday
  off: { dates: string[]; ranges: [string, string][] };
  at?: string | null;
}
const K_SCHEDULE = 'cas_g_schedule';

async function casToken() { try { return await storage.getToken(); } catch { return null; } }

/** The newest schedule available: CAS, then the school server, then the saved copy. */
export async function loadSchedule(): Promise<GameSchedule | null> {
  let fresh: GameSchedule | null = null;
  if (await casToken()) {
    try { fresh = (await api.get<GameSchedule>('/api/games/schedule', { timeout: 8000 })).data; } catch { /* offline */ }
  }
  if (!fresh) {
    try {
      const ses = await getSchoolSession();
      const base = ses?.base ?? (await findSchoolServer())?.base;
      if (base) {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
        try {
          const r = await fetch(`${base}/lms/games/schedule?class=${encodeURIComponent(ses?.class_name ?? '')}`, { signal: ctl.signal });
          if (r.ok) fresh = await r.json();
        } finally { clearTimeout(t); }
      }
    } catch { /* not on the school Wi-Fi */ }
  }
  if (fresh) { await AsyncStorage.setItem(K_SCHEDULE, JSON.stringify(fresh)).catch(() => {}); return fresh; }
  try { return JSON.parse((await AsyncStorage.getItem(K_SCHEDULE)) || 'null'); } catch { return null; }
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Whether a lesson is on now (Ghana time, which is UTC), and when the run of lessons ends. */
export function lessonNow(schedule: GameSchedule | null, now = new Date()): { locked: boolean; until: string | null } {
  if (!schedule) return { locked: false, until: null };
  const date = now.toISOString().slice(0, 10);
  if (schedule.off?.dates?.includes(date)) return { locked: false, until: null };
  if (schedule.off?.ranges?.some(([a, b]) => date >= a && date <= b)) return { locked: false, until: null };
  const day = String(now.getUTCDay() === 0 ? 7 : now.getUTCDay());
  const spans = (schedule.lessons?.[day] ?? []).map(([a, b]) => [toMin(a), toMin(b)] as [number, number]).sort((x, y) => x[0] - y[0]);
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const current = spans.find(([a, b]) => mins >= a && mins < b);
  if (!current) return { locked: false, until: null };
  // Lessons back to back (or overlapping) count as one run.
  let end = current[1];
  for (const [a, b] of spans) if (a <= end && b > end) end = b;
  return { locked: true, until: fromMin(end) };
}

/** A random id for a play (UUID v4 form), so a score sent twice is stored once. */
function uuid(): string {
  const h = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  h[12] = '4'; h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  const x = h.join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// ── Scores ──────────────────────────────────────────────────────────────────
export interface Play { id: string; game: string; score: number; played_at: string; via: 'cas' | 'school' | 'none' }
const K_QUEUE = 'cas_g_queue';
const K_BEST = 'cas_g_best';

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try { return JSON.parse((await AsyncStorage.getItem(key)) || 'null') ?? fallback; } catch { return fallback; }
}

export async function personalBests(): Promise<Record<string, number>> { return readJson(K_BEST, {}); }

/** Records a finished game: the personal best on this device, and the score for the leaderboard. */
export async function recordPlay(game: string, score: number): Promise<{ best: number; newBest: boolean }> {
  const bests = await personalBests();
  const newBest = score > (bests[game] ?? -1);
  if (newBest) { bests[game] = score; await AsyncStorage.setItem(K_BEST, JSON.stringify(bests)).catch(() => {}); }
  const via: Play['via'] = (await casToken()) ? 'cas' : (await getSchoolSession()) ? 'school' : 'none';
  if (via !== 'none') {
    const queue = await readJson<Play[]>(K_QUEUE, []);
    queue.push({ id: uuid(), game, score: Math.round(score), played_at: new Date().toISOString(), via });
    await AsyncStorage.setItem(K_QUEUE, JSON.stringify(queue.slice(-500))).catch(() => {});
    await sendScores();
  }
  return { best: bests[game], newBest };
}

/** Sends waiting scores to CAS or the school server; those that cannot go yet stay queued. */
export async function sendScores(): Promise<void> {
  const queue = await readJson<Play[]>(K_QUEUE, []);
  if (!queue.length) return;
  const sent = new Set<string>();
  const cas = queue.filter(p => p.via === 'cas');
  if (cas.length && await casToken()) {
    try { await api.post('/api/games/scores', { scores: cas }, { timeout: 10000 }); cas.forEach(p => sent.add(p.id)); } catch { /* later */ }
  }
  const school = queue.filter(p => p.via === 'school');
  if (school.length) {
    const ses = await getSchoolSession();
    if (ses) {
      try {
        const r = await fetch(`${ses.base}/lms/games/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ses.token}` },
          body: JSON.stringify({ scores: school }) });
        if (r.ok) school.forEach(p => sent.add(p.id));
      } catch { /* later */ }
    }
  }
  if (sent.size) {
    const left = (await readJson<Play[]>(K_QUEUE, [])).filter(p => !sent.has(p.id));
    await AsyncStorage.setItem(K_QUEUE, JSON.stringify(left)).catch(() => {});
  }
}

// ── Leaderboards ────────────────────────────────────────────────────────────
export interface BoardRow { rank: number; name: string; class_name: string | null; score: number; me: boolean }
export interface Board { scope: 'class' | 'school'; class_name: string | null; week_start: string; players: number; top: BoardRow[]; me: BoardRow | null; personal_best: number | null }
export type BoardResult = { board: Board } | { reason: 'signed-out' | 'offline' };

export async function loadBoard(game: string, scope: 'class' | 'school'): Promise<BoardResult> {
  if (await casToken()) {
    try { return { board: (await api.get<Board>('/api/games/leaderboard', { params: { game, scope }, timeout: 10000 })).data }; }
    catch { /* try the school server */ }
  }
  const ses = await getSchoolSession();
  if (ses) {
    try {
      const r = await fetch(`${ses.base}/lms/games/leaderboard?game=${encodeURIComponent(game)}&scope=${scope}`, { headers: { Authorization: `Bearer ${ses.token}` } });
      if (r.ok) return { board: await r.json() };
    } catch { /* not on the school Wi-Fi */ }
    return { reason: 'offline' };
  }
  return (await casToken()) ? { reason: 'offline' } : { reason: 'signed-out' };
}

/** A shuffled copy. */
export function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
