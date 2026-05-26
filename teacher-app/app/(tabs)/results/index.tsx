import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { DropdownSelect } from '@/components/DropdownSelect';
import type { AcademicYear, StudentResult } from '@/types/api';

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function ResultsIndexScreen() {
  const Colors = useTheme();

  const [years,     setYears]     = useState<AcademicYear[]>([]);
  const [classes,   setClasses]   = useState<string[]>([]);
  const [yearId,    setYearId]    = useState('');
  const [semester,  setSemester]  = useState('1');
  const [className, setClassName] = useState('');
  const [results,   setResults]   = useState<StudentResult[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [metaReady, setMetaReady] = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    Promise.all([
      api.get<AcademicYear[]>('/api/academic-years'),
      api.get<string[]>('/api/students/classes'),
    ]).then(([yRes, cRes]) => {
      setYears(yRes.data);
      const current = yRes.data.find(y => y.is_current);
      if (current) { setYearId(current.id); setSemester(String(current.current_semester ?? 1)); }
      else if (yRes.data[0]) setYearId(yRes.data[0].id);
      setClasses(cRes.data);
    }).catch(() => setError('Failed to load filters.')).finally(() => setMetaReady(true));
  }, []);

  const load = useCallback(async () => {
    if (!yearId || !className) return;
    setLoading(true); setError('');
    try {
      const { data } = await api.get<StudentResult[]>('/api/results', {
        params: { academic_year_id: yearId, semester, class_name: className },
      });
      setResults(data);
    } catch { setError('Failed to load results.'); }
    finally { setLoading(false); }
  }, [yearId, semester, className]);

  useEffect(() => { load(); }, [load]);

  const yearName = years.find(y => y.id === yearId)?.name ?? '';
  const classOpts = classes.map(c => ({ label: c, value: c }));
  const yearOpts  = years.map(y => ({ label: y.name + (y.is_current ? ' ✦' : ''), value: y.id }));
  const semOpts   = [{ label: 'Semester 1', value: '1' }, { label: 'Semester 2', value: '2' }];

  return (
    <ScrollView style={[styles.container, { backgroundColor: Colors.bg }]} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <View style={styles.row}>
          <DropdownSelect value={yearId} options={yearOpts} onChange={setYearId}
            placeholder="Academic Year" colors={Colors} style={{ flex: 1 }} />
          <DropdownSelect value={semester} options={semOpts} onChange={setSemester}
            colors={Colors} style={{ width: 130 }} />
        </View>
        <View style={{ marginTop: 10 }}>
          <DropdownSelect value={className} options={classOpts} onChange={setClassName}
            placeholder="Select class…" colors={Colors} style={{ width: '100%' }} />
        </View>
      </View>

      {error ? <Text style={[styles.error, { color: Colors.danger }]}>{error}</Text> : null}

      {!className ? (
        <View style={[styles.empty, { borderColor: Colors.border }]}>
          <Text style={[styles.emptyText, { color: Colors.muted }]}>Select a class to view results</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
      ) : results.length === 0 ? (
        <View style={[styles.empty, { borderColor: Colors.border }]}>
          <Text style={[styles.emptyText, { color: Colors.muted }]}>No results for {className}</Text>
          <Text style={[styles.emptySub, { color: Colors.muted }]}>Ensure assessments and exam scores have been entered.</Text>
        </View>
      ) : (
        <View style={[styles.listCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <View style={[styles.listHeader, { borderBottomColor: Colors.border }]}>
            <Text style={[styles.listTitle, { color: Colors.text }]}>{className}</Text>
            <Text style={[styles.listMeta, { color: Colors.muted }]}>{yearName} · Semester {semester} · {results.length} students</Text>
          </View>
          {results
            .slice()
            .sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999))
            .map((r, i) => (
              <TouchableOpacity
                key={r.student_id}
                style={[styles.row2, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}
                onPress={() => router.push({
                  pathname: '/(tabs)/results/student',
                  params: {
                    student_id:   r.student_id,
                    year_id:      yearId,
                    semester,
                    class_name:   className,
                    year_name:    yearName,
                    result_json:  JSON.stringify(r),
                    ca_label:     `CA (${r.ca_percentage}%)`,
                    exam_label:   `Exam (${r.exam_percentage}%)`,
                  },
                })}
              >
                <View style={[styles.posBadge, { backgroundColor: Colors.primary }]}>
                  <Text style={styles.posText}>{r.class_position ?? '—'}</Text>
                </View>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, { color: Colors.text }]} numberOfLines={1}>{r.name}</Text>
                  <Text style={[styles.rowCode, { color: Colors.muted }]}>{r.student_code}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowAvg, { color: Colors.primary }]}>{r.average ?? '—'}</Text>
                  <Text style={[styles.rowGrade, { color: Colors.muted }]}>{r.overall_grade}</Text>
                </View>
              </TouchableOpacity>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1 },
  content:    { padding: 16, gap: 12, paddingBottom: 40 },
  card:       { borderRadius: 14, borderWidth: 1, padding: 14 },
  row:        { flexDirection: 'row', gap: 10 },
  error:      { fontSize: 13, textAlign: 'center' },
  empty:      { borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 32, alignItems: 'center' },
  emptyText:  { fontSize: 14, textAlign: 'center' },
  emptySub:   { fontSize: 12, textAlign: 'center', marginTop: 4, opacity: 0.7 },
  listCard:   { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  listHeader: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  listTitle:  { fontSize: 14, fontWeight: '800' },
  listMeta:   { fontSize: 12, marginTop: 2 },
  row2:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  posBadge:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  posText:    { color: '#fff', fontSize: 12, fontWeight: '800' },
  rowInfo:    { flex: 1, minWidth: 0 },
  rowName:    { fontSize: 13, fontWeight: '700' },
  rowCode:    { fontSize: 11, marginTop: 1 },
  rowRight:   { alignItems: 'flex-end' },
  rowAvg:     { fontSize: 15, fontWeight: '800' },
  rowGrade:   { fontSize: 11, marginTop: 1 },
});
