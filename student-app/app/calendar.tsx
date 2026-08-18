import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { CalendarEvent } from '@/types/api';

const TYPE_COLOR: Record<string, { color: string; bg: string }> = {
  holiday:    { color: '#145C44', bg: '#DCFCE7' },
  exam:       { color: '#DC2626', bg: '#FEE2E2' },
  event:      { color: '#1D4ED8', bg: '#DBEAFE' },
  sports:     { color: '#D97706', bg: '#FEF3C7' },
  meeting:    { color: '#7C3AED', bg: '#EDE9FE' },
};

export default function CalendarScreen() {
  const C = useTheme();
  const [events,     setEvents]     = useState<CalendarEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const from = new Date().toISOString().split('T')[0];
      const to   = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data } = await api.get<CalendarEvent[]>('/api/student/calendar', { params: { from, to } });
      setEvents(data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Spinner message="Loading calendar…" />;

  // Group by month
  const byMonth: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const key = ev.date.substring(0, 7); // YYYY-MM
    (byMonth[key] ??= []).push(ev);
  }

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
    >
      {events.length === 0 && (
        <Text style={[s.empty, { color: C.muted }]}>No upcoming events in the next 4 months.</Text>
      )}
      {Object.entries(byMonth).map(([month, evs]) => (
        <View key={month} style={s.monthBlock}>
          <Text style={[s.monthTitle, { color: C.textSoft }]}>
            {new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </Text>
          <Card padded={false} style={s.monthCard}>
            {evs.map((ev, i) => {
              const sc = TYPE_COLOR[ev.type] ?? { color: C.muted, bg: C.surfaceWarm };
              const isPast = new Date(ev.date) < new Date(new Date().toDateString());
              return (
                <View key={ev.id} style={[s.eventRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }, isPast && s.pastRow]}>
                  <View style={s.dateCol}>
                    <Text style={[s.dayNum, { color: isPast ? C.muted : C.primary }]}>
                      {new Date(ev.date).getDate()}
                    </Text>
                    <Text style={[s.dayName, { color: C.muted }]}>
                      {new Date(ev.date).toLocaleDateString('en-GB', { weekday: 'short' })}
                    </Text>
                  </View>
                  <View style={[s.accent_, { backgroundColor: isPast ? C.border : C.accent }]} />
                  <View style={s.eventBody}>
                    <Text style={[s.eventName, { color: isPast ? C.muted : C.text }]}>{ev.name}</Text>
                    {ev.notes && <Text style={[s.eventNotes, { color: C.muted }]} numberOfLines={2}>{ev.notes}</Text>}
                  </View>
                  <View style={[s.typeBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[s.typeText, { color: sc.color }]}>{ev.type}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  flex:        { flex: 1 },
  monthBlock:  { marginBottom: 20 },
  monthTitle:  { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  monthCard:   { overflow: 'hidden' },
  eventRow:    { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  pastRow:     { opacity: 0.5 },
  dateCol:     { width: 36, alignItems: 'center' },
  dayNum:      { fontSize: 18, fontWeight: '900' },
  dayName:     { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  accent_:     { width: 3, height: 40, borderRadius: 2 },
  eventBody:   { flex: 1 },
  eventName:   { fontSize: 14, fontWeight: '700' },
  eventNotes:  { fontSize: 12, marginTop: 3, lineHeight: 16 },
  typeBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typeText:    { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  empty:       { textAlign: 'center', marginTop: 48, fontSize: 14 },
});
