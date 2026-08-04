import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Dropdown } from '@/components/ui/Dropdown';
import type { AcademicYear, SemesterResults } from '@/types/api';

const GRADE_COLOR = (g: string | null, danger: string, warn: string, success: string) =>
  !g ? '#94A3B8' : ['A1','A','B2','B3','B+','B-','C4','C5','C6'].includes(g) ? success
  : ['F9','F','E8'].includes(g) ? danger : warn;

const SEM_OPTIONS = [
  { label: 'Semester 1', value: '1' },
  { label: 'Semester 2', value: '2' },
];

export default function ResultsScreen() {
  const C = useTheme();
  const [years,         setYears]         = useState<AcademicYear[]>([]);
  const [yearId,        setYearId]        = useState('');
  const [semester,      setSemester]      = useState(1);
  const [results,       setResults]       = useState<SemesterResults | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState('');

  const loadYears = async () => {
    const { data } = await api.get<AcademicYear[]>('/api/student/academic-years');
    setYears(data);
    const cur = data.find(y => y.is_current) ?? data[0];
    if (cur) { setYearId(cur.id); setSemester(cur.current_semester ?? 1); }
    return cur;
  };

  const loadResults = useCallback(async (yId: string, sem: number, isFilter = false) => {
    if (!yId) return;
    setError('');
    if (isFilter) setFilterLoading(true);
    try {
      const { data } = await api.get<SemesterResults>('/api/student/results', { params: { academic_year_id: yId, semester: sem } });
      setResults(data);
    } catch { setError('Failed to load results.'); }
    finally { setLoading(false); setRefreshing(false); setFilterLoading(false); }
  }, []);

  useEffect(() => {
    loadYears().then(cur => { if (cur) loadResults(cur.id, cur.current_semester ?? 1); else setLoading(false); });
  }, []);

  const handleYearChange = (val: string) => { setYearId(val); loadResults(val, semester, true); };
  const handleSemChange  = (val: string) => { const s = parseInt(val); setSemester(s); loadResults(yearId, s, true); };

  const yearOptions = years.map(y => ({ label: y.name, value: y.id }));

  if (loading) return <Spinner message="Loading results…" />;

  const avg = results?.average;
  const avgColor = avg != null ? (avg >= 50 ? C.success : C.danger) : C.muted;

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadResults(yearId, semester); }} tintColor={C.accent} />}
    >
      {/* Filter row */}
      <View style={s.filterRow}>
        <Dropdown
          label="Academic Year"
          options={yearOptions}
          value={yearId}
          onChange={handleYearChange}
          style={s.filterYear}
        />
        <Dropdown
          label="Semester"
          options={SEM_OPTIONS}
          value={String(semester)}
          onChange={handleSemChange}
          style={s.filterSem}
        />
      </View>

      {filterLoading && (
        <View style={[s.filterSpinner, { backgroundColor: C.surface }]}>
          <ActivityIndicator color={C.primary} />
          <Text style={[s.filterSpinnerText, { color: C.muted }]}>Loading…</Text>
        </View>
      )}

      {!filterLoading && error ? <Text style={[s.err, { color: C.danger }]}>{error}</Text> : null}

      {!filterLoading && results && (
        <>
          {/* Summary card */}
          <Card style={s.summaryCard}>
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: avgColor }]}>{avg != null ? `${avg.toFixed(1)}%` : '—'}</Text>
                <Text style={[s.summaryLabel, { color: C.muted }]}>Average</Text>
              </View>
              <View style={[s.divider, { backgroundColor: C.border }]} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: C.text }]}>
                  {results.class_position != null ? `${results.class_position}` : '—'}
                  {results.total_students != null ? <Text style={[s.summarySmall, { color: C.muted }]}>/{results.total_students}</Text> : null}
                </Text>
                <Text style={[s.summaryLabel, { color: C.muted }]}>Position</Text>
              </View>
              <View style={[s.divider, { backgroundColor: C.border }]} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: C.text }]}>{results.subjects.length}</Text>
                <Text style={[s.summaryLabel, { color: C.muted }]}>Subjects</Text>
              </View>
            </View>
          </Card>

          {avg != null && avg < 40 && (
            <View style={[s.atRisk, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
              <Ionicons name="warning-outline" size={16} color={C.danger} />
              <Text style={[s.atRiskText, { color: C.danger }]}>Your average is below 40% — please speak to your form teacher.</Text>
            </View>
          )}

          {/* Subject table */}
          <Card padded={false} style={s.tableCard}>
            <View style={[s.tableHead, { backgroundColor: C.surfaceWarm }]}>
              {['Subject', 'CA', 'Exam', 'Total', 'Grade'].map(h => (
                <Text key={h} style={[s.th, { color: C.muted, flex: h === 'Subject' ? 2.5 : 1 }]}>{h}</Text>
              ))}
            </View>
            {results.subjects.map((sub, i) => (
              <View key={sub.subject} style={[s.tableRow, { borderTopColor: C.border }, i > 0 && { borderTopWidth: 1 }]}>
                <Text style={[s.td, { color: C.text, flex: 2.5, fontWeight: '600' }]} numberOfLines={2}>{sub.subject}</Text>
                <Text style={[s.td, { color: C.textSoft, flex: 1 }]}>{sub.ca_score != null ? sub.ca_score.toFixed(1) : '—'}</Text>
                <Text style={[s.td, { color: C.textSoft, flex: 1 }]}>{sub.exam_score != null ? sub.exam_score.toFixed(1) : '—'}</Text>
                <Text style={[s.td, { color: C.text, flex: 1, fontWeight: '700' }]}>{sub.total ?? '—'}</Text>
                <Text style={[s.td, { flex: 1, fontWeight: '800', color: GRADE_COLOR(sub.grade, C.danger, C.warning, C.success) }]}>{sub.grade ?? '—'}</Text>
              </View>
            ))}
          </Card>

          {results.form_teacher_remarks?.general_remarks && (
            <Card style={s.remarksCard}>
              <Text style={[s.remarksTitle, { color: C.muted }]}>Form Teacher Remarks</Text>
              <Text style={[s.remarksText, { color: C.text }]}>{results.form_teacher_remarks.general_remarks}</Text>
              {results.form_teacher_remarks.form_teacher_name && (
                <Text style={[s.remarksTeacher, { color: C.muted }]}>— {results.form_teacher_remarks.form_teacher_name}</Text>
              )}
            </Card>
          )}
        </>
      )}

      {!filterLoading && !results && !loading && !error && (
        <Text style={[s.empty, { color: C.muted }]}>No results found for this term.</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  flex:           { flex: 1 },
  filterRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  filterYear:     { flex: 2 },
  filterSem:      { flex: 1 },
  filterSpinner:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, borderRadius: 14, marginBottom: 12 },
  filterSpinnerText: { fontSize: 14, fontWeight: '600' },
  err:            { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  summaryCard:    { marginBottom: 12 },
  summaryRow:     { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  summaryItem:    { alignItems: 'center', flex: 1 },
  summaryValue:   { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  summarySmall:   { fontSize: 14, fontWeight: '400' },
  summaryLabel:   { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  divider:        { width: 1, height: 40 },
  atRisk:         { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 12 },
  atRiskText:     { fontSize: 13, fontWeight: '600', lineHeight: 18, flex: 1 },
  tableCard:      { marginBottom: 12, overflow: 'hidden' },
  tableHead:      { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  th:             { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  tableRow:       { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 11, alignItems: 'center' },
  td:             { fontSize: 13, textAlign: 'center' },
  remarksCard:    { marginBottom: 12 },
  remarksTitle:   { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  remarksText:    { fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  remarksTeacher: { fontSize: 12, marginTop: 8 },
  empty:          { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
