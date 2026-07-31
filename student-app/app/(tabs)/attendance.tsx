import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { AcademicYear, AttendanceSummary, AttendanceSession } from '@/types/api';

const STATUS_CFG = {
  present: { label: 'Present', color: '#15803D', bg: '#DCFCE7' },
  absent:  { label: 'Absent',  color: '#DC2626', bg: '#FEE2E2' },
  late:    { label: 'Late',    color: '#D97706', bg: '#FEF3C7' },
};

export default function AttendanceScreen() {
  const C = useTheme();
  const [years,      setYears]      = useState<AcademicYear[]>([]);
  const [yearId,     setYearId]     = useState('');
  const [semester,   setSemester]   = useState(1);
  const [data,       setData]       = useState<AttendanceSummary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (yId: string, sem: number) => {
    if (!yId) return;
    try {
      const { data: res } = await api.get<AttendanceSummary>('/api/student/attendance', { params: { academic_year_id: yId, semester: sem } });
      setData(res);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    api.get<AcademicYear[]>('/api/student/academic-years').then(({ data: yrs }) => {
      setYears(yrs);
      const cur = yrs.find(y => y.is_current) ?? yrs[0];
      if (cur) { setYearId(cur.id); setSemester(cur.current_semester ?? 1); load(cur.id, cur.current_semester ?? 1); }
      else setLoading(false);
    });
  }, []);

  useEffect(() => { if (yearId) load(yearId, semester); }, [yearId, semester, load]);

  if (loading) return <Spinner message="Loading attendance…" />;

  const rate = data?.rate ?? 0;
  const rateColor = rate >= 75 ? C.success : C.danger;
  const total = (data?.present ?? 0) + (data?.absent ?? 0) + (data?.late ?? 0);

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(yearId, semester); }} tintColor={C.accent} />}
    >
      {/* Pickers */}
      <View style={s.pickerRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          {years.map(y => (
            <TouchableOpacity key={y.id} onPress={() => setYearId(y.id)}
              style={[s.pill, { backgroundColor: yearId === y.id ? C.primary : C.surface, borderColor: yearId === y.id ? C.primary : C.border }]}>
              <Text style={[s.pillText, { color: yearId === y.id ? '#fff' : C.textSoft }]}>{y.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={s.semRow}>
          {[1, 2].map(sem_ => (
            <TouchableOpacity key={sem_} onPress={() => setSemester(sem_)}
              style={[s.semBtn, { backgroundColor: semester === sem_ ? C.accent : C.surface, borderColor: semester === sem_ ? C.accent : C.border }]}>
              <Text style={[s.semText, { color: semester === sem_ ? '#fff' : C.textSoft }]}>Sem {sem_}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {data && (
        <>
          {/* Rate gauge */}
          <Card style={s.rateCard}>
            <View style={s.rateRow}>
              <Text style={[s.rateValue, { color: rateColor }]}>{rate.toFixed(1)}%</Text>
              <Text style={[s.rateLabel, { color: C.muted }]}>Attendance Rate</Text>
            </View>
            <View style={[s.track, { backgroundColor: C.border }]}>
              <View style={[s.fill, { width: `${Math.min(rate, 100)}%`, backgroundColor: rateColor }]} />
              <View style={[s.marker, { left: '75%', backgroundColor: C.warning }]} />
            </View>
            <Text style={[s.markerLabel, { color: C.muted }]}>75% minimum</Text>

            {/* Counts */}
            <View style={s.countsRow}>
              {[
                { label: 'Present', count: data.present, color: '#15803D', bg: '#DCFCE7' },
                { label: 'Absent',  count: data.absent,  color: '#DC2626', bg: '#FEE2E2' },
                { label: 'Late',    count: data.late,    color: '#D97706', bg: '#FEF3C7' },
                { label: 'Total',   count: total,        color: C.textSoft, bg: C.surfaceWarm },
              ].map(item => (
                <View key={item.label} style={[s.countBox, { backgroundColor: item.bg }]}>
                  <Text style={[s.countValue, { color: item.color }]}>{item.count}</Text>
                  <Text style={[s.countLabel, { color: item.color }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </Card>

          {rate < 75 && (
            <View style={[s.warn, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
              <Text style={[s.warnText, { color: C.danger }]}>⚠ Attendance below 75% minimum. You need {Math.ceil((0.75 * total - data.present) / 0.25)} more sessions to reach 75%.</Text>
            </View>
          )}

          {/* Session log */}
          <Text style={[s.sectionTitle, { color: C.textSoft }]}>Session Log</Text>
          {(data.sessions ?? []).length === 0
            ? <Text style={[s.empty, { color: C.muted }]}>No sessions recorded yet.</Text>
            : (data.sessions ?? []).map(session => {
                const sc = STATUS_CFG[session.status] ?? STATUS_CFG.present;
                return (
                  <View key={session.id} style={[s.sessionRow, { backgroundColor: C.surface, borderColor: C.border }]}>
                    <View style={s.sessionLeft}>
                      <Text style={[s.sessionDate, { color: C.text }]}>{formatDate(session.date)}</Text>
                      {session.subject && <Text style={[s.sessionSubject, { color: C.muted }]}>{session.subject}</Text>}
                      {session.period && <Text style={[s.sessionPeriod, { color: C.muted }]}>{session.period}</Text>}
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[s.statusText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                  </View>
                );
              })
          }
        </>
      )}
    </ScrollView>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  flex:         { flex: 1 },
  pickerRow:    { marginBottom: 14, gap: 10 },
  pills:        { gap: 8, paddingVertical: 2 },
  pill:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  pillText:     { fontSize: 13, fontWeight: '600' },
  semRow:       { flexDirection: 'row', gap: 8 },
  semBtn:       { flex: 1, paddingVertical: 7, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  semText:      { fontSize: 13, fontWeight: '600' },
  rateCard:     { marginBottom: 14 },
  rateRow:      { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 12 },
  rateValue:    { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  rateLabel:    { fontSize: 14, fontWeight: '600' },
  track:        { height: 10, borderRadius: 5, overflow: 'visible', position: 'relative', marginBottom: 4 },
  fill:         { height: 10, borderRadius: 5 },
  marker:       { position: 'absolute', top: -3, width: 3, height: 16, borderRadius: 2 },
  markerLabel:  { fontSize: 11, textAlign: 'right', marginBottom: 16 },
  countsRow:    { flexDirection: 'row', gap: 8, marginTop: 4 },
  countBox:     { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  countValue:   { fontSize: 20, fontWeight: '800' },
  countLabel:   { fontSize: 11, fontWeight: '600', marginTop: 2 },
  warn:         { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 14 },
  warnText:     { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  sessionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  sessionLeft:  { flex: 1 },
  sessionDate:  { fontSize: 14, fontWeight: '700' },
  sessionSubject:{ fontSize: 12, marginTop: 2 },
  sessionPeriod: { fontSize: 11, marginTop: 1 },
  statusBadge:  { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  statusText:   { fontSize: 12, fontWeight: '700' },
  empty:        { textAlign: 'center', marginTop: 24, fontSize: 14 },
});
