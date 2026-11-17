// The school server's Offline Assessment page, shown inside the app so its
// traffic can be held on the school Wi-Fi even when mobile data is on.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/context/ThemeContext';
import { holdWifi } from '@/modules/wifi-bind';
import { Body, Button, Row } from '@/components/ui/kit';

export default function OfflineAssessmentPage() {
  const C = useTheme();
  const { url } = useLocalSearchParams<{ url: string }>();
  const web = useRef<WebView>(null);
  const [canBack, setCanBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);

  // Keep the app on the Wi-Fi only while this page is open.
  useEffect(() => holdWifi(), []);

  // Android back button: go back inside the page first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canBack) { web.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canBack]);

  if (!url) { router.back(); return null; }
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: 'Offline Assessment' }} />
      {failed ? (
        <View style={{ flex: 1, padding: 20, gap: 12, justifyContent: 'center' }}>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>The school server isn't answering</Text>
          <Body soft>Check that this phone is on the school Wi-Fi and that the school server PC is on.</Body>
          <Row>
            <Button label="Try again" grow onPress={() => { setFailed(false); setKey(k => k + 1); }} />
            <Button label="Open in browser" kind="secondary" grow onPress={() => Linking.openURL(url).catch(() => {})} />
          </Row>
        </View>
      ) : (
        <WebView
          key={key}
          ref={web}
          source={{ uri: url }}
          domStorageEnabled
          javaScriptEnabled
          setSupportMultipleWindows={false}
          onNavigationStateChange={s => setCanBack(s.canGoBack)}
          onError={() => setFailed(true)}
          onHttpError={e => { if (e.nativeEvent.statusCode >= 500) setFailed(true); }}
          startInLoadingState
          renderLoading={() => (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
              <ActivityIndicator color={C.primaryText} />
            </View>
          )}
          style={{ flex: 1, backgroundColor: C.bg }}
        />
      )}
    </View>
  );
}
