import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';

function InitialLayout() {
  const { user, isLoading, mustChangePassword } = useAuth();
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const seg         = segments[0] as string;
    const inTabs      = seg === '(tabs)';
    const inLogin     = seg === 'login';
    const inChangePwd = seg === 'change-password';
    const inModal     = ['timetable', 'calendar', 'fees', 'clearance', 'library', 'exeat', 'profile'].includes(seg);

    if (!user && !inLogin) {
      router.replace('/login');
    } else if (user && mustChangePassword && !inChangePwd) {
      router.replace('/change-password');
    } else if (user && !mustChangePassword && !inTabs && !inModal) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, mustChangePassword]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
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

      {isLoading && (
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
