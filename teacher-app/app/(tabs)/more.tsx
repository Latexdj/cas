import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppearancePicker } from '@/components/AppearancePicker';
import { useAuth } from '@/context/AuthContext';
import { loadAccess, resetAccess, useAccess } from '@/lib/access';
import { MENU, visible } from '@/lib/menu';
import { Body, Card, Divider, InlineConfirm, ListRow, Screen, SectionLabel } from '@/components/ui/kit';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';
import { appBuild, appVersion, checkAppUpdate, type AvailableUpdate } from '@/lib/appUpdate';
import { Platform } from 'react-native';

export default function MoreScreen() {
  const access = useAccess();
  const { logout } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<AvailableUpdate | null | undefined>(undefined);
  async function checkUpdates() {
    setChecking(true);
    try { setFound(await checkAppUpdate({ force: true })); } catch { setFound(null); }
    finally { setChecking(false); }
  }

  // Responsibilities first, then everything else, as on the web.
  const sections = MENU.map(s => ({ ...s, items: s.items.filter(i => visible(i, access)) })).filter(s => s.items.length);

  return (
    <Screen onRefresh={() => loadAccess(true)}>
      {sections.map(section => (
        <View key={section.label} style={{ gap: 8 }}>
          <SectionLabel>{section.label}</SectionLabel>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {section.items.map((item, i) => (
              <View key={item.route}>
                {i > 0 && <Divider />}
                <ListRow icon={item.icon} title={item.label} sub={item.sub} onPress={() => router.push(item.route as never)} />
              </View>
            ))}
          </Card>
        </View>
      ))}

      <SectionLabel>Appearance</SectionLabel>
      <Card>
        <Body soft small>System follows your phone's light or dark setting.</Body>
        <AppearancePicker />
      </Card>

      <SectionLabel>App</SectionLabel>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <ListRow icon="refresh-outline" title={checking ? 'Checking…' : 'Check for updates'}
          sub={`CAS Teacher ${appVersion()} (build ${appBuild()})${found === null ? '. You have the latest version.' : ''}`}
          onPress={() => { if (!checking && Platform.OS === 'android') checkUpdates(); }} />
      </Card>
      {found ? <AppUpdateBanner update={found} onDone={() => setFound(undefined)} /> : null}

      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {confirmOut ? (
          <View style={{ paddingVertical: 8 }}>
            <InlineConfirm question="Sign out of CAS on this phone?" confirmLabel="Sign out"
              onConfirm={() => { resetAccess(); logout(); }} onCancel={() => setConfirmOut(false)} />
          </View>
        ) : (
          <ListRow icon="log-out-outline" title="Sign out" danger onPress={() => setConfirmOut(true)} />
        )}
      </Card>
    </Screen>
  );
}
