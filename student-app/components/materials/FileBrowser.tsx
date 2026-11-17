import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, FlatList, Linking,
  Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles, tc } from '@/lib/themedStyles';
import { ensureAppLm, fmtBytes, pauseLmSync, resumeLmSync, startLmSync, useLmSync } from '@/lib/lmSync';
import { findSchoolServer } from '@/lib/schoolServer';

// ── Constants ─────────────────────────────────────────────────────────────────
// App-specific external dir: always readable without any permission (Android 11+)
const APP_LM_BASE    = '/storage/emulated/0/Android/data/com.cas.student/files/LM';
// Shared storage fallback: requires MANAGE_EXTERNAL_STORAGE on Android 11+
const SHARED_LM_BASE = '/storage/emulated/0/LM';

// Helpers for building URIs once the base is resolved
function lmPath(base: string, stack: string[], name?: string) {
  const parts = name ? [...stack, name] : stack;
  return parts.length ? `${base}/${parts.join('/')}` : base;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface FsItem {
  name:        string;
  uri:         string;
  isDirectory: boolean;
  size?:       number;
}

type FileKind = 'pdf' | 'video' | 'image' | 'audio' | 'unknown';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fileKind(name: string): FileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf')                                   return 'pdf';
  if (['mp4', 'mkv', 'mov', 'avi', 'webm', '3gp'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'aac', 'm4a', 'ogg'].includes(ext))          return 'audio';
  return 'unknown';
}

function kindIcon(kind: FileKind): { name: keyof typeof import('@expo/vector-icons/build/Ionicons').glyphMap; color: string } {
  switch (kind) {
    case 'pdf':   return { name: 'document-text',    color: '#DC2626' };
    case 'video': return { name: 'play-circle',      color: '#7C3AED' };
    case 'image': return { name: 'image',            color: '#D97706' };
    case 'audio': return { name: 'musical-notes',    color: '#0F766E' };
    default:      return { name: 'document-outline', color: '#94A3B8' };
  }
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── LM locations ──────────────────────────────────────────────────────────────
// Materials can be in several places: the app's own folder (downloads from the
// school server, or copied there by USB) and the shared LM folder (copied by
// USB). Every location with content is shown, merged into one tree.
async function findLmBases(): Promise<string[]> {
  if (Platform.OS !== 'android') return [SHARED_LM_BASE];
  const found: string[] = [];
  // readDirectoryAsync is used (not getInfoAsync) because FUSE blocks stat()
  // traversal through Android/data/ even for the app's own package dir.
  const candidates = [
    APP_LM_BASE,                                  // Android/data/com.cas.student/files/LM
    SHARED_LM_BASE,                               // /storage/emulated/0/LM
    '/storage/emulated/0/Learning materials',     // alternative name some transfers use
    '/storage/emulated/0/Learning Materials',
  ];

  for (const base of candidates) {
    try {
      const names = await FileSystem.readDirectoryAsync(`file://${base}`);
      if (names.some(n => !n.startsWith('.'))) found.push(base);
    } catch { /* not there, or no access */ }
  }
  return found;
}

// ── Hidden-files check ────────────────────────────────────────────────────────
// On Android 11+ an app without "All files access" can still list folders in
// shared storage, but Android hides every file that isn't a photo, video or
// audio file. The LM folder then shows its subject folders with nothing in
// them. Walk the tree (bounded) and stop at the first document: if folders
// exist but no document is visible anywhere, documents are being hidden.
const MEDIA_KINDS: FileKind[] = ['video', 'image', 'audio'];

async function documentsHidden(base: string): Promise<'none' | 'all' | 'documents'> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 30 || base === APP_LM_BASE) return 'none';
  const queue = [`file://${base}`];
  let dirs = 0, files = 0, seen = 0;
  while (queue.length && dirs < 250 && seen < 1500) {
    const dir = queue.shift()!;
    let names: string[] = [];
    try { names = await FileSystem.readDirectoryAsync(dir); } catch { continue; }
    dirs++;
    for (const name of names) {
      if (name.startsWith('.')) continue;
      seen++;
      let isDir = false;
      try { isDir = (await FileSystem.getInfoAsync(`${dir}/${name}`)).isDirectory ?? false; } catch { isDir = false; }
      if (isDir) { queue.push(`${dir}/${name}`); continue; }
      files++;
      if (!MEDIA_KINDS.includes(fileKind(name))) return 'none'; // a document is visible: access is fine
    }
  }
  if (dirs <= 1) return 'none';            // a single empty LM folder is just empty
  return files === 0 ? 'all' : 'documents'; // folders but no documents visible
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  /** Shown in the header — pass the tab/screen title so it can be hidden when drilling in */
  showBackAsClose?: boolean;
}

