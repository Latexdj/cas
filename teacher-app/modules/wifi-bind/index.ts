// Route the app's traffic through the school Wi-Fi while talking to the CAS
// School Server (see WifiBindModule.kt). No-ops on web and when the native
// module is missing (e.g. an older build).
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

interface WifiBindNative { hasWifi(): boolean; bind(): boolean; unbind(): boolean; isBound(): boolean }
const native = Platform.OS === 'android' ? requireOptionalNativeModule<WifiBindNative>('WifiBind') : null;

let holders = 0;

/** Routes the app through the Wi-Fi until the returned release() is called. Nested calls are counted. */
export function holdWifi(): () => void {
  if (!native) return () => {};
  holders++;
  try { if (holders === 1) native.bind(); } catch { /* ignore */ }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    try { if (holders === 0) native.unbind(); } catch { /* ignore */ }
  };
}

/** Runs fn with the app routed through the Wi-Fi. */
export async function onWifi<T>(fn: () => Promise<T>): Promise<T> {
  const release = holdWifi();
  try { return await fn(); } finally { release(); }
}

export const hasWifi = () => { try { return native ? native.hasWifi() : true; } catch { return true; } };
