import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { storage } from '@/lib/storage';

function InitialLayout() {
  const { user, isLoading, mustChangePassword } = useAuth();
  const router   = useRouter();
  const segments = useSegments();
  const [schoolCode, setSchoolCode] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setSchoolCode(undefined);
    storage.getSchoolCode().then(c => setSchoolCode(c));
  }, [segments]);

  useEffect(() => {
    if (isLoading || schoolCode === undefined) return;

    const inTabs       = segments[0] === '(tabs)';
    const inLogin      = segments[0] === 'login';
    const inSetup      = segments[0] === 'setup';
    const inChangePwd  = segments[0] === 'change-password';

    if (!schoolCode && !inSetup) {
      router.replace('/setup');
    } else if (schoolCode && !user && !inLogin && !inSetup) {
      router.replace('/login');
    } else if (user && mustChangePassword && !inChangePwd) {
      router.replace('/change-password');
    } else if (user && !mustChangePassword && !inTabs) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, schoolCode, mustChangePassword]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="setup"           />
        <Stack.Screen name="login"           />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="(tabs)"          />
        <Stack.Screen name="timetable"       options={{ headerShown: true, title: 'Timetable',  headerBackTitle: 'Back' }} />
        <Stack.Screen name="calendar"        options={{ headerShown: true, title: 'Calendar',   headerBackTitle: 'Back' }} />
        <Stack.Screen name="fees"            options={{ headerShown: true, title: 'Fees',        headerBackTitle: 'Back' }} />
        <Stack.Screen name="clearance"       options={{ headerShown: true, title: 'Clearance',  headerBackTitle: 'Back' }} />
        <Stack.Screen name="library"         options={{ headerShown: true, title: 'Library',    headerBackTitle: 'Back' }} />
        <Stack.Screen name="exeat"           options={{ headerShown: true, title: 'Exeat',      headerBackTitle: 'Back' }} />
        <Stack.Screen name="profile"         options={{ headerShown: true, title: 'Profile',    headerBackTitle: 'Back' }} />
      </Stack>

      {(isLoading || schoolCode === undefined) && (
        <View style={s.overlay}>
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

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', zIndex: 999 },
});
