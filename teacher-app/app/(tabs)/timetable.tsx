import React, { useCallback, useState } from 'react';
import {
  ScrollView, RefreshControl, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { TimetableSlot } from '@/types/api';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS = [1, 2, 3, 4, 5];

export default function TimetableScreen() {
  const Colors = useTheme();
  const { user } = useAuth();
  const [slots,      setSlots]      = useState<TimetableSlot[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<TimetableSlot[]>(`/api/timetable/teacher/${user.id}`);
      setSlots(res.data);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const slotsByDay = (day: number) => slots.filter(s => s.day_of_week === day);

  const today = new Date().getDay(); // 0=Sun, 1=Mon …

  if (loading) return <Spinner />;

  return (
    <View style={styles.root}>
      {/* Custom header */}
      <View style={[styles.header, { backgroundColor: Colors.primary }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Weekly Timetable</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {slots.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={48} color={Colors.primary} style={{ opacity: 0.4 }} />
            <Text style={styles.emptyTitle}>No timetable entries</Text>
            <Text style={styles.emptySub}>Your school admin hasn't added any timetable entries for you yet.</Text>
          </View>
        ) : (
          DAYS.map(day => {
            const daySlots = slotsByDay(day);
            const isToday  = day === today;
            return (
              <View key={day} style={styles.daySection}>
                <View style={[styles.dayHeader, isToday && { backgroundColor: Colors.primary + '18' }]}>
                  <Text style={[styles.dayName, isToday && { color: Colors.primary }]}>
                    {DAY_NAMES[day]}
                  </Text>
                  {isToday && (
                    <View style={[styles.todayPill, { backgroundColor: Colors.primary }]}>
                      <Text style={styles.todayPillText}>Today</Text>
                    </View>
                  )}
                  <Text style={styles.dayCount}>
                    {daySlots.length} {daySlots.length === 1 ? 'lesson' : 'lessons'}
                  </Text>
                </View>

                {daySlots.length === 0 ? (
                  <View style={styles.emptyDay}>
                    <Text style={styles.emptyDayText}>No classes</Text>
                  </View>
                ) : (
                  daySlots.map(slot => (
                    <View key={slot.id} style={[styles.slotCard, isToday && { borderLeftColor: Colors.primary, borderLeftWidth: 3 }]}>
                      <View style={styles.slotTime}>
                        <Text style={styles.slotTimeText}>{slot.start_time.slice(0, 5)}</Text>
                        <View style={styles.slotTimeLine} />
                        <Text style={styles.slotTimeText}>{slot.end_time.slice(0, 5)}</Text>
                      </View>
                      <View style={styles.slotBody}>
                        <Text style={styles.slotSubject}>{slot.subject}</Text>
                        <View style={styles.slotMeta}>
                          <Ionicons name="people-outline" size={12} color="#8C7E6E" />
                          <Text style={styles.slotClass}>{slot.class_names}</Text>
                        </View>
                        {slot.periods && slot.periods > 1 && (
                          <Text style={styles.slotPeriods}>{slot.periods} periods</Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#F4EFE6' },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 16, paddingBottom: 16 },
  backBtn:       { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle:   { flex: 1, fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -0.3 },
  content:       { padding: 16, paddingBottom: 40 },
  // Empty state
  emptyWrap:     { alignItems: 'center', paddingVertical: 60 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: '#1C1208', marginTop: 16, marginBottom: 8 },
  emptySub:      { fontSize: 13, color: '#8C7E6E', textAlign: 'center', lineHeight: 20 },
  // Day section
  daySection:    { marginBottom: 16 },
  dayHeader:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 6, backgroundColor: '#F0EDE8' },
  dayName:       { fontSize: 13, fontWeight: '800', color: '#1C1208', flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayCount:      { fontSize: 11, color: '#8C7E6E', fontWeight: '600' },
  todayPill:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginRight: 8 },
  todayPillText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  emptyDay:      { backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E2D9CC', borderStyle: 'dashed' },
  emptyDayText:  { fontSize: 13, color: '#C0B8AF', fontStyle: 'italic' },
  // Slot card
  slotCard:      { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: '#E2D9CC', overflow: 'hidden' },
  slotTime:      { width: 52, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: '#F8F5F0', gap: 2 },
  slotTimeText:  { fontSize: 10, fontWeight: '700', color: '#4A3F32', fontVariant: ['tabular-nums'] },
  slotTimeLine:  { width: 1, height: 10, backgroundColor: '#C0B8AF' },
  slotBody:      { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  slotSubject:   { fontSize: 14, fontWeight: '700', color: '#1C1208', marginBottom: 4 },
  slotMeta:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slotClass:     { fontSize: 12, color: '#8C7E6E', fontWeight: '600' },
  slotPeriods:   { fontSize: 11, color: '#A09282', marginTop: 3 },
});
