import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

interface AssessmentMode { id: string; name: string; ca_contribution: number }
interface Assessment {
  id: string; mode_id: string; mode_name: string; ca_contribution: number;
  title: string | null; date: string | null; max_score: number; score_count: number;
}

export default function SubjectAssessmentsScreen() {
  const Colors = useTheme();
  const { subject, class_name, year_id, semester, year_name } = useLocalSearchParams<{
    subject: string; class_name: string; year_id: string; semester: string; year_name: string;
  }>();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [modes,       setModes]       = useState<AssessmentMode[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  // New assessment modal state
  const [showModal, setShowModal]   = useState(false);
  const [modeId,    setModeId]      = useState('');
  const [title,     setTitle]       = useState('');
  const [date,      setDate]        = useState('');
  const [maxScore,  setMaxScore]    = useState('');
  const [creating,  setCreating]    = useState(false);
  const [createErr, setCreateErr]   = useState('');

  const load = useCallback(async () => {
    try {
      const [aRes, mRes] = await Promise.all([
        api.get<Assessment[]>('/api/assessments', {
          params: { academic_year_id: year_id, semester, subject, class_name },
        }),
        api.get<AssessmentMode[]>('/api/assessment-modes'),
      ]);
      setAssessments(aRes.data);
      setModes(mRes.data);
      if (mRes.data.length > 0 && !modeId) setModeId(mRes.data[0].id);
    } catch {
      // silently fail on refresh
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year_id, semester, subject, class_name, modeId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  async function createAssessment() {
    if (!modeId) { setCreateErr('Please select a mode.'); return; }
    if (!maxScore || parseFloat(maxScore) <= 0) { setCreateErr('Max score is required.'); return; }
    setCreating(true); setCreateErr('');
    try {
      await api.post('/api/assessments', {
        academic_year_id: year_id,
        semester:         parseInt(semester),
        subject,
        class_name,
        mode_id:   modeId,
        title:     title.trim() || null,
        date:      date || null,
        max_score: parseFloat(maxScore),
      });
      setShowModal(false);
      setTitle(''); setDate(''); setMaxScore(''); setCreateErr('');
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCreateErr(msg ?? 'Failed to create.');
    } finally { setCreating(false); }
  }

  async function deleteAssessment(id: string, label: string) {
    Alert.alert('Delete Assessment', `Delete "${label}"? All scores will be lost.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await api.delete(`/api/assessments/${id}`); await load(); }
          catch { Alert.alert('Error', 'Failed to delete.'); }
        },
      },
    ]);
  }

  const inputStyle = [styles.input, { borderColor: Colors.border, color: Colors.text, backgroundColor: Colors.surface }];

  return (
    <View style={[styles.container, { backgroundColor: Colors.bg }]}>
      {/* Header info */}
      <View style={[styles.headerCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <Text style={[styles.headerSubject, { color: Colors.text }]}>{subject}</Text>
        <Text style={[styles.headerMeta, { color: Colors.muted }]}>{class_name} Â· {year_name} Â· Semester {semester}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={assessments}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="clipboard-outline" size={40} color={Colors.muted} />
              <Text style={[styles.emptyText, { color: Colors.muted }]}>No assessments yet.{'\n'}Tap + to add one.</Text>
            </View>
          }
          ListHeaderComponent={
            <TouchableOpacity
              style={[styles.examBtn, { borderColor: Colors.accent, backgroundColor: Colors.bg }]}
              onPress={() => router.push({ pathname: '/(tabs)/assessments/exam', params: { subject, class_name, year_id, semester, year_name } })}
            >
              <Ionicons name="document-text-outline" size={16} color={Colors.accent} />
              <Text style={[styles.examBtnText, { color: Colors.accent }]}>Enter End-of-Semester Exam Scores</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => {
            const label = item.title ?? item.mode_name;
            const dateStr = item.date ? new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
            return (
              <View style={[styles.card, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                <TouchableOpacity style={styles.cardMain}
                  onPress={() => router.push({ pathname: '/(tabs)/assessments/scores', params: { assessment_id: item.id, subject, class_name, year_id, semester, assessment_label: label } })}>
                  <View style={styles.cardRow}>
                    <View style={[styles.modeBadge, { backgroundColor: Colors.primaryLight }]}>
                      <Text style={[styles.modeBadgeText, { color: Colors.primary }]}>{item.mode_name}</Text>
                    </View>
                    {dateStr && <Text style={[styles.dateText, { color: Colors.muted }]}>{dateStr}</Text>}
                  </View>
                  <Text style={[styles.cardTitle, { color: Colors.text }]}>{label}</Text>
                  <Text style={[styles.cardMeta, { color: Colors.muted }]}>Max: {item.max_score} Â· {item.score_count} score{item.score_count !== 1 ? 's' : ''} entered</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cardDelete} onPress={() => deleteAssessment(item.id, label)}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* Add button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: Colors.primary }]}
        onPress={() => setShowModal(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Create modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: Colors.surface }]}>
            <Text style={[styles.sheetTitle, { color: Colors.text }]}>New Assessment</Text>

            <Text style={[styles.label, { color: Colors.muted }]}>Mode *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {modes.map(m => (
                  <TouchableOpacity key={m.id} onPress={() => setModeId(m.id)}
                    style={[styles.pill, { backgroundColor: modeId === m.id ? Colors.primary : Colors.bg, borderColor: modeId === m.id ? Colors.primary : Colors.border }]}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: modeId === m.id ? '#fff' : Colors.text }}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.label, { color: Colors.muted }]}>Title (optional)</Text>
            <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="e.g. Week 3 Test" placeholderTextColor={Colors.muted} />

            <Text style={[styles.label, { color: Colors.muted }]}>Date (YYYY-MM-DD)</Text>
            <TextInput style={inputStyle} value={date} onChangeText={setDate} placeholder="e.g. 2025-03-14" placeholderTextColor={Colors.muted} keyboardType="numeric" />

            <Text style={[styles.label, { color: Colors.muted }]}>Max Score</Text>
            <TextInput style={inputStyle} value={maxScore} onChangeText={setMaxScore} keyboardType="numeric" placeholder="e.g. 50" placeholderTextColor={Colors.muted} />

            {createErr ? <Text style={[styles.errText, { color: Colors.danger }]}>{createErr}</Text> : null}

            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: Colors.bg, borderColor: Colors.border }]} onPress={() => setShowModal(false)}>
                <Text style={{ color: Colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: Colors.primary, flex: 1 }]} onPress={createAssessment} disabled={creating}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{creating ? 'Creatingâ€¦' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  headerCard:   { margin: 16, marginBottom: 0, borderRadius: 14, padding: 14, borderWidth: 1 },
  headerSubject:{ fontSize: 17, fontWeight: '800' },
  headerMeta:   { fontSize: 12, marginTop: 3 },
  center:       { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText:    { fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  examBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: 8 },
  examBtnText:  { fontSize: 13, fontWeight: '700' },
  card:         { borderRadius: 14, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  cardMain:     { flex: 1, padding: 14 },
  cardDelete:   { padding: 14, justifyContent: 'center', alignItems: 'center' },
  cardRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  modeBadge:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  modeBadgeText:{ fontSize: 11, fontWeight: '700' },
  dateText:     { fontSize: 11 },
  cardTitle:    { fontSize: 14, fontWeight: '700' },
  cardMeta:     { fontSize: 11, marginTop: 2 },
  fab:          { position: 'absolute', bottom: 28, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  sheetTitle:   { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  label:        { fontSize: 12, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:        { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  pill:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  errText:      { fontSize: 13, marginBottom: 10 },
  btnRow:       { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn:          { paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, paddingHorizontal: 16 },
});