export default function FileBrowser({ showBackAsClose }: Props) {
  const C = useTheme();

  const [bases,   setBases]   = useState<string[]>([]);
  const basesRef = useRef<string[]>([]);
  const setAllBases = (b: string[]) => { basesRef.current = b; setBases(b); };
  const [stack,   setStack]   = useState<string[]>([]);
  const stackRef = useRef<string[]>([]);
  stackRef.current = stack;
  const [items,   setItems]   = useState<FsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<'permission' | 'not-found' | 'other' | null>(null);
  // Only photos/videos are visible: documents are hidden until All files access is on.
  const [docsHidden, setDocsHidden] = useState(false);
  const needsAttention = useRef(false);

  // ── Load directory (the same folder path in every location, merged) ───────
  const loadDir = useCallback(async (path: string[], from: string[] = basesRef.current) => {
    setLoading(true); setError(null);
    try {
      const byName = new Map<string, FsItem>();
      let read = 0; let lastErr: unknown = null;
      for (const base of from) {
        const dirUri = `file://${lmPath(base, path)}`;
        let names: string[];
        try { names = await FileSystem.readDirectoryAsync(dirUri); read++; }
        catch (e) { lastErr = e; continue; }
        for (const name of names) {
          if (name.startsWith('.') || byName.has(name)) continue;   // the first location's copy wins
          const uri  = `${dirUri}/${name}`;
          const info = await FileSystem.getInfoAsync(uri).catch(() => null);
          if (!info?.exists) continue;
          byName.set(name, { name, uri, isDirectory: info.isDirectory ?? false, size: (info as any).size as number | undefined });
        }
      }
      // A folder that exists in no location (e.g. removed while open).
      if (!read && from.length) throw lastErr ?? new Error('ENOENT');
      const detailed = [...byName.values()];
      // Folders first, then files; both alphabetical
      detailed.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      setItems(detailed.filter(i => !i.name.startsWith('.')));
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '');
      const isNotFound = msg.includes('ENOENT') || msg.includes('does not exist') || msg.includes('No such');
      if (isNotFound) {
        setError('not-found');
      } else if (
        (Platform.OS === 'android' && Number(Platform.Version) >= 30) ||
        msg.toLowerCase().includes('permission') ||
        msg.includes('EACCES') ||
        msg.toLowerCase().includes('denied') ||
        msg.toLowerCase().includes('access')
      ) {
        setError('permission');
      } else {
        setError('other');
      }
    } finally { setLoading(false); }
  }, []);

  // ── Resolve LM base, check nothing is hidden, then load root ───────────────
  const initialise = useCallback(async () => {
    setLoading(true); setError(null); setDocsHidden(false);
    const found = await findLmBases();
    // With a school server on the Wi-Fi, materials are downloaded into the
    // app's own LM folder. Look for the server in the background (it can take
    // a few seconds) and add that folder alongside the others if one is found.
    if (!found.includes(APP_LM_BASE) && Platform.OS === 'android') {
      findSchoolServer().then(async sv => {
        if (!sv) return;
        await ensureAppLm();
        if (basesRef.current.includes(APP_LM_BASE)) return;
        const next = [APP_LM_BASE, ...basesRef.current];
        setAllBases(next); setError(null);
        await loadDir(stackRef.current, next);
      }).catch(() => {});
    }
    // Shared folders where Android hides documents until All files access is on.
    let hiddenAll = 0;
    for (const b of found) {
      const hidden = await documentsHidden(b);
      if (hidden === 'all') hiddenAll++;
      if (hidden === 'documents') setDocsHidden(true);
    }
    const usable = found;
    if (!usable.length || (hiddenAll && hiddenAll === usable.length)) { setError('permission'); setLoading(false); return; }
    if (hiddenAll) setDocsHidden(true);
    // Keep the app's folder if the school server was found while this ran.
    const all = basesRef.current.includes(APP_LM_BASE) && !usable.includes(APP_LM_BASE) ? [APP_LM_BASE, ...usable] : usable;
    setAllBases(all);
    setStack([]);
    await loadDir([], all);
  }, [loadDir]);

  useEffect(() => { initialise(); }, [initialise]);

  // Download new materials from the school server while this screen is open,
  // and show files as they land.
  const sync = useLmSync();
  useEffect(() => { startLmSync(); }, []);
  useEffect(() => {
    if (!sync.landed) return;
    // Files landed in the app's folder: make sure it is one of the locations shown.
    const next = basesRef.current.includes(APP_LM_BASE) ? basesRef.current : [APP_LM_BASE, ...basesRef.current];
    if (next !== basesRef.current) setAllBases(next);
    const t = setTimeout(() => loadDir(stackRef.current, next), 1500);
    return () => clearTimeout(t);
  }, [sync.landed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back from Settings after allowing access: check again automatically.
  useEffect(() => {
    needsAttention.current = error === 'permission' || docsHidden;
  }, [error, docsHidden]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && needsAttention.current) initialise();
    });
    return () => sub.remove();
  }, [initialise]);

  function openAllFilesAccess() {
    IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
      { data: 'package:com.cas.student' }
    ).catch(() => Linking.openSettings());
  }

  useEffect(() => {
    if (bases.length && !loading && !error) loadDir(stack);
  }, [stack]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ──────────────────────────────────────────────────────────────
  function enter(item: FsItem) {
    if (item.isDirectory) {
      setStack(p => [...p, item.name]);
    } else {
      const kind = fileKind(item.name);
      if (kind === 'unknown') return; // can't open
      router.push({
        pathname: '/viewer',
        params: {
          path: item.uri.replace(/^file:\/\//, ''),
          type: kind,
          name: item.name,
        },
      } as any);
    }
  }

  function goBack() {
    setStack(p => p.slice(0, -1));
  }

  // ── Render states ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color={C.primaryText} />
        <Text style={[s.stateText, { color: C.muted }]}>Reading materials folder…</Text>
      </View>
    );
  }

  if (error === 'permission') {
    const needsAllFiles = Platform.OS === 'android' && Number(Platform.Version) >= 30;

    // On Android 11+, deep-link directly to the All Files Access page for this app.
    // The user just needs to flip one toggle — no digging through menus.
    function openPermissionSettings() {
      Linking.openSettings();
    }

    const retry = initialise;

    return (
      <View style={[s.permRoot, { backgroundColor: C.bg }]}>
        <Ionicons name="lock-closed-outline" size={52} color={C.muted as string} />
        <Text style={[s.stateTitle, { color: C.text }]}>Storage Access Needed</Text>

        {needsAllFiles ? (
          <>
            <Text style={[s.stateText, { color: C.muted }]}>
              Tap <Text style={{ fontWeight: '800', color: C.text }}>Grant Permission</Text> below.
              On the next screen, enable{' '}
              <Text style={{ fontWeight: '800', color: C.text }}>"Allow management of all files"</Text>,
              then come back and tap <Text style={{ fontWeight: '800', color: C.text }}>Retry</Text>.
            </Text>
            <TouchableOpacity
              style={[s.permBtn, { backgroundColor: C.primary }]}
              onPress={openAllFilesAccess}
            >
              <Text style={s.permBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[s.stateText, { color: C.muted }]}>
              The app needs permission to read learning materials from the device storage.
            </Text>
            <TouchableOpacity style={[s.permBtn, { backgroundColor: C.primary }]} onPress={openPermissionSettings}>
              <Text style={s.permBtnText}>Open App Settings</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={[s.permBtn, { backgroundColor: C.surface, marginTop: 10, borderWidth: 1, borderColor: C.border }]}
          onPress={retry}
        >
          <Text style={[s.permBtnText, { color: C.text }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error === 'not-found') {
    return (
      <View style={[s.center, { backgroundColor: C.bg, padding: 32 }]}>
        <Ionicons name="folder-open-outline" size={52} color={C.muted as string} />
        <Text style={[s.stateTitle, { color: C.text }]}>LM Folder Not Found</Text>
        <Text style={[s.stateText, { color: C.muted }]}>
          No LM folder was found on this device.{'\n\n'}
          Copy the <Text style={{ fontWeight: '800' }}>LM</Text> folder to:{'\n'}
          <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>Android/data/com.cas.student/files/LM</Text>
          {'\n'}or{'\n'}
          <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>/storage/emulated/0/LM</Text>
        </Text>
      </View>
    );
  }

  if (error === 'other') {
    return (
      <View style={[s.center, { backgroundColor: C.bg, padding: 32 }]}>
        <Ionicons name="warning-outline" size={52} color={C.muted as string} />
        <Text style={[s.stateTitle, { color: C.text }]}>Could Not Read Folder</Text>
        <Text style={[s.stateText, { color: C.muted }]}>An unexpected error occurred reading the materials folder.</Text>
        <TouchableOpacity style={[s.permBtn, { backgroundColor: C.primary, marginTop: 20 }]} onPress={() => loadDir(stack)}>
          <Text style={s.permBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Breadcrumb ──────────────────────────────────────────────────────────────
  const crumbs = ['LM', ...stack];

  const syncBar = (() => {
    let title = '', sub = '';
    if (sync.phase === 'syncing') {
      title = `Downloading ${Math.min(sync.done + 1, sync.total)} of ${sync.total} file${sync.total === 1 ? '' : 's'} from the school server`;
      sub = `${fmtBytes(Math.max(0, sync.bytesTotal - sync.bytesDone))} left${sync.message ? `. ${sync.message}` : ''}`;
    } else if (sync.phase === 'paused') {
      title = 'Download paused'; sub = `${sync.total - sync.done} file${sync.total - sync.done === 1 ? '' : 's'} still to download`;
    } else if (sync.phase === 'done') {
      title = 'Up to date with the school server'; sub = sync.message || `${sync.serverFiles} file${sync.serverFiles === 1 ? '' : 's'} from the server`;
    } else if (sync.phase === 'error') {
      title = 'Materials not updated'; sub = sync.message;
    } else return null;   // no school server, or still looking: nothing to show
    const frac = sync.bytesTotal ? Math.min(1, sync.bytesDone / sync.bytesTotal) : 0;
    return (
      <View style={[s.syncBar, { backgroundColor: C.surface, borderBottomColor: C.border }]} accessibilityLiveRegion="polite">
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[s.syncTitle, { color: sync.phase === 'error' ? C.danger : C.text }]} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={[s.syncSub, { color: C.textSoft }]} numberOfLines={2}>{sub}</Text>}
          {(sync.phase === 'syncing' || sync.phase === 'paused') && (
            <View style={[s.syncTrack, { backgroundColor: C.border }]}>
              <View style={[s.syncFill, { width: `${Math.round(frac * 100)}%`, backgroundColor: C.primaryText }]} />
            </View>
          )}
        </View>
        {sync.phase === 'syncing' && (
          <TouchableOpacity onPress={pauseLmSync} accessibilityRole="button" style={[s.syncBtn, { borderColor: C.border }]}>
            <Text style={[s.syncBtnText, { color: C.text }]}>Pause</Text>
          </TouchableOpacity>
        )}
        {(sync.phase === 'paused' || sync.phase === 'error') && (
          <TouchableOpacity onPress={resumeLmSync} accessibilityRole="button" style={[s.syncBtn, { borderColor: C.border }]}>
            <Text style={[s.syncBtnText, { color: C.text }]}>{sync.phase === 'paused' ? 'Resume' : 'Try again'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  })();

  return (
    <View style={[s.flex, { backgroundColor: C.bg }]}>
      {syncBar}

      {/* Breadcrumb + back */}
      {stack.length > 0 && (
        <View style={[s.breadRow, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={goBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={20} color={C.primary as string} />
          </TouchableOpacity>
          <View style={s.crumbs}>
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Ionicons name="chevron-forward" size={12} color={C.muted as string} style={{ marginHorizontal: 2 }} />}
                <Text
                  style={[s.crumb, { color: i === crumbs.length - 1 ? C.text : C.muted }, i === crumbs.length - 1 && s.crumbActive]}
                  numberOfLines={1}
                >
                  {c}
                </Text>
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      {docsHidden && (
        <View style={[s.banner, { backgroundColor: tc('#FEF3DC', 'bg'), borderColor: tc('#C8780A', 'border') }]}>
          <Text style={s.bannerText}>
            Some materials are hidden. Android only lets this app see videos and pictures until you allow access to all files, so PDFs and documents won&apos;t show.
          </Text>
          <TouchableOpacity style={[s.bannerBtn, { backgroundColor: C.primary }]} onPress={openAllFilesAccess}>
            <Text style={s.permBtnText}>Allow access</Text>
          </TouchableOpacity>
        </View>
      )}

      {items.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="folder-open-outline" size={44} color={C.muted as string} />
          <Text style={[s.stateText, { color: C.muted }]}>
            {sync.phase === 'syncing' && stack.length === 0 ? 'Materials are downloading from the school server.' : 'This folder is empty.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.uri}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const kind   = item.isDirectory ? null : fileKind(item.name);
            const icon   = item.isDirectory
              ? { name: 'folder' as const, color: '#D97706' }
              : kindIcon(kind!);
            const canOpen = item.isDirectory || (kind !== 'unknown');

            return (
              <TouchableOpacity
                style={[s.row, { backgroundColor: C.surface, borderColor: C.border }, !canOpen && s.rowDisabled]}
                onPress={() => canOpen && enter(item)}
                activeOpacity={canOpen ? 0.72 : 1}
              >
                <View style={[s.iconBox, { backgroundColor: icon.color + '18' }]}>
                  <Ionicons name={icon.name as any} size={26} color={icon.color} />
                </View>
                <View style={s.rowBody}>
                  <Text style={[s.rowName, { color: canOpen ? C.text : C.muted }]} numberOfLines={2}>{item.name}</Text>
                  {!item.isDirectory && (
                    <Text style={[s.rowMeta, { color: C.muted }]}>
                      {kind !== 'unknown' ? kind!.toUpperCase() : 'Cannot open'}{item.size ? `  ·  ${fmtSize(item.size)}` : ''}
                    </Text>
                  )}
                  {item.isDirectory && (
                    <Text style={[s.rowMeta, { color: C.muted }]}>Folder</Text>
                  )}
                </View>
                {canOpen && <Ionicons name={item.isDirectory ? 'chevron-forward' : 'open-outline'} size={18} color={C.muted as string} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const s = createThemedStyles({
  syncBar:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  syncTitle:   { fontSize: 14, fontWeight: '700' },
  syncSub:     { fontSize: 13, lineHeight: 18 },
  syncTrack:   { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  syncFill:    { height: 5, borderRadius: 3 },
  syncBtn:     { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  syncBtnText: { fontSize: 14, fontWeight: '600' },
  flex:        { flex: 1 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  stateTitle:  { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  stateText:   { fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  permRoot:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  steps:       { width: '100%', borderRadius: 14, borderWidth: 1, padding: 16, gap: 12, marginTop: 4 },
  stepRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum:     { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  stepNumText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  stepText:    { flex: 1, fontSize: 13, lineHeight: 18 },
  permBtn:     { width: '100%', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  permBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  breadRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn:     { marginRight: 10 },
  crumbs:      { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  crumb:       { fontSize: 13, fontWeight: '600' },
  crumbActive: { fontWeight: '800' },

  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  rowDisabled: { opacity: 0.45 },
  iconBox:     { width: 48, height: 48, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  rowBody:     { flex: 1 },
  rowName:     { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  rowMeta:     { fontSize: 12, marginTop: 2 },

  banner:      { margin: 12, marginBottom: 0, padding: 12, borderRadius: 12, borderLeftWidth: 4, gap: 10 },
  bannerText:  { fontSize: 13, lineHeight: 19, color: '#2A2620' },
  bannerBtn:   { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
});
