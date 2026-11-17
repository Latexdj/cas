import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Spinner } from '@/components/ui/Spinner';
import { storage } from '@/lib/storage';
import { offlineQueue } from '@/lib/offlineQueue';
import { api } from '@/lib/api';
import { createThemedStyles } from '@/lib/themedStyles';
import { useTheme } from '@/context/ThemeContext';
import { headerOptions } from '@/lib/nav';
import { Platform } from 'react-native';
import { ReminderTapHandler } from '@/components/ReminderTapHandler';
import { NoticeHost } from '@/components/NoticeHost';

// Header titles for the screens opened from More (same names as the web menu).
const SCREEN_TITLES: [string, string][] = [
  ['reminders', 'Lesson reminders'], ['memos', 'Memos'], ['letters', 'My Letters'], ['clinic', 'Clinic'],
  ['resources', 'Resources'], ['conduct', 'My Queries'], ['student-attendance', 'Student Attendance'],
  ['id-scan', 'Scan ID Card'], ['invigilation', 'Invigilation'], ['lms/index', 'My Courses'], ['lms/[courseId]', 'Course'], ['form-class', 'Form Class'],
  ['hod/index', 'My Department'], ['hod/inventory', 'Department Inventory'], ['hod/observations', 'Department Observations'], ['clearance', 'Clearance'], ['library', 'Library'],
  ['roll-call', 'Roll Call'], ['resumption', 'Resumption Register'], ['house-students', 'My House'], ['budgets', 'Budgets'], ['offline-assessment', 'Offline Assessment'],
];

function InitialLayout() {
  const { user, isLoading } = useAuth();
  const C = useTheme();
  const router   = useRouter();
  const segments = useSegments();
  const [schoolCode, setSchoolCode] = useState<string | null | undefined>(undefined);

  // Re-read school code from storage every time navigation changes.
  // Reset to undefined first so the loading overlay blocks navigation
  // logic during the async read (prevents redirect-back-to-setup race).
  useEffect(() => {
    setSchoolCode(undefined);
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
    } else if (user && (inLogin || inSetup || !segments[0])) {
      // Signed in: leave the sign-in screens. Module screens outside the
      // tabs (LMS, HOD, Library...) stay where they are.
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, schoolCode]);

  return (
    <>
      <Stack screenOptions={{ ...headerOptions(C), headerShown: true }}>
        <Stack.Screen name="setup"  options={{ headerShown: false }} />
        <Stack.Screen name="login"  options={{ headerShown: false }} />
        <Stack.Screen name="index"  options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {SCREEN_TITLES.map(([name, title]) => <Stack.Screen key={name} name={name} options={{ title }} />)}
      </Stack>

      {/* Tapping a lesson reminder opens Submit attendance for that lesson. */}
      {user && Platform.OS !== 'web' && <ReminderTapHandler />}
      <NoticeHost />

      {(isLoading || schoolCode === undefined) && (
        <View style={styles.loadingOverlay}>
          <Spinner message="Loading…" />
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  // Auto-sync queued submissions whenever the device comes online
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        offlineQueue.syncAll((path, data) => api.post(path, data)).catch(() => {});
      }
    });
    return unsubscribe;
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <InitialLayout />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = createThemedStyles({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FAFAF8',
    zIndex: 999,
  },
});
