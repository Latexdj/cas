import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from './ui/Card';
import { Colors } from '@/constants/colors';
import { AttendanceRecord } from '@/types/api';

export function AttendanceCard({ record }: { record: AttendanceRecord }) {
  const date = new Date(record.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.datePill}>
          <Text style={styles.dateText}>{date}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.subject}>{record.subject}</Text>
          <Text style={styles.meta}>{record.class_names} · {record.periods} period{record.periods !== 1 ? 's' : ''}</Text>
          {record.topic ? <Text style={styles.topic}>{record.topic}</Text> : null}
        </View>
        {record.location_verified && (
          <Text style={styles.verified}>✓ GPS</Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  datePill:  { backgroundColor: Colors.bg, borderRadius: 8, padding: 8, alignItems: 'center', minWidth: 64 },
  dateText:  { fontSize: 12, color: Colors.primary, fontWeight: '600', textAlign: 'center' },
  info:      { flex: 1 },
  subject:   { fontSize: 15, fontWeight: '600', color: Colors.text },
  meta:      { fontSize: 13, color: Colors.muted, marginTop: 2 },
  topic:     { fontSize: 13, color: Colors.text, marginTop: 4, fontStyle: 'italic' },
  verified:  { fontSize: 12, color: Colors.success, fontWeight: '600' },
});
