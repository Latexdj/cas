import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';

export default function TabsLayout() {
  const Colors = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function fetchUnread() {
      try {
        const { data } = await api.get<{ count: number }>('/api/notifications/unread-count');
        if (mounted) setUnreadCount(data.count ?? 0);
      } catch {}
    }

    fetchUnread();
    const interval = setInterval(fetchUnread, 60_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle:      { backgroundColor: Colors.primary },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontWeight: '800', letterSpacing: -0.3 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index"         options={{ title: 'Dashboard',     tabBarIcon: ({ color, size }) => <Ionicons name="home-outline"            size={size} color={color} /> }} />
      <Tabs.Screen name="submit"        options={{ title: 'Submit',        tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="absences"      options={{ title: 'Absences',      tabBarIcon: ({ color, size }) => <Ionicons name="alert-circle-outline"   size={size} color={color} />, href: '/absences' }} />
      <Tabs.Screen name="history"       options={{ title: 'History',       tabBarIcon: ({ color, size }) => <Ionicons name="time-outline"           size={size} color={color} /> }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#EF4444', fontSize: 10, minWidth: 16, height: 16 },
        }}
      />
      <Tabs.Screen name="profile"       options={{ title: 'Profile',       tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline"  size={size} color={color} /> }} />
      <Tabs.Screen name="timetable"     options={{ href: null, title: 'Timetable' }} />
    </Tabs>
  );
}
