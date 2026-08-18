import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { FeeSummary } from '@/types/api';

export default function FeesScreen() {
  const C = useTheme();
  const [data,       setData]       = useState<FeeSummary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState<'bills' | 'payments'>('bills');
  const [disabled,   setDisabled]   = useState(false);

  async function load() {
    try {
      const { data: res } = await api.get<FeeSummary>('/api/student/fees');
      setData(res);
    } catch (err: any) {
      if (err?.response?.status === 403) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Spinner message="Loading fees…" />;
  if (disabled) return (
    <View style={[s.center, { backgroundColor: C.bg }]}>
      <Text style={[s.disabledText, { color: C.muted }]}>Fees module is not enabled for your school.</Text>
    </View>
  );
  if (!data) return null;

  const paidPct = data.total_billed > 0 ? (data.total_paid / data.total_billed) * 100 : 0;

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
    >
      {/* Summary */}
      <Card style={s.summaryCard}>
        <View style={s.summaryRow}>
          {[
            { label: 'Total Billed', value: data.total_billed,  color: C.text },
            { label: 'Paid',         value: data.total_paid,    color: C.success },
            { label: 'Outstanding',  value: data.outstanding,   color: data.outstanding > 0 ? C.danger : C.success },
          ].map(item => (
            <View key={item.label} style={s.summaryItem}>
              <Text style={[s.summaryValue, { color: item.color }]}>GH₵{item.value.toFixed(2)}</Text>
              <Text style={[s.summaryLabel, { color: C.muted }]}>{item.label}</Text>
            </View>
          ))}
        </View>
        <View style={[s.track, { backgroundColor: C.border }]}>
          <View style={[s.fill, { width: `${Math.min(paidPct, 100)}%`, backgroundColor: paidPct >= 100 ? C.success : C.warning }]} />
        </View>
        <Text style={[s.trackLabel, { color: C.muted }]}>{paidPct.toFixed(0)}% paid</Text>
      </Card>

      {data.outstanding > 0 && (
        <View style={[s.banner, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
          <Text style={[s.bannerText, { color: C.danger }]}>You have an outstanding balance of GH₵{data.outstanding.toFixed(2)}. Please settle with the accounts office.</Text>
        </View>
      )}

      {/* Tab toggle */}
      <View style={[s.tabRow, { backgroundColor: C.surface, borderColor: C.border }]}>
        {(['bills', 'payments'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={[s.tabBtn, tab === t && { backgroundColor: C.primary }]}>
            <Text style={[s.tabText, { color: tab === t ? '#fff' : C.textSoft }]}>
              {t === 'bills' ? `Bills (${data.bills.length})` : `Payments (${data.payments.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'bills' && data.bills.map(bill => (
        <Card key={bill.id} style={s.billCard}>
          <View style={s.billHeader}>
            <Text style={[s.billLabel, { color: C.text }]}>{bill.label}</Text>
            <View style={[s.statusBadge, { backgroundColor: bill.status === 'paid' ? '#DCFCE7' : bill.balance > 0 ? '#FEE2E2' : '#FEF3C7' }]}>
              <Text style={[s.statusText, { color: bill.status === 'paid' ? '#145C44' : bill.balance > 0 ? '#DC2626' : '#D97706' }]}>
                {bill.status === 'paid' ? 'Paid' : bill.balance > 0 ? 'Unpaid' : 'Partial'}
              </Text>
            </View>
          </View>
          <View style={s.billAmounts}>
            <Text style={[s.billAmt, { color: C.muted }]}>Billed: GH₵{bill.amount.toFixed(2)}</Text>
            <Text style={[s.billAmt, { color: C.success }]}>Paid: GH₵{bill.paid.toFixed(2)}</Text>
            {bill.balance > 0 && <Text style={[s.billAmt, { color: C.danger }]}>Balance: GH₵{bill.balance.toFixed(2)}</Text>}
          </View>
          {bill.due_date && (
            <Text style={[s.dueDate, { color: C.muted }]}>Due: {formatDate(bill.due_date)}</Text>
          )}
          <View style={[s.billTrack, { backgroundColor: C.border }]}>
            <View style={[s.billFill, { width: `${Math.min((bill.paid / bill.amount) * 100, 100)}%`, backgroundColor: bill.balance === 0 ? C.success : C.warning }]} />
          </View>
        </Card>
      ))}

      {tab === 'payments' && (
        data.payments.length === 0
          ? <Text style={[s.empty, { color: C.muted }]}>No payments recorded yet.</Text>
          : data.payments.map(pay => (
            <Card key={pay.id} style={s.paymentRow}>
              <View style={s.payLeft}>
                <Text style={[s.payAmount, { color: C.success }]}>GH₵{pay.amount.toFixed(2)}</Text>
                <Text style={[s.payDate, { color: C.muted }]}>{formatDate(pay.paid_at)}</Text>
              </View>
              <View style={s.payRight}>
                {pay.method && <Text style={[s.payMethod, { color: C.textSoft }]}>{pay.method}</Text>}
                {pay.receipt_number && <Text style={[s.payReceipt, { color: C.muted }]}>#{pay.receipt_number}</Text>}
              </View>
            </Card>
          ))
      )}
    </ScrollView>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const s = StyleSheet.create({
  flex:          { flex: 1 },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  disabledText:  { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  summaryCard:   { marginBottom: 14 },
  summaryRow:    { flexDirection: 'row', marginBottom: 16 },
  summaryItem:   { flex: 1, alignItems: 'center' },
  summaryValue:  { fontSize: 15, fontWeight: '800' },
  summaryLabel:  { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  track:         { height: 8, borderRadius: 4, marginTop: 2 },
  fill:          { height: 8, borderRadius: 4 },
  trackLabel:    { fontSize: 11, textAlign: 'right', marginTop: 4 },
  banner:        { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 14 },
  bannerText:    { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  tabRow:        { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, marginBottom: 16, gap: 4 },
  tabBtn:        { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabText:       { fontSize: 13, fontWeight: '700' },
  billCard:      { marginBottom: 10 },
  billHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  billLabel:     { fontSize: 14, fontWeight: '700', flex: 1 },
  statusBadge:   { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText:    { fontSize: 11, fontWeight: '700' },
  billAmounts:   { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 6 },
  billAmt:       { fontSize: 12, fontWeight: '600' },
  dueDate:       { fontSize: 11, marginBottom: 8 },
  billTrack:     { height: 6, borderRadius: 3 },
  billFill:      { height: 6, borderRadius: 3 },
  paymentRow:    { marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payLeft:       {},
  payAmount:     { fontSize: 16, fontWeight: '800' },
  payDate:       { fontSize: 12, marginTop: 2 },
  payRight:      { alignItems: 'flex-end' },
  payMethod:     { fontSize: 13, fontWeight: '600' },
  payReceipt:    { fontSize: 11, marginTop: 2 },
  empty:         { textAlign: 'center', marginTop: 32, fontSize: 14 },
});
