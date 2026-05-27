import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark, useToggleDark } from '@/context/ThemeContext';

interface MenuItem {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const MENU_SECTIONS: { label: string; items: MenuItem[] }[] = [
  {
    label: 'Assessments',
    items: [
      {
        title:    'My Assessments',
        subtitle: 'Record CA scores and end-of-semester exam marks',
        icon:     'school-outline',
        route:    '/(tabs)/assessments',
      },
      {
        title:    'Results',
        subtitle: 'View class report cards and student rankings',
        icon:     'bar-chart-outline',
        route:    '/(tabs)/results',
      },
    ],
  },
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
  const Colors     = useTheme();
  const isDark     = useIsDark();
  const toggleDark = useToggleDark();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }} contentContainerStyle={styles.content}>

      {/* Dark mode toggle */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: Colors.muted }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <View style={styles.item}>
            <View style={[styles.iconWrap, { backgroundColor: Colors.primaryLight }]}>
              <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={22} color={Colors.primary} />
            </View>
            <View style={styles.itemBody}>
              <Text style={[styles.itemTitle, { color: Colors.text }]}>Dark Mode</Text>
              <Text style={[styles.itemSub, { color: Colors.muted }]}>
                {isDark ? 'Dark theme active' : 'Light theme active'}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleDark}
              trackColor={{ false: Colors.border, true: Colors.primaryMid }}
              thumbColor="#ffffff"
            />
          </View>
        </View>
      </View>

      {MENU_SECTIONS.map(section => (
        <View key={section.label} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: Colors.muted }]}>{section.label}</Text>
          <View style={[styles.card, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            {section.items.map((item, i) => (
              <TouchableOpacity
                key={item.route}
                style={[
                  styles.item,
                  i < section.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: isDark ? Colors.border : '#F1EDE8' },
                ]}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: Colors.accentLight }]}>
                  <Ionicons name={item.icon} size={22} color={Colors.primary} />
                </View>
                <View style={styles.itemBody}>
                  <Text style={[styles.itemTitle, { color: Colors.text }]}>{item.title}</Text>
                  <Text style={[styles.itemSub, { color: Colors.muted }]}>{item.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content:      { padding: 16, paddingBottom: 48 },
  section:      { marginBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, paddingHorizontal: 4 },
  card:         { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  item:         { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  iconWrap:     { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  itemBody:     { flex: 1 },
  itemTitle:    { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  itemSub:      { fontSize: 12 },
});
