// Shared state for the Past Questions pack: what is on the tablet, the
// school server, and the last update check. The home screen and the
// "Get new questions" screen both read it, so they always agree.
import { useSyncExternalStore } from 'react';
import { importUsb, importZip, localManifest, updatePack, type PackManifest, type UpdateResult, type ZipResult } from './quizPack';
import { findSchoolServer, setManualAddress, tryAddress, type SchoolServer } from './schoolServer';

export interface PackSyncState {
  ready: boolean;                          // the local pack has been read
  manifest: PackManifest | null;
  busy: boolean;
  status: string;                          // last result or progress, in plain words
  tone: 'ok' | 'info' | 'bad';
  server: SchoolServer | null | undefined; // undefined = still looking
  checkedAt: number | null;
}

let state: PackSyncState = {
  ready: false, manifest: null, busy: false, status: '', tone: 'info', server: undefined, checkedAt: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<PackSyncState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

export function usePackSync(): PackSyncState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => state,
    () => state,
  );
}

/** Checks the school server and the internet for a newer pack. */
export async function checkForUpdates(fresh = false): Promise<UpdateResult | undefined> {
  if (state.busy) return undefined;
  set({ busy: true, status: 'Checking for new questions…', tone: 'info', server: undefined });
  const local = await localManifest();
  const find = () => findSchoolServer({ fresh, packVersion: local?.version ?? null })
    .then(sv => { set({ server: sv }); return sv; });
  const r = await updatePack(find, msg => set({ status: msg }));
  const from = r.status === 'updated' || r.status === 'current'
    ? (r.source === 'school' ? ' from the school server' : r.source === 'online' ? ' from the internet' : '') : '';
  if (r.status === 'updated') set({ manifest: r.manifest, status: `Updated ${r.changed} subject${r.changed === 1 ? '' : 's'}${from}.`, tone: 'ok' });
  else if (r.status === 'current') set({ manifest: r.manifest, status: `Up to date${from ? `, checked${from}` : ''}.`, tone: 'ok' });
  else if (r.status === 'offline') set({ status: 'No school server or internet right now. Your questions still work.', tone: 'info' });
  else set({ status: 'The update stopped part way. Try again when the connection is better.', tone: 'bad' });
  set({ busy: false, checkedAt: Date.now() });
  return r;
}

let started = false;
/** First open in this session: read the tablet's pack, pick up a USB folder, then check. */
export async function startPackSync() {
  if (started) return;
  started = true;
  set({ manifest: await localManifest() });
  const usb = await importUsb();
  if (usb) set({ manifest: usb, status: 'Loaded new questions from the Past Questions folder.', tone: 'ok' });
  set({ ready: true });
  await checkForUpdates();
}

export async function loadZipFile(uri: string, force = false): Promise<ZipResult> {
  const r = await importZip(uri, { force });
  if (r.status === 'loaded') set({ manifest: r.manifest, status: `Loaded ${r.questions} questions from the USB drive.`, tone: 'ok' });
  return r;
}

export async function connectToAddress(raw: string): Promise<boolean> {
  const sv = await tryAddress(raw);
  if (!sv) return false;
  set({ server: sv });
  checkForUpdates();
  return true;
}

export async function forgetManualAddress() {
  await setManualAddress(null);
  checkForUpdates(true);
}
