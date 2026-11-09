import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { ClinicVisit, ClinicHealthProfile } from '@/types/api';

const OUTCOME_LABELS: Record<string, string> = {
  returned_to_class:  'Returned to class',
  sent_home:          'Sent home',
  referred_to_hospital:'Referred to hospital',
  admitted_in_clinic: 'Admitted in clinic',
  other:              'Other',
};

export default function ClinicScreen() {
  const C = useTheme();
  const [visits,     setVisits]     = useState<ClinicVisit[]>([]);
  const [profile,    setProfile]    = useState<ClinicHealthProfile | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const [v, p] = await Promise.all([
        api.get<ClinicVisit[]>('/api/clinic/my-visits'),
        api.get<ClinicHealthProfile | null>('/api/clinic/my-health-profile'),
      ]);
      setVisits(v.data);
      setProfile(p.data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Spinner message="Loading clinic records…" />;

  const hasProfile = profile && (
    profile.blood_group || profile.genotype || profile.known_allergies ||
    profile.known_conditions || profile.current_medications
  );

  const profileRows: { label: string; value: string }[] = profile ? [
    profile.blood_group         && { label: 'Blood group',         value: profile.blood_group },
    profile.genotype            && { label: 'Genotype',            value: profile.genotype },
    profile.known_allergies     && { label: 'Known allergies',     value: profile.known_allergies },
    profile.known_conditions    && { label: 'Known conditions',    value: profile.known_conditions },
    profile.current_medications && { label: 'Current medications', value: profile.current_medications },
  ].filter(Boolean) as { label: string; value: string }[] : [];

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
    >
      {hasProfile && (
        <Card style={s.profileCard}>
          <Text style={[s.sectionTitle, { color: C.textSoft }]}>Health profile on file</Text>
          <View style={s.profileGrid}>
            {profileRows.map(row => (
              <View key={row.label} style={s.profileItem}>
                <Text style={[s.profileLabel, { color: C.muted }]}>{row.label}</Text>
                <Text style={[s.profileValue, { color: C.text }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Text style={[s.sectionTitle, { color: C.textSoft, marginTop: hasProfile ? 4 : 0 }]}>Visit history</Text>
      {visits.length === 0 ? (
        <Text style={[s.empty, { color: C.muted }]}>You have no recorded clinic visits.</Text>
      ) : (
        visits.map(v => {
          const severityColor = v.severity === 'serious' ? C.danger : v.severity === 'moderate' ? C.warning : C.success;
          const severityBg    = v.severity === 'serious' ? C.dangerLight : v.severity === 'moderate' ? C.warningLight : C.successLight;
          return (
            <Card key={v.id} style={s.visitCard}>
              <View style={s.visitHeader}>
                <Text style={[s.visitComplaint, { color: C.text }]}>{v.complaint}</Text>
                <View style={[s.badge, { backgroundColor: severityBg }]}>
                  <Text style={[s.badgeText, { color: severityColor }]}>{v.severity}</Text>
                </View>
              </View>
              <Text style={[s.visitMeta, { color: C.muted }]}>
                {formatDate(v.visit_date)}{v.outcome ? ` · ${OUTCOME_LABELS[v.outcome] ?? v.outcome}` : ''}
              </Text>
              {v.treatment_given && (
                <Text style={[s.visitTreatment, { color: C.muted }]}>Treatment: {v.treatment_given}</Text>
              )}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const s = StyleSheet.create({
  flex:           { flex: 1 },
  sectionTitle:   { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  profileCard:    { marginBottom: 20 },
  profileGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  profileItem:    { minWidth: '45%' },
  profileLabel:   { fontSize: 11, marginBottom: 2 },
  profileValue:   { fontSize: 14, fontWeight: '600' },
  visitCard:      { marginBottom: 10 },
  visitHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  visitComplaint: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  badge:          { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText:      { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  visitMeta:      { fontSize: 12 },
  visitTreatment: { fontSize: 12, marginTop: 4 },
  empty:          { textAlign: 'center', marginTop: 16, fontSize: 14, color: '#8C7E6E' },
});
