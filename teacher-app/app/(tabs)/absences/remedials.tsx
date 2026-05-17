import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { RemedialLesson } from '@/types/api';

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RemedialsScreen() {
  const Colors = useTheme();
  const { user } = useAuth();
  const [remedials,  setRemedials]  = useState<RemedialLesson[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get(`/api/remedial/teacher/${user.id}`);
      setRemedials(Array.isArray(res.data) ? res.data : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {loading
        ? [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
        : remedials.length === 0
        ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyTitle}>No remedial lessons</Text>
            <Text style={styles.emptySub}>Schedule one from an outstanding absence</Text>
          </View>
        )
        : remedials.map(rem => (
          <View key={rem.id} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.flex1}>
                <Text style={styles.subject}>{rem.subject} — {rem.class_name}</Text>
                <Text style={styles.meta}>
                  {fmt(rem.remedial_date)} at {rem.remedial_time?.slice(0, 5)}
                  {rem.duration_periods
                    ? ` · ${rem.duration_periods} period${rem.duration_periods !== 1 ? 's' : ''}`
                    : ''}
                </Text>
                {rem.topic ? <Text style={styles.topic}>{rem.topic}</Text> : null}
                {rem.location_name ? <Text style={styles.meta}>{rem.location_name}</Text> : null}
              </View>
              <View style={[styles.badge, { backgroundColor: `${Colors.primary}20` }]}>
                <Text style={[styles.badgeText, { color: Colors.primary }]}>{rem.status}</Text>
              </View>
            </View>
          </View>
        ))
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F4EFE6' },
  content:    { padding: 16, paddingBottom: 40 },
  skeleton:   { backgroundColor: '#E5DDD5', borderRadius: 16, height: 96, marginBottom: 12 },
  empty:      { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 32, alignItems: 'center' },
  emptyIcon:  { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#2C2218' },
  emptySub:   { fontSize: 13, color: '#8C7E6E', marginTop: 4 },
  card:       { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 16, marginBottom: 12 },
  cardRow:    { flexDirection: 'row', alignItems: 'flex-start' },
  flex1:      { flex: 1, marginRight: 12 },
  subject:    { fontSize: 14, fontWeight: '700', color: '#2C2218' },
  meta:       { fontSize: 12, color: '#8C7E6E', marginTop: 2 },
  topic:      { fontSize: 12, color: '#4A3F32', fontStyle: 'italic', marginTop: 4 },
  badge:      { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:  { fontSize: 12, fontWeight: '700' },
});
