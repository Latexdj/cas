import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

export default function AbsencesScreen() {
  const Colors = useTheme();
  const { user } = useAuth();

  const [absenceCount,  setAbsenceCount]  = useState(0);
  const [remedialCount, setRemedialCount] = useState(0);
  const [leaveTotal,    setLeaveTotal]    = useState(0);
  const [leavePending,  setLeavePending]  = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [absRes, remRes, levRes] = await Promise.allSettled([
        api.get(`/api/absences/teacher/${user.id}`),
        api.get(`/api/remedial/teacher/${user.id}`),
        api.get('/api/teacher-excuses'),
      ]);
      if (absRes.status === 'fulfilled') setAbsenceCount(Array.isArray(absRes.value.data) ? absRes.value.data.length : 0);
      if (remRes.status === 'fulfilled') setRemedialCount(Array.isArray(remRes.value.data) ? remRes.value.data.length : 0);
      if (levRes.status === 'fulfilled') {
        const arr = Array.isArray(levRes.value.data) ? levRes.value.data : [];
        setLeaveTotal(arr.length);
        setLeavePending(arr.filter((l: any) => l.status === 'Pending').length);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const cards = [
    {
      icon: '⚠️',
      title: 'Outstanding Absences',
      count: absenceCount,
      subtitle: absenceCount === 1 ? 'unresolved absence' : 'unresolved absences',
      accent: '#DC2626',
      href: '/absences/list',
      requestHref: null,
    },
    {
      icon: '📅',
      title: 'Remedial Lessons',
      count: remedialCount,
      subtitle: remedialCount === 1 ? 'lesson scheduled' : 'lessons scheduled',
      accent: Colors.primary,
      href: '/absences/remedials',
      requestHref: null,
    },
    {
      icon: '📋',
      title: 'Leave Requests',
      count: leaveTotal,
      subtitle: leavePending > 0 ? `${leavePending} pending approval` : 'no pending requests',
      accent: '#D97706',
      href: '/absences/leaves',
      requestHref: '/absences/leaves',
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.heading}>Absences &amp; Leave</Text>
        <Text style={styles.sub}>Overview of your attendance record</Text>
      </View>

      {loading
        ? [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
        : cards.map(card => (
            <View key={card.title} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardIcon}>{card.icon}</Text>
              </View>
              <View style={styles.countRow}>
                <Text style={[styles.count, { color: card.accent }]}>{card.count}</Text>
                <Text style={styles.countSub}>{card.subtitle}</Text>
              </View>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() => router.push(card.href as any)}
                >
                  <Text style={styles.viewBtnText}>View</Text>
                </TouchableOpacity>
                {card.requestHref && (
                  <TouchableOpacity
                    style={[styles.requestBtn, { backgroundColor: Colors.primary }]}
                    onPress={() => router.push({ pathname: card.requestHref as any, params: { openForm: '1' } })}
                  >
                    <Text style={styles.requestBtnText}>+ Request Leave</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F4EFE6' },
  content:        { padding: 16, paddingBottom: 40 },
  header:         { marginBottom: 20 },
  heading:        { fontSize: 20, fontWeight: '800', color: '#2C2218', letterSpacing: -0.3 },
  sub:            { fontSize: 13, color: '#8C7E6E', marginTop: 2 },
  skeleton:       { backgroundColor: '#E5DDD5', borderRadius: 16, height: 140, marginBottom: 16 },
  card:           { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 20, marginBottom: 16 },
  cardTop:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle:      { fontSize: 11, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.6 },
  cardIcon:       { fontSize: 20 },
  countRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 20 },
  count:          { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  countSub:       { fontSize: 13, color: '#8C7E6E', marginBottom: 6 },
  btnRow:         { flexDirection: 'row', gap: 8 },
  viewBtn:        { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2D9CC', backgroundColor: '#F4EFE6', alignItems: 'center' },
  viewBtnText:    { fontSize: 13, fontWeight: '700', color: '#4A3F32' },
  requestBtn:     { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  requestBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
