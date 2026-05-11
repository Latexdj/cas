import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { TimetableSlot, AttendanceRecord } from '@/types/api';

interface Props {
  slot: TimetableSlot;
  submitted: AttendanceRecord[];
  onPress?: () => void;
}

function isSubmitted(slot: TimetableSlot, submitted: AttendanceRecord[]) {
  return submitted.some((a) => {
    const subjectMatch = a.subject.toLowerCase() === slot.subject.toLowerCase();
    const classes = a.class_names.split(',').map((c) => c.trim().toLowerCase());
    return subjectMatch && classes.includes(slot.class_name.toLowerCase());
  });
}

export function TimetableSlotCard({ slot, submitted, onPress }: Props) {
  const Colors = useTheme();
  const done = isSubmitted(slot, submitted);

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} disabled={done} style={[styles.card, done && styles.cardDone]}>
      <View style={[styles.bar, { backgroundColor: done ? '#2D7A4F' : Colors.accent }]} />
      <View style={styles.body}>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={13} color="#8C7E6E" style={{ marginRight: 4 }} />
          <Text style={styles.time}>{slot.start_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5)}</Text>
        </View>
        <Text style={styles.subject}>{slot.subject}</Text>
        <Text style={styles.className}>{slot.class_name}</Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: done ? '#E4F4EB' : Colors.accentLight }]}>
        {done
          ? <Ionicons name="checkmark-circle" size={18} color="#2D7A4F" />
          : <Ionicons name="arrow-forward-circle-outline" size={18} color={Colors.accent} />
        }
        <Text style={[styles.statusText, { color: done ? '#2D7A4F' : Colors.accent }]}>
          {done ? 'Done' : 'Submit'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E2D9CC', shadowColor: '#1C1208', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, overflow: 'hidden' },
  cardDone:   { opacity: 0.7 },
  bar:        { width: 5, alignSelf: 'stretch' },
  body:       { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  timeRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  time:       { fontSize: 12, color: '#8C7E6E', fontWeight: '600' },
  subject:    { fontSize: 16, fontWeight: '700', color: '#1C1208', letterSpacing: -0.2 },
  className:  { fontSize: 13, color: '#4A3F32', marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, marginRight: 12, borderRadius: 10 },
  statusText: { fontSize: 12, fontWeight: '700' },
});
