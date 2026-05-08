import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';

type Status = 'Absent' | 'Remedial Scheduled' | 'Made Up' | 'Cleared' | 'Verified'
            | 'present' | 'upcoming' | 'in_session' | 'Scheduled' | 'Completed' | 'Cancelled';

const palette: Record<string, { bg: string; text: string }> = {
  present:            { bg: '#D1FAE5', text: Colors.success },
  Verified:           { bg: '#D1FAE5', text: Colors.success },
  'Made Up':          { bg: '#D1FAE5', text: Colors.success },
  Completed:          { bg: '#D1FAE5', text: Colors.success },
  upcoming:           { bg: '#EFF6FF', text: Colors.primary },
  Scheduled:          { bg: '#EFF6FF', text: Colors.primary },
  in_session:         { bg: '#FEF3C7', text: '#92400E' },
  'Remedial Scheduled': { bg: '#FEF3C7', text: '#92400E' },
  Absent:             { bg: '#FEE2E2', text: Colors.danger },
  Cancelled:          { bg: '#F3F4F6', text: Colors.muted },
  Cleared:            { bg: '#F3F4F6', text: Colors.muted },
};

export function Badge({ status }: { status: Status | string }) {
  const colors = palette[status] ?? { bg: '#F3F4F6', text: Colors.muted };
  const label  = status === 'in_session' ? 'In Session' : status;
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  text:  { fontSize: 12, fontWeight: '600' },
});
