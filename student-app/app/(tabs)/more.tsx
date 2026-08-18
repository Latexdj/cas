import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

interface MenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  route?: string;
  action?: () => void;
  color: string;
  danger?: boolean;
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const { user, logout } = useAuth();

  const items: MenuItem[] = [
    { label: 'Timetable', icon: 'calendar-outline',      iconColor: '#D97706', route: '/timetable', color: '#FEF3C7' },
    { label: 'Calendar',  icon: 'calendar-number-outline',iconColor: '#1D4ED8', route: '/calendar',  color: '#EFF6FF' },
    { label: 'Fees',      icon: 'card-outline',           iconColor: '#DC2626', route: '/fees',      color: '#FEF2F2' },
    { label: 'Clearance', icon: 'document-text-outline',  iconColor: '#145C44', route: '/clearance', color: '#F0FDF4' },
    { label: 'Library',   icon: 'library-outline',        iconColor: '#7C3AED', route: '/library',   color: '#EDE9FE' },
    { label: 'Exeat',     icon: 'exit-outline',           iconColor: '#EA580C', route: '/exeat',     color: '#FFF7ED' },
    { label: 'LMS',       icon: 'school-outline',         iconColor: '#0F766E', route: '/lms',       color: '#ECFDF5' },
    { label: 'Profile',   icon: 'person-circle-outline',  iconColor: '#475569', route: '/profile',   color: '#F1F5F9' },
    { label: 'Sign Out',  icon: 'log-out-outline',        iconColor: '#DC2626', action: logout,      color: '#FEF2F2', danger: true },
  ];

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      <View style={[s.header, { backgroundColor: C.primary, paddingTop: insets.top + 20 }]}>
        <Text style={s.headerTitle}>More</Text>
        <Text style={s.headerSub}>{user?.name}</Text>
      </View>

      <View style={s.grid}>
        {items.map(item => (
          <TouchableOpacity
            key={item.label}
            style={[s.item, { backgroundColor: item.color }]}
            onPress={item.action ?? (() => item.route && router.push(item.route as any))}
            activeOpacity={0.72}
          >
            <Ionicons name={item.icon} size={32} color={item.iconColor} />
            <Text style={[s.itemLabel, { color: item.danger ? '#DC2626' : '#1C1208' }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  flex:        { flex: 1 },
  header:      { paddingHorizontal: 20, paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, marginBottom: 20 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  headerSub:   { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
  item:        { width: '47%', borderRadius: 16, padding: 20, gap: 10, alignItems: 'center' },
  itemLabel:   { fontSize: 14, fontWeight: '700' },
});
