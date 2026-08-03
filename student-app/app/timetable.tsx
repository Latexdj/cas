import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { TimetableRow } from '@/types/api';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function TimetableScreen() {
  const C = useTheme();
  const [rows,       setRows]       = useState<TimetableRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<TimetableRow[]>('/api/student/timetable');
      setRows(data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Spinner message="Loading timetable…" />;

  const byDay = DAYS.reduce<Record<string, TimetableRow[]>>((acc, d) => {
    acc[d] = rows.filter(r => r.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
    return acc;
  }, {});

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
    >
      {(rows.length === 0 || DAYS.every(d => !byDay[d]?.length)) && (
        <Text style={[s.empty, { color: C.muted }]}>No timetable found for your class.</Text>
      )}
      {DAYS.map(day => {
        const periods = byDay[day];
        if (!periods?.length) return null;
        const isToday = day === today;
        return (
          <View key={day} style={s.dayBlock}>
            <View style={s.dayHeader}>
              <Text style={[s.dayName, { color: isToday ? C.primary : C.textSoft }]}>{day}</Text>
              {isToday && <View style={[s.todayDot, { backgroundColor: C.accent }]} />}
            </View>
            <Card padded={false} style={[s.dayCard, isToday && { borderColor: C.primary, borderWidth: 1.5 }]}>
              {periods.map((row, i) => (
                <View key={i} style={[s.periodRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                  <View style={[s.timeCol, { backgroundColor: isToday ? C.primaryLight : C.surfaceWarm }]}>
                    <Text style={[s.timeStart, { color: C.primary }]}>{fmt(row.start_time)}</Text>
                    <Text style={[s.timeEnd, { color: C.muted }]}>{fmt(row.end_time)}</Text>
                  </View>
                  <View style={s.subjectCol}>
                    <Text style={[s.subject, { color: C.text }]}>{row.subject}</Text>
                    {row.teacher_name && <Text style={[s.teacher, { color: C.muted }]}>{row.teacher_name}</Text>}
                    {row.room && <Text style={[s.room, { color: C.muted }]}>Room {row.room}</Text>}
                  </View>
                </View>
              ))}
            </Card>
          </View>
        );
      })}
    </ScrollView>
  );
}

function fmt(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const s = StyleSheet.create({
  flex:       { flex: 1 },
  dayBlock:   { marginBottom: 20 },
  dayHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dayName:    { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  todayDot:   { width: 8, height: 8, borderRadius: 4 },
  dayCard:    { overflow: 'hidden' },
  periodRow:  { flexDirection: 'row' },
  timeCol:    { width: 72, padding: 12, alignItems: 'center', justifyContent: 'center' },
  timeStart:  { fontSize: 13, fontWeight: '800' },
  timeEnd:    { fontSize: 11, marginTop: 2 },
  subjectCol: { flex: 1, padding: 12, justifyContent: 'center' },
  subject:    { fontSize: 14, fontWeight: '700' },
  teacher:    { fontSize: 12, marginTop: 2 },
  room:       { fontSize: 11, marginTop: 1 },
  empty:      { textAlign: 'center', marginTop: 48, fontSize: 14 },
});
