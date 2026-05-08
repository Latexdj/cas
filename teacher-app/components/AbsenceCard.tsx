import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Colors } from '@/constants/colors';
import { AbsenceRecord } from '@/types/api';

interface Props {
  absence: AbsenceRecord;
  onAddReason?: () => void;
  onScheduleRemedial?: () => void;
}

export function AbsenceCard({ absence, onAddReason, onScheduleRemedial }: Props) {
  const date = new Date(absence.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const canAct = absence.status === 'Absent';

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={styles.subject}>{absence.subject}</Text>
          <Text style={styles.meta}>{absence.class_name} · {date}</Text>
          {absence.reason ? <Text style={styles.reason}>"{absence.reason}"</Text> : null}
        </View>
        <Badge status={absence.status} />
      </View>
      {canAct && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btn} onPress={onAddReason}>
            <Text style={styles.btnText}>Add Reason</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onScheduleRemedial}>
            <Text style={[styles.btnText, styles.btnPrimaryText]}>Schedule Remedial</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  info:          { flex: 1, marginRight: 8 },
  subject:       { fontSize: 15, fontWeight: '600', color: Colors.text },
  meta:          { fontSize: 13, color: Colors.muted, marginTop: 2 },
  reason:        { fontSize: 13, color: Colors.text, marginTop: 6, fontStyle: 'italic' },
  actions:       { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn:           { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnText:       { fontSize: 13, fontWeight: '600', color: Colors.text },
  btnPrimary:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  btnPrimaryText:{ color: '#fff' },
});
