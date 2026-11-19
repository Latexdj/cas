// Automatic updates while the app is open.
//
// Whenever the app opens, comes back to the front, joins a Wi-Fi network, or
// every 15 minutes, it looks for the CAS School Server. When it finds one it:
//   1. downloads a newer CAS Student app (APK) in the background and keeps it,
//      so the student can install it later, on or off the Wi-Fi;
//   2. brings learning materials, past questions and stories added in CAS up
//      to date, straight into their screens;
// and keeps a short list of what changed, shown the next time the app is
// looked at ("Updated while you were away").
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { appBuild, findSchoolServer, type SchoolServer } from './schoolServer';
import { startLmSync, lmSnapshot } from './lmSync';
import { checkForUpdates } from './packSync';
import { loadCustom, pictureSources, refreshCustom, saveStory } from './storybooks';

export interface ReadyApp { versionCode: number; versionName: string; size: number; file: string }
export interface AutoUpdateState {
  ready: ReadyApp | null;                                    // downloaded, waiting to be installed
  downloading: { versionCode: number; progress: number } | null;
  note: string;                                              // e.g. not enough space
  news: { at: string; items: string[] } | null;              // what changed, until the student dismisses it
}

const DIR = `${FileSystem.documentDirectory}updates/`;
const K_READY = 'cas_auto_ready_app';
const K_NEWS = 'cas_auto_news';
const K_LAST_BUILD = 'cas_auto_last_build';
const SPARE = 300 * 1024 * 1024;   // leave this much free besides the app download

let state: AutoUpdateState = { ready: null, downloading: null, note: '', news: null };
const listeners = new Set<() => void>();
function set(patch: Partial<AutoUpdateState>) { state = { ...state, ...patch }; listeners.forEach(l => l()); }
export function useAutoUpdate(): AutoUpdateState {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state, () => state);
}

async function addNews(items: string[]) {
  if (!items.length) return;
  const prev = state.news?.items ?? [];
  const news = { at: new Date().toISOString(), items: [...prev, ...items].slice(-8) };
  set({ news });
  await AsyncStorage.setItem(K_NEWS, JSON.stringify(news)).catch(() => {});
}
export async function dismissNews() {
  set({ news: null });
  await AsyncStorage.removeItem(K_NEWS).catch(() => {});
}

let loaded = false;
/** Reads what an earlier session left: a downloaded app, unread news, and whether the app was just updated. */
async function loadState() {
  if (loaded) return;
  loaded = true;
  try { const n = JSON.parse((await AsyncStorage.getItem(K_NEWS)) || 'null'); if (n?.items?.length) set({ news: n }); } catch { /* none */ }
  let ready: ReadyApp | null = null;
  try { ready = JSON.parse((await AsyncStorage.getItem(K_READY)) || 'null'); } catch { /* none */ }
  if (ready) {
    const info = await FileSystem.getInfoAsync(ready.file).catch(() => ({ exists: false, size: 0 }));
    if (ready.versionCode <= appBuild() || !info.exists || (info as { size?: number }).size !== ready.size) {
      await forgetReady(ready);
    } else set({ ready });
  }
  // The app was updated since it last ran.
  const last = Number(await AsyncStorage.getItem(K_LAST_BUILD).catch(() => null)) || 0;
  const now = appBuild();
  if (now) {
    if (last && now > last) await addNews([`CAS Student was updated to version ${Application.nativeApplicationVersion ?? now}.`]);
    await AsyncStorage.setItem(K_LAST_BUILD, String(now)).catch(() => {});
  }
}

async function forgetReady(r: ReadyApp | null) {
  if (r) await FileSystem.deleteAsync(r.file, { idempotent: true }).catch(() => {});
  await AsyncStorage.removeItem(K_READY).catch(() => {});
  set({ ready: null });
}

