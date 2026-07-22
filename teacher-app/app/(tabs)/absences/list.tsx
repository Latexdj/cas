import React, { useCallback, useState } from 'react';
import {
  Alert, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { AbsenceRecord } from '@/types/api';

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AbsenceListScreen() {
  const Colors = useTheme();
  const { user } = useAuth();
  const [absences,   setAbsences]   = useState<AbsenceRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [reasonId,   setReasonId]   = useState('');
  const [reasonText, setReasonText] = useState('');
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError('');
    try {
      const res = await api.get(`/api/absences/teacher/${user.id}`);
      setAbsences(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setLoadError(err?.response?.data?.error ?? 'Failed to load absences.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  async function saveReason(id: string) {
    if (!reasonText.trim()) { Alert.alert('Enter a reason'); return; }
    setSaving(true);
    try {
      await api.patch(`/api/absences/${id}/reason`, { reason: reasonText.trim() });
      setReasonId(''); setReasonText(''); load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not save reason.');
    } finally { setSaving(false); }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {loading
        ? [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
        : loadError
        ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
              <Text style={[styles.errorText, { textDecorationLine: 'underline', marginTop: 8 }]}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        )
        : absences.length === 0
        ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>No outstanding absences</Text>
            <Text style={styles.emptySub}>Your attendance record is clear</Text>
          </View>
        )
        : absences.map(ab => (
          <View key={ab.id} style={styles.card}>
            <View style={styles.subjectRow}>
              <Text style={[styles.subject, { flex: 1 }]}>{ab.subject} — {ab.class_name}</Text>
              {ab.is_combined && (
                <View style={styles.combinedBadge}>
                  <Text style={styles.combinedBadgeText}>Combined</Text>
                </View>
              )}
            </View>
            <Text style={styles.meta}>
              {fmt(ab.date)}{ab.scheduled_period ? ` · ${ab.scheduled_period}` : ''}
            </Text>
            {ab.reason ? <Text style={styles.reason}>"{ab.reason}"</Text> : null}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => {
                  if (reasonId === ab.id) { setReasonId(''); }
                  else { setReasonId(ab.id); setReasonText(ab.reason ?? ''); }
                }}
              >
                <Text style={styles.btnSecondaryText}>
                  {reasonId === ab.id ? 'Cancel' : ab.reason ? 'Edit Reason' : 'Add Reason'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: Colors.primary }]}
                onPress={() => router.push({
                  pathname: '/absences/remedial',
                  params: {
                    absenceId: ab.id,
                    subject: ab.subject,
                    className: ab.class_name,
                    date: ab.date,
                    absenceGroupId: ab.absence_group_id ?? '',
                  },
                })}
              >
                <Text style={styles.btnPrimaryText}>Schedule Remedial</Text>
              </TouchableOpacity>
            </View>

            {reasonId === ab.id && (
              <View style={styles.reasonBox}>
                <TextInput
                  style={styles.reasonInput}
                  placeholder="Explain why you were absent…"
                  placeholderTextColor="#8C7E6E"
                  value={reasonText}
                  onChangeText={setReasonText}
                  multiline
                  numberOfLines={3}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: Colors.primary }, saving && { opacity: 0.4 }]}
                  onPress={() => saveReason(ab.id)}
                  disabled={saving}
                >
                  <Text style={styles.btnPrimaryText}>{saving ? 'Saving…' : 'Save Reason'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F4EFE6' },
  content:         { padding: 16, paddingBottom: 40 },
  skeleton:        { backgroundColor: '#E5DDD5', borderRadius: 16, height: 96, marginBottom: 12 },
  errorBox:        { backgroundColor: '#FEE2E2', borderRadius: 16, borderWidth: 1, borderColor: '#FECACA', padding: 20, alignItems: 'center' },
  errorText:       { fontSize: 13, color: '#B91C1C', textAlign: 'center', fontWeight: '600' },
  empty:           { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 32, alignItems: 'center' },
  emptyIcon:       { fontSize: 32, marginBottom: 8 },
  emptyTitle:      { fontSize: 15, fontWeight: '700', color: '#2C2218' },
  emptySub:        { fontSize: 13, color: '#8C7E6E', marginTop: 4 },
  card:            { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 16, marginBottom: 12 },
  subjectRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 2 },
  subject:         { fontSize: 14, fontWeight: '700', color: '#2C2218' },
  combinedBadge:   { backgroundColor: '#FEF3C7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  combinedBadgeText: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  meta:            { fontSize: 12, color: '#8C7E6E', marginTop: 2 },
  reason:          { fontSize: 12, color: '#4A3F32', fontStyle: 'italic', marginTop: 6 },
  btnRow:          { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnSecondary:    { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#E2D9CC', backgroundColor: '#F4EFE6', alignItems: 'center' },
  btnSecondaryText:{ fontSize: 12, fontWeight: '700', color: '#8C7E6E' },
  btnPrimary:      { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  btnPrimaryText:  { fontSize: 12, fontWeight: '700', color: '#fff' },
  reasonBox:       { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F4EFE6' },
  reasonInput:     { backgroundColor: '#F4EFE6', borderRadius: 10, padding: 12, fontSize: 14, color: '#1C1208', minHeight: 80, textAlignVertical: 'top', marginBottom: 10, borderWidth: 1, borderColor: '#E2D9CC' },
  saveBtn:         { paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
});
