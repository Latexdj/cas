// App updates for CAS Teacher, from two places:
//   1. the CAS School Server on the school Wi-Fi (no data used), and
//   2. CAS online (any internet).
// Whichever has the newest build wins; on a tie the school server does.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { api } from './api';
import { findSchoolServer } from './schoolServer';
import { holdWifi } from '@/modules/wifi-bind';

const K_SNOOZE = 'cas_t_update_snooze';
const K_LAST = 'cas_t_update_checked';
const CHECK_EVERY = 3 * 60 * 60 * 1000;

export interface AvailableUpdate {
  source: 'school' | 'online'; url: string; versionCode: number; versionName: string; size: number; sha256: string | null;
}

export const appBuild = () => Number(Application.nativeBuildVersion) || 0;
export const appVersion = () => Application.nativeApplicationVersion ?? '';

async function fromSchool(): Promise<AvailableUpdate | null> {
  const s = await findSchoolServer();
  const a = s?.info.teacher_app;
  if (!s || !a) return null;
  return { source: 'school', url: `${s.base}/app/teacher/latest.apk`, versionCode: a.versionCode, versionName: a.versionName, size: a.size, sha256: a.sha256 };
}
async function fromOnline(): Promise<AvailableUpdate | null> {
  try {
    const { data } = await api.get<{ versionCode: number; versionName: string | null; size: number; sha256: string; url: string } | null>('/api/app-releases/teacher/latest', { timeout: 15000 });
    if (!data || !Number.isInteger(data.versionCode)) return null;
    return { source: 'online', url: `${api.defaults.baseURL}${data.url}`, versionCode: data.versionCode, versionName: data.versionName ?? '', size: data.size, sha256: data.sha256 };
  } catch { return null; }
}

/**
 * A newer CAS Teacher app, or null. Looks at most every 3 hours unless
 * `force` (the Check for updates button); "Not now" hides a version for a day.
 */
export async function checkAppUpdate({ force = false } = {}): Promise<AvailableUpdate | null> {
  if (Platform.OS !== 'android') return null;
  if (!force) {
    const last = Number(await AsyncStorage.getItem(K_LAST).catch(() => null)) || 0;
    if (Date.now() - last < CHECK_EVERY) {
      // Between checks, still show an update found earlier and not installed.
      const kept = await AsyncStorage.getItem(`${K_LAST}:found`).catch(() => null);
      const u = kept ? (JSON.parse(kept) as AvailableUpdate) : null;
      return u && u.versionCode > appBuild() && !(await snoozed(u.versionCode)) ? u : null;
    }
  }
  // One after the other: the school check routes the app through the Wi-Fi,
  // which may have no internet, so the online check waits until it is done.
  const school = await fromSchool().catch(() => null);
  const online = await fromOnline();
  await AsyncStorage.setItem(K_LAST, String(Date.now())).catch(() => {});
  const best = [school, online].filter((u): u is AvailableUpdate => !!u && u.versionCode > appBuild())
    .sort((a, b) => b.versionCode - a.versionCode || (a.source === 'school' ? -1 : 1))[0] ?? null;
  await AsyncStorage.setItem(`${K_LAST}:found`, best ? JSON.stringify(best) : '').catch(() => {});
  if (!best || (!force && (await snoozed(best.versionCode)))) return null;
  return best;
}

async function snoozed(versionCode: number) {
  try {
    const s = JSON.parse((await AsyncStorage.getItem(K_SNOOZE)) || 'null');
    return !!s && s.versionCode === versionCode && Date.now() < s.until;
  } catch { return false; }
}
export async function snoozeUpdate(versionCode: number) {
  await AsyncStorage.setItem(K_SNOOZE, JSON.stringify({ versionCode, until: Date.now() + 20 * 60 * 60 * 1000 })).catch(() => {});
}

/** Downloads the APK (progress 0 to 1) and opens Android's installer. */
export async function installUpdate(u: AvailableUpdate, onProgress: (p: number) => void) {
  const dest = `${FileSystem.cacheDirectory}cas-teacher-${u.versionCode}.apk`;
  const release = u.source === 'school' ? holdWifi() : () => {};
  try {
  const have = await FileSystem.getInfoAsync(dest);
  if (!have.exists || have.size !== u.size) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    const dl = FileSystem.createDownloadResumable(u.url, dest, {}, (p) => {
      const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : u.size;
      onProgress(Math.min(1, p.totalBytesWritten / total));
    });
    const res = await dl.downloadAsync();
    if (!res || res.status !== 200) {
      throw new Error(u.source === 'school' ? 'The download did not finish. Stay near the Wi-Fi and try again.' : 'The download did not finish. Check your internet and try again.');
    }
    const got = await FileSystem.getInfoAsync(dest);
    if (!got.exists || got.size !== u.size) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      throw new Error('The download was incomplete. Try again.');
    }
  }
  } finally { release(); }
  onProgress(1);
  const uri = await FileSystem.getContentUriAsync(dest);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: uri, type: 'application/vnd.android.package-archive', flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}
