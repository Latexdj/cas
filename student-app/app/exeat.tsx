import React, { useEffect, useState } from 'react';
import { Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { ExeatData } from '@/types/api';

const STATUS_CFG = {
  pending:  { label: 'Pending',  color: '#D97706', bg: '#FEF3C7' },
  approved: { label: 'Approved', color: '#145C44', bg: '#DCFCE7' },
  rejected: { label: 'Rejected', color: '#DC2626', bg: '#FEE2E2' },
  returned: { label: 'Returned', color: '#1D4ED8', bg: '#DBEAFE' },
};

export default function ExeatScreen() {
  const C = useTheme();
  const [data,        setData]        = useState<ExeatData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [formError,   setFormError]   = useState('');

  const [type,        setType]        = useState<'internal' | 'external'>('internal');
  const [destination, setDestination] = useState('');
  const [reason,      setReason]      = useState('');
  const [departure,   setDeparture]   = useState('');
  const [returnTime,  setReturnTime]  = useState('');
  const [parentPhone, setParentPhone] = useState('');

  async function load() {
    try {
      const { data: res } = await api.get<ExeatData>('/api/exeat/my-requests');
      setData(res);
      if (res.guardian_mobile) setParentPhone(res.guardian_mobile);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit() {
    if (!destination || !reason || !departure || !returnTime) { setFormError('All fields are required.'); return; }
    setFormError(''); setSubmitting(true);
    try {
      await api.post('/api/exeat/student-request', { type, destination, reason, departure_at: departure, return_at: returnTime, parent_contact: parentPhone });
      setShowForm(false);
      setDestination(''); setReason(''); setDeparture(''); setReturnTime('');
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.error ?? 'Failed to submit request.');
    } finally { setSubmitting(false); }
  }

  if (loading) return <Spinner message="Loading exeat…" />;

  const q = data?.quota;

  return (
    <>
      <ScrollView
        style={[s.flex, { backgroundColor: C.bg }]}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
      >
        {/* Quota */}
        {q && (
          <Card style={s.quotaCard}>
            <Text style={[s.quotaTitle, { color: C.textSoft }]}>Exeat Quota</Text>
            <View style={s.quotaRow}>
              {[
                { label: 'Internal Used',      value: q.internal_used,      color: C.text },
                { label: 'Internal Remaining', value: q.internal_remaining, color: q.internal_remaining > 0 ? C.success : C.danger },
                { label: 'External Used',      value: q.external_used,      color: C.text },
                { label: 'External Remaining', value: q.external_remaining, color: q.external_remaining > 0 ? C.success : C.danger },
              ].map(item => (
                <View key={item.label} style={s.quotaItem}>
                  <Text style={[s.quotaValue, { color: item.color }]}>{item.value}</Text>
                  <Text style={[s.quotaLabel, { color: C.muted }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* New request button */}
        <Button label="+ Request Exeat" onPress={() => setShowForm(true)} style={s.newBtn} />

        {/* Past requests */}
        <Text style={[s.sectionTitle, { color: C.textSoft }]}>My Requests</Text>
        {(data?.requests ?? []).length === 0
          ? <Text style={[s.empty, { color: C.muted }]}>No exeat requests yet.</Text>
          : (data?.requests ?? []).map(req => {
            const sc = STATUS_CFG[req.status] ?? STATUS_CFG.pending;
            return (
              <Card key={req.id} style={s.reqCard}>
                <View style={s.reqHeader}>
                  <View>
                    <Text style={[s.reqType, { color: C.text }]}>{req.type === 'internal' ? '🏫 Internal' : '🚗 External'}</Text>
                    <Text style={[s.reqDest, { color: C.muted }]}>{req.destination}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[s.statusText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                </View>
                <Text style={[s.reqReason, { color: C.textSoft }]}>{req.reason}</Text>
                <View style={s.reqDates}>
                  <Text style={[s.reqDate, { color: C.muted }]}>Depart: {formatDateTime(req.departure_at)}</Text>
                  <Text style={[s.reqDate, { color: C.muted }]}>Return: {formatDateTime(req.return_at)}</Text>
                </View>
                {req.rejection_reason && (
                  <Text style={[s.rejection, { color: C.danger }]}>Reason: {req.rejection_reason}</Text>
                )}
              </Card>
            );
          })
        }
      </ScrollView>

      {/* Request form modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <ScrollView style={[s.modal, { backgroundColor: C.bg }]} contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: C.text }]}>New Exeat Request</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Text style={[s.closeBtn, { color: C.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Type selector */}
          <View style={[s.typeRow, { backgroundColor: C.surface, borderColor: C.border }]}>
            {(['internal', 'external'] as const).map(t => (
              <TouchableOpacity key={t} onPress={() => setType(t)}
                style={[s.typeBtn, type === t && { backgroundColor: C.primary }]}>
                <Text style={[s.typeText, { color: type === t ? '#fff' : C.textSoft }]}>
                  {t === 'internal' ? '🏫 Internal' : '🚗 External'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {[
            { label: 'Destination',      value: destination, set: setDestination, placeholder: 'Where are you going?' },
            { label: 'Reason',           value: reason,      set: setReason,      placeholder: 'Why are you leaving?' },
            { label: 'Departure (Date & Time)', value: departure, set: setDeparture, placeholder: `e.g. ${Platform.OS === 'ios' ? '2026-07-31T14:00' : '2026-07-31 14:00'}` },
            { label: 'Expected Return',  value: returnTime,  set: setReturnTime,  placeholder: `e.g. ${Platform.OS === 'ios' ? '2026-08-01T18:00' : '2026-08-01 18:00'}` },
            { label: 'Parent Contact',   value: parentPhone, set: setParentPhone, placeholder: 'Guardian phone number' },
          ].map(field => (
            <View key={field.label} style={s.field}>
              <Text style={[s.fieldLabel, { color: C.textSoft }]}>{field.label}</Text>
              <TextInput
                style={[s.fieldInput, { color: C.text, borderColor: C.border, backgroundColor: C.surface }]}
                value={field.value}
                onChangeText={t => { field.set(t); setFormError(''); }}
                placeholder={field.placeholder}
                placeholderTextColor={C.placeholder}
                multiline={field.label === 'Reason'}
              />
            </View>
          ))}

          {formError ? <Text style={[s.formErr, { color: C.danger }]}>{formError}</Text> : null}
          <Button label="Submit Request" onPress={handleSubmit} loading={submitting} size="lg" />
        </ScrollView>
      </Modal>
    </>
  );
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const s = StyleSheet.create({
  flex:         { flex: 1 },
  quotaCard:    { marginBottom: 14 },
  quotaTitle:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  quotaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quotaItem:    { width: '47%', alignItems: 'center', paddingVertical: 8 },
  quotaValue:   { fontSize: 26, fontWeight: '900' },
  quotaLabel:   { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  newBtn:       { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  reqCard:      { marginBottom: 10 },
  reqHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  reqType:      { fontSize: 14, fontWeight: '800' },
  reqDest:      { fontSize: 12, marginTop: 2 },
  statusBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:   { fontSize: 11, fontWeight: '700' },
  reqReason:    { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  reqDates:     { gap: 2 },
  reqDate:      { fontSize: 12 },
  rejection:    { fontSize: 12, fontWeight: '600', marginTop: 6 },
  empty:        { textAlign: 'center', marginTop: 32, fontSize: 14 },
  modal:        { flex: 1 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle:   { fontSize: 20, fontWeight: '800' },
  closeBtn:     { fontSize: 20, padding: 4 },
  typeRow:      { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, marginBottom: 18, gap: 4 },
  typeBtn:      { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  typeText:     { fontSize: 14, fontWeight: '700' },
  field:        { marginBottom: 16 },
  fieldLabel:   { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 7 },
  fieldInput:   { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  formErr:      { fontSize: 13, fontWeight: '600', marginBottom: 12 },
});
