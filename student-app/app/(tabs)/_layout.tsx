import { Tabs } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  const C = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   C.tabActive,
        tabBarInactiveTintColor: C.tabInactive,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor:  C.border,
          borderTopWidth:  1,
          height:          62,
          paddingBottom:   10,
        },
        tabBarLabelStyle:    { fontSize: 11, fontWeight: '600' },
        headerStyle:         { backgroundColor: C.primary },
        headerTintColor:     '#fff',
        headerTitleStyle:    { fontWeight: '800', letterSpacing: -0.3 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title:       'Home',
          headerShown: false,
          tabBarIcon:  ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title:      'Results',
          tabBarIcon: ({ color, size }) => <Ionicons name="ribbon-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title:      'Attendance',
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-circle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="lms"
        options={{
          title:      'LMS',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title:      'More',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
