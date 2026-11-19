// Shows what the automatic updates (lib/autoUpdate.ts) did and have ready:
//   - "Updated while you were away": new materials, questions, stories, or a
//     newer app installed; stays until the student taps OK;
//   - a new app that is already downloaded, ready to install any time, with
//     or without Wi-Fi ("Later" hides it until the app is next opened);
//   - a quiet line while the new app downloads, or when there is no space.
import React, { useState } from 'react';
import { Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { appBuild } from '@/lib/schoolServer';
import { dismissNews, installReady, useAutoUpdate } from '@/lib/autoUpdate';

let hiddenThisSession: number | null = null;   // "Later": until the app is next started

export function AppUpdateBanner({ style }: { style?: ViewStyle } = {}) {
  const C = useTheme();
  const { ready, downloading, note, news } = useAutoUpdate();
  const [hidden, setHidden] = useState<number | null>(hiddenThisSession);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);

  const showReady = !!ready && ready.versionCode > appBuild() && hidden !== ready.versionCode;
  if (!news && !showReady && !downloading && !note) return null;

  async function install() {
    setError(''); setOpening(true);
    try { await installReady(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The installer could not be opened.'); }
    finally { setOpening(false); }
  }
  const card = { backgroundColor: C.surface, borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 10, width: '100%' as const };

  return (
    <View style={[{ gap: 10 }, style]}>
      {news && (
        <View accessibilityRole="alert" style={[card, { borderColor: C.success }]}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={26} color={C.success} />
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>Updated while you were away</Text>
          </View>
          <View style={{ gap: 4 }}>
            {news.items.map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={{ color: C.success, fontSize: 14, lineHeight: 20 }}>{'•'}</Text>
                <Text style={{ flex: 1, color: C.text, fontSize: 14, lineHeight: 20 }}>{t}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={dismissNews}
            style={{ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1.5, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>OK</Text>
          </TouchableOpacity>
        </View>
      )}

      {showReady && ready && (
        <View accessibilityRole="alert" style={[card, { borderColor: C.primaryText }]}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="arrow-down-circle" size={26} color={C.primaryText} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>A new CAS Student app is ready to install</Text>
              <Text style={{ color: C.textSoft, fontSize: 13, marginTop: 2 }}>
                Version {ready.versionName || ready.versionCode} is already downloaded. Installing takes a minute and needs no Wi-Fi.
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity accessibilityRole="button" onPress={install} disabled={opening}
              style={{ flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', opacity: opening ? 0.6 : 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{opening ? 'Opening the installer…' : 'Install now'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => { hiddenThisSession = ready.versionCode; setHidden(ready.versionCode); }}
              style={{ minHeight: 46, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Later</Text>
            </TouchableOpacity>
          </View>
          {!!error && <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>}
          <Text style={{ color: C.muted, fontSize: 12 }}>If Android asks, allow installs from CAS Student. Your work and downloads are kept.</Text>
        </View>
      )}

      {!showReady && downloading && (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 4 }} accessibilityLiveRegion="polite">
          <Ionicons name="cloud-download-outline" size={20} color={C.textSoft} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: C.textSoft, fontSize: 13 }}>
              Downloading the new CAS Student app from the school server, {Math.round(downloading.progress * 100)}%. Keep using the app; you can install it when it is done.
            </Text>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: C.border, overflow: 'hidden' }}>
              <View style={{ height: 4, width: `${Math.round(downloading.progress * 100)}%`, backgroundColor: C.primaryText }} />
            </View>
          </View>
        </View>
      )}

      {!showReady && !downloading && !!note && (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 4 }}>
          <Ionicons name="alert-circle-outline" size={20} color={C.warning} />
          <Text style={{ flex: 1, color: C.textSoft, fontSize: 13 }}>{note}</Text>
        </View>
      )}
    </View>
  );
}
