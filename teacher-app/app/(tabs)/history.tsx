import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { offlineQueue, QueuedSubmission } from '@/lib/offlineQueue';
import { AttendanceCard } from '@/components/AttendanceCard';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { DropdownSelect } from '@/components/DropdownSelect';
import { useTheme } from '@/context/ThemeContext';
import { AttendanceRecord, AcademicYear } from '@/types/api';

/* ─── Types ─── */
interface StudentSession {
  id: string;
  date: string;
  subject: string;
  class_name: string;
  total: number;
  present: number;
  absent: number;
  late: number;
}

interface SessionRecord {
  id: string;
  status: 'Present' | 'Absent' | 'Late';
  student_id: string;
  student_code: string;
  name: string;
  class_name: string;
}

interface SessionDetail {
  session: StudentSession & { teacher_name: string };
  records: SessionRecord[];
}

interface MeetingRecord {
  id: string;
  date: string;
  meeting_title: string;
  meeting_type: string;
  start_time: string;
  end_time: string;
  notes?: string;
  location_name?: string;
  location_verified: boolean;
  submitted_at: string;
}

interface AtRiskStudent {
  id: string;
  student_code: string;
  name: string;
  class_name: string;
  total_sessions: number;
  present: number;
  absent: number;
  late: number;
  present_pct: number | null;
}

/* ─── Helpers ─── */
const PAGE_SIZE     = 30;
const RISK_THRESHOLD = 75;

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function today30() { return new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

/* ─── Pending card ─── */
function PendingCard({ item }: { item: QueuedSubmission }) {
  const dt = new Date(item.queuedAt);
  const timeStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' · ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={pendingStyles.card}>
      <View style={pendingStyles.header}>
        <View style={pendingStyles.badge}><Text style={pendingStyles.badgeText}>PENDING SYNC</Text></View>
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
  card:      { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74', borderRadius: 12, padding: 14, marginBottom: 10 },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badge:     { backgroundColor: '#EA580C', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  time:      { fontSize: 12, color: '#9A3412' },
  subject:   { fontSize: 15, fontWeight: '700', color: '#1C1208', marginBottom: 2 },
  meta:      { fontSize: 13, color: '#7C5C3E', marginTop: 2 },
  topic:     { fontSize: 13, color: '#9A6D4A', fontStyle: 'italic', marginTop: 2 },
});

/* ─── Date range row ─── */
function DateRangeRow({ from, to, onChangeFrom, onChangeTo }: {
  from: string; to: string;
  onChangeFrom: (v: string) => void;
  onChangeTo:   (v: string) => void;
}) {
  return (
    <View style={drStyles.row}>
      <View style={drStyles.half}>
        <Text style={drStyles.label}>From</Text>
        <TextInput
          style={drStyles.input} value={from} onChangeText={onChangeFrom}
          placeholder="YYYY-MM-DD" placeholderTextColor="#B5A898"
          keyboardType="numbers-and-punctuation" maxLength={10}
        />
      </View>
      <View style={drStyles.half}>
        <Text style={drStyles.label}>To</Text>
        <TextInput
          style={drStyles.input} value={to} onChangeText={onChangeTo}
          placeholder="YYYY-MM-DD" placeholderTextColor="#B5A898"
          keyboardType="numbers-and-punctuation" maxLength={10}
        />
      </View>
    </View>
  );
}

const drStyles = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2D9CC', paddingHorizontal: 16, paddingVertical: 10 },
  half:  { flex: 1 },
  label: { fontSize: 11, fontWeight: '700', color: '#8C7E6E', marginBottom: 4 },
  input: { backgroundColor: '#F4EFE6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#1C1208', borderWidth: 1, borderColor: '#E2D9CC' },
});

