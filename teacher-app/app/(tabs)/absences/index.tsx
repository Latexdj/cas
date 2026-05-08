import React, { useCallback, useState } from 'react';
import {
  Alert, Modal, RefreshControl, SectionList,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { AbsenceCard } from '@/components/AbsenceCard';
import { RemedialCard } from '@/components/RemedialCard';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors } from '@/constants/colors';
import { AbsenceRecord, RemedialLesson } from '@/types/api';

type ListItem = AbsenceRecord | RemedialLesson;
type Section  = { title: string; type: 'absences' | 'remedials'; data: ListItem[] };

export default function AbsencesScreen() {
  const { user } = useAuth();
  const [absences,    setAbsences]    = useState<AbsenceRecord[]>([]);
  const [remedials,   setRemedials]   = useState<RemedialLesson[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [reasonModal, setReasonModal] = useState<AbsenceRecord | null>(null);
  const [reason,      setReason]      = useState('');
  const [saving,      setSaving]      = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [absRes, remRes] = await Promise.all([
        api.get(`/api/absences/teacher/${user.id}`),
        api.get(`/api/remedial/teacher/${user.id}`),
      ]);
      setAbsences(absRes.data);
      setRemedials(remRes.data);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  async function submitReason() {
    if (!reason.trim()) { Alert.alert('Enter a reason'); return; }
    setSaving(true);
    try {
      await api.patch(`/api/absences/${reasonModal!.id}/reason`, { reason: reason.trim() });
      setReasonModal(null);
      setReason('');
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not save reason.');
    } finally {
      setSaving(false);
    }
  }

  const sections: Section[] = [
    { title: `Outstanding Absences (${absences.length})`, type: 'absences',  data: absences  as ListItem[] },
    { title: `Remedial Lessons (${remedials.length})`,    type: 'remedials', data: remedials as ListItem[] },
  ];

  if (loading) return <Spinner />;

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item, section }) => {
          if (section.type === 'absences') {
            const absence = item as AbsenceRecord;
            return (
              <AbsenceCard
                absence={absence}
                onAddReason={() => { setReasonModal(absence); setReason(absence.reason ?? ''); }}
                onScheduleRemedial={() => router.push({
                  pathname: '/absences/remedial',
                  params: { absenceId: absence.id, subject: absence.subject, className: absence.class_name, date: absence.date },
                })}
              />
            );
          }
          return <RemedialCard lesson={item as unknown as RemedialLesson} />;
        }}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionText}>
                {section.type === 'absences' ? '🎉 No outstanding absences' : '📅 No remedial lessons scheduled'}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState icon="🎉" title="All clear!" subtitle="No absences or remedials found." />}
      />

      {/* Add reason modal */}
      <Modal visible={!!reasonModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Add Reason</Text>
            {reasonModal && (
              <Text style={styles.sheetSub}>{reasonModal.subject} · {reasonModal.class_name}</Text>
            )}
            <TextInput
              style={styles.reasonInput}
              placeholder="Explain why you were absent…"
              placeholderTextColor={Colors.muted}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={styles.sheetActions}>
              <Button label="Cancel" variant="secondary" onPress={() => { setReasonModal(null); setReason(''); }} style={styles.halfBtn} />
              <Button label="Save" onPress={submitReason} loading={saving} style={styles.halfBtn} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.bg },
  list:           { padding: 16, paddingTop: 8, flexGrow: 1 },
  sectionHeader:  { paddingVertical: 10, paddingTop: 16 },
  sectionTitle:   { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptySection:   { backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 8, alignItems: 'center' },
  emptySectionText: { fontSize: 14, color: Colors.muted },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle:     { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  sheetSub:       { fontSize: 14, color: Colors.muted, marginBottom: 16 },
  reasonInput:    { backgroundColor: Colors.bg, borderRadius: 10, padding: 14, fontSize: 15, color: Colors.text, minHeight: 100, textAlignVertical: 'top', marginBottom: 16 },
  sheetActions:   { flexDirection: 'row', gap: 10 },
  halfBtn:        { flex: 1 },
});
