import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { offlineQueue, QueuedSubmission } from '@/lib/offlineQueue';
import { AttendanceCard } from '@/components/AttendanceCard';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/context/ThemeContext';
import { AttendanceRecord, AcademicYear } from '@/types/api';

const PAGE_SIZE = 30;

function PendingCard({ item, onRemove }: { item: QueuedSubmission; onRemove: () => void }) {
  const dt = new Date(item.queuedAt);
  const timeStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    ' · ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={pendingStyles.card}>
      <View style={pendingStyles.header}>
        <View style={pendingStyles.badge}>
          <Text style={pendingStyles.badgeText}>PENDING SYNC</Text>
        </View>
        <Text style={pendingStyles.time}>{timeStr}</Text>
      </View>
      <Text style={pendingStyles.subject}>{item.subject}</Text>
      <Text style={pendingStyles.meta}>{item.classNames} · {item.periods} period{item.periods !== 1 ? 's' : ''}</Text>
      {item.topic ? <Text style={pendingStyles.topic}>{item.topic}</Text> : null}
      {item.locationName ? <Text style={pendingStyles.meta}>{item.locationName}</Text> : null}
    </View>
  );
}

const pendingStyles = StyleSheet.create({
  card:       { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74', borderRadius: 12, padding: 14, marginBottom: 10 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badge:      { backgroundColor: '#EA580C', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:  { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  time:       { fontSize: 12, color: '#9A3412' },
  subject:    { fontSize: 15, fontWeight: '700', color: '#1C1208', marginBottom: 2 },
  meta:       { fontSize: 13, color: '#7C5C3E', marginTop: 2 },
  topic:      { fontSize: 13, color: '#9A6D4A', fontStyle: 'italic', marginTop: 2 },
});

export default function HistoryScreen() {
  const Colors = useTheme();
  const { user } = useAuth();
  const [records,       setRecords]       = useState<AttendanceRecord[]>([]);
  const [pending,       setPending]       = useState<QueuedSubmission[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [hasMore,       setHasMore]       = useState(true);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [filterYear,    setFilterYear]    = useState<string>('');
  const [filterSem,     setFilterSem]     = useState<string>('');

  useEffect(() => {
    api.get<AcademicYear[]>('/api/academic-years').then(r => {
      setAcademicYears(r.data);
      const current = r.data.find(y => y.is_current);
      if (current) {
        setFilterYear(current.id);
        setFilterSem(current.current_semester ? String(current.current_semester) : '');
      }
    }).catch(() => {});
  }, []);

  async function loadPending() {
    const q = await offlineQueue.getAll();
    setPending(q);
  }

  async function fetchPage(offset: number, replace: boolean, year = filterYear, sem = filterSem) {
    if (!user) return;
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset };
      if (year) params.academic_year_id = year;
      if (sem)  params.semester = sem;
      const res = await api.get('/api/attendance/history', { params });
      const data: AttendanceRecord[] = res.data;
      setRecords((prev) => replace ? data : [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }

  async function loadAll(replace: boolean, year = filterYear, sem = filterSem) {
    await Promise.all([loadPending(), fetchPage(0, replace, year, sem)]);
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    setRecords([]);
    loadAll(true);
  }, [user]));

  function applyFilter(year: string, sem: string) {
    setFilterYear(year);
    setFilterSem(sem);
    setLoading(true);
    setRecords([]);
    loadAll(true, year, sem);
  }

  const onRefresh = () => { setRefreshing(true); loadAll(true); };

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPage(records.length, false);
  };

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const { synced, failed } = await offlineQueue.syncAll(
        (path, data) => api.post(path, data)
      );
      await loadAll(true);
      if (synced > 0 && failed === 0) {
        Alert.alert('Sync Complete', `${synced} submission${synced !== 1 ? 's' : ''} uploaded successfully.`);
      } else if (synced > 0) {
        Alert.alert('Partial Sync', `${synced} uploaded, ${failed} still pending. Check your connection and try again.`);
      } else {
        Alert.alert('Sync Failed', 'Could not connect to the server. Please check your internet connection.');
      }
    } catch {
      Alert.alert('Sync Failed', 'An unexpected error occurred.');
    } finally {
      setSyncing(false);
    }
  }

  const selectedYearName = academicYears.find(y => y.id === filterYear)?.name ?? 'All Years';
  const semLabel = filterSem === '1' ? 'Semester 1' : filterSem === '2' ? 'Semester 2' : 'All Semesters';

  const filterBar = (
    <View style={styles.filterBar}>
      {/* Year picker */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        {academicYears.map(y => (
          <TouchableOpacity
            key={y.id}
            style={[styles.filterChip, filterYear === y.id && { backgroundColor: Colors.primary }]}
            onPress={() => applyFilter(y.id, filterSem)}
          >
            <Text style={[styles.filterChipText, filterYear === y.id && { color: '#fff' }]}>
              {y.name}{y.is_current ? ' ✦' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* Semester chips */}
      <View style={styles.semRow}>
        {[['', 'All'], ['1', 'Sem 1'], ['2', 'Sem 2']].map(([val, label]) => (
          <TouchableOpacity
            key={val}
            style={[styles.semChip, filterSem === val && { backgroundColor: Colors.primary }]}
            onPress={() => applyFilter(filterYear, val)}
          >
            <Text style={[styles.semChipText, filterSem === val && { color: '#fff' }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const pendingHeader = (
    <View>
      {filterBar}
      {pending.length > 0 && (
        <View style={styles.pendingSection}>
          <View style={styles.pendingHeaderRow}>
            <Text style={styles.pendingSectionTitle}>
              Pending Sync ({pending.length})
            </Text>
            <TouchableOpacity style={styles.syncBtn} onPress={handleSyncNow} disabled={syncing}>
              {syncing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.syncBtnText}>Sync Now</Text>}
            </TouchableOpacity>
          </View>
          {pending.map(item => (
            <PendingCard key={item.id} item={item} onRemove={loadPending} />
          ))}
          <View style={styles.divider} />
        </View>
      )}
      <Text style={styles.historyLabel}>{selectedYearName} · {semLabel}</Text>
    </View>
  );

  if (loading) return <Spinner />;

  return (
    <View style={styles.container}>
      <FlatList
        data={records}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <AttendanceCard record={item} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={pendingHeader}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={Colors.primary} /> : null}
        ListEmptyComponent={
          <EmptyState icon="📋" title="No records" subtitle={`No attendance records for ${selectedYearName} · ${semLabel}.`} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F4EFE6' },
  list:               { padding: 16, flexGrow: 1 },
  // Filter bar
  filterBar:          { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2D9CC', paddingBottom: 10, marginBottom: 12, marginHorizontal: -16, paddingHorizontal: 16 },
  filterScroll:       { gap: 8, paddingVertical: 10 },
  filterChip:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0EDE8', borderWidth: 1, borderColor: '#E2D9CC' },
  filterChipText:     { fontSize: 12, fontWeight: '700', color: '#4A3F32' },
  semRow:             { flexDirection: 'row', gap: 8 },
  semChip:            { flex: 1, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0EDE8', alignItems: 'center', borderWidth: 1, borderColor: '#E2D9CC' },
  semChipText:        { fontSize: 12, fontWeight: '700', color: '#4A3F32' },
  // Pending
  pendingSection:     { marginBottom: 8 },
  pendingHeaderRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pendingSectionTitle:{ fontSize: 13, fontWeight: '700', color: '#EA580C', textTransform: 'uppercase', letterSpacing: 0.5 },
  syncBtn:            { backgroundColor: '#EA580C', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, minWidth: 80, alignItems: 'center' },
  syncBtnText:        { color: '#fff', fontSize: 13, fontWeight: '700' },
  divider:            { height: 1, backgroundColor: '#E2D9CC', marginVertical: 16 },
  historyLabel:       { fontSize: 13, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
});
