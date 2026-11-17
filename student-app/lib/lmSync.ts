// Learning materials from the CAS School Server.
//
// The server's LM folder is copied into this app's own LM folder (the one
// the Learning Materials screen reads first). Only new or changed files are
// downloaded. Files the server removed are deleted here, but only files that
// came from the server: anything copied in by USB is left alone.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { findSchoolServer } from './schoolServer';

export const APP_LM = 'file:///storage/emulated/0/Android/data/com.cas.student/files/LM';
const RECORD = `${APP_LM}/.cas-sync.json`;
const RESERVE = 300 * 1024 * 1024;   // leave this much space free on the tablet

interface ServerFile { path: string; size: number; mtime: number }
interface SyncRecord { version: string | null; files: Record<string, { size: number; mtime: number }> }

export interface LmSyncState {
  phase: 'idle' | 'checking' | 'syncing' | 'paused' | 'done' | 'no-server' | 'error' | 'unsupported';
  total: number;          // files to download this round
  done: number;
  bytesTotal: number;
  bytesDone: number;
  current: string | null;
  message: string;
  serverFiles: number;
  landed: number;         // bumps whenever a file lands, so the browser can refresh
}

let state: LmSyncState = {
  phase: 'idle', total: 0, done: 0, bytesTotal: 0, bytesDone: 0, current: null, message: '', serverFiles: 0, landed: 0,
};
const listeners = new Set<() => void>();
function set(patch: Partial<LmSyncState>) { state = { ...state, ...patch }; listeners.forEach(l => l()); }
export function useLmSync(): LmSyncState {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state, () => state);
}

async function readRecord(): Promise<SyncRecord> {
  try { return JSON.parse(await FileSystem.readAsStringAsync(RECORD)); } catch { return { version: null, files: {} }; }
}
async function writeRecord(r: SyncRecord) {
  try { await FileSystem.writeAsStringAsync(RECORD, JSON.stringify(r)); } catch { /* next round fixes it */ }
}

