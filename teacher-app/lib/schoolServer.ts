// Finds the CAS School Server on the school's Wi-Fi (same search as the
// CAS Student app). The teacher app only uses it for app updates.
//
// Order: an address typed in by hand, then the last one found, then a quick
// scan of the tablet's own network (x.x.x.1 to x.x.x.254 on port 8787). The
// first reply that says it is a CAS School Server wins and is remembered.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import * as Application from 'expo-application';

export const SERVER_PORT = 8787;
const K_SAVED = 'cas_t_school_server';
const K_MANUAL = 'cas_t_school_server_manual';
const K_DEVICE = 'cas_t_device_id';

export interface SchoolServerInfo {
  service: 'cas-school-server'; version: string; school_name: string | null;
  pack_version: number | null;
  app: { versionCode: number; versionName: string; size: number; sha256: string } | null;
  teacher_app?: { versionCode: number; versionName: string; size: number; sha256: string } | null;
}
export interface SchoolServer { base: string; address: string; info: SchoolServerInfo }

export function appBuild(): number {
  return Number(Application.nativeBuildVersion) || 0;
}

async function deviceId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(K_DEVICE);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(K_DEVICE, id);
    }
    return id;
  } catch { return 'unknown-device'; }
}

/** Normalises "192.168.88.10" or "http://192.168.88.10:8787/" to "192.168.88.10:8787". */
export function normaliseAddress(raw: string): string | null {
  const s = raw.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!s) return null;
  const m = s.match(/^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/);
  if (!m) return null;
  return `${m[1]}:${m[2] ?? SERVER_PORT}`;
}

async function probe(address: string, ms: number, _packVersion: number | null, signal?: { found: boolean }): Promise<SchoolServer | null> {
  if (signal?.found) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`http://${address}/cas-school-server`, {
      signal: ctl.signal,
      headers: {
        'X-CAS-Device': await deviceId(),
        'X-CAS-App': 'teacher',
        'X-CAS-App-Build': String(appBuild()),
        'X-CAS-App-Version': Application.nativeApplicationVersion ?? '',
      },
    });
    if (!r.ok) return null;
    const info = (await r.json()) as SchoolServerInfo;
    if (info?.service !== 'cas-school-server') return null;
    return { base: `http://${address}`, address, info };
  } catch { return null; } finally { clearTimeout(t); }
}

const isPrivate = (ip: string) => /^(10\.\d+|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+$/.test(ip);

async function scan(packVersion: number | null): Promise<SchoolServer | null> {
  if (Platform.OS === 'web') return null;
  let ip = '';
  try { ip = await Network.getIpAddressAsync(); } catch { return null; }
  if (!ip || !isPrivate(ip)) return null;
  const prefix = ip.split('.').slice(0, 3).join('.');
  const own = Number(ip.split('.')[3]);
  // Low addresses first: servers usually get those.
  const hosts = Array.from({ length: 254 }, (_, i) => i + 1).filter(n => n !== own);
  const signal = { found: false };
  let hit: SchoolServer | null = null;
  const BATCH = 48;
  for (let i = 0; i < hosts.length && !hit; i += BATCH) {
    const results = await Promise.all(hosts.slice(i, i + BATCH).map(n => probe(`${prefix}.${n}:${SERVER_PORT}`, 900, packVersion, signal)));
    hit = results.find(Boolean) ?? null;
    if (hit) signal.found = true;
  }
  return hit;
}

export async function getManualAddress(): Promise<string | null> {
  try { return await AsyncStorage.getItem(K_MANUAL); } catch { return null; }
}
export async function setManualAddress(address: string | null) {
  try {
    if (address) await AsyncStorage.setItem(K_MANUAL, address);
    else await AsyncStorage.removeItem(K_MANUAL);
  } catch { /* storage unavailable */ }
}

let pending: Promise<SchoolServer | null> | null = null;
let lastResult: { at: number; server: SchoolServer | null } | null = null;

/**
 * Looks for the school server. Results are reused for a minute so several
 * screens opening together don't each scan the network.
 */
export function findSchoolServer(opts: { fresh?: boolean; packVersion?: number | null } = {}): Promise<SchoolServer | null> {
  if (!opts.fresh && lastResult && Date.now() - lastResult.at < 60_000) return Promise.resolve(lastResult.server);
  if (pending) return pending;
  pending = (async () => {
    const pv = opts.packVersion ?? null;
    let server: SchoolServer | null = null;
    const manual = await getManualAddress();
    if (manual) server = await probe(manual, 3000, pv);
    if (!server) {
      const saved = await AsyncStorage.getItem(K_SAVED).catch(() => null);
      if (saved && saved !== manual) server = await probe(saved, 2000, pv);
    }
    if (!server) server = await scan(pv);
    if (server) await AsyncStorage.setItem(K_SAVED, server.address).catch(() => {});
    lastResult = { at: Date.now(), server };
    return server;
  })().finally(() => { pending = null; });
  return pending;
}

/** Checks one typed-in address; saves it as the manual address when it answers. */
export async function tryAddress(raw: string): Promise<SchoolServer | null> {
  const address = normaliseAddress(raw);
  if (!address) return null;
  const server = await probe(address, 4000, null);
  if (server) {
    await setManualAddress(address);
    await AsyncStorage.setItem(K_SAVED, address).catch(() => {});
    lastResult = { at: Date.now(), server };
  }
  return server;
}
