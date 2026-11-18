// Storybooks: picture books from the African Storybook Project
// (africanstorybook.org), via the Global-ASP repositories. All CC BY.
//
// The text of every story is in the app (assets/storybooks/en.json, built by
// tools/build-storybooks.mjs). Pictures are downloaded per story into
// <documentDirectory>/stories/<id>/<nn>.jpg, from the school server on the
// Wi-Fi, or online from the Global-ASP image bank.
//   picture 01 is the cover; page n uses picture n+1.
//
// Stories added in Super Admin come as a list from the school server or CAS
// (/api/storybooks/manifest), kept on the device, and work the same way; their
// pictures come from the school server or their own online address, and a
// page may have no picture.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { findSchoolServer } from './schoolServer';
import { BASE_URL } from './api';

export interface Story {
  id: string; title: string; author: string; illustrator: string;
  licence: string; url: string; level: Level; words: number; pictures: number; pages: string[];
  /** Stories added in Super Admin: picture n's online address is images[n - 1] (null: no picture). */
  custom?: boolean; images?: (string | null)[]; updated_at?: string;
}
interface Library { source: string; image_base: string; built_at: string; stories: Story[] }

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
// Levels 1-4 follow the African Storybook (all built-in stories); 5-10 are
// for longer stories added in Super Admin, up to SHS.
export const LEVELS: { level: Level; name: string; hint: string }[] = [
  { level: 1, name: 'Level 1', hint: 'First words' },
  { level: 2, name: 'Level 2', hint: 'First sentences' },
  { level: 3, name: 'Level 3', hint: 'First paragraphs' },
  { level: 4, name: 'Level 4', hint: 'Longer stories' },
  { level: 5, name: 'Level 5', hint: 'Chapter stories' },
  { level: 6, name: 'Level 6', hint: 'JHS 1' },
  { level: 7, name: 'Level 7', hint: 'JHS 2 and 3' },
  { level: 8, name: 'Level 8', hint: 'SHS 1' },
  { level: 9, name: 'Level 9', hint: 'SHS 2' },
  { level: 10, name: 'Level 10', hint: 'SHS 3 and beyond' },
];
/** The list's filter: levels grouped by school stage. */
export const STAGES: { key: string; name: string; levels: Level[] }[] = [
  { key: 'all', name: 'All levels', levels: [] },
  { key: 'early', name: 'Early readers (1-3)', levels: [1, 2, 3] },
  { key: 'primary', name: 'Upper primary (4-5)', levels: [4, 5] },
  { key: 'jhs', name: 'JHS (6-7)', levels: [6, 7] },
  { key: 'shs', name: 'SHS (8-10)', levels: [8, 9, 10] },
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
export const byline = (author: string) => (!author ? '' : isTale(author) ? taleName(author) : `by ${author}`);
/** "Written by Fabian Wakholi", or "Ghanaian folktale". */
export const writtenBy = (author: string) => (isTale(author) ? taleName(author) : `Written by ${author}`);
export const storyById = (id: string) => custom.find(s => s.id === id) ?? library().stories.find(s => s.id === id) ?? null;
/** Stories added in Super Admin first (newest), then the built-in library. */
export const allStories = (): Story[] => [...custom, ...library().stories];

// ── Stories added in Super Admin ──
interface CustomManifest {
  version: number;
  stories: { id: string; title: string; author: string; illustrator: string; licence: string; level: number;
    pages: string[]; images: (string | null)[]; updated_at: string }[];
}
const K_CUSTOM = 'cas_storybooks_custom';
let custom: Story[] = [];
let customVersion = -1;
const toStory = (m: CustomManifest['stories'][number]): Story => ({
  id: m.id, title: m.title, author: m.author || '', illustrator: m.illustrator || '',
  licence: m.licence, url: '', level: (Math.min(10, Math.max(1, Math.round(m.level) || 1)) as Level),
  words: m.pages.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0),
  pictures: m.images.length, pages: m.pages, custom: true, images: m.images, updated_at: m.updated_at,
});
function applyManifest(m: CustomManifest) { customVersion = m.version; custom = (m.stories || []).map(toStory); }

/** The added stories this device already has. */
export async function loadCustom(): Promise<Story[]> {
  if (customVersion < 0) {
    try { const m = JSON.parse((await AsyncStorage.getItem(K_CUSTOM)) || 'null'); if (m) applyManifest(m); } catch { /* none yet */ }
  }
  return custom;
}

