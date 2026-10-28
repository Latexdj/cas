import React, { useCallback, useState } from 'react';
import {
  Alert, Image, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/Button';
import { LessonObservation, LessonObservationDetail } from '@/types/api';

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusStyle(status: string) {
  if (status === 'Scheduled')    return { bg: '#FEF3C7', color: '#92400E' };
  if (status === 'Completed')    return { bg: '#DBEAFE', color: '#1D4ED8' };
  if (status === 'Acknowledged') return { bg: '#E0E7FF', color: '#4338CA' };
  return { bg: '#DCFCE7', color: '#2D7A4F' }; // Closed
}

export default function ObservationsScreen() {
  const Colors = useTheme();

  const [observations, setObservations] = useState<LessonObservation[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeId, setActiveId]     = useState<string | null>(null);
  const [detail,   setDetail]       = useState<LessonObservationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment,  setComment]      = useState('');
  const [acking,   setAcking]       = useState(false);
  const [togglingAction, setTogglingAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/lesson-observation');
      setObservations(Array.isArray(res.data) ? res.data : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  async function openDetail(id: string) {
    setActiveId(id);
    setDetailLoading(true);
    setComment('');
    try {
      const res = await api.get(`/api/lesson-observation/${id}`);
      setDetail(res.data);
    } catch {
      Alert.alert('Error', 'Could not load this observation.');
      setActiveId(null);
    } finally { setDetailLoading(false); }
  }

  function closeDetail() { setActiveId(null); setDetail(null); }

  async function acknowledge() {
    if (!activeId) return;
    setAcking(true);
    try {
      await api.post(`/api/lesson-observation/${activeId}/acknowledge`, { comment: comment || undefined });
      const res = await api.get(`/api/lesson-observation/${activeId}`);
      setDetail(res.data);
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Failed to acknowledge.');
    } finally { setAcking(false); }
  }

  async function toggleAction(actionId: string, currentStatus: 'Open' | 'Done') {
    if (!activeId) return;
    setTogglingAction(actionId);
    try {
      await api.patch(`/api/lesson-observation/${activeId}/actions/${actionId}`, { status: currentStatus === 'Open' ? 'Done' : 'Open' });
      const res = await api.get(`/api/lesson-observation/${activeId}`);
      setDetail(res.data);
      load();
    } catch {
      Alert.alert('Error', 'Failed to update action item.');
    } finally { setTogglingAction(null); }
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading
          ? [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
          : observations.length === 0
          ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👁️</Text>
              <Text style={styles.emptyTitle}>No observations yet</Text>
              <Text style={styles.emptySub}>Feedback from lesson observations will appear here</Text>
            </View>
          )
          : observations.map(o => {
            const s = statusStyle(o.status);
            return (
              <TouchableOpacity key={o.id} style={styles.card} onPress={() => openDetail(o.id)} activeOpacity={0.7}>
                <View style={styles.cardRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.cardTitle}>{o.subject || 'Lesson Observation'} {o.class_names ? `· ${o.class_names}` : ''}</Text>
                    <Text style={styles.meta}>Observed by {o.observer_name}</Text>
                    <Text style={styles.meta}>{fmt(o.observed_at || o.scheduled_at)}</Text>
                    {o.open_actions > 0 && <Text style={[styles.meta, { color: '#C8780A', fontWeight: '600' }]}>{o.open_actions} open action{o.open_actions !== 1 ? 's' : ''}</Text>}
                  </View>
                  <View style={[styles.badge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.badgeText, { color: s.color }]}>{o.status}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        }
      </ScrollView>

      <Modal visible={!!activeId} transparent animationType="slide" onRequestClose={closeDetail}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              {detailLoading || !detail ? (
                <Text style={styles.sheetSub}>Loading…</Text>
              ) : detail.status === 'Scheduled' ? (
                <>
                  <Text style={styles.sheetTitle}>{detail.subject || 'Lesson Observation'}</Text>
                  <Text style={styles.sheetSub}>This observation hasn&apos;t happened yet. Feedback will appear here once it&apos;s conducted.</Text>
                  <Button label="Close" variant="secondary" onPress={closeDetail} />
                </>
              ) : (
                <>
                  <Text style={styles.sheetTitle}>{detail.subject || 'Lesson Observation'} {detail.class_names ? `· ${detail.class_names}` : ''}</Text>
                  <Text style={styles.sheetSub}>Observed by {detail.observer_name} · {fmt(detail.observed_at || detail.scheduled_at)}</Text>

                  <Text style={styles.fieldLabel}>What Went Well</Text>
                  <Text style={styles.bodyText}>{detail.glow_notes || '—'}</Text>

                  <Text style={styles.fieldLabel}>What to Work On</Text>
                  <Text style={styles.bodyText}>{detail.grow_notes || '—'}</Text>

                  <Text style={styles.fieldLabel}>Recommended Action</Text>
                  <Text style={styles.bodyText}>{detail.recommended_action || '—'}</Text>

                  {detail.photos.length > 0 && (
                    <>
                      <Text style={styles.fieldLabel}>Photos</Text>
                      <View style={styles.photoRow}>
                        {detail.photos.map(p => (
                          <Image key={p.id} source={{ uri: p.photo_url }} style={styles.photo} resizeMode="cover" />
                        ))}
                      </View>
                    </>
                  )}

                  {detail.actions.length > 0 && (
                    <>
                      <Text style={styles.fieldLabel}>Action Items</Text>
                      {detail.actions.map(a => (
                        <TouchableOpacity key={a.id} style={styles.actionRow} onPress={() => toggleAction(a.id, a.status)} disabled={togglingAction === a.id}>
                          <View style={[styles.checkbox, a.status === 'Done' && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}>
                            {a.status === 'Done' && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <View style={styles.flex1}>
                            <Text style={[styles.actionText, a.status === 'Done' && { textDecorationLine: 'line-through', color: '#8C7E6E' }]}>{a.description}</Text>
                            {a.due_date && <Text style={styles.meta}>Due {fmtDate(a.due_date)}</Text>}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}

                  {detail.teacher_ack_at ? (
                    <View style={{ marginTop: 14 }}>
                      <Text style={styles.meta}>You acknowledged this on {fmtDate(detail.teacher_ack_at)}</Text>
                      {detail.teacher_comment ? <Text style={styles.italicText}>&quot;{detail.teacher_comment}&quot;</Text> : null}
                    </View>
                  ) : detail.status === 'Completed' ? (
                    <View style={{ marginTop: 14 }}>
                      <Text style={styles.fieldLabel}>Acknowledge This Feedback</Text>
                      <TextInput
                        style={styles.textArea}
                        placeholder="Optional comment — add context or push back if needed…"
                        placeholderTextColor="#8C7E6E"
                        value={comment}
                        onChangeText={setComment}
                        multiline
                        numberOfLines={3}
                      />
                      <Button label="Acknowledge" onPress={acknowledge} loading={acking} />
                    </View>
                  ) : null}

                  <View style={{ marginTop: 14 }}>
                    <Button label="Close" variant="secondary" onPress={closeDetail} />
                  </View>
                </>
              )}
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
  skeleton:    { backgroundColor: '#E5DDD5', borderRadius: 16, height: 96, marginBottom: 12 },
  empty:       { backgroundColor: '#FAFAF8', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 32, alignItems: 'center' },
  emptyIcon:   { fontSize: 32, marginBottom: 8 },
  emptyTitle:  { fontSize: 15, fontWeight: '700', color: '#2C2218' },
  emptySub:    { fontSize: 13, color: '#8C7E6E', marginTop: 4, textAlign: 'center' },
  card:        { backgroundColor: '#FAFAF8', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 16, marginBottom: 12 },
  cardRow:     { flexDirection: 'row', alignItems: 'flex-start' },
  flex1:       { flex: 1 },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: '#2C2218' },
  meta:        { fontSize: 12, color: '#8C7E6E', marginTop: 2 },
  italicText:  { fontSize: 12, color: '#4A3F32', fontStyle: 'italic', marginTop: 4 },
  badge:       { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 10 },
  badgeText:   { fontSize: 12, fontWeight: '700' },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#FAFAF8', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: '#1C1208', marginBottom: 4 },
  sheetSub:    { fontSize: 13, color: '#8C7E6E', marginBottom: 18 },
  fieldLabel:  { fontSize: 11, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  bodyText:    { fontSize: 14, color: '#2C2218', lineHeight: 20 },
  textArea:    { backgroundColor: '#F4EFE6', borderRadius: 10, padding: 14, fontSize: 15, color: '#1C1208', minHeight: 80, textAlignVertical: 'top', marginBottom: 12, borderWidth: 1, borderColor: '#E2D9CC' },
  photoRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo:       { width: 100, height: 76, borderRadius: 8, borderWidth: 1, borderColor: '#E2D9CC' },
  actionRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  checkbox:    { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#B5A898', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkmark:   { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionText:  { fontSize: 13, color: '#2C2218' },
});
