import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Colors } from '@/constants/colors';
import { RemedialLesson } from '@/types/api';

export function RemedialCard({ lesson }: { lesson: RemedialLesson }) {
  const absenceDate  = new Date(lesson.original_absence_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const remedialDate = new Date(lesson.remedial_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time         = lesson.remedial_time?.slice(0, 5) ?? '';

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={styles.subject}>{lesson.subject}</Text>
          <Text style={styles.meta}>{lesson.class_name}</Text>
        </View>
        <Badge status={lesson.status} />
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Original absence</Text>
          <Text style={styles.detailValue}>{absenceDate}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Remedial date</Text>
          <Text style={styles.detailValue}>{remedialDate} at {time}</Text>
        </View>
        {lesson.location_name ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{lesson.location_name}</Text>
          </View>
        ) : null}
        {lesson.topic ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Topic</Text>
            <Text style={styles.detailValue}>{lesson.topic}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  info:        { flex: 1, marginRight: 8 },
  subject:     { fontSize: 15, fontWeight: '600', color: Colors.text },
  meta:        { fontSize: 13, color: Colors.muted, marginTop: 2 },
  details:     { gap: 6 },
  detailRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { fontSize: 13, color: Colors.muted },
  detailValue: { fontSize: 13, color: Colors.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
});
