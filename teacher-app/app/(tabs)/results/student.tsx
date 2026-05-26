import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { StudentResult } from '@/types/api';

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function StudentResultScreen() {
  const Colors = useTheme();
  const { result_json, ca_label, exam_label, class_name, year_name, semester } =
    useLocalSearchParams<{
      result_json: string; ca_label: string; exam_label: string;
      class_name: string; year_name: string; semester: string;
    }>();

  const result: StudentResult = JSON.parse(result_json ?? '{}');

  return (
    <ScrollView style={[styles.container, { backgroundColor: Colors.bg }]} contentContainerStyle={styles.content}>
      {/* Summary */}
      <View style={[styles.summaryCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <Text style={[styles.studentName, { color: Colors.text }]}>{result.name}</Text>
        <Text style={[styles.studentMeta, { color: Colors.muted }]}>
          {result.student_code} · {class_name} · {year_name} · Semester {semester}
        </Text>

        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: Colors.primaryLight ?? Colors.bg }]}>
            <Text style={[styles.statLabel, { color: Colors.muted }]}>Average</Text>
            <Text style={[styles.statValue, { color: Colors.primary }]}>{result.average ?? '—'}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: Colors.bg }]}>
            <Text style={[styles.statLabel, { color: Colors.muted }]}>Position</Text>
            <Text style={[styles.statValue, { color: Colors.text }]}>
              {result.class_position ? ordinal(result.class_position) : '—'}
              {result.class_total ? ` / ${result.class_total}` : ''}
            </Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: Colors.bg }]}>
            <Text style={[styles.statLabel, { color: Colors.muted }]}>Grade</Text>
            <Text style={[styles.statValue, { color: Colors.text }]}>{result.overall_grade}</Text>
          </View>
        </View>
      </View>

      {/* Subject rows */}
      <View style={[styles.subjectCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        {/* Header */}
        <View style={[styles.subjectHeader, { borderBottomColor: Colors.border }]}>
          <Text style={[styles.subjectCol, { flex: 2, color: Colors.muted }]}>Subject</Text>
          <Text style={[styles.subjectCol, { color: Colors.muted }]}>{ca_label}</Text>
          <Text style={[styles.subjectCol, { color: Colors.muted }]}>{exam_label}</Text>
          <Text style={[styles.subjectCol, { color: Colors.muted }]}>Total</Text>
          <Text style={[styles.subjectCol, { color: Colors.muted }]}>Grd</Text>
        </View>

        {result.subjects?.map((s, i) => (
          <View
            key={s.subject}
            style={[styles.subjectRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}
          >
            <View style={{ flex: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.subjectName, { color: Colors.text }]} numberOfLines={1}>{s.subject}</Text>
                {s.is_imported && (
                  <Text style={styles.importedBadge}>IMP</Text>
                )}
              </View>
              <Text style={[styles.subjectPos, { color: Colors.muted }]}>
                {s.subject_position ? `${ordinal(s.subject_position)} / ${s.class_size}` : ''}
                {s.remark && s.remark !== '-' ? ` · ${s.remark}` : ''}
              </Text>
            </View>
            <Text style={[styles.subjectNum, { color: Colors.muted }]}>{s.ca_score ?? '—'}</Text>
            <Text style={[styles.subjectNum, { color: Colors.muted }]}>{s.exam_score ?? '—'}</Text>
            <Text style={[styles.subjectNum, { color: Colors.primary, fontWeight: '800' }]}>{s.total ?? '—'}</Text>
            <Text style={[styles.subjectNum, { color: Colors.text, fontWeight: '700' }]}>{s.grade}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  content:       { padding: 16, gap: 12, paddingBottom: 40 },
  summaryCard:   { borderRadius: 14, borderWidth: 1, padding: 14 },
  studentName:   { fontSize: 17, fontWeight: '800' },
  studentMeta:   { fontSize: 12, marginTop: 3, marginBottom: 14 },
  statsRow:      { flexDirection: 'row', gap: 8 },
  statBox:       { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  statLabel:     { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue:     { fontSize: 20, fontWeight: '800', marginTop: 3 },
  subjectCard:   { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  subjectHeader: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  subjectCol:    { flex: 1, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', textAlign: 'center' },
  subjectRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  subjectName:   { fontSize: 12, fontWeight: '700' },
  subjectPos:    { fontSize: 10, marginTop: 2 },
  subjectNum:    { flex: 1, fontSize: 13, textAlign: 'center' },
  importedBadge: { fontSize: 8, fontWeight: '800', color: '#92400E', backgroundColor: '#FEF3C7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
