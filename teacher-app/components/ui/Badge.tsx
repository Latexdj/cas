import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';

const palette: Record<string, { bg: string; text: string }> = {
  present:              { bg: Colors.successLight, text: Colors.success },
  Verified:             { bg: Colors.successLight, text: Colors.success },
  'Made Up':            { bg: Colors.successLight, text: Colors.success },
  Completed:            { bg: Colors.successLight, text: Colors.success },
  Approved:             { bg: Colors.successLight, text: Colors.success },
  upcoming:             { bg: Colors.primaryLight,  text: Colors.primary },
  Scheduled:            { bg: Colors.primaryLight,  text: Colors.primary },
  in_session:           { bg: Colors.warningLight,  text: Colors.warning },
  'Remedial Scheduled': { bg: Colors.warningLight,  text: Colors.warning },
  Pending:              { bg: Colors.warningLight,  text: Colors.warning },
  Absent:               { bg: Colors.dangerLight,   text: Colors.danger },
  Rejected:             { bg: Colors.dangerLight,   text: Colors.danger },
  Excused:              { bg: '#EDE9FB',             text: '#5B21B6' },
  Cancelled:            { bg: '#F0EDE8',             text: Colors.muted },
  Cleared:              { bg: '#F0EDE8',             text: Colors.muted },
};

export function Badge({ status }: { status: string }) {
  const c     = palette[status] ?? { bg: '#F0EDE8', text: Colors.muted };
  const label = status === 'in_session' ? 'In Session' : status;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  text:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});
