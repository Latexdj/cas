import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

interface ExamRow {
  student_id: string;
  student_code: string;
  name: string;
  exam_id: string | null;
  score: number | null;
  max_score: number | null;
}

export default function ExamScoresScreen() {
  const Colors = useTheme();
  const { subject, class_name, year_id, semester, year_name } = useLocalSearchParams<{
    subject: string; class_name: string; year_id: string; semester: string; year_name: string;
  }>();

  const [rows,     setRows]     = useState<ExamRow[]>([]);
  const [scores,   setScores]   = useState<Record<string, string>>({});
  const [maxScore, setMaxScore] = useState('');
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');

  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<ExamRow[]>('/api/exam-scores', {
        params: { academic_year_id: year_id, semester, subject, class_name },
      });
      setRows(data);
      const s: Record<string, string> = {};
      for (const r of data) {
        s[r.student_id] = r.score != null ? String(r.score) : '';
      }
      setScores(s);
      // Pre-populate max score from existing saved value
      const existingMax = data.find((r: ExamRow) => r.max_score != null)?.max_score;
      if (existingMax != null) setMaxScore(String(existingMax));
    } catch {
      setError('Failed to load exam scores.');
    } finally { setLoading(false); }
  }, [year_id, semester, subject, class_name]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  async function save() {
    if (!maxScore || parseFloat(maxScore) <= 0) { setError('Max score is required before saving.'); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      const payload = rows.map(r => ({
        student_id: r.student_id,
        score:      scores[r.student_id] !== '' ? parseFloat(scores[r.student_id]) : null,
      }));
      await api.post('/api/exam-scores', {
        academic_year_id: year_id,
        semester:         parseInt(semester),
        subject,
        class_name,
        max_score:        parseFloat(maxScore),
        scores:           payload,
      });
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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: Colors.bg }]}>
      <View style={[styles.infoCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <Text style={[styles.infoTitle, { color: Colors.text }]}>End-of-Semester Exam</Text>
        <Text style={[styles.infoMeta, { color: Colors.muted }]}>{subject} Â· {class_name} Â· {year_name} Â· Semester {semester}</Text>
        <View style={styles.maxRow}>
          <Text style={[styles.maxLabel, { color: Colors.muted }]}>Max Score</Text>
          <TextInput
            style={[styles.maxInput, { borderColor: Colors.border, color: Colors.text, backgroundColor: Colors.bg }]}
            value={maxScore}
            onChangeText={setMaxScore}
            keyboardType="numeric"
            placeholder="e.g. 100"
            placeholderTextColor={Colors.muted}
          />
        </View>
      </View>

      {error ? <Text style={[styles.banner, { backgroundColor: Colors.dangerLight, color: Colors.danger }]}>{error}</Text> : null}
      {saved ? <Text style={[styles.banner, { backgroundColor: '#DCFCE7', color: '#15803D' }]}>âœ“ Exam scores saved.</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={r => r.student_id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 8 }}
        renderItem={({ item, index }) => (
          <View style={[styles.row, { borderColor: Colors.border, backgroundColor: Colors.surface }]}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowName, { color: Colors.text }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.rowCode, { color: Colors.muted }]}>{item.student_code}</Text>
            </View>
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
          </View>
        )}
      />

      <View style={[styles.footer, { backgroundColor: Colors.surface, borderTopColor: Colors.border }]}>
        <Text style={[styles.footerMeta, { color: Colors.muted }]}>{rows.length} student{rows.length !== 1 ? 's' : ''}</Text>
        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.primary }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Exam Scores</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1 },
  infoCard:   { margin: 16, marginBottom: 8, borderRadius: 14, padding: 14, borderWidth: 1 },
  infoTitle:  { fontSize: 16, fontWeight: '800' },
  infoMeta:   { fontSize: 12, marginTop: 3, marginBottom: 10 },
  maxRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  maxLabel:   { fontSize: 12, fontWeight: '600' },
  maxInput:   { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, width: 80, textAlign: 'center' },
  banner:     { marginHorizontal: 16, marginBottom: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontWeight: '600' },
  row:        { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, gap: 10 },
  rowLeft:    { flex: 1, minWidth: 0 },
  rowName:    { fontSize: 13, fontWeight: '700' },
  rowCode:    { fontSize: 11, marginTop: 1 },
  scoreInput: { width: 80, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  footer:     { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, gap: 12 },
  footerMeta: { flex: 1, fontSize: 13 },
  saveBtn:    { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  saveBtnText:{ color: '#fff', fontWeight: '700', fontSize: 14 },
});