/** Gets the newest list of added stories from the school server or CAS. True when it changed. */
export async function refreshCustom(): Promise<boolean> {
  await loadCustom();
  const get = async (url: string): Promise<CustomManifest | null> => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
    try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
  };
  const school = WEB ? null : await findSchoolServer().catch(() => null);
  const found = (await Promise.all([school ? get(`${school.base}/storybooks/custom/manifest`) : null, get(`${BASE_URL}/api/storybooks/manifest`)]))
    .filter((m): m is CustomManifest => !!m && Array.isArray(m.stories));
  const best = found.sort((a, b) => b.version - a.version)[0];
  if (!best || best.version === customVersion) return false;
  // A story whose pictures changed is downloaded again.
  const before = new Map(custom.map(s => [s.id, s.updated_at]));
  applyManifest(best);
  await AsyncStorage.setItem(K_CUSTOM, JSON.stringify(best)).catch(() => {});
  for (const st of custom) if (before.has(st.id) && before.get(st.id) !== st.updated_at) await removeStory(st.id);
  return true;
}

const WEB = Platform.OS === 'web';
const ROOT = WEB ? '' : `${FileSystem.documentDirectory}stories/`;
const nn = (n: number) => String(n).padStart(2, '0');
const onlineUrl = (story: Story, n: number) => (story.custom ? story.images?.[n - 1] ?? null : `${library().image_base}/${story.id}/${nn(n)}.jpg`);
/** False for a page of an added story that has no picture. */
export const hasPicture = (story: Story, n: number) => !story.custom || !!story.images?.[n - 1];
const localUri = (id: string, n: number) => `${ROOT}${id}/${nn(n)}.jpg`;
const DONE = (id: string) => `${ROOT}${id}/done`;

/** Picture n of a story (1 = cover) as something <Image> can show, or null when not on the device. */
export function pictureUri(story: Story, n: number, saved: boolean): string | null {
  if (!hasPicture(story, n)) return null;
  if (WEB) return onlineUrl(story, n);   // the web preview has no file system
  return saved ? localUri(story.id, n) : null;
}

export async function isSaved(id: string): Promise<boolean> {
  if (WEB) return true;
  return (await FileSystem.getInfoAsync(DONE(id))).exists;
}

export async function savedIds(): Promise<Set<string>> {
  if (WEB) return new Set(allStories().map(s => s.id));
  const out = new Set<string>();
  const dirs = await FileSystem.readDirectoryAsync(ROOT).catch(() => [] as string[]);
  await Promise.all(dirs.map(async d => { if ((await FileSystem.getInfoAsync(DONE(d))).exists) out.add(d); }));
  return out;
}

export async function removeStory(id: string) {
  if (!WEB) await FileSystem.deleteAsync(`${ROOT}${id}/`, { idempotent: true });
}

/** Where pictures come from right now: the school server (tablets), then online. */
export interface Sources { school: string | null }
export async function pictureSources(): Promise<Sources> {
  const school = WEB ? null : await findSchoolServer().catch(() => null);
  return { school: school ? school.base : null };
}
/** Addresses to try for picture n, in order. */
export function remoteUrls(story: Story, n: number, src: Sources): string[] {
  const fromSchool = src.school ? `${src.school}/storybooks/${story.custom ? 'custom/' : ''}${story.id}/${nn(n)}.jpg` : null;
  return [fromSchool, onlineUrl(story, n)].filter((u): u is string => !!u);
}

/**
 * Saves one story's pictures. Tries each source in turn for each picture,
 * so a school server that is still mirroring falls back to online.
 */
export async function saveStory(story: Story, sources: Sources, onProgress?: (done: number, total: number) => void): Promise<boolean> {
  if (WEB) return true;
  const dir = `${ROOT}${story.id}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  for (let n = 1; n <= story.pictures; n++) {
    onProgress?.(n - 1, story.pictures);
    const to = localUri(story.id, n);
    if (!hasPicture(story, n) || (await FileSystem.getInfoAsync(to)).exists) continue;
    let ok = false;
    for (const url of remoteUrls(story, n, sources)) {
      const tmp = `${to}.tmp`;
      try {
        const r = await FileSystem.downloadAsync(url, tmp);
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
