// App updates from the CAS School Server: when the server holds a newer
// CAS Student APK than this one, download it over the school Wi-Fi and hand
// it to Android's installer.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { appBuild, findSchoolServer, type SchoolServer } from './schoolServer';

const K_SNOOZE = 'cas_s_update_snooze';

export interface AvailableUpdate { server: SchoolServer; versionCode: number; versionName: string; size: number }

/** A newer app on the school server, unless the student chose "Not now" today. */
export async function checkAppUpdate(): Promise<AvailableUpdate | null> {
  if (Platform.OS !== 'android') return null;
  const server = await findSchoolServer();
  const app = server?.info.app;
  if (!server || !app || app.versionCode <= appBuild()) return null;
  try {
    const snooze = JSON.parse((await AsyncStorage.getItem(K_SNOOZE)) || 'null');
    if (snooze && snooze.versionCode === app.versionCode && Date.now() < snooze.until) return null;
  } catch { /* no snooze */ }
  return { server, versionCode: app.versionCode, versionName: app.versionName, size: app.size };
}

export async function snoozeUpdate(versionCode: number) {
  const until = Date.now() + 20 * 60 * 60 * 1000;
  await AsyncStorage.setItem(K_SNOOZE, JSON.stringify({ versionCode, until })).catch(() => {});
}

/** Downloads the APK (progress 0 to 1) and opens Android's installer. */
export async function installUpdate(u: AvailableUpdate, onProgress: (p: number) => void) {
  const dest = `${FileSystem.cacheDirectory}cas-student-${u.versionCode}.apk`;
  const have = await FileSystem.getInfoAsync(dest);
  if (!have.exists || have.size !== u.size) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    const dl = FileSystem.createDownloadResumable(`${u.server.base}/app/latest.apk`, dest, {}, (p) => {
      const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : u.size;
      onProgress(Math.min(1, p.totalBytesWritten / total));
    });
    const res = await dl.downloadAsync();
    if (!res || res.status !== 200) throw new Error('The download did not finish. Stay near the Wi-Fi and try again.');
    const got = await FileSystem.getInfoAsync(dest);
    if (!got.exists || got.size !== u.size) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      throw new Error('The download was incomplete. Try again.');
    }
  }
  onProgress(1);
  const uri = await FileSystem.getContentUriAsync(dest);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: uri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}
