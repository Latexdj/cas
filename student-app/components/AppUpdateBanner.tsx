// "A newer CAS Student app is on the school network." Shown when the CAS
// School Server on the Wi-Fi holds a newer APK than the one installed.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { checkAppUpdate, installUpdate, snoozeUpdate, type AvailableUpdate } from '@/lib/appUpdate';

export function AppUpdateBanner() {
  const C = useTheme();
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    checkAppUpdate().then(u => { if (live) setUpdate(u); }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!update) return null;

  async function install() {
    if (!update) return;
    setError(''); setProgress(0);
    try { await installUpdate(update, setProgress); }
    catch (e) { setError(e instanceof Error ? e.message : 'The update could not be installed.'); }
    finally { setProgress(null); }
  }

  const mb = (update.size / 1024 / 1024).toFixed(0);
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: C.surface, borderColor: C.primaryText, borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 10, width: '100%' }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Ionicons name="arrow-down-circle" size={26} color={C.primaryText} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>A newer CAS Student app is ready</Text>
          <Text style={{ color: C.textSoft, fontSize: 13, marginTop: 2 }}>
            Version {update.versionName || update.versionCode} from the school server ({mb} MB, no internet needed).
          </Text>
        </View>
      </View>
      {progress != null ? (
        <View style={{ gap: 6 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' }}>
            <View style={{ height: 6, width: `${Math.round(progress * 100)}%`, backgroundColor: C.primaryText }} />
          </View>
          <Text style={{ color: C.textSoft, fontSize: 13 }}>
            {progress < 1 ? `Downloading… ${Math.round(progress * 100)}%` : 'Opening the installer…'}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity accessibilityRole="button" onPress={install}
            style={{ flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
            {progress != null ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Install</Text>}
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => { snoozeUpdate(update.versionCode); setUpdate(null); }}
            style={{ minHeight: 46, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Not now</Text>
          </TouchableOpacity>
        </View>
      )}
      {!!error && <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>}
      <Text style={{ color: C.muted, fontSize: 12 }}>If Android asks, allow installs from CAS Student. Your work and downloads are kept.</Text>
    </View>
  );
}
