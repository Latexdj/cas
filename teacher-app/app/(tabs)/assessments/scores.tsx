import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

interface ScoreRow {
  student_id: string;
  student_code: string;
  name: string;
  score_id: string | null;
  score: number | null;
  absent: boolean;
}

interface AssessmentInfo {
  id: string;
  mode_name: string;
  title: string | null;
  date: string | null;
  max_score: number;
  class_name: string;
  subject: string;
}

export default function ScoresScreen() {
  const Colors = useTheme();
  const { assessment_id, assessment_label } = useLocalSearchParams<{ assessment_id: string; assessment_label: string }>();

  const [assessment, setAssessment] = useState<AssessmentInfo | null>(null);
  const [rows,       setRows]       = useState<ScoreRow[]>([]);
  const [scores,     setScores]     = useState<Record<string, string>>({});
  const [absents,    setAbsents]    = useState<Record<string, boolean>>({});
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState('');

  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/assessments/${assessment_id}/scores`);
      setAssessment(data.assessment);
      setRows(data.scores);
      const s: Record<string, string> = {};
      const a: Record<string, boolean> = {};
      for (const r of data.scores as ScoreRow[]) {
        s[r.student_id] = r.score != null ? String(r.score) : '';
        a[r.student_id] = r.absent;
      }
      setScores(s);
      setAbsents(a);
    } catch {
      setError('Failed to load scores.');
    } finally {
      setLoading(false);
    }
  }, [assessment_id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const payload = rows.map(r => ({
        student_id: r.student_id,
        score:      absents[r.student_id] ? null : (scores[r.student_id] !== '' ? parseFloat(scores[r.student_id]) : null),
        absent:     absents[r.student_id] ?? false,
      }));
      await api.post(`/api/assessments/${assessment_id}/scores`, { scores: payload });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  if (loading) return (
    <View style={[styles.container, { backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );

  const maxScore = assessment?.max_score ?? 100;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: Colors.bg }]}>
      {/* Assessment info */}
      <View style={[styles.infoCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <Text style={[styles.infoTitle, { color: Colors.text }]}>{assessment_label}</Text>
        <Text style={[styles.infoMeta, { color: Colors.muted }]}>
          {assessment?.subject} Â· {assessment?.class_name} Â· Max: {maxScore}
        </Text>
      </View>

      {error ? <Text style={[styles.errBanner, { backgroundColor: Colors.dangerLight, color: Colors.danger }]}>{error}</Text> : null}
      {saved ? <Text style={[styles.errBanner, { backgroundColor: '#DCFCE7', color: '#15803D' }]}>âœ“ Scores saved.</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={r => r.student_id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 8 }}
        renderItem={({ item, index }) => {
          const isAbsent = absents[item.student_id] ?? false;
          return (
            <View style={[styles.row, { borderColor: Colors.border, backgroundColor: Colors.surface }]}>
              <View style={styles.rowLeft}>
                <Text style={[styles.rowName, { color: Colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.rowCode, { color: Colors.muted }]}>{item.student_code}</Text>
              </View>
              {isAbsent ? (
                <View style={[styles.absentBadge, { backgroundColor: Colors.dangerLight }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.danger }}>Absent</Text>
                </View>
              ) : (
                <TextInput
                  ref={ref => { inputRefs.current[item.student_id] = ref; }}
                  style={[styles.scoreInput, { borderColor: Colors.border, color: Colors.text, backgroundColor: Colors.bg }]}
                  value={scores[item.student_id] ?? ''}
                  onChangeText={v => setScores(prev => ({ ...prev, [item.student_id]: v }))}
                  keyboardType="decimal-pad"
                  placeholder={`/ ${maxScore}`}
                  placeholderTextColor={Colors.muted}
                  returnKeyType={index < rows.length - 1 ? 'next' : 'done'}
                  onSubmitEditing={() => {
                    const nextId = rows[index + 1]?.student_id;
                    if (nextId) inputRefs.current[nextId]?.focus();
                  }}
                />
              )}
              <TouchableOpacity
                style={[styles.absentToggle, { backgroundColor: isAbsent ? Colors.danger : Colors.bg, borderColor: isAbsent ? Colors.danger : Colors.border }]}
                onPress={() => setAbsents(prev => ({ ...prev, [item.student_id]: !prev[item.student_id] }))}
              >
                <Ionicons name={isAbsent ? 'close-circle' : 'close-circle-outline'} size={20} color={isAbsent ? '#fff' : Colors.muted} />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {/* Save footer */}
      <View style={[styles.footer, { backgroundColor: Colors.surface, borderTopColor: Colors.border }]}>
        <Text style={[styles.footerMeta, { color: Colors.muted }]}>{rows.length} student{rows.length !== 1 ? 's' : ''}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: Colors.primary }]}
          onPress={save}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>{rows.some(r => r.score_id !== null) ? 'Save Changes' : 'Save Scores'}</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  infoCard:     { margin: 16, marginBottom: 8, borderRadius: 14, padding: 14, borderWidth: 1 },
  infoTitle:    { fontSize: 16, fontWeight: '800' },
  infoMeta:     { fontSize: 12, marginTop: 3 },
  errBanner:    { marginHorizontal: 16, marginBottom: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontWeight: '600' },
  row:          { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, gap: 10 },
  rowLeft:      { flex: 1, minWidth: 0 },
  rowName:      { fontSize: 13, fontWeight: '700' },
  rowCode:      { fontSize: 11, marginTop: 1 },
  scoreInput:   { width: 70, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  absentBadge:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  absentToggle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  footer:       { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, gap: 12 },
  footerMeta:   { flex: 1, fontSize: 13 },
  saveBtn:      { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  saveBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
});

