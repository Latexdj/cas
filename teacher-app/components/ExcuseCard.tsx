import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Colors } from '@/constants/colors';
import { TeacherExcuse } from '@/types/api';

interface Props {
  excuse: TeacherExcuse;
}

export function ExcuseCard({ excuse }: Props) {
  const fmt = (d: string) => {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const dateLabel = excuse.date_from.slice(0, 10) === excuse.date_to.slice(0, 10)
    ? fmt(excuse.date_from)
    : `${fmt(excuse.date_from)} – ${fmt(excuse.date_to)}`;

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.type}>{excuse.type}</Text>
        <Badge status={excuse.status} />
      </View>
      <Text style={styles.dates}>{dateLabel}</Text>
      <Text style={styles.reason} numberOfLines={2}>"{excuse.reason}"</Text>
      {excuse.approved_by_name ? (
        <Text style={styles.approver}>
          {excuse.status === 'Approved' ? 'Approved' : 'Reviewed'} by {excuse.approved_by_name}
        </Text>
      ) : excuse.status === 'Pending' ? (
        <Text style={styles.pending}>Awaiting admin approval</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  type:     { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 8 },
  dates:    { fontSize: 13, color: Colors.muted, marginBottom: 4 },
  reason:   { fontSize: 13, color: Colors.textSoft, fontStyle: 'italic' },
  approver: { fontSize: 12, color: Colors.muted, marginTop: 6 },
  pending:  { fontSize: 12, color: Colors.warning, marginTop: 6, fontWeight: '600' },
});
