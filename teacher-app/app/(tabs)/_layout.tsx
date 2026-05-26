import { Tabs } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  const Colors = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   Colors.primary,
        tabBarInactiveTintColor: '#A09282',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor:  '#E2D9CC',
          borderTopWidth:  1,
          height:          60,
          paddingBottom:   8,
        },
        tabBarLabelStyle:    { fontSize: 11, fontWeight: '600' },
        headerStyle:         { backgroundColor: Colors.primary },
        headerTintColor:     '#fff',
        headerTitleStyle:    { fontWeight: '800', letterSpacing: -0.3 },
        headerShadowVisible: false,
      }}
    >
      {/* ── Primary tabs ── */}
      <Tabs.Screen
        name="index"
        options={{
          title:        'Home',
          headerShown:  false,
          tabBarIcon:   ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timetable"
        options={{
          title:      'Timetable',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          title:      'Meetings',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="absences"
        options={{
          title:      'Absences',
          tabBarIcon: ({ color, size }) => <Ionicons name="alert-circle-outline" size={size} color={color} />,
          href:       '/absences',
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title:      'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />

      {/* ── Hidden screens (accessible via navigation) ── */}
      <Tabs.Screen name="submit"        options={{ href: null, title: 'Submit'        }} />
      <Tabs.Screen name="history"       options={{ href: null, title: 'History'       }} />
      <Tabs.Screen name="profile"       options={{ href: null, title: 'Profile'       }} />
      <Tabs.Screen name="notifications" options={{ href: null, title: 'Notifications' }} />
      <Tabs.Screen name="plc"           options={{ href: null, title: 'PLC'           }} />
    </Tabs>
  );
}
