import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import type { DisciplinaryLetter } from '@/types/api';

const OFFENSE_CAT_LABELS: Record<string, string> = {
  lateness_absenteeism: 'Lateness / Absenteeism',
  fighting_assault:     'Fighting / Assault',
  exam_malpractice:     'Exam Malpractice',
  substance_use:        'Substance Use',
  insubordination:      'Insubordination',
  theft_damage:         'Theft / Property Damage',
  bullying_harassment:  'Bullying / Harassment',
  indecent_behavior:    'Indecent Behavior',
  vandalism:            'Vandalism',
  other:                'Other',
};

export default function ConductScreen() {
  const C = useTheme();
  const [letters,      setLetters]      = useState<DisciplinaryLetter[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [acknowledging,setAcknowledging]= useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get<DisciplinaryLetter[]>('/api/student/discipline');
      setLetters(data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const total  = letters.length;
  const active = letters.filter(l => l.status !== 'resolved').length;

  async function acknowledge(id: string) {
    setAcknowledging(id);
    setError(null);
    try {
      const { data } = await api.post<DisciplinaryLetter>(`/api/student/discipline/${id}/acknowledge`, {});
      setLetters(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to acknowledge. Please try again.');
    } finally {
      setAcknowledging(null);
    }
  }

  if (loading) return <Spinner message="Loading conduct record…" />;

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
    >
      <View style={s.statRow}>
        <Card style={s.statCard}>
          <Text style={[s.statLabel, { color: C.muted }]}>Total Letters</Text>
          <Text style={[s.statValue, { color: C.text }]}>{total}</Text>
        </Card>
        <Card style={s.statCard}>
          <Text style={[s.statLabel, { color: C.muted }]}>Active</Text>
          <Text style={[s.statValue, { color: active > 0 ? C.warning : C.success }]}>{active}</Text>
        </Card>
      </View>

      {error && <Text style={[s.errorText, { color: C.danger }]}>{error}</Text>}

      {letters.length === 0 ? (
        <Card style={s.emptyCard}>
          <Ionicons name="shield-checkmark-outline" size={44} color={C.success} style={{ marginBottom: 10 }} />
          <Text style={[s.emptyTitle, { color: C.text }]}>No disciplinary records on file.</Text>
          <Text style={[s.emptySub, { color: C.muted }]}>Keep up the good work!</Text>
        </Card>
      ) : (
        letters.map(l => {
          const tBadge = letterTypeBadge(l.letter_type, C);
          const sBadge = letterStatusBadge(l.status, C);
          const isExpanded = expandedId === l.id;
          return (
            <Card key={l.id} style={s.letterCard} padded={false}>
              <TouchableOpacity style={s.letterHeader} onPress={() => setExpandedId(isExpanded ? null : l.id)} activeOpacity={0.75}>
                <View style={{ flex: 1 }}>
                  <View style={s.badgeRow}>
                    <View style={[s.badge, { backgroundColor: tBadge.bg }]}>
                      <Text style={[s.badgeText, { color: tBadge.color }]}>{tBadge.label}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: sBadge.bg }]}>
                      <Text style={[s.badgeText, { color: sBadge.color }]}>{sBadge.label}</Text>
                    </View>
                  </View>
                  <Text style={[s.letterSubject, { color: C.text }]}>{l.subject}</Text>
                  <Text style={[s.letterMeta, { color: C.muted }]}>
                    {OFFENSE_CAT_LABELS[l.offense_category] ?? l.offense_category}
                    {l.offense_other ? ` — ${l.offense_other}` : ''} · {formatDate(l.issued_date)}
                  </Text>
                </View>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
              </TouchableOpacity>

              {isExpanded && (
                <View style={[s.letterBody, { borderTopColor: C.border }]}>
                  <View style={[s.formalBox, { backgroundColor: C.bg, borderColor: C.border }]}>
                    <View style={[s.formalHeader, { borderBottomColor: C.border }]}>
                      <Text style={[s.formalTag, { color: C.muted }]}>Disciplinary Letter</Text>
                      <Text style={[s.formalMeta, { color: C.muted }]}>
                        Issued by {l.issued_by_name} · {formatDate(l.issued_date)}
                        {l.academic_year_name ? ` · ${l.academic_year_name}` : ''}
                        {l.semester ? ` · Semester ${l.semester}` : ''}
                      </Text>
                    </View>
                    <Text style={[s.formalText, { color: C.text }]}>{l.body}</Text>
                  </View>

                  {l.acknowledged_at && (
                    <View style={[s.infoBox, { backgroundColor: C.successLight }]}>
                      <Text style={[s.infoText, { color: C.success }]}>
                        Acknowledged by <Text style={{ fontWeight: '700' }}>{l.acknowledged_by}</Text> on {formatDate(l.acknowledged_at)}
                      </Text>
                    </View>
                  )}

                  {l.resolution_notes && (
                    <View style={[s.infoBox, { backgroundColor: C.successLight }]}>
                      <Text style={[s.infoTitle, { color: C.success }]}>Resolution</Text>
                      <Text style={[s.infoText, { color: C.text }]}>{l.resolution_notes}</Text>
                      {l.resolved_at && <Text style={[s.infoSub, { color: C.muted }]}>Resolved on {formatDate(l.resolved_at)}</Text>}
                    </View>
                  )}

                  {l.status === 'issued' && (
                    <Button
                      label={acknowledging === l.id ? 'Acknowledging…' : 'Acknowledge Receipt'}
                      size="sm"
                      loading={acknowledging === l.id}
                      onPress={() => acknowledge(l.id)}
                      style={{ alignSelf: 'flex-start' }}
                    />
                  )}
                </View>
              )}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

function letterTypeBadge(type: string, C: any) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    warning:       { label: 'Warning',       color: C.warning, bg: C.warningLight },
    final_warning: { label: 'Final Warning', color: C.danger,  bg: C.dangerLight },
    suspension:    { label: 'Suspension',    color: C.danger,  bg: C.dangerLight },
    dismissal:     { label: 'Dismissal',     color: C.danger,  bg: C.dangerLight },
    other:         { label: 'Other',         color: C.muted,   bg: C.bg },
  };
  return map[type] ?? { label: type, color: C.muted, bg: C.bg };
}

function letterStatusBadge(status: string, C: any) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    issued:       { label: 'Issued',       color: C.warning, bg: C.warningLight },
    acknowledged: { label: 'Acknowledged', color: C.primary, bg: C.primaryLight },
    resolved:     { label: 'Resolved',     color: C.success, bg: C.successLight },
  };
  return map[status] ?? { label: status, color: C.muted, bg: C.bg };
}

function formatDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const s = StyleSheet.create({
  flex:         { flex: 1 },
  statRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard:     { flex: 1 },
  statLabel:    { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  statValue:    { fontSize: 20, fontWeight: '800' },
  errorText:    { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  emptyCard:    { alignItems: 'center', paddingVertical: 48 },
  emptyTitle:   { fontSize: 15, fontWeight: '700' },
  emptySub:     { fontSize: 13, marginTop: 4 },
  letterCard:   { marginBottom: 10, overflow: 'hidden' },
  letterHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  badgeRow:     { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 5 },
  badge:        { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText:    { fontSize: 11, fontWeight: '700' },
  letterSubject:{ fontSize: 14, fontWeight: '700' },
  letterMeta:   { fontSize: 11, marginTop: 3 },
  letterBody:   { borderTopWidth: 1, padding: 14 },
  formalBox:    { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
  formalHeader: { borderBottomWidth: 1, paddingBottom: 10, marginBottom: 10 },
  formalTag:    { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  formalMeta:   { fontSize: 12, marginTop: 4 },
  formalText:   { fontSize: 13, lineHeight: 21 },
  infoBox:      { borderRadius: 10, padding: 12, marginBottom: 10 },
  infoTitle:    { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  infoText:     { fontSize: 12 },
  infoSub:      { fontSize: 11, marginTop: 4 },
});
