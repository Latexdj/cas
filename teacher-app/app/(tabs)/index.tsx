import React, { useCallback, useState } from 'react';
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
  const [slots,      setSlots]      = useState<TimetableSlot[]>([]);
  const [submitted,  setSubmitted]  = useState<AttendanceRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
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
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const today    = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const pending  = slots.length - submitted.length;
  const firstName = user?.name?.split(' ')[0] ?? '';

  if (!user)   return <Spinner message="Loading…" />;
  if (loading) return <Spinner />;

  return (
    <View style={styles.root}>
      {/* Header band */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good day, {firstName}</Text>
          <Text style={styles.date}>{today}</Text>
        </View>
        <View style={styles.avatarSmall}>
          <Text style={styles.avatarLetter}>{firstName.charAt(0)}</Text>
        </View>
      </View>

      {/* Stats strip */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{slots.length}</Text>
          <Text style={styles.statLabel}>Lessons</Text>
        </View>
        <View style={[styles.stat, styles.statDivider]}>
          <Text style={[styles.statNum, { color: Colors.success }]}>{submitted.length}</Text>
          <Text style={styles.statLabel}>Submitted</Text>
        </View>
        <View style={[styles.stat, styles.statDivider]}>
          <Text style={[styles.statNum, { color: pending > 0 ? Colors.danger : Colors.muted }]}>{pending}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Today's Timetable</Text>

      <FlatList
        data={slots}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <TimetableSlotCard
            slot={item}
            submitted={submitted}
            onPress={() => router.push({
              pathname: '/(tabs)/submit',
              params: { slotId: item.id, subject: item.subject, className: item.class_name, periods: item.periods },
            })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListEmptyComponent={<EmptyState icon="📅" title="No lessons today" subtitle="Your timetable has no entries for today." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: Colors.bg },

  header:       {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting:     { fontSize: 21, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  date:         { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  avatarSmall:  { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: '#fff' },

  statsRow:     {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: -16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#1C1208',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  stat:         { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statDivider:  { borderLeftWidth: 1, borderLeftColor: Colors.border },
  statNum:      { fontSize: 24, fontWeight: '800', color: Colors.text },
  statLabel:    { fontSize: 11, color: Colors.muted, marginTop: 3, fontWeight: '600', letterSpacing: 0.3 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 8 },
  list:         { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
});
