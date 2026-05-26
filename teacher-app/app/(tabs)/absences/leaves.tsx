import React, { useCallback, useState } from 'react';
import {
  Alert, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/Button';
import { TeacherExcuse } from '@/types/api';

const LEAVE_TYPES = ['Sick Leave', 'Official Duty', 'Permission', 'Other'] as const;
type LeaveType = typeof LEAVE_TYPES[number];

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusStyle(status: string) {
  if (status === 'Approved') return { bg: '#DCFCE7', color: '#166534' };
  if (status === 'Rejected') return { bg: '#FEE2E2', color: '#991B1B' };
  return { bg: '#FEF3C7', color: '#92400E' };
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function LeavesScreen() {
  const Colors = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ openForm?: string }>();

  const [leaves,    setLeaves]    = useState<TeacherExcuse[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [showForm,  setShowForm]  = useState(params.openForm === '1');

  const [leaveType,  setLeaveType]  = useState<LeaveType>('Sick Leave');
  const [dateFrom,   setDateFrom]   = useState(todayStr());
  const [dateTo,     setDateTo]     = useState(todayStr());
  const [reason,     setReason]     = useState('');
  const [docUri,     setDocUri]     = useState<string | null>(null);
  const [docName,    setDocName]    = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const docRequired = leaveType !== 'Official Duty';

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/teacher-excuses');
      setLeaves(Array.isArray(res.data) ? res.data : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  async function pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        setDocUri(result.assets[0].uri);
        setDocName(result.assets[0].name);
      }
    } catch {
      Alert.alert('Error', 'Could not open document picker.');
    }
  }

  async function submit() {
    if (!reason.trim()) { Alert.alert('Reason required'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format.'); return;
    }
    if (dateTo < dateFrom) { Alert.alert('End date must be on or after start date'); return; }
    if (docRequired && !docUri) {
      Alert.alert('Document required', 'Please attach a supporting document (PDF or Word) for this leave type.');
      return;
    }
    setSubmitting(true);
    try {
      let documentBase64: string | undefined;
      if (docUri && docName) {
        const base64 = await FileSystem.readAsStringAsync(docUri, { encoding: FileSystem.EncodingType.Base64 });
        const ext  = docName.slice(docName.lastIndexOf('.')).toLowerCase();
        const mime = ext === '.pdf'  ? 'application/pdf'
                   : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                   :                   'application/msword';
        documentBase64 = `data:${mime};base64,${base64}`;
      }
      await api.post('/api/teacher-excuses', {
        teacherId: user!.id, dateFrom, dateTo, type: leaveType, reason: reason.trim(),
        documentBase64, documentFilename: docName ?? undefined,
      });
      setShowForm(false);
      setReason(''); setDateFrom(todayStr()); setDateTo(todayStr()); setLeaveType('Sick Leave');
      setDocUri(null); setDocName(null);
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not submit request.');
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: Colors.primary }]}
          onPress={() => setShowForm(true)}
        >
          <Text style={styles.newBtnText}>+ Request Leave</Text>
        </TouchableOpacity>

        {loading
          ? [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
          : leaves.length === 0
          ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No leave requests yet</Text>
              <Text style={styles.emptySub}>Tap "Request Leave" to submit one</Text>
            </View>
          )
          : leaves.map(lv => {
            const s = statusStyle(lv.status);
            const dateLabel = lv.date_from.slice(0, 10) === lv.date_to.slice(0, 10)
              ? fmt(lv.date_from)
              : `${fmt(lv.date_from)} – ${fmt(lv.date_to)}`;
            return (
              <View key={lv.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.leaveType}>{lv.type}</Text>
                    <Text style={styles.meta}>{dateLabel}</Text>
                    {lv.reason ? <Text style={styles.italicText}>"{lv.reason}"</Text> : null}
                    {lv.document_url ? (
                      <Text
                        style={[styles.meta, { color: Colors.primary, fontWeight: '600' }]}
                        onPress={() => { if (lv.document_url) require('react-native').Linking.openURL(lv.document_url); }}
                      >
                        📄 View Document
                      </Text>
                    ) : null}
                    {lv.approved_by_name ? (
                      <Text style={styles.meta}>
                        {lv.status === 'Approved' ? 'Approved' : 'Reviewed'} by {lv.approved_by_name}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.badge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.badgeText, { color: s.color }]}>{lv.status}</Text>
                  </View>
                </View>
              </View>
            );
          })
        }
      </ScrollView>

      <Modal visible={showForm} transparent animationType="slide">
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Request Leave</Text>
              <Text style={styles.sheetSub}>Pending requests require admin approval</Text>

              <Text style={styles.fieldLabel}>Type of Leave</Text>
              <View style={styles.chipRow}>
                {LEAVE_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, leaveType === t && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                    onPress={() => setLeaveType(t)}
                  >
                    <Text style={[styles.chipText, leaveType === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.dateRow}>
                <View style={styles.flex1}>
                  <Text style={styles.fieldLabel}>From</Text>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#B5A898"
                    value={dateFrom}
                    onChangeText={setDateFrom}
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
                    value={dateTo}
                    onChangeText={setDateTo}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Reason</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Describe the reason for your leave…"
                placeholderTextColor="#8C7E6E"
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={4}
              />

              {docRequired && (
                <View>
                  <Text style={styles.fieldLabel}>
                    Supporting Document <Text style={{ color: '#DC2626' }}>*</Text>
                  </Text>
                  <Text style={styles.fieldHint}>PDF or Word file required for this leave type</Text>
                  <TouchableOpacity
                    style={[styles.docBtn, docUri && { borderColor: Colors.primary }]}
                    onPress={pickDocument}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.docBtnText, docUri && { color: Colors.primary }]}>
                      {docUri ? `✓  ${docName}` : '📎  Attach Document'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.row2}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => { setShowForm(false); setReason(''); }}
                  style={styles.flex1}
                />
                <Button label="Submit Request" onPress={submit} loading={submitting} style={styles.flex1} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F4EFE6' },
  content:     { padding: 16, paddingBottom: 40 },
  newBtn:      { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  newBtnText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  skeleton:    { backgroundColor: '#E5DDD5', borderRadius: 16, height: 96, marginBottom: 12 },
  empty:       { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 32, alignItems: 'center' },
  emptyIcon:   { fontSize: 32, marginBottom: 8 },
  emptyTitle:  { fontSize: 15, fontWeight: '700', color: '#2C2218' },
  emptySub:    { fontSize: 13, color: '#8C7E6E', marginTop: 4 },
  card:        { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 16, marginBottom: 12 },
  cardRow:     { flexDirection: 'row', alignItems: 'flex-start' },
  flex1:       { flex: 1 },
  leaveType:   { fontSize: 14, fontWeight: '700', color: '#2C2218' },
  meta:        { fontSize: 12, color: '#8C7E6E', marginTop: 2 },
  italicText:  { fontSize: 12, color: '#4A3F32', fontStyle: 'italic', marginTop: 4 },
  badge:       { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 10 },
  badgeText:   { fontSize: 12, fontWeight: '700' },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: '#1C1208', marginBottom: 4 },
  sheetSub:    { fontSize: 14, color: '#8C7E6E', marginBottom: 18 },
  fieldLabel:  { fontSize: 11, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E2D9CC', backgroundColor: '#FDFAF5' },
  chipText:    { fontSize: 13, fontWeight: '600', color: '#4A3F32' },
  dateRow:     { flexDirection: 'row', gap: 12, marginBottom: 18 },
  dateInput:   { backgroundColor: '#F4EFE6', borderRadius: 10, padding: 12, fontSize: 15, color: '#1C1208', borderWidth: 1, borderColor: '#E2D9CC' },
  textArea:    { backgroundColor: '#F4EFE6', borderRadius: 10, padding: 14, fontSize: 15, color: '#1C1208', minHeight: 100, textAlignVertical: 'top', marginBottom: 18, borderWidth: 1, borderColor: '#E2D9CC' },
  row2:        { flexDirection: 'row', gap: 10 },
  fieldHint:   { fontSize: 11, color: '#8C7E6E', marginBottom: 8, marginTop: -4 },
  docBtn:      { borderWidth: 1, borderColor: '#E2D9CC', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginBottom: 18 },
  docBtnText:  { fontSize: 13, fontWeight: '600', color: '#8C7E6E' },
});
