import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { createThemedStyles } from '@/lib/themedStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The public area the student was last in. If the app restarts (Android
// closed it, or it recovered from an error) it reopens there rather than on
// the landing page.
const LAST_AREA = 'cas_s_last_area';
const REMEMBERED = ['welcome', 'materials', 'past-questions', 'login'];

function InitialLayout() {
  const { user, isLoading, mustChangePassword } = useAuth();
  const C = useTheme();
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const seg         = segments[0] as string;
    const inTabs      = seg === '(tabs)';
    const inLogin     = seg === 'login';
    const inChangePwd = seg === 'change-password';
    const inPublic    = ['welcome', 'materials', 'viewer', 'past-questions'].includes(seg);
    const inModal     = ['timetable', 'calendar', 'fees', 'clearance', 'library', 'exeat', 'profile', 'clinic', 'conduct', 'lms'].includes(seg);

    if (!user && !inLogin && !inPublic) {
      AsyncStorage.getItem(LAST_AREA)
        .then(raw => {
          const last = raw ? JSON.parse(raw) : null;
          const recent = last && Date.now() - last.at < 6 * 60 * 60 * 1000;
          router.replace(recent && last.seg === 'past-questions' ? '/past-questions' : '/welcome');
        })
        .catch(() => router.replace('/welcome'));
    } else if (user && mustChangePassword && !inChangePwd) {
      router.replace('/change-password');
    } else if (user && !mustChangePassword && !inTabs && !inModal && !inPublic) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, mustChangePassword]);

  useEffect(() => {
    const seg = segments[0] as string;
    if (REMEMBERED.includes(seg)) AsyncStorage.setItem(LAST_AREA, JSON.stringify({ seg, at: Date.now() })).catch(() => {});
  }, [segments]);

  return (
    <>
      <Stack screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: C.surface },
        headerTintColor: C.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: C.bg },
      }}>
        <Stack.Screen name="welcome"         />
        <Stack.Screen name="login"           />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="(tabs)"          />
        <Stack.Screen name="materials"       options={{ headerShown: true, title: 'Learning Materials', headerBackTitle: 'Back' }} />
        <Stack.Screen name="viewer"          options={{ headerShown: true, headerBackTitle: 'Back' }} />
        <Stack.Screen name="past-questions/index"  options={{ headerShown: true, title: 'Past Questions', headerBackTitle: 'Back' }} />
        <Stack.Screen name="past-questions/[slug]" options={{ headerShown: true, title: 'Subject', headerBackTitle: 'Back' }} />
        <Stack.Screen name="past-questions/play"   options={{ headerShown: true, title: 'Practice', headerBackTitle: 'Back' }} />
        <Stack.Screen name="past-questions/updates" options={{ headerShown: true, title: 'Get new questions', headerBackTitle: 'Back' }} />
        <Stack.Screen name="timetable"       options={{ headerShown: true, title: 'Timetable',  headerBackTitle: 'Back' }} />
        <Stack.Screen name="calendar"        options={{ headerShown: true, title: 'Calendar',   headerBackTitle: 'Back' }} />
        <Stack.Screen name="fees"            options={{ headerShown: true, title: 'Fees',        headerBackTitle: 'Back' }} />
        <Stack.Screen name="clearance"       options={{ headerShown: true, title: 'Clearance',  headerBackTitle: 'Back' }} />
        <Stack.Screen name="library"         options={{ headerShown: true, title: 'Library',    headerBackTitle: 'Back' }} />
        <Stack.Screen name="exeat"           options={{ headerShown: true, title: 'Exeat',      headerBackTitle: 'Back' }} />
        <Stack.Screen name="profile"         options={{ headerShown: true, title: 'Profile',    headerBackTitle: 'Back' }} />
        <Stack.Screen name="clinic"              options={{ headerShown: true, title: 'Clinic',  headerBackTitle: 'Back' }} />
        <Stack.Screen name="conduct"             options={{ headerShown: true, title: 'Conduct', headerBackTitle: 'Back' }} />
        <Stack.Screen name="lms/[courseId]"      options={{ headerShown: true, title: 'Course',  headerBackTitle: 'Back' }} />
        <Stack.Screen name="lms/pasco"           options={{ headerShown: true, title: 'Pasco',    headerBackTitle: 'Back' }} />
        <Stack.Screen name="lms/quiz/[quizId]"   options={{ headerShown: false }} />
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

const s = createThemedStyles({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', zIndex: 999 },
});
