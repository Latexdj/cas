import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

interface PlcAbsence {
  id: string;
  date: string;
  reason: string | null;
  status: string | null;
  session_title: string;
  start_time: string;
  end_time: string;
}

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlcAbsencesScreen() {
  const Colors = useTheme();
  const [absences,   setAbsences]   = useState<PlcAbsence[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/plc/my-absences');
      setAbsences(Array.isArray(res.data) ? res.data : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

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
        : absences.length === 0
        ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>No PLC absences</Text>
            <Text style={styles.emptySub}>You have attended all recorded PLC sessions</Text>
          </View>
        )
        : absences.map(ab => (
          <View key={ab.id} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.flex1}>
                <Text style={styles.title}>{ab.session_title}</Text>
                <Text style={styles.meta}>
                  {fmt(ab.date)} · {ab.start_time?.slice(0, 5)}–{ab.end_time?.slice(0, 5)}
                </Text>
                {ab.reason ? <Text style={styles.reason}>"{ab.reason}"</Text> : null}
              </View>
              {ab.status && (
                <View style={[styles.badge, ab.status === 'excused' ? styles.badgeExcused : styles.badgeAbsent]}>
                  <Text style={[styles.badgeText, ab.status === 'excused' ? styles.badgeExcusedText : styles.badgeAbsentText]}>
                    {ab.status.charAt(0).toUpperCase() + ab.status.slice(1)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F4EFE6' },
  content:         { padding: 16, paddingBottom: 40 },
  skeleton:        { backgroundColor: '#E5DDD5', borderRadius: 16, height: 88, marginBottom: 12 },
  empty:           { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 32, alignItems: 'center' },
  emptyIcon:       { fontSize: 32, marginBottom: 8 },
  emptyTitle:      { fontSize: 15, fontWeight: '700', color: '#2C2218' },
  emptySub:        { fontSize: 13, color: '#8C7E6E', marginTop: 4 },
  card:            { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 16, marginBottom: 12 },
  cardRow:         { flexDirection: 'row', alignItems: 'flex-start' },
  flex1:           { flex: 1 },
  title:           { fontSize: 14, fontWeight: '700', color: '#2C2218' },
  meta:            { fontSize: 12, color: '#8C7E6E', marginTop: 4 },
  reason:          { fontSize: 12, color: '#4A3F32', fontStyle: 'italic', marginTop: 4 },
  badge:           { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 10 },
  badgeAbsent:     { backgroundColor: '#FEE2E2' },
  badgeAbsentText: { color: '#991B1B' },
  badgeExcused:    { backgroundColor: '#DCFCE7' },
  badgeExcusedText:{ color: '#166534' },
  badgeText:       { fontSize: 11, fontWeight: '700' },
});
