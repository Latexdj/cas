import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { TimetableSlotCard } from '@/components/TimetableSlotCard';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors } from '@/constants/colors';
import { TimetableSlot, AttendanceRecord, SchoolCalendarEntry } from '@/types/api';

const EVENT_COLORS: Record<SchoolCalendarEntry['type'], { bg: string; text: string }> = {
  Holiday:       { bg: '#FEF3DC', text: Colors.warning },
  'School Event':{ bg: Colors.primaryLight, text: Colors.primary },
  'Closed Day':  { bg: Colors.dangerLight,  text: Colors.danger  },
};

function UpcomingEventsSection({ events }: { events: SchoolCalendarEntry[] }) {
  if (events.length === 0) return null;
  return (
    <View style={eventStyles.section}>
      <Text style={eventStyles.header}>Upcoming School Events</Text>
      {events.map(e => {
        const cfg  = EVENT_COLORS[e.type] ?? { bg: '#F0EDE8', text: Colors.muted };
        const date = new Date(e.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        return (
          <View key={e.id} style={eventStyles.card}>
            <View style={[eventStyles.typePill, { backgroundColor: cfg.bg }]}>
              <Text style={[eventStyles.typeText, { color: cfg.text }]}>{e.type}</Text>
            </View>
            <View style={eventStyles.body}>
              <Text style={eventStyles.name}>{e.name}</Text>
              <Text style={eventStyles.date}>{date}</Text>
              {e.notes ? <Text style={eventStyles.notes}>{e.notes}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const eventStyles = StyleSheet.create({
  section:  { paddingHorizontal: 16, paddingBottom: 24, marginTop: 8 },
  header:   { fontSize: 12, fontWeight: '700', color: '#8C7E6E', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  card:     { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2D9CC', flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  typePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginTop: 2 },
  typeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  body:     { flex: 1 },
  name:     { fontSize: 14, fontWeight: '700', color: '#1C1208' },
  date:     { fontSize: 12, color: '#8C7E6E', marginTop: 2 },
  notes:    { fontSize: 12, color: '#4A3F32', marginTop: 4, fontStyle: 'italic' },
});

export default function HomeScreen() {
  const themeColors = useTheme();
  const { user } = useAuth();
  const [slots,      setSlots]      = useState<TimetableSlot[]>([]);
  const [submitted,  setSubmitted]  = useState<AttendanceRecord[]>([]);
  const [events,     setEvents]     = useState<SchoolCalendarEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const from = new Date().toISOString().slice(0, 10);
    const to   = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    try {
      const [ttRes, attRes, evRes] = await Promise.allSettled([
        api.get(`/api/timetable/today/${user.id}`),
        api.get(`/api/attendance/today/${user.id}`),
        api.get('/api/school-calendar', { params: { from, to } }),
      ]);
      if (ttRes.status  === 'fulfilled') setSlots(ttRes.value.data);
      if (attRes.status === 'fulfilled') setSubmitted(attRes.value.data);
      if (evRes.status  === 'fulfilled') setEvents(evRes.value.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const today     = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const pending   = slots.length - submitted.length;
  const firstName = user?.name?.split(' ')[0] ?? '';

  if (!user)   return <Spinner />;
  if (loading) return <Spinner />;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { backgroundColor: themeColors.primary }]}>
        <View>
          <Text style={styles.greeting}>Good day, {firstName}</Text>
          <Text style={styles.date}>{today}</Text>
        </View>
        <View style={[styles.avatarSmall, { backgroundColor: themeColors.accent }]}>
          <Text style={styles.avatarLetter}>{firstName.charAt(0)}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{slots.length}</Text>
          <Text style={styles.statLabel}>Lessons</Text>
        </View>
        <View style={[styles.stat, styles.statDivider]}>
          <Text style={[styles.statNum, { color: '#2D7A4F' }]}>{submitted.length}</Text>
          <Text style={styles.statLabel}>Submitted</Text>
        </View>
        <View style={[styles.stat, styles.statDivider]}>
          <Text style={[styles.statNum, { color: pending > 0 ? '#B83232' : '#8C7E6E' }]}>{pending}</Text>
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
              params: { slotId: item.id },
            })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.accent} />}
        ListEmptyComponent={<EmptyState icon="📅" title="No lessons today" subtitle="Your timetable has no entries for today." />}
        ListFooterComponent={<UpcomingEventsSection events={events} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#F4EFE6' },
  header:      { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting:    { fontSize: 21, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  date:        { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  avatarSmall: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  avatarLetter:{ fontSize: 18, fontWeight: '800', color: '#fff' },
  statsRow:    { flexDirection: 'row', backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: -16, borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', shadowColor: '#1C1208', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, marginBottom: 20 },
  stat:        { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: '#E2D9CC' },
  statNum:     { fontSize: 24, fontWeight: '800', color: '#1C1208' },
  statLabel:   { fontSize: 11, color: '#8C7E6E', marginTop: 3, fontWeight: '600', letterSpacing: 0.3 },
  sectionLabel:{ fontSize: 12, fontWeight: '700', color: '#8C7E6E', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 8 },
  list:        { paddingHorizontal: 16, paddingBottom: 8, flexGrow: 1 },
});
