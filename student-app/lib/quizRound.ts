// The round a student is in the middle of, kept so it can be continued if the
// app is closed or the tablet restarts. One unfinished round at a time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TheoryRating } from './quizProgress';

const KEY = 'cas_s_quiz_round';
const MAX_AGE = 3 * 24 * 60 * 60 * 1000;

export interface SavedRound {
  slug: string; subject: string; mode: 'practice' | 'paper' | 'retry' | 'theory'; label: string;
  ids: string[]; i: number;
  answers: Record<string, string>; ratings: Record<string, string>;
  left: number; savedAt: number;
}

export async function loadRound(): Promise<SavedRound | null> {
  try {
    const r = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null') as SavedRound | null;
    if (!r || Date.now() - r.savedAt > MAX_AGE || !Array.isArray(r.ids) || !r.ids.length) return null;
    return r;
  } catch { return null; }
}

export async function saveRound(r: Omit<SavedRound, 'savedAt'>) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify({ ...r, savedAt: Date.now() })); } catch { /* storage full */ }
}

export async function clearRound() {
  try { await AsyncStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

export type { TheoryRating };
