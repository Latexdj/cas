// "A newer CAS Teacher app is ready", from the school server or CAS online.
import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { checkAppUpdate, installUpdate, snoozeUpdate, type AvailableUpdate } from '@/lib/appUpdate';
import { Body, Button, Card, Progress, Row } from '@/components/ui/kit';

export function AppUpdateBanner({ update: given, onDone }: { update?: AvailableUpdate | null; onDone?: () => void } = {}) {
  const C = useTheme();
  const [update, setUpdate] = useState<AvailableUpdate | null>(given ?? null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (given !== undefined) { setUpdate(given); return; }
    if (Platform.OS !== 'android') return;
    let live = true;
    checkAppUpdate().then(u => { if (live) setUpdate(u); }).catch(() => {});
    return () => { live = false; };
  }, [given]);

  if (!update) return null;

  async function install() {
    if (!update) return;
    setError(''); setProgress(0);
    try { await installUpdate(update, setProgress); }
    catch (e) { setError(e instanceof Error ? e.message : 'The update could not be installed.'); }
    finally { setProgress(null); }
  }
  const mb = Math.round(update.size / 1024 / 1024);
  return (
    <Card accent={C.primaryText}>
      <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Ionicons name="arrow-down-circle" size={26} color={C.primaryText} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>A newer CAS Teacher app is ready</Text>
          <Body small soft>
            Version {update.versionName || update.versionCode}, {mb} MB, {update.source === 'school' ? 'from the school server (no data used)' : 'over the internet'}.
          </Body>
        </View>
      </View>
      {progress != null ? (
        <View style={{ gap: 6 }}>
          <Progress value={progress} />
          <Body small soft>{progress < 1 ? `Downloading… ${Math.round(progress * 100)}%` : 'Opening the installer…'}</Body>
        </View>
      ) : (
        <Row>
          <Button label="Install" grow onPress={install} />
          <Button label="Not now" kind="secondary" onPress={() => { snoozeUpdate(update.versionCode); setUpdate(null); onDone?.(); }} />
        </Row>
      )}
      {!!error && <Body small style={{ color: C.danger }}>{error}</Body>}
      <Body small soft>If Android asks, allow installs from CAS Teacher. You stay signed in and keep your settings.</Body>
    </Card>
  );
}
