// Past Questions progress, kept on this tablet only (no login).
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cas_s_quiz_progress';

export type TheoryRating = 'got' | 'partly' | 'missed';
export interface QuizSession { slug: string; label: string; score: number; total: number; at: number }
export interface QuizProgress {
  objective: Record<string, { ok: boolean; at: number }>;   // last result per question id
  theory:    Record<string, { rating: TheoryRating; at: number }>;
  sessions:  QuizSession[];                                 // newest first, last 20
}

const EMPTY: QuizProgress = { objective: {}, theory: {}, sessions: [] };

export async function getProgress(): Promise<QuizProgress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p === 'object' ? { ...EMPTY, ...p } : { ...EMPTY };
  } catch { return { ...EMPTY }; }
}

async function save(p: QuizProgress) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full: progress is a convenience */ }
}

export async function recordRound(
  slug: string, label: string,
  objective: { id: string; ok: boolean }[],
  theory: { id: string; rating: TheoryRating }[],
) {
  const p = await getProgress();
  const at = Date.now();
  objective.forEach(a => { p.objective[a.id] = { ok: a.ok, at }; });
  theory.forEach(a => { p.theory[a.id] = { rating: a.rating, at }; });
  const score = objective.filter(a => a.ok).length + theory.filter(a => a.rating === 'got').length;
  const total = objective.length + theory.length;
  if (total > 0) p.sessions = [{ slug, label, score, total, at }, ...p.sessions].slice(0, 20);
  await save(p);
}

/** Forgets every answer for the given question ids, and the subject's sessions. */
export async function clearSubject(slug: string, ids: string[]) {
  const p = await getProgress();
  ids.forEach(id => { delete p.objective[id]; delete p.theory[id]; });
  p.sessions = p.sessions.filter(s => s.slug !== slug);
  await save(p);
}