export const fmtBytes = (n: number) =>
  n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n >= 1048576 ? `${Math.round(n / 1048576)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

const parentOf = (uri: string) => uri.slice(0, uri.lastIndexOf('/'));
const nameOf = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1);

let running = false;
let pauseRequested = false;
let currentDownload: FileSystem.DownloadResumable | null = null;
let pausedResume: { path: string; data: string } | null = null;

/** Makes sure the app's LM folder exists (so the browser can show it while files arrive). */
export async function ensureAppLm() {
  if (Platform.OS !== 'android') return;
  try {
    const info = await FileSystem.getInfoAsync(APP_LM);
    if (!info.exists) await FileSystem.makeDirectoryAsync(APP_LM, { intermediates: true });
  } catch { /* the browser shows its own error */ }
}

export async function startLmSync() {
  if (Platform.OS !== 'android') { set({ phase: 'unsupported' }); return; }
  if (running) return;
  running = true; pauseRequested = false;
  try {
    set({ phase: 'checking', message: 'Looking for the school server…' });
    const server = await findSchoolServer();
    if (!server) { set({ phase: 'no-server', message: '' }); return; }

    let manifest: { version: string; files: ServerFile[] };
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(`${server.base}/lm/manifest`, { signal: ctl.signal }).finally(() => clearTimeout(t));
      if (!r.ok) throw new Error(String(r.status));
      manifest = await r.json();
    } catch { set({ phase: 'error', message: 'Could not read the school server’s materials list. Try again near the Wi-Fi.' }); return; }

    await ensureAppLm();
    const rec = await readRecord();
    const onServer = new Map(manifest.files.map(f => [f.path, f]));

    // Files the server no longer has (only ones it gave us).
    for (const p of Object.keys(rec.files)) {
      if (!onServer.has(p)) {
        await FileSystem.deleteAsync(`${APP_LM}/${p}`, { idempotent: true }).catch(() => {});
        delete rec.files[p];
      }
    }
    await writeRecord(rec);

    const todo: ServerFile[] = [];
    for (const f of manifest.files) {
      const had = rec.files[f.path];
      if (had && had.size === f.size && had.mtime === f.mtime) {
        const info = await FileSystem.getInfoAsync(`${APP_LM}/${f.path}`).catch(() => ({ exists: false }));
        if (info.exists) continue;
      }
      todo.push(f);
    }
    if (!todo.length) {
      rec.version = manifest.version; await writeRecord(rec);
      set({ phase: 'done', total: 0, done: 0, bytesTotal: 0, bytesDone: 0, current: null, serverFiles: manifest.files.length, message: '' });
      return;
    }

    // Space: if everything won't fit, take what fits, smallest first.
    let free = Infinity;
    try { free = (await FileSystem.getFreeDiskStorageAsync()) - RESERVE; } catch { /* unknown */ }
    const needed = todo.reduce((n, f) => n + f.size, 0);
    let list = todo;
    let spaceNote = '';
    if (needed > free) {
      list = []; let used = 0;
      for (const f of [...todo].sort((a, b) => a.size - b.size)) { if (used + f.size <= free) { list.push(f); used += f.size; } }
      spaceNote = `Not enough space for everything: needs ${fmtBytes(needed)}, ${fmtBytes(Math.max(0, free))} free. Downloading what fits.`;
    }
    const bytesTotal = list.reduce((n, f) => n + f.size, 0);
    set({ phase: 'syncing', total: list.length, done: 0, bytesTotal, bytesDone: 0, serverFiles: manifest.files.length, message: spaceNote });

    let bytesDone = 0;
    for (const [i, f] of list.entries()) {
      if (pauseRequested) break;
      const dest = `${APP_LM}/${f.path}`;
      const part = `${parentOf(dest)}/.${nameOf(dest)}.part`;
      set({ current: f.path, done: i });
      await FileSystem.makeDirectoryAsync(parentOf(dest), { intermediates: true }).catch(() => {});
      const url = `${server.base}/lm/file?path=${encodeURIComponent(f.path)}`;
      const resume = pausedResume?.path === f.path ? pausedResume.data : undefined;
      pausedResume = null;
      if (!resume) await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
      currentDownload = FileSystem.createDownloadResumable(url, part, {}, (p) => {
        set({ bytesDone: bytesDone + p.totalBytesWritten });
      }, resume);
      let result: FileSystem.FileSystemDownloadResult | undefined;
      try {
        result = resume ? await currentDownload.resumeAsync() : await currentDownload.downloadAsync();
      } catch {
        if (pauseRequested) break;
        set({ phase: 'error', message: `The download of ${nameOf(dest)} stopped. Stay near the school Wi-Fi and try again.` });
        return;
      }
      if (pauseRequested || !result) break;   // paused mid-file
      const got = await FileSystem.getInfoAsync(part);
      // 206 is a resumed (partial-content) download; both are complete when the size matches.
      if ((result.status !== 200 && result.status !== 206) || !got.exists || got.size !== f.size) {
        await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
        continue;   // tried again next round
      }
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      await FileSystem.moveAsync({ from: part, to: dest });
      rec.files[f.path] = { size: f.size, mtime: f.mtime };
      await writeRecord(rec);
      bytesDone += f.size;
      set({ done: i + 1, bytesDone, landed: state.landed + 1 });
    }
    currentDownload = null;
    if (pauseRequested) { set({ phase: 'paused', current: null }); return; }
    if (list.length === todo.length) rec.version = manifest.version;
    await writeRecord(rec);
    set({ phase: 'done', current: null, message: spaceNote });
  } catch (e) {
    set({ phase: 'error', message: 'Updating the materials stopped. Try again near the school Wi-Fi.' });
  } finally {
    running = false;
  }
}

export async function pauseLmSync() {
  pauseRequested = true;
  const d = currentDownload;
  if (d) {
    try {
      const snap = await d.pauseAsync();
      if (state.current && snap.resumeData) pausedResume = { path: state.current, data: snap.resumeData };
    } catch { /* already finished */ }
  }
}

export function resumeLmSync() { startLmSync(); }