/* ─── Main screen ─── */
export default function HistoryScreen() {
  const Colors = useTheme();
  const { user } = useAuth();

  const [tab, setTab] = useState<'my' | 'sessions' | 'atrisk' | 'meetings'>('my');

  /* ── My Attendance ── */
  const [records,       setRecords]       = useState<AttendanceRecord[]>([]);
  const [pending,       setPending]       = useState<QueuedSubmission[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [hasMore,       setHasMore]       = useState(true);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [filterYear,    setFilterYear]    = useState('');
  const [filterSem,     setFilterSem]     = useState('');

  /* ── Sessions ── */
  const [sessions,     setSessions]     = useState<StudentSession[]>([]);
  const [sessLoading,  setSessLoading]  = useState(false);
  const [sessFrom,     setSessFrom]     = useState(today30());
  const [sessTo,       setSessTo]       = useState(todayStr());
  const [detail,       setDetail]       = useState<SessionDetail | null>(null);
  const [detailLoading,setDetailLoading]= useState(false);
  const sessInitRef = useRef(false);

  /* ── Meetings ── */
  const [meetingRecords,    setMeetingRecords]    = useState<MeetingRecord[]>([]);
  const [meetingLoading,    setMeetingLoading]    = useState(false);
  const [meetingLoadingMore,setMeetingLoadingMore]= useState(false);
  const [meetingHasMore,    setMeetingHasMore]    = useState(true);
  const [meetingOffset,     setMeetingOffset]     = useState(0);
  const [meetingFilterYear, setMeetingFilterYear] = useState('');
  const [meetingFilterSem,  setMeetingFilterSem]  = useState('');
  const meetingInitRef = useRef(false);

  /* ── At Risk ── */
  const [atRisk,        setAtRisk]        = useState<AtRiskStudent[]>([]);
  const [riskLoading,   setRiskLoading]   = useState(false);
  const [riskFrom,      setRiskFrom]      = useState(today30());
  const [riskTo,        setRiskTo]        = useState(todayStr());
  const [riskBelowOnly, setRiskBelowOnly] = useState(false);
  const [openClasses,   setOpenClasses]   = useState<Set<string>>(new Set());
  const riskInitRef = useRef(false);

  /* ─── Academic years init ─── */
  useEffect(() => {
    api.get<AcademicYear[]>('/api/academic-years').then(r => {
      setAcademicYears(r.data);
      const current = r.data.find(y => y.is_current);
      if (current) {
        const yearId = current.id;
        const sem    = current.current_semester ? String(current.current_semester) : '';
        setFilterYear(yearId);
        setFilterSem(sem);
        setMeetingFilterYear(yearId);
        setMeetingFilterSem(sem);
      }
    }).catch(() => {});
  }, []);

  /* ─── Fetch pages (My Attendance) ─── */
  async function fetchPage(offset: number, replace: boolean, year = filterYear, sem = filterSem) {
    if (!user) return;
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset };
      if (year) params.academic_year_id = year;
      if (sem)  params.semester = sem;
      const res = await api.get('/api/attendance/history', { params });
      const data: AttendanceRecord[] = res.data;
      setRecords(prev => replace ? data : [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch {}
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }

  async function loadPending() {
    const q = await offlineQueue.getAll();
    setPending(q);
  }

  async function loadAll(replace: boolean, year = filterYear, sem = filterSem) {
    await Promise.all([loadPending(), fetchPage(0, replace, year, sem)]);
  }

  useFocusEffect(useCallback(() => {
    setLoading(true); setRecords([]); loadAll(true);
    sessInitRef.current = false;
    riskInitRef.current = false;
  }, [user]));

  function applyFilter(year: string, sem: string) {
    setFilterYear(year); setFilterSem(sem); setLoading(true); setRecords([]);
    loadAll(true, year, sem);
  }

  const onRefresh = () => { setRefreshing(true); loadAll(true); };
  const loadMore  = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPage(records.length, false);
  };

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const { synced, failed } = await offlineQueue.syncAll((path, data) => api.post(path, data));
      await loadAll(true);
      if (synced > 0 && failed === 0) Alert.alert('Sync Complete', `${synced} submission${synced !== 1 ? 's' : ''} uploaded.`);
      else if (synced > 0) Alert.alert('Partial Sync', `${synced} uploaded, ${failed} still pending.`);
      else Alert.alert('Sync Failed', 'Could not connect. Check your internet connection.');
    } catch { Alert.alert('Sync Failed', 'An unexpected error occurred.'); }
    finally { setSyncing(false); }
  }

  /* ─── Sessions ─── */
  async function fetchSessions(from: string, to: string) {
    if (!user) return;
    setSessLoading(true);
    try {
      const res = await api.get<StudentSession[]>(
        `/api/student-attendance/teacher/${user.id}?from=${from}&to=${to}`
      );
      setSessions(Array.isArray(res.data) ? res.data : []);
    } catch {}
    finally { setSessLoading(false); }
  }

  async function openDetail(sessionId: string) {
    setDetailLoading(true); setDetail(null);
    try {
      const res = await api.get<SessionDetail>(`/api/student-attendance/session/${sessionId}`);
      setDetail(res.data);
    } finally { setDetailLoading(false); }
  }

  /* ─── Meetings history ─── */
  async function fetchMeetingPage(offset: number, replace: boolean, year = meetingFilterYear, sem = meetingFilterSem) {
    if (!user) return;
    if (replace) setMeetingLoading(true); else setMeetingLoadingMore(true);
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset };
      if (year) params.academic_year_id = year;
      if (sem)  params.semester = sem;
      const res = await api.get<MeetingRecord[]>('/api/meetings/my-history', { params });
      const rows = Array.isArray(res.data) ? res.data : [];
      setMeetingRecords(prev => replace ? rows : [...prev, ...rows]);
      setMeetingHasMore(rows.length === PAGE_SIZE);
      setMeetingOffset(offset + rows.length);
    } catch {}
    finally { setMeetingLoading(false); setMeetingLoadingMore(false); }
  }

  function applyMeetingFilter(year: string, sem: string) {
    setMeetingFilterYear(year); setMeetingFilterSem(sem);
    setMeetingRecords([]); setMeetingOffset(0);
    fetchMeetingPage(0, true, year, sem);
  }

  /* ─── At Risk ─── */
  async function fetchAtRisk(from: string, to: string) {
    if (!user) return;
    setRiskLoading(true);
    try {
      const res = await api.get<AtRiskStudent[]>(
        `/api/student-attendance/report/teacher/${user.id}/students?from=${from}&to=${to}`
      );
      setAtRisk(Array.isArray(res.data) ? res.data : []);
    } catch {}
    finally { setRiskLoading(false); }
  }

  function handleTabPress(t: 'my' | 'sessions' | 'atrisk' | 'meetings') {
    setTab(t);
    if (t === 'sessions' && !sessInitRef.current) {
      sessInitRef.current = true;
      fetchSessions(sessFrom, sessTo);
    }
    if (t === 'atrisk' && !riskInitRef.current) {
      riskInitRef.current = true;
      fetchAtRisk(riskFrom, riskTo);
    }
    if (t === 'meetings' && !meetingInitRef.current) {
      meetingInitRef.current = true;
      fetchMeetingPage(0, true);
    }
  }

  /* ─── Derived ─── */
  const selectedYearName = academicYears.find(y => y.id === filterYear)?.name ?? 'All Years';
  const semLabel = filterSem === '1' ? 'Semester 1' : filterSem === '2' ? 'Semester 2' : 'All Semesters';

  /* ─── Tab bar ─── */
  const TabBar = (
    <View style={styles.tabBar}>
      {([['my', 'My Lessons'], ['sessions', 'Sessions'], ['atrisk', 'At Risk'], ['meetings', 'Meetings']] as const).map(([t, label]) => (
        <TouchableOpacity
          key={t}
          style={[styles.tabBtn, tab === t && { backgroundColor: Colors.primary }]}
          onPress={() => handleTabPress(t)}
        >
          <Text style={[styles.tabBtnText, tab === t && { color: '#fff' }]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  /* ─── My Attendance header ─── */
  const filterBar = (
    <View style={styles.filterBar}>
      <View style={styles.filterDropRow}>
        <DropdownSelect
          value={filterYear}
          options={academicYears.map(y => ({ label: y.name + (y.is_current ? ' ✦' : ''), value: y.id }))}
          onChange={id => applyFilter(id, filterSem)}
          placeholder="Academic Year"
          colors={Colors}
          style={{ flex: 1 }}
        />
        <DropdownSelect
          value={filterSem}
          options={[{ label: 'All', value: '' }, { label: 'Semester 1', value: '1' }, { label: 'Semester 2', value: '2' }]}
          onChange={v => applyFilter(filterYear, v)}
          colors={Colors}
          style={{ width: 130 }}
        />
      </View>
    </View>
  );

  const myListHeader = (
    <View>
      {TabBar}
      {filterBar}
      {pending.length > 0 && (
        <View style={styles.pendingSection}>
          <View style={styles.pendingHeaderRow}>
            <Text style={styles.pendingSectionTitle}>Pending Sync ({pending.length})</Text>
            <TouchableOpacity style={styles.syncBtn} onPress={handleSyncNow} disabled={syncing}>
              {syncing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.syncBtnText}>Sync Now</Text>}
            </TouchableOpacity>
          </View>
          {pending.map(item => <PendingCard key={item.id} item={item} />)}
          <View style={styles.divider} />
        </View>
      )}
      <Text style={styles.historyLabel}>{selectedYearName} · {semLabel}</Text>
    </View>
  );

  /* ─── Render ─── */
  if (loading && tab === 'my') return <Spinner />;

  /* ── My Attendance tab ── */
  if (tab === 'my') {
    return (
      <View style={styles.container}>
        <FlatList
          data={records}
          keyExtractor={r => r.id}
          renderItem={({ item }) => <AttendanceCard record={item} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={myListHeader}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={Colors.primary} /> : null}
          ListEmptyComponent={
            <EmptyState icon="📋" title="No records" subtitle={`No attendance records for ${selectedYearName} · ${semLabel}.`} />
          }
        />
      </View>
    );
  }

  /* ── Sessions tab ── */
  if (tab === 'sessions') {
    const statusColor: Record<string, { bg: string; color: string }> = {
      Present: { bg: '#DCFCE7', color: '#15803D' },
      Absent:  { bg: '#FEF2F2', color: '#DC2626' },
      Late:    { bg: '#FFFBEB', color: '#D97706' },
    };

    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => fetchSessions(sessFrom, sessTo)}
              tintColor={Colors.primary}
            />
          }
        >
          {TabBar}
          <DateRangeRow
            from={sessFrom} to={sessTo}
            onChangeFrom={v => { setSessFrom(v); if (v.length === 10) fetchSessions(v, sessTo); }}
            onChangeTo={v => { setSessTo(v); if (v.length === 10) fetchSessions(sessFrom, v); }}
          />

          <View style={{ padding: 16 }}>
            {sessLoading ? (
              [1,2,3].map(i => <View key={i} style={[styles.skeleton, { marginBottom: 12 }]} />)
            ) : sessions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No student sessions found</Text>
                <Text style={styles.emptySub}>Adjust the date range to see earlier records</Text>
              </View>
            ) : sessions.map(sess => (
              <TouchableOpacity
                key={sess.id}
                style={styles.sessCard}
                onPress={() => openDetail(sess.id)}
                activeOpacity={0.8}
              >
                <View style={styles.sessTop}>
                  <View style={styles.flex1}>
                    <Text style={styles.sessSubject}>{sess.subject} — {sess.class_name}</Text>
                    <Text style={styles.sessMeta}>{fmt(sess.date)}</Text>
                  </View>
                  <Text style={styles.sessMeta}>{sess.total} students</Text>
                </View>
                <View style={styles.statRow}>
                  {[
                    { label: 'Present', val: sess.present, color: '#15803D', bg: '#DCFCE7' },
                    { label: 'Absent',  val: sess.absent,  color: '#DC2626', bg: '#FEF2F2' },
                    { label: 'Late',    val: sess.late,    color: '#D97706', bg: '#FFFBEB' },
                  ].map(({ label, val, color, bg }) => (
                    <View key={label} style={[styles.statBox, { backgroundColor: bg }]}>
                      <Text style={[styles.statNum, { color }]}>{val}</Text>
                      <Text style={[styles.statLabel, { color }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Session detail modal */}
        <Modal visible={!!detail || detailLoading} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.flex1}>
                  <Text style={styles.modalTitle}>
                    {detail ? `${detail.session.class_name} — ${detail.session.subject}` : 'Loading…'}
                  </Text>
                  {detail && <Text style={styles.modalSub}>{fmt(detail.session.date)}</Text>}
                </View>
                {detail && (
                  <View style={styles.modalCounts}>
                    <Text style={[styles.modalCountText, { color: '#15803D' }]}>
                      {detail.records.filter(r => r.status === 'Present').length} Present
                    </Text>
                    <Text style={[styles.modalCountText, { color: '#DC2626' }]}>
                      {detail.records.filter(r => r.status === 'Absent').length} Absent
                    </Text>
                    {detail.records.filter(r => r.status === 'Late').length > 0 && (
                      <Text style={[styles.modalCountText, { color: '#D97706' }]}>
                        {detail.records.filter(r => r.status === 'Late').length} Late
                      </Text>
                    )}
                  </View>
                )}
                <TouchableOpacity onPress={() => setDetail(null)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                {detailLoading && !detail ? (
                  <ActivityIndicator style={{ marginTop: 24 }} color={Colors.primary} />
                ) : detail?.records.map(r => {
                  const sc = statusColor[r.status] ?? statusColor.Present;
                  return (
                    <View key={r.id} style={styles.modalRow}>
                      <View>
                        <Text style={styles.studentCode}>{r.student_code}</Text>
                        <Text style={styles.studentName}>{r.name}</Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                        <Text style={[styles.statusPillText, { color: sc.color }]}>{r.status}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  /* ── Meetings tab ── */
  if (tab === 'meetings') {
    const meetingSelectedYearName = academicYears.find(y => y.id === meetingFilterYear)?.name ?? 'All Years';
    const meetingSemLabel = meetingFilterSem === '1' ? 'Sem 1' : meetingFilterSem === '2' ? 'Sem 2' : 'All';

    const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
      PLC:        { bg: '#EDE9FE', color: '#7C3AED' },
      Staff:      { bg: '#DBEAFE', color: '#1D4ED8' },
      Department: { bg: '#FEF3C7', color: '#D97706' },
      General:    { bg: '#F0FDF4', color: '#15803D' },
    };

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.list}>
          {TabBar}

          {/* Year + Semester filter */}
          <View style={styles.filterBar}>
            <View style={styles.filterDropRow}>
              <DropdownSelect
                value={meetingFilterYear}
                options={academicYears.map(y => ({ label: y.name + (y.is_current ? ' ✦' : ''), value: y.id }))}
                onChange={id => applyMeetingFilter(id, meetingFilterSem)}
                placeholder="Academic Year"
                colors={Colors}
                style={{ flex: 1 }}
              />
              <DropdownSelect
                value={meetingFilterSem}
                options={[{ label: 'All', value: '' }, { label: 'Semester 1', value: '1' }, { label: 'Semester 2', value: '2' }]}
                onChange={v => applyMeetingFilter(meetingFilterYear, v)}
                colors={Colors}
                style={{ width: 130 }}
              />
            </View>
          </View>

          <Text style={styles.historyLabel}>{meetingSelectedYearName} · {meetingSemLabel}</Text>

          <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
            {meetingLoading ? (
              [1,2,3].map(i => <View key={i} style={[styles.skeleton, { marginBottom: 12 }]} />)
            ) : meetingRecords.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🤝</Text>
                <Text style={styles.emptyTitle}>No meeting records</Text>
                <Text style={styles.emptySub}>No meetings recorded for this period</Text>
              </View>
            ) : meetingRecords.map(m => {
              const tc = TYPE_COLORS[m.meeting_type] ?? { bg: '#F0EDE8', color: '#4A3F32' };
              return (
                <View key={m.id} style={styles.meetingCard}>
                  <View style={styles.meetingTop}>
                    <View style={styles.flex1}>
                      <Text style={styles.meetingTitle}>{m.meeting_title}</Text>
                      <Text style={styles.meetingDate}>{fmt(m.date)}</Text>
                    </View>
                    <View style={[styles.meetingTypeBadge, { backgroundColor: tc.bg }]}>
                      <Text style={[styles.meetingTypeText, { color: tc.color }]}>{m.meeting_type}</Text>
                    </View>
                  </View>
                  <View style={styles.meetingMeta}>
                    <Text style={styles.meetingMetaText}>
                      {m.start_time} – {m.end_time}
                    </Text>
                    {m.location_name ? (
                      <Text style={styles.meetingMetaText}> · {m.location_name}</Text>
                    ) : null}
                    {m.location_verified && (
                      <Text style={styles.meetingVerified}> · Location verified</Text>
                    )}
                  </View>
                  {m.notes ? <Text style={styles.meetingNotes}>{m.notes}</Text> : null}
                </View>
              );
            })}

            {meetingHasMore && !meetingLoading && meetingRecords.length > 0 && (
              <TouchableOpacity
                style={[styles.loadMoreBtn, { borderColor: Colors.primary }]}
                onPress={() => fetchMeetingPage(meetingOffset, false)}
                disabled={meetingLoadingMore}
              >
                {meetingLoadingMore
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={[styles.loadMoreText, { color: Colors.primary }]}>Load more</Text>}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ── At Risk tab ── */
  const classMap = new Map<string, AtRiskStudent[]>();
  for (const s of atRisk) {
    if (riskBelowOnly && (s.present_pct === null || s.present_pct >= RISK_THRESHOLD)) continue;
    if (!classMap.has(s.class_name)) classMap.set(s.class_name, []);
    classMap.get(s.class_name)!.push(s);
  }
  const classGroups = [...classMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => fetchAtRisk(riskFrom, riskTo)}
            tintColor={Colors.primary}
          />
        }
      >
        {TabBar}
        <DateRangeRow
          from={riskFrom} to={riskTo}
          onChangeFrom={v => { setRiskFrom(v); if (v.length === 10) fetchAtRisk(v, riskTo); }}
          onChangeTo={v => { setRiskTo(v); if (v.length === 10) fetchAtRisk(riskFrom, v); }}
        />

        {/* Below-only toggle */}
        <View style={[drStyles.row, { paddingTop: 8, paddingBottom: 10 }]}>
          {[false, true].map(v => (
            <TouchableOpacity
              key={String(v)}
              style={[styles.semChip, styles.flex1, riskBelowOnly === v && { backgroundColor: Colors.primary }]}
              onPress={() => setRiskBelowOnly(v)}
            >
              <Text style={[styles.semChipText, riskBelowOnly === v && { color: '#fff' }]}>
                {v ? `Below ${RISK_THRESHOLD}% only` : 'All Students'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {riskLoading ? (
            [1,2,3,4].map(i => <View key={i} style={[styles.skeleton, { marginBottom: 10 }]} />)
          ) : classGroups.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>{riskBelowOnly ? '✅' : '📋'}</Text>
              <Text style={styles.emptyTitle}>
                {riskBelowOnly ? 'No students below threshold' : 'No student data for this period'}
              </Text>
              <Text style={styles.emptySub}>Adjust the date range to see more records</Text>
            </View>
          ) : classGroups.map(([className, students]) => {
            const isOpen = openClasses.has(className);
            const belowCount = students.filter(s => s.present_pct !== null && s.present_pct < RISK_THRESHOLD).length;
            const hasAlert = belowCount > 0;

            return (
              <View key={className} style={[styles.classGroup, hasAlert && { borderColor: '#FECACA' }]}>
                <TouchableOpacity
                  style={[styles.classHeader, { backgroundColor: hasAlert ? '#FFF8F8' : '#FAFAF8' }]}
                  onPress={() => setOpenClasses(prev => {
                    const next = new Set(prev);
                    if (next.has(className)) next.delete(className); else next.add(className);
                    return next;
                  })}
                >
                  <View style={styles.flex1}>
                    <Text style={styles.className}>{className}</Text>
                    <Text style={styles.classSubText}>
                      {students.length} student{students.length !== 1 ? 's' : ''}
                      {hasAlert && !riskBelowOnly
                        ? <Text style={{ color: '#DC2626' }}> · {belowCount} below {RISK_THRESHOLD}%</Text>
                        : null}
                    </Text>
                  </View>
                  <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>›</Text>
                </TouchableOpacity>

                {isOpen && students.map(s => {
                  const pct = s.present_pct ?? 0;
                  const barColor = pct >= 90 ? '#15803D' : pct >= RISK_THRESHOLD ? '#D97706' : '#DC2626';
                  const isLow = s.present_pct !== null && s.present_pct < RISK_THRESHOLD;
                  return (
                    <View key={s.id} style={[styles.studentRow, isLow && { backgroundColor: '#FFF8F8' }]}>
                      <View style={styles.studentInfo}>
                        <Text style={styles.studentName}>{s.name}</Text>
                        <Text style={styles.studentCode}>{s.student_code}</Text>
                      </View>
                      <View style={styles.studentRight}>
                        <Text style={[styles.pctText, { color: barColor }]}>
                          {s.present_pct !== null ? `${s.present_pct}%` : '—'}
                        </Text>
                        <Text style={styles.studentMeta}>attendance</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: barColor }]} />
                      </View>
                      <Text style={styles.sessionsMeta}>
                        {s.absent} absent{s.late > 0 ? ` · ${s.late} late` : ''} · {s.total_sessions} session{s.total_sessions !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F4EFE6' },
  list:               { flexGrow: 1 },
  /* Tab bar */
  tabBar:             { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2D9CC', padding: 8, gap: 6 },
  tabBtn:             { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: '#F4EFE6' },
  tabBtnText:         { fontSize: 12, fontWeight: '700', color: '#8C7E6E' },
  /* Filter bar */
  filterBar:          { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2D9CC', paddingVertical: 10, paddingHorizontal: 16 },
  filterDropRow:      { flexDirection: 'row', gap: 8 },
  semChip:            { flex: 1, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0EDE8', alignItems: 'center', borderWidth: 1, borderColor: '#E2D9CC' },
  semChipText:        { fontSize: 12, fontWeight: '700', color: '#4A3F32' },
  /* Pending */
  pendingSection:     { padding: 16, paddingBottom: 0 },
  pendingHeaderRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pendingSectionTitle:{ fontSize: 13, fontWeight: '700', color: '#EA580C', textTransform: 'uppercase', letterSpacing: 0.5 },
  syncBtn:            { backgroundColor: '#EA580C', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, minWidth: 80, alignItems: 'center' },
  syncBtnText:        { color: '#fff', fontSize: 13, fontWeight: '700' },
  divider:            { height: 1, backgroundColor: '#E2D9CC', marginTop: 16 },
  historyLabel:       { fontSize: 13, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5, padding: 16, paddingBottom: 4 },
  /* Sessions */
  skeleton:           { backgroundColor: '#E5DDD5', borderRadius: 12, height: 96 },
  emptyCard:          { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 32, alignItems: 'center' },
  emptyIcon:          { fontSize: 32, marginBottom: 8 },
  emptyTitle:         { fontSize: 15, fontWeight: '700', color: '#2C2218' },
  emptySub:           { fontSize: 13, color: '#8C7E6E', marginTop: 4, textAlign: 'center' },
  sessCard:           { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2D9CC', padding: 14, marginBottom: 12 },
  sessTop:            { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  flex1:              { flex: 1 },
  sessSubject:        { fontSize: 14, fontWeight: '700', color: '#2C2218' },
  sessMeta:           { fontSize: 12, color: '#8C7E6E', marginTop: 2 },
  statRow:            { flexDirection: 'row', gap: 8 },
  statBox:            { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  statNum:            { fontSize: 18, fontWeight: '800' },
  statLabel:          { fontSize: 10, fontWeight: '700', marginTop: 1 },
  /* Session detail modal */
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:         { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalHeader:        { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E2D9CC' },
  modalTitle:         { fontSize: 15, fontWeight: '800', color: '#2C2218' },
  modalSub:           { fontSize: 12, color: '#8C7E6E', marginTop: 2 },
  modalCounts:        { flexDirection: 'row', gap: 8, marginRight: 8, flexWrap: 'wrap' },
  modalCountText:     { fontSize: 12, fontWeight: '700' },
  closeBtn:           { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F4EFE6', alignItems: 'center', justifyContent: 'center' },
  closeBtnText:       { fontSize: 14, color: '#8C7E6E', fontWeight: '700' },
  modalBody:          { padding: 16 },
  modalRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F4EFE6' },
  studentCode:        { fontSize: 11, fontWeight: '700', color: '#8C7E6E' },
  studentName:        { fontSize: 14, fontWeight: '600', color: '#2C2218' },
  statusPill:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillText:     { fontSize: 12, fontWeight: '700' },
  /* Meetings */
  meetingCard:        { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2D9CC', padding: 14, marginBottom: 12 },
  meetingTop:         { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  meetingTitle:       { fontSize: 14, fontWeight: '700', color: '#2C2218', marginBottom: 2 },
  meetingDate:        { fontSize: 12, color: '#8C7E6E' },
  meetingTypeBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginLeft: 8 },
  meetingTypeText:    { fontSize: 11, fontWeight: '700' },
  meetingMeta:        { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  meetingMetaText:    { fontSize: 12, color: '#8C7E6E' },
  meetingVerified:    { fontSize: 12, color: '#15803D', fontWeight: '600' },
  meetingNotes:       { fontSize: 13, color: '#4A3F32', fontStyle: 'italic', marginTop: 6, lineHeight: 18 },
  loadMoreBtn:        { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  loadMoreText:       { fontSize: 13, fontWeight: '700' },
  /* At Risk */
  classGroup:         { borderRadius: 14, borderWidth: 1, borderColor: '#E2D9CC', overflow: 'hidden', marginBottom: 10 },
  classHeader:        { flexDirection: 'row', alignItems: 'center', padding: 14 },
  className:          { fontSize: 14, fontWeight: '700', color: '#2C2218' },
  classSubText:       { fontSize: 12, color: '#8C7E6E', marginTop: 2 },
  chevron:            { fontSize: 20, color: '#8C7E6E', transform: [{ rotate: '0deg' }] },
  chevronOpen:        { transform: [{ rotate: '90deg' }] },
  studentRow:         { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F4EFE6' },
  studentInfo:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  studentRight:       { alignItems: 'flex-end' },
  pctText:            { fontSize: 16, fontWeight: '800' },
  studentMeta:        { fontSize: 10, color: '#8C7E6E' },
  barTrack:           { height: 6, backgroundColor: '#F0EDE8', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  barFill:            { height: 6, borderRadius: 3 },
  sessionsMeta:       { fontSize: 12, color: '#8C7E6E' },
});
