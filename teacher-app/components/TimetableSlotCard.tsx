import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Colors } from '@/constants/colors';
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
  const done   = isSubmitted(slot, submitted);
  const status = done ? 'present' : 'upcoming';

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} disabled={done}>
      <Card style={done ? styles.done : undefined}>
        <View style={styles.row}>
          <View style={styles.timeCol}>
            <Text style={styles.time}>{slot.start_time?.slice(0, 5)}</Text>
            <Text style={styles.timeSep}>–</Text>
            <Text style={styles.time}>{slot.end_time?.slice(0, 5)}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.subject}>{slot.subject}</Text>
            <Text style={styles.className}>{slot.class_name}</Text>
          </View>
          <Badge status={status} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  done:      { opacity: 0.65 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeCol:   { alignItems: 'center', minWidth: 52 },
  time:      { fontSize: 13, fontWeight: '600', color: Colors.primary },
  timeSep:   { fontSize: 11, color: Colors.muted },
  info:      { flex: 1 },
  subject:   { fontSize: 15, fontWeight: '600', color: Colors.text },
  className: { fontSize: 13, color: Colors.muted, marginTop: 2 },
});