/** Downloads a newer app from the school server, if there is one and it is not already here. */
async function fetchApp(server: SchoolServer) {
  const app = server.info.app;
  if (!app || app.versionCode <= appBuild()) return;
  if (state.ready?.versionCode === app.versionCode) return;
  let free = Infinity;
  try { free = await FileSystem.getFreeDiskStorageAsync(); } catch { /* unknown */ }
  if (free < app.size + SPARE) {
    set({ note: `A new CAS Student app is on the school server, but this device needs ${Math.ceil((app.size + SPARE - free) / 1048576)} MB more free space to download it.` });
    return;
  }
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const file = `${DIR}cas-student-${app.versionCode}.apk`;
  const part = `${file}.part`;
  set({ downloading: { versionCode: app.versionCode, progress: 0 }, note: '' });
  try {
    await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
    const dl = FileSystem.createDownloadResumable(`${server.base}/app/latest.apk`, part, {}, p => {
      const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : app.size;
      set({ downloading: { versionCode: app.versionCode, progress: Math.min(1, p.totalBytesWritten / total) } });
    });
    const res = await dl.downloadAsync();
    const got = await FileSystem.getInfoAsync(part);
    // The server may have swapped in an even newer app meanwhile: the size tells.
    if (!res || res.status !== 200 || !got.exists || got.size !== app.size) {
      await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
      return;   // tried again next time
    }
    await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
    await FileSystem.moveAsync({ from: part, to: file });
    const old = state.ready;
    const ready: ReadyApp = { versionCode: app.versionCode, versionName: app.versionName, size: app.size, file };
    await AsyncStorage.setItem(K_READY, JSON.stringify(ready));
    set({ ready });
    if (old && old.file !== file) await FileSystem.deleteAsync(old.file, { idempotent: true }).catch(() => {});
  } catch { /* the Wi-Fi dropped: next time */ }
  finally { set({ downloading: null }); }
}

/** Opens Android's installer for the downloaded app. Works without any network. */
export async function installReady() {
  const r = state.ready;
  if (!r) return;
  const info = await FileSystem.getInfoAsync(r.file);
  if (!info.exists) { await forgetReady(r); throw new Error('The downloaded update is missing. It will download again on the school Wi-Fi.'); }
  const uri = await FileSystem.getContentUriAsync(r.file);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: uri, type: 'application/vnd.android.package-archive', flags: 1,   // FLAG_GRANT_READ_URI_PERMISSION
  });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

let running = false;
let lastRun = 0;
/**
 * One round: find the school server, then update the app download and the
 * content. `force` skips the 10-minute pause between rounds (used when the
 * device has just joined a Wi-Fi network).
 */
export async function runAutoUpdate(force = false) {
  if (Platform.OS !== 'android' || running) return;
  await loadState();
  if (!force && Date.now() - lastRun < 10 * 60 * 1000) return;
  if (force && Date.now() - lastRun < 60 * 1000) return;
  running = true; lastRun = Date.now();
  try {
    const server = await findSchoolServer({ fresh: force }).catch(() => null);
    if (!server) return;
    const news: string[] = [];

    // Content first: it is small next to the app download.
    const storyIds = new Set((await loadCustom()).map(st => st.id));
    if (await refreshCustom().catch(() => false)) {
      const fresh = (await loadCustom()).filter(st => !storyIds.has(st.id));
      if (fresh.length) {
        const src = await pictureSources();
        for (const st of fresh) await saveStory(st, src).catch(() => false);
        news.push(fresh.length === 1 ? `New storybook: ${fresh[0].title}.` : `${plural(fresh.length, 'new storybook', 'new storybooks')}, in Storybooks.`);
      }
    }

    const pq = await checkForUpdates().catch(() => undefined);
    if (pq?.status === 'updated' && pq.changed > 0) news.push(`Past Questions: ${plural(pq.changed, 'subject', 'subjects')} updated.`);
    await addNews(news);

    // The app next, so it is ready to install even if the materials take long.
    await fetchApp(server);

    // Learning materials last: the first copy onto a tablet can be large.
    await startLmSync().catch(() => {});
    const lm = lmSnapshot();
    if (lm.phase === 'done' && lm.done > 0) await addNews([`${plural(lm.done, 'learning material', 'learning materials')} added or updated, in Learning Materials.`]);
  } finally {
    running = false;
  }
}

/** Shows what an earlier session left (a downloaded app, unread news) without searching the network. */
export function primeAutoUpdate() { loadState().catch(() => {}); }
