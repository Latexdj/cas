// In-app message banner, used instead of native pop-ups (CAS design rule).
// notify() from anywhere; <NoticeHost /> in the root layout shows it.
import { useSyncExternalStore } from 'react';

export type NoticeTone = 'ok' | 'info' | 'bad';
export interface AppNotice { id: number; text: string; tone: NoticeTone }

let current: AppNotice | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function notify(text: string, tone: NoticeTone = 'info', ms = tone === 'bad' ? 7000 : 4500) {
  current = { id: ++seq, text, tone };
  if (timer) clearTimeout(timer);
  timer = setTimeout(dismissNotice, ms);
  emit();
}
export function dismissNotice() {
  current = null;
  if (timer) { clearTimeout(timer); timer = null; }
  emit();
}
export function useAppNotice(): AppNotice | null {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => current);
}
