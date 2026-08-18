import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Dropdown } from '@/components/ui/Dropdown';
import type { AcademicYear, AttendanceSummary } from '@/types/api';

const SEM_OPTIONS = [
  { label: 'Semester 1', value: '1' },
  { label: 'Semester 2', value: '2' },
];

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  Present: { label: 'Present', color: '#145C44', bg: '#DCFCE7' },
  Absent:  { label: 'Absent',  color: '#DC2626', bg: '#FEE2E2' },
  Late:    { label: 'Late',    color: '#D97706', bg: '#FEF3C7' },
};

export default function AttendanceScreen() {
  const C = useTheme();
  const [years,         setYears]         = useState<AcademicYear[]>([]);
  const [yearId,        setYearId]        = useState('');
  const [semester,      setSemester]      = useState(1);
  const [data,          setData]          = useState<AttendanceSummary | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);

  const load = useCallback(async (yId: string, sem: number, isFilter = false) => {
    if (!yId) return;
    if (isFilter) setFilterLoading(true);
    try {
      const { data: res } = await api.get<AttendanceSummary>('/api/student/attendance', { params: { academic_year_id: yId, semester: sem } });
      setData(res);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); setFilterLoading(false); }
  }, []);

  useEffect(() => {
    api.get<AcademicYear[]>('/api/student/academic-years').then(({ data: yrs }) => {
      setYears(yrs);
      const cur = yrs.find(y => y.is_current) ?? yrs[0];
      if (cur) { setYearId(cur.id); setSemester(cur.current_semester ?? 1); load(cur.id, cur.current_semester ?? 1); }
      else setLoading(false);
    });
  }, []);

  const handleYearChange = (val: string) => { setYearId(val); load(val, semester, true); };
  const handleSemChange  = (val: string) => { const s = parseInt(val); setSemester(s); load(yearId, s, true); };

  const yearOptions = years.map(y => ({ label: y.name, value: y.id }));

  if (loading) return <Spinner message="Loading attendance…" />;

  const present = data?.summary?.present ?? 0;
  const absent  = data?.summary?.absent  ?? 0;
  const late    = data?.summary?.late    ?? 0;
  const total   = data?.summary?.total   ?? (present + absent + late);
  const rate    = data?.summary?.rate    ?? 0;
  const rateColor = rate >= 75 ? C.success : C.danger;

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(yearId, semester); }} tintColor={C.accent} />}
    >
      {/* Filter row */}
      <View style={s.filterRow}>
        <Dropdown
          label="Academic Year"
          options={yearOptions}
          value={yearId}
          onChange={handleYearChange}
          style={s.filterYear}
        />
        <Dropdown
          label="Semester"
          options={SEM_OPTIONS}
          value={String(semester)}
          onChange={handleSemChange}
          style={s.filterSem}
        />
      </View>

      {filterLoading && (
        <View style={[s.filterSpinner, { backgroundColor: C.surface }]}>
          <ActivityIndicator color={C.primary} />
          <Text style={[s.filterSpinnerText, { color: C.muted }]}>Loading…</Text>
        </View>
      )}

      {!filterLoading && data && (
        <>
          {/* Rate card */}
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

            {/* Stats row */}
            <View style={s.countsRow}>
              {[
                { label: 'Present', count: present, color: '#145C44', bg: '#DCFCE7' },
                { label: 'Absent',  count: absent,  color: '#DC2626', bg: '#FEE2E2' },
                { label: 'Late',    count: late,    color: '#D97706', bg: '#FEF3C7' },
                { label: 'Total',   count: total,   color: C.textSoft as string, bg: C.surfaceWarm as string },
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
              <Ionicons name="warning-outline" size={16} color={C.danger} />
              <Text style={[s.warnText, { color: C.danger }]}>
                Attendance below 75% minimum.
                {total > 0 ? ` You need ${Math.max(0, Math.ceil((0.75 * total - present) / 0.25))} more sessions to reach 75%.` : ''}
              </Text>
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
                      {session.period  && <Text style={[s.sessionPeriod,  { color: C.muted }]}>{session.period}</Text>}
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

      {!filterLoading && !data && (
        <Text style={[s.empty, { color: C.muted }]}>No attendance data found.</Text>
      )}
    </ScrollView>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  flex:              { flex: 1 },
  filterRow:         { flexDirection: 'row', gap: 10, marginBottom: 16 },
  filterYear:        { flex: 2 },
  filterSem:         { flex: 1 },
  filterSpinner:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, borderRadius: 14, marginBottom: 12 },
  filterSpinnerText: { fontSize: 14, fontWeight: '600' },
  rateCard:          { marginBottom: 14 },
  rateRow:           { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 12 },
  rateValue:         { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  rateLabel:         { fontSize: 14, fontWeight: '600' },
  track:             { height: 10, borderRadius: 5, overflow: 'visible', position: 'relative', marginBottom: 4 },
  fill:              { height: 10, borderRadius: 5 },
  marker:            { position: 'absolute', top: -3, width: 3, height: 16, borderRadius: 2 },
  markerLabel:       { fontSize: 11, textAlign: 'right', marginBottom: 16 },
  countsRow:         { flexDirection: 'row', gap: 8, marginTop: 4 },
  countBox:          { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  countValue:        { fontSize: 20, fontWeight: '800' },
  countLabel:        { fontSize: 11, fontWeight: '600', marginTop: 2 },
  warn:              { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 14 },
  warnText:          { fontSize: 13, fontWeight: '600', lineHeight: 18, flex: 1 },
  sectionTitle:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  sessionRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  sessionLeft:       { flex: 1 },
  sessionDate:       { fontSize: 14, fontWeight: '700' },
  sessionSubject:    { fontSize: 12, marginTop: 2 },
  sessionPeriod:     { fontSize: 11, marginTop: 1 },
  statusBadge:       { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  statusText:        { fontSize: 12, fontWeight: '700' },
  empty:             { textAlign: 'center', marginTop: 24, fontSize: 14 },
});
