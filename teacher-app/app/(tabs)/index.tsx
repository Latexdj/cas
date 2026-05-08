import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { TimetableSlotCard } from '@/components/TimetableSlotCard';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors } from '@/constants/colors';
import { TimetableSlot, AttendanceRecord } from '@/types/api';

export default function HomeScreen() {
  const { user } = useAuth();
  const [slots,     setSlots]     = useState<TimetableSlot[]>([]);
  const [submitted, setSubmitted] = useState<AttendanceRecord[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [ttRes, attRes] = await Promise.all([
        api.get(`/api/timetable/today/${user.id}`),
        api.get(`/api/attendance/today/${user.id}`),
      ]);
      setSlots(ttRes.data);
      setSubmitted(attRes.data);
    } catch {
      // silently fail — user sees empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  if (!user)   return <Spinner message="Redirecting…" />;
  if (loading) return <Spinner />;

  return (
    <View style={styles.container}>
      <View style={styles.greeting}>
        <Text style={styles.name}>Hello, {user?.name?.split(' ')[0]} 👋</Text>
        <Text style={styles.date}>{today}</Text>
      </View>

      <View style={styles.summary}>
        <View style={styles.pill}>
          <Text style={styles.pillNum}>{slots.length}</Text>
          <Text style={styles.pillLabel}>Lessons</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: '#D1FAE5' }]}>
          <Text style={[styles.pillNum, { color: Colors.success }]}>{submitted.length}</Text>
          <Text style={styles.pillLabel}>Submitted</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: '#FEE2E2' }]}>
          <Text style={[styles.pillNum, { color: Colors.danger }]}>{slots.length - submitted.length}</Text>
          <Text style={styles.pillLabel}>Pending</Text>
        </View>
      </View>

      <FlatList
        data={slots}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <TimetableSlotCard
            slot={item}
            submitted={submitted}
            onPress={() => router.push({ pathname: '/(tabs)/submit', params: { slotId: item.id, subject: item.subject, className: item.class_name, periods: item.periods } })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon="📅" title="No lessons today" subtitle="You have no timetable entries for today." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.bg },
  greeting:   { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  name:       { fontSize: 22, fontWeight: '700', color: '#fff' },
  date:       { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  summary:    { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 4 },
  pill:       { flex: 1, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, alignItems: 'center' },
  pillNum:    { fontSize: 22, fontWeight: '700', color: Colors.primary },
  pillLabel:  { fontSize: 12, color: Colors.muted, marginTop: 2 },
  list:       { padding: 16, paddingTop: 8, flexGrow: 1 },
});
