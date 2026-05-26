import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

export default function AbsencesScreen() {
  const Colors = useTheme();
  const { user } = useAuth();

  const [classCount,   setClassCount]   = useState(0);
  const [meetingCount, setMeetingCount] = useState(0);
  const [plcCount,     setPlcCount]     = useState(0);
  const [remedialCount,setRemedialCount]= useState(0);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [absRes, meetRes, plcRes, remRes] = await Promise.allSettled([
        api.get(`/api/absences/teacher/${user.id}`),
        api.get('/api/meetings/my-absences'),
        api.get('/api/plc/my-absences'),
        api.get(`/api/remedial/teacher/${user.id}`),
      ]);
      if (absRes.status  === 'fulfilled') setClassCount(Array.isArray(absRes.value.data)  ? absRes.value.data.length  : 0);
      if (meetRes.status === 'fulfilled') setMeetingCount(Array.isArray(meetRes.value.data) ? meetRes.value.data.length : 0);
      if (plcRes.status  === 'fulfilled') setPlcCount(Array.isArray(plcRes.value.data)   ? plcRes.value.data.length   : 0);
      if (remRes.status  === 'fulfilled') setRemedialCount(Array.isArray(remRes.value.data) ? remRes.value.data.length : 0);
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
      title: 'Class Absences',
      count: classCount,
      subtitle: classCount === 1 ? 'unresolved absence' : 'unresolved absences',
      accent: '#DC2626',
      href: '/absences/list',
    },
    {
      icon: '🤝',
      title: 'Meeting Absences',
      count: meetingCount,
      subtitle: meetingCount === 1 ? 'recorded absence' : 'recorded absences',
      accent: '#D97706',
      href: '/absences/meetings',
    },
    {
      icon: '👥',
      title: 'PLC Absences',
      count: plcCount,
      subtitle: plcCount === 1 ? 'recorded absence' : 'recorded absences',
      accent: '#7C3AED',
      href: '/absences/plc-absences',
    },
    {
      icon: '📅',
      title: 'Remedial Lessons',
      count: remedialCount,
      subtitle: remedialCount === 1 ? 'lesson scheduled' : 'lessons scheduled',
      accent: Colors.primary,
      href: '/absences/remedials',
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.heading}>Absences</Text>
        <Text style={styles.sub}>Your absence record by category</Text>
      </View>

      {loading
        ? [1, 2, 3, 4].map(i => <View key={i} style={styles.skeleton} />)
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
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => router.push(card.href as any)}
              >
                <Text style={styles.viewBtnText}>View Details</Text>
              </TouchableOpacity>
            </View>
          ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F4EFE6' },
  content:     { padding: 16, paddingBottom: 40 },
  header:      { marginBottom: 20 },
  heading:     { fontSize: 20, fontWeight: '800', color: '#2C2218', letterSpacing: -0.3 },
  sub:         { fontSize: 13, color: '#8C7E6E', marginTop: 2 },
  skeleton:    { backgroundColor: '#E5DDD5', borderRadius: 16, height: 120, marginBottom: 16 },
  card:        { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 20, marginBottom: 16 },
  cardTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle:   { fontSize: 11, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.6 },
  cardIcon:    { fontSize: 20 },
  countRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 16 },
  count:       { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  countSub:    { fontSize: 13, color: '#8C7E6E', marginBottom: 6 },
  viewBtn:     { paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2D9CC', backgroundColor: '#F4EFE6', alignItems: 'center' },
  viewBtnText: { fontSize: 13, fontWeight: '700', color: '#4A3F32' },
});
