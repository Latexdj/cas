import { Pressable } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

// Same tab bar as the web teacher portal: Today, Timetable, Marks, Absences, More.
export default function TabsLayout() {
  const C = useTheme();
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: string; size: number }) =>
    <Ionicons name={name} size={size} color={color} />;

  // Screens opened from Today or More get a back arrow to where they came from.
  const sub = (title: string) => ({
    href: null, title,
    headerLeft: () => (
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(tabs)/more'))} accessibilityRole="button"
        accessibilityLabel="Back" hitSlop={12} style={{ paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' }}>
        <Ionicons name="arrow-back" size={22} color={C.text} />
      </Pressable>
    ),
  });

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarActiveTintColor:   C.tabActive,
        tabBarInactiveTintColor: C.tabInactive,
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border, borderTopWidth: 1, height: 62, paddingBottom: 8, paddingTop: 4 },
        tabBarLabelStyle:    { fontSize: 12, fontWeight: '600' },
        headerStyle:         { backgroundColor: C.surface },
        headerTintColor:     C.text,
        headerTitleStyle:    { fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index"       options={{ title: 'Today', headerShown: false, tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="timetable"   options={{ title: 'Timetable', tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="assessments" options={{ title: 'Marks', headerShown: false, tabBarIcon: icon('create-outline') }} />
      <Tabs.Screen name="absences"    options={{ title: 'Absences', headerShown: false, tabBarIcon: icon('alert-circle-outline'), href: '/absences' }} />
      <Tabs.Screen name="more"        options={{ title: 'More', tabBarIcon: icon('menu-outline') }} />

      {/* Reached from Today or More */}
      <Tabs.Screen name="submit" options={sub('Submit attendance')} />
      <Tabs.Screen name="meetings" options={sub('Meetings')} />
      <Tabs.Screen name="observations" options={sub('My Observations')} />
      <Tabs.Screen name="history" options={sub('History')} />
      <Tabs.Screen name="profile" options={sub('Profile')} />
      <Tabs.Screen name="notifications" options={sub('Alerts')} />
      <Tabs.Screen name="plc" options={sub('PLC')} />
      <Tabs.Screen name="results" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
