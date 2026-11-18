// Storybooks: picture books from the African Storybook Project
// (africanstorybook.org), via the Global-ASP repositories. All CC BY.
//
// The text of every story is in the app (assets/storybooks/en.json, built by
// tools/build-storybooks.mjs). Pictures are downloaded per story into
// <documentDirectory>/stories/<id>/<nn>.jpg, from the school server on the
// Wi-Fi, or online from the Global-ASP image bank.
//   picture 01 is the cover; page n uses picture n+1.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { findSchoolServer } from './schoolServer';

export interface Story {
  id: string; title: string; author: string; illustrator: string;
  licence: string; url: string; level: 1 | 2 | 3 | 4; words: number; pictures: number; pages: string[];
}
interface Library { source: string; image_base: string; built_at: string; stories: Story[] }

export const LEVELS: { level: Story['level']; name: string; hint: string }[] = [
  { level: 1, name: 'Level 1', hint: 'First words' },
  { level: 2, name: 'Level 2', hint: 'First sentences' },
  { level: 3, name: 'Level 3', hint: 'First paragraphs' },
  { level: 4, name: 'Level 4', hint: 'Longer stories' },
];

let lib: Library | null = null;
export function library(): Library {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!lib) lib = require('../assets/storybooks/en.json') as Library;
  return lib;
}
/** Folktales are credited to where they come from, not to a writer. */
const isTale = (author: string) => /folk ?tale|traditional/i.test(author);
const taleName = (author: string) => (/^folktale$/i.test(author) ? 'A folktale' : author);
/** "by Fabian Wakholi", or "Ghanaian folktale". */
export const byline = (author: string) => (isTale(author) ? taleName(author) : `by ${author}`);
/** "Written by Fabian Wakholi", or "Ghanaian folktale". */
export const writtenBy = (author: string) => (isTale(author) ? taleName(author) : `Written by ${author}`);
export const storyById = (id: string) => library().stories.find(s => s.id === id) ?? null;

const WEB = Platform.OS === 'web';
const ROOT = WEB ? '' : `${FileSystem.documentDirectory}stories/`;
const nn = (n: number) => String(n).padStart(2, '0');
const onlineUrl = (id: string, n: number) => `${library().image_base}/${id}/${nn(n)}.jpg`;
const localUri = (id: string, n: number) => `${ROOT}${id}/${nn(n)}.jpg`;
const DONE = (id: string) => `${ROOT}${id}/done`;

/** Picture n of a story (1 = cover) as something <Image> can show, or null when not on the device. */
export function pictureUri(story: Story, n: number, saved: boolean): string | null {
  if (WEB) return onlineUrl(story.id, n);   // the web preview has no file system
  return saved ? localUri(story.id, n) : null;
}

export async function isSaved(id: string): Promise<boolean> {
  if (WEB) return true;
  return (await FileSystem.getInfoAsync(DONE(id))).exists;
}

export async function savedIds(): Promise<Set<string>> {
  if (WEB) return new Set(library().stories.map(s => s.id));
  const out = new Set<string>();
  const dirs = await FileSystem.readDirectoryAsync(ROOT).catch(() => [] as string[]);
  await Promise.all(dirs.map(async d => { if ((await FileSystem.getInfoAsync(DONE(d))).exists) out.add(d); }));
  return out;
}

export async function removeStory(id: string) {
  if (!WEB) await FileSystem.deleteAsync(`${ROOT}${id}/`, { idempotent: true });
}

/** Where pictures come from right now: the school server (tablets) and/or online. */
export async function pictureSources(): Promise<string[]> {
  const school = await findSchoolServer().catch(() => null);
  const list = school ? [`${school.base}/storybooks`] : [];
  return [...list, library().image_base];
}

/**
 * Saves one story's pictures. Tries each source in turn for each picture,
 * so a school server that is still mirroring falls back to online.
 */
export async function saveStory(story: Story, sources: string[], onProgress?: (done: number, total: number) => void): Promise<boolean> {
  if (WEB) return true;
  const dir = `${ROOT}${story.id}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  for (let n = 1; n <= story.pictures; n++) {
    onProgress?.(n - 1, story.pictures);
    const to = localUri(story.id, n);
    if ((await FileSystem.getInfoAsync(to)).exists) continue;
    let ok = false;
    for (const base of sources) {
      const tmp = `${to}.tmp`;
      try {
        const r = await FileSystem.downloadAsync(`${base}/${story.id}/${nn(n)}.jpg`, tmp);
        if (r.status !== 200) throw new Error(String(r.status));
        await FileSystem.moveAsync({ from: tmp, to });
        ok = true; break;
      } catch { await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {}); }
    }
    if (!ok) return false;
  }
  await FileSystem.writeAsStringAsync(DONE(story.id), new Date().toISOString());
  onProgress?.(story.pictures, story.pictures);
  return true;
}

// ── Reading progress (this device) ──
const K_PROGRESS = 'cas_storybooks_progress';
export interface Progress { page: number; finished: boolean; at: string }
export async function loadProgress(): Promise<Record<string, Progress>> {
  try { return JSON.parse((await AsyncStorage.getItem(K_PROGRESS)) || '{}'); } catch { return {}; }
}
export async function saveProgress(id: string, page: number, finished: boolean) {
  const all = await loadProgress();
  all[id] = { page, finished: finished || !!all[id]?.finished, at: new Date().toISOString() };
  await AsyncStorage.setItem(K_PROGRESS, JSON.stringify(all)).catch(() => {});
}
