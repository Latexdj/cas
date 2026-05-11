import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Spinner } from '@/components/ui/Spinner';
import { storage } from '@/lib/storage';

function InitialLayout() {
  const { user, isLoading } = useAuth();
  const router   = useRouter();
  const segments = useSegments();
  const [schoolCode, setSchoolCode] = useState<string | null | undefined>(undefined);

  // Re-read school code from storage every time navigation changes
  useEffect(() => {
    storage.getSchoolCode().then(c => setSchoolCode(c));
  }, [segments]);

  useEffect(() => {
    if (isLoading || schoolCode === undefined) return;

    const inTabs  = segments[0] === '(tabs)';
    const inLogin = segments[0] === 'login';
    const inSetup = segments[0] === 'setup';

    if (!schoolCode && !inSetup) {
      router.replace('/setup');
    } else if (schoolCode && !user && !inLogin && !inSetup) {
      router.replace('/login');
    } else if (user && !inTabs) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, schoolCode]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="setup"  />
        <Stack.Screen name="login"  />
        <Stack.Screen name="(tabs)" />
      </Stack>

      {(isLoading || schoolCode === undefined) && (
        <View style={styles.loadingOverlay}>
          <Spinner message="Loading…" />
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <InitialLayout />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    zIndex: 999,
  },
});
