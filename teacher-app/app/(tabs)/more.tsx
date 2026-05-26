import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

interface MenuItem {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const MENU_SECTIONS: { label: string; items: MenuItem[] }[] = [
  {
    label: 'Records',
    items: [
      {
        title:    'History',
        subtitle: 'Attendance records, sessions & meeting logs',
        icon:     'time-outline',
        route:    '/(tabs)/history',
      },
      {
        title:    'Leave Requests',
        subtitle: 'Submit and track leave applications',
        icon:     'document-text-outline',
        route:    '/absences/leaves',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        title:    'Profile',
        subtitle: 'Your account details and settings',
        icon:     'person-circle-outline',
        route:    '/(tabs)/profile',
      },
      {
        title:    'Notifications',
        subtitle: 'System messages and alerts',
        icon:     'notifications-outline',
        route:    '/(tabs)/notifications',
      },
    ],
  },
];

export default function MoreScreen() {
  const Colors = useTheme();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {MENU_SECTIONS.map(section => (
        <View key={section.label} style={styles.section}>
          <Text style={styles.sectionLabel}>{section.label}</Text>
          <View style={styles.card}>
            {section.items.map((item, i) => (
              <TouchableOpacity
                key={item.route}
                style={[
                  styles.item,
                  i < section.items.length - 1 && styles.itemDivider,
                ]}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: Colors.accentLight }]}>
                  <Ionicons name={item.icon} size={22} color={Colors.primary} />
                </View>
                <View style={styles.itemBody}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemSub}>{item.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C0B8AF" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F4EFE6' },
  content:      { padding: 16, paddingBottom: 48 },
  section:      { marginBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, paddingHorizontal: 4 },
  card:         { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', overflow: 'hidden' },
  item:         { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  itemDivider:  { borderBottomWidth: 1, borderBottomColor: '#F1EDE8' },
  iconWrap:     { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  itemBody:     { flex: 1 },
  itemTitle:    { fontSize: 15, fontWeight: '700', color: '#1C1208', marginBottom: 2 },
  itemSub:      { fontSize: 12, color: '#8C7E6E' },
});
