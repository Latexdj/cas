import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { ClearanceStatus } from '@/types/api';

const STATUS_CFG = {
  not_initiated:  { label: 'Not Started',     color: '#64748B', bg: '#F1F5F9' },
  in_progress:    { label: 'In Progress',     color: '#D97706', bg: '#FEF3C7' },
  action_required:{ label: 'Action Required', color: '#DC2626', bg: '#FEE2E2' },
  fully_cleared:  { label: 'Fully Cleared',   color: '#15803D', bg: '#DCFCE7' },
};

const ITEM_STATUS = {
  cleared:          { icon: '✓', color: '#15803D', bg: '#DCFCE7' },
  not_cleared:      { icon: '✗', color: '#DC2626', bg: '#FEE2E2' },
  action_required:  { icon: '!', color: '#D97706', bg: '#FEF3C7' },
};

export default function ClearanceScreen() {
  const C = useTheme();
  const [data,       setData]       = useState<ClearanceStatus | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const { data: res } = await api.get<ClearanceStatus>('/api/student/clearance');
      setData(res);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Spinner message="Loading clearance…" />;

  const overall = data?.overall ?? 'not_initiated';
  const sc = STATUS_CFG[overall];
  const cleared = (data?.items ?? []).filter(i => i.status === 'cleared').length;
  const total   = (data?.items ?? []).length;
  const pct     = total > 0 ? Math.round((cleared / total) * 100) : 0;

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
    >
      {/* Overall status */}
      <Card style={[s.overallCard, { borderColor: sc.color }]}>
        <View style={s.overallRow}>
          <View style={[s.overallBadge, { backgroundColor: sc.bg }]}>
            <Text style={[s.overallLabel, { color: sc.color }]}>{sc.label}</Text>
          </View>
          <Text style={[s.overallPct, { color: sc.color }]}>{pct}%</Text>
        </View>
        <View style={[s.track, { backgroundColor: C.border }]}>
          <View style={[s.fill, { width: `${pct}%`, backgroundColor: overall === 'fully_cleared' ? '#15803D' : overall === 'action_required' ? '#DC2626' : '#D97706' }]} />
        </View>
        <Text style={[s.trackLabel, { color: C.muted }]}>{cleared} of {total} offices cleared</Text>
      </Card>

      {/* Office items */}
      <Text style={[s.sectionTitle, { color: C.textSoft }]}>Office Checklist</Text>
      {(data?.items ?? []).map((item, i) => {
        const ic = ITEM_STATUS[item.status] ?? ITEM_STATUS.not_cleared;
        return (
          <Card key={i} style={s.itemCard}>
            <View style={s.itemRow}>
              <View style={[s.iconBox, { backgroundColor: ic.bg }]}>
                <Text style={[s.iconText, { color: ic.color }]}>{ic.icon}</Text>
              </View>
              <View style={s.itemBody}>
                <Text style={[s.officeName, { color: C.text }]}>{item.office}</Text>
                {item.notes && <Text style={[s.itemNotes, { color: C.muted }]}>{item.notes}</Text>}
              </View>
              <View style={[s.statusBadge, { backgroundColor: ic.bg }]}>
                <Text style={[s.statusText, { color: ic.color }]}>
                  {item.status === 'cleared' ? 'Cleared' : item.status === 'action_required' ? 'Action Needed' : 'Not Cleared'}
                </Text>
              </View>
            </View>
          </Card>
        );
      })}

      {(data?.items ?? []).length === 0 && (
        <Text style={[s.empty, { color: C.muted }]}>No clearance items found.</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  flex:          { flex: 1 },
  overallCard:   { marginBottom: 20, borderWidth: 2 },
  overallRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  overallBadge:  { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  overallLabel:  { fontSize: 14, fontWeight: '800' },
  overallPct:    { fontSize: 26, fontWeight: '900' },
  track:         { height: 10, borderRadius: 5 },
  fill:          { height: 10, borderRadius: 5 },
  trackLabel:    { fontSize: 12, marginTop: 8 },
  sectionTitle:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  itemCard:      { marginBottom: 10 },
  itemRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox:       { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  iconText:      { fontSize: 16, fontWeight: '800' },
  itemBody:      { flex: 1 },
  officeName:    { fontSize: 14, fontWeight: '700' },
  itemNotes:     { fontSize: 12, marginTop: 3, lineHeight: 16 },
  statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:    { fontSize: 11, fontWeight: '700' },
  empty:         { textAlign: 'center', marginTop: 32, fontSize: 14 },
});
