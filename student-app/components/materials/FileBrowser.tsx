import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Linking, PermissionsAndroid,
  Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const LM_BASE = '/storage/emulated/0/LM';
const LM_URI  = `file://${LM_BASE}`;

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

// ── Permission helpers ────────────────────────────────────────────────────────
async function requestPermission(): Promise<'granted' | 'denied'> {
  if (Platform.OS !== 'android') return 'granted';
  const v = Number(Platform.Version);

  if (v >= 30) {
    // PermissionsAndroid.check() always returns false for MANAGE_EXTERNAL_STORAGE —
    // Android uses Environment.isExternalStorageManager(), not checkSelfPermission().
    // Probe Android/data/ instead of the root: it is never empty (every installed
    // app has a subfolder there) and listing it is explicitly blocked without
    // MANAGE_EXTERNAL_STORAGE on API 30+. A non-empty result = permission granted.
    // An empty result or an exception = permission not granted.
    try {
      const names = await FileSystem.readDirectoryAsync(
        'file:///storage/emulated/0/Android/data/'
      );
      return names.length > 0 ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  // Android 10 and below: runtime READ_EXTERNAL_STORAGE is sufficient.
  const r = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    { title: 'Storage Access', message: 'Required to read learning materials from device storage.', buttonPositive: 'Allow', buttonNegative: 'Deny' }
  );
  return r === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  /** Shown in the header — pass the tab/screen title so it can be hidden when drilling in */
  showBackAsClose?: boolean;
}

export default function FileBrowser({ showBackAsClose }: Props) {
  const C = useTheme();

  // Navigation stack: array of folder names relative to LM_BASE
  const [stack,   setStack]   = useState<string[]>([]);
  const [items,   setItems]   = useState<FsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<'permission' | 'not-found' | 'other' | null>(null);

  const currentUri = [LM_URI, ...stack].join('/');

  // ── Load directory ──────────────────────────────────────────────────────────
  const loadDir = useCallback(async (dirUri: string) => {
    setLoading(true); setError(null);
    try {
      const names = await FileSystem.readDirectoryAsync(dirUri);
      const detailed = await Promise.all(
        names.map(async name => {
          const uri  = `${dirUri}/${name}`;
          const info = await FileSystem.getInfoAsync(uri);
          return {
            name,
            uri,
            isDirectory: info.isDirectory ?? false,
            size: (info as any).size as number | undefined,
          } as FsItem;
        })
      );
      // Folders first, then files; both alphabetical
      detailed.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      setItems(detailed.filter(i => !i.name.startsWith('.')));
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '');
      console.log('[FileBrowser] readDir error (API ' + Platform.Version + '):', msg);
      const isNotFound = msg.includes('ENOENT') || msg.includes('does not exist') || msg.includes('No such');
      if (isNotFound) {
        setError('not-found');
      } else if (
        // Android 11+ (API 30+): any read failure on /storage/emulated/0/ is a permission problem
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

  // ── Initial permission request then load ────────────────────────────────────
  useEffect(() => {
    (async () => {
      const perm = await requestPermission();
      if (perm === 'granted') {
        await loadDir(LM_URI);
      } else {
        setError('permission');
        setLoading(false);
      }
    })();
  }, [loadDir]);

  useEffect(() => {
    if (!loading && !error) loadDir(currentUri);
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
          path: `${LM_BASE}/${[...stack, item.name].join('/')}`,
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
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={[s.stateText, { color: C.muted }]}>Reading materials folder…</Text>
      </View>
    );
  }

  if (error === 'permission') {
    const needsAllFiles = Platform.OS === 'android' && Number(Platform.Version) >= 30;

    // On Android 11+, deep-link directly to the All Files Access page for this app.
    // The user just needs to flip one toggle — no digging through menus.
    function openPermissionSettings() {
      if (needsAllFiles) {
        Linking.openURL('package:com.cas.student').catch(() => Linking.openSettings());
      } else {
        Linking.openSettings();
      }
    }

    async function retry() {
      setLoading(true); setError(null);
      const perm = await requestPermission();
      if (perm === 'granted') {
        setStack([]);
        await loadDir(LM_URI);
      } else {
        setError('permission');
        setLoading(false);
      }
    }

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
              onPress={() =>
                IntentLauncher.startActivityAsync(
                  'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
                  { data: 'package:com.cas.student' }
                ).catch(() => Linking.openSettings())
              }
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
          No folder named <Text style={{ fontWeight: '800' }}>LM</Text> was found at{' '}
          <Text style={{ fontFamily: 'monospace' }}>/storage/emulated/0/LM</Text>.
          {'\n\n'}Please ensure the learning materials have been loaded onto this device.
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
        <TouchableOpacity style={[s.permBtn, { backgroundColor: C.primary, marginTop: 20 }]} onPress={() => loadDir(currentUri)}>
          <Text style={s.permBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Breadcrumb ──────────────────────────────────────────────────────────────
  const crumbs = ['LM', ...stack];

  return (
    <View style={[s.flex, { backgroundColor: C.bg }]}>

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

      {items.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="folder-open-outline" size={44} color={C.muted as string} />
          <Text style={[s.stateText, { color: C.muted }]}>This folder is empty.</Text>
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

const s = StyleSheet.create({
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
});
