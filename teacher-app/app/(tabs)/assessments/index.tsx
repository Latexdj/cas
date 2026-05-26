import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { DropdownSelect } from '@/components/DropdownSelect';
import type { AcademicYear } from '@/types/api';

interface SubjectSlot { subject: string; class_name: string }

export default function AssessmentsIndexScreen() {
  const Colors = useTheme();
  const [years,       setYears]       = useState<AcademicYear[]>([]);
  const [yearId,      setYearId]      = useState<string>('');
  const [semester,    setSemester]    = useState<1 | 2>(1);
  const [slots,       setSlots]       = useState<SubjectSlot[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState('');

  const load = useCallback(async (yId?: string, sem?: 1 | 2) => {
    setError('');
    try {
      const { data: yearList } = await api.get<AcademicYear[]>('/api/academic-years');
      setYears(yearList);

      const currentYear = yearList.find(y => y.is_current);
      const effectiveYearId   = yId   ?? (currentYear?.id ?? yearList[0]?.id ?? '');
      const effectiveSemester = sem   ?? (currentYear?.current_semester ?? 1);
      if (!yId)  setYearId(effectiveYearId);
      if (!sem)  setSemester(effectiveSemester as 1 | 2);

      if (!effectiveYearId) { setSlots([]); return; }
      const { data } = await api.get<SubjectSlot[]>('/api/assessments/my-subjects', {
        params: { academic_year_id: effectiveYearId, semester: effectiveSemester },
      });
      setSlots(data);
    } catch {
      setError('Failed to load subjects.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  function onRefresh() { setRefreshing(true); load(yearId, semester); }

  function changeYear(id: string) {
    setYearId(id);
    setLoading(true);
    load(id, semester);
  }
  function changeSemester(s: 1 | 2) {
    setSemester(s);
    setLoading(true);
    load(yearId, s);
  }

  const currentYearName = years.find(y => y.id === yearId)?.name ?? '';

  return (
    <View style={[styles.container, { backgroundColor: Colors.bg }]}>
      {/* Year + Semester selector */}
      <View style={[styles.selectorCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <View style={styles.selectorRow}>
          <DropdownSelect
            value={yearId}
            options={years.map(y => ({ label: y.name, value: y.id }))}
            onChange={changeYear}
            placeholder="Academic Year"
            colors={Colors}
            style={{ flex: 1 }}
          />
          <DropdownSelect
            value={String(semester)}
            options={[{ label: 'Semester 1', value: '1' }, { label: 'Semester 2', value: '2' }]}
            onChange={v => changeSemester(parseInt(v) as 1 | 2)}
            colors={Colors}
            style={{ width: 130 }}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: Colors.danger, fontSize: 14 }}>{error}</Text>
        </View>
      ) : slots.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="book-outline" size={48} color={Colors.muted} />
          <Text style={[styles.emptyText, { color: Colors.muted }]}>No timetable subjects found{'\n'}for this year and semester.</Text>
        </View>
      ) : (
        <FlatList
          data={slots}
          keyExtractor={i => `${i.subject}|${i.class_name}`}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: Colors.surface, borderColor: Colors.border }]}
              onPress={() => router.push({ pathname: '/(tabs)/assessments/subject', params: { subject: item.subject, class_name: item.class_name, year_id: yearId, semester: String(semester), year_name: currentYearName } })}
            >
              <View style={[styles.cardAccent, { backgroundColor: Colors.primary }]} />
              <View style={styles.cardBody}>
                <Text style={[styles.cardSubject, { color: Colors.text }]}>{item.subject}</Text>
                <Text style={[styles.cardClass, { color: Colors.muted }]}>{item.class_name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  selectorCard: { margin: 16, borderRadius: 14, padding: 14, borderWidth: 1 },
  selectorRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText:    { fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 22 },
  card:         { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  cardAccent:   { width: 4, alignSelf: 'stretch' },
  cardBody:     { flex: 1, padding: 14 },
  cardSubject:  { fontSize: 15, fontWeight: '700' },
  cardClass:    { fontSize: 12, marginTop: 2 },
});

