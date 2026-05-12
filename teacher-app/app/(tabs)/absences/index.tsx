import React, { useCallback, useState } from 'react';
import {
  Alert, Modal, RefreshControl, ScrollView, SectionList,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { AbsenceCard } from '@/components/AbsenceCard';
import { RemedialCard } from '@/components/RemedialCard';
import { ExcuseCard } from '@/components/ExcuseCard';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useTheme } from '@/context/ThemeContext';
import { AbsenceRecord, RemedialLesson, TeacherExcuse } from '@/types/api';

type ListItem    = AbsenceRecord | RemedialLesson | TeacherExcuse;
type SectionType = 'absences' | 'remedials' | 'excuses';
type Section     = { title: string; type: SectionType; data: ListItem[] };

const EXCUSE_TYPES = ['Sick Leave', 'Official Duty', 'Permission', 'Other'] as const;
type ExcuseType = typeof EXCUSE_TYPES[number];

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function AbsencesScreen() {
  const Colors = useTheme();
  const { user } = useAuth();

  const [absences,   setAbsences]   = useState<AbsenceRecord[]>([]);
  const [remedials,  setRemedials]  = useState<RemedialLesson[]>([]);
  const [excuses,    setExcuses]    = useState<TeacherExcuse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add-reason modal
  const [reasonModal, setReasonModal] = useState<AbsenceRecord | null>(null);
  const [reason,      setReason]      = useState('');
  const [saving,      setSaving]      = useState(false);

  // Leave-request form
  const [showLeaveForm,   setShowLeaveForm]   = useState(false);
  const [newType,         setNewType]         = useState<ExcuseType>('Sick Leave');
  const [newDateFrom,     setNewDateFrom]     = useState(todayStr);
  const [newDateTo,       setNewDateTo]       = useState(todayStr);
  const [newReason,       setNewReason]       = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [absRes, remRes, excRes] = await Promise.all([
        api.get(`/api/absences/teacher/${user.id}`),
        api.get(`/api/remedial/teacher/${user.id}`),
        api.get('/api/teacher-excuses'),
      ]);
      setAbsences(absRes.data);
      setRemedials(remRes.data);
      setExcuses(excRes.data);
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

  async function submitLeave() {
    if (!newReason.trim()) { Alert.alert('Please provide a reason.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(newDateTo)) {
      Alert.alert('Invalid date', 'Dates must be in YYYY-MM-DD format.');
      return;
    }
    if (newDateTo < newDateFrom) { Alert.alert('End date must be on or after start date.'); return; }
    setSubmittingLeave(true);
    try {
      await api.post('/api/teacher-excuses', {
        teacherId: user!.id,
        dateFrom:  newDateFrom,
        dateTo:    newDateTo,
        type:      newType,
        reason:    newReason.trim(),
      });
      setShowLeaveForm(false);
      setNewReason('');
      setNewDateFrom(todayStr());
      setNewDateTo(todayStr());
      setNewType('Sick Leave');
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not submit request.');
    } finally {
      setSubmittingLeave(false);
    }
  }

  const sections: Section[] = [
    { title: `Outstanding Absences (${absences.length})`, type: 'absences',  data: absences  as ListItem[] },
    { title: `Remedial Lessons (${remedials.length})`,    type: 'remedials', data: remedials as ListItem[] },
    { title: `Leave Requests (${excuses.length})`,        type: 'excuses',   data: excuses   as ListItem[] },
  ];

  if (loading) return <Spinner />;

  return (
    <View style={styles.container}>
      {/* Request leave button */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.leaveBtn, { backgroundColor: Colors.primary }]}
          onPress={() => setShowLeaveForm(true)}
        >
          <Text style={styles.leaveBtnText}>+ Request Leave</Text>
        </TouchableOpacity>
      </View>

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
          if (section.type === 'remedials') {
            return <RemedialCard lesson={item as unknown as RemedialLesson} />;
          }
          return <ExcuseCard excuse={item as TeacherExcuse} />;
        }}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionText}>
                {section.type === 'absences'
                  ? '🎉 No outstanding absences'
                  : section.type === 'remedials'
                  ? '📅 No remedial lessons scheduled'
                  : '📋 No leave requests submitted yet'}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      />

      {/* Add-reason bottom sheet */}
      <Modal visible={!!reasonModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Add Reason</Text>
            {reasonModal && (
              <Text style={styles.sheetSub}>{reasonModal.subject} · {reasonModal.class_name}</Text>
            )}
            <TextInput
              style={styles.textArea}
              placeholder="Explain why you were absent…"
              placeholderTextColor="#8C7E6E"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={styles.row2}>
              <Button label="Cancel" variant="secondary" onPress={() => { setReasonModal(null); setReason(''); }} style={styles.flex1} />
              <Button label="Save"   onPress={submitReason} loading={saving} style={styles.flex1} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Leave request bottom sheet */}
      <Modal visible={showLeaveForm} transparent animationType="slide">
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Request Leave</Text>
              <Text style={styles.sheetSub}>Pending requests require admin approval</Text>

              {/* Type selector */}
              <Text style={styles.fieldLabel}>Type of Leave</Text>
              <View style={styles.chipRow}>
                {EXCUSE_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, newType === t && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                    onPress={() => setNewType(t)}
                  >
                    <Text style={[styles.chipText, newType === t && styles.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Date range */}
              <View style={styles.dateRow}>
                <View style={styles.flex1}>
                  <Text style={styles.fieldLabel}>From</Text>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#B5A898"
                    value={newDateFrom}
                    onChangeText={setNewDateFrom}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.fieldLabel}>To</Text>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#B5A898"
                    value={newDateTo}
                    onChangeText={setNewDateTo}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                </View>
              </View>

              {/* Reason */}
              <Text style={styles.fieldLabel}>Reason</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Describe the reason for your leave…"
                placeholderTextColor="#8C7E6E"
                value={newReason}
                onChangeText={setNewReason}
                multiline
                numberOfLines={4}
              />

              <View style={styles.row2}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => { setShowLeaveForm(false); setNewReason(''); }}
                  style={styles.flex1}
                />
                <Button label="Submit Request" onPress={submitLeave} loading={submittingLeave} style={styles.flex1} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F4EFE6' },
  topBar:          { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  leaveBtn:        { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  leaveBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  list:            { padding: 16, paddingTop: 4, flexGrow: 1 },
  sectionHeader:   { paddingVertical: 10, paddingTop: 16 },
  sectionTitle:    { fontSize: 13, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5 },
  emptySection:    { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 8, alignItems: 'center' },
  emptySectionText:{ fontSize: 14, color: '#8C7E6E' },
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetScroll:     { flexGrow: 1, justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
  sheetTitle:      { fontSize: 18, fontWeight: '700', color: '#1C1208', marginBottom: 4 },
  sheetSub:        { fontSize: 14, color: '#8C7E6E', marginBottom: 18 },
  fieldLabel:      { fontSize: 11, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E2D9CC', backgroundColor: '#FDFAF5' },
  chipText:        { fontSize: 13, fontWeight: '600', color: '#4A3F32' },
  chipTextActive:  { color: '#fff' },
  dateRow:         { flexDirection: 'row', gap: 12, marginBottom: 18 },
  dateInput:       { backgroundColor: '#F4EFE6', borderRadius: 10, padding: 12, fontSize: 15, color: '#1C1208', borderWidth: 1, borderColor: '#E2D9CC' },
  textArea:        { backgroundColor: '#F4EFE6', borderRadius: 10, padding: 14, fontSize: 15, color: '#1C1208', minHeight: 100, textAlignVertical: 'top', marginBottom: 18, borderWidth: 1, borderColor: '#E2D9CC' },
  row2:            { flexDirection: 'row', gap: 10 },
  flex1:           { flex: 1 },
});
