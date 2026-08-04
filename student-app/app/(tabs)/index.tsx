import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Image, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { storage } from '@/lib/storage';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type {
  StudentProfile, SemesterResults, AttendanceSummary,
  CalendarEvent, AcademicYear, FeeSummary,
} from '@/types/api';

const SW = Dimensions.get('window').width;
// 3 cards per row: 16px padding each side + 2×10px gaps
const CARD_W = Math.floor((SW - 32 - 20) / 3);

// ── Quick links (9 = 3×3) ───────────────────────────────────────────────────
interface QuickLink {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  bg: string;
  tint: string;
}
const QUICK_LINKS: QuickLink[] = [
  { label: 'Results',    icon: 'ribbon-outline',            route: '/results',    bg: '#EAF4EE', tint: '#15803D' },
  { label: 'Attendance', icon: 'checkmark-circle-outline',  route: '/attendance', bg: '#EBF3FF', tint: '#1D4ED8' },
  { label: 'Timetable',  icon: 'calendar-outline',          route: '/timetable',  bg: '#FEF9EC', tint: '#D97706' },
  { label: 'Fees',       icon: 'card-outline',              route: '/fees',       bg: '#FEF2F2', tint: '#DC2626' },
  { label: 'Clearance',  icon: 'document-text-outline',     route: '/clearance',  bg: '#EDFAF4', tint: '#059669' },
  { label: 'Library',    icon: 'library-outline',           route: '/library',    bg: '#F0ECFF', tint: '#7C3AED' },
  { label: 'Exeat',      icon: 'exit-outline',              route: '/exeat',      bg: '#FFF4ED', tint: '#EA580C' },
  { label: 'LMS',        icon: 'school-outline',            route: '/lms',        bg: '#ECFDF5', tint: '#0F766E' },
  { label: 'Calendar',   icon: 'calendar-number-outline',   route: '/calendar',   bg: '#EEF2FF', tint: '#4F46E5' },
];

// ── Types for progression charts ─────────────────────────────────────────────
interface ProgressPoint {
  label: string;          // e.g. "23/24\nS1"
  average:     number | null;
  attendance:  number | null;
  position:    number | null;
  totalStudents: number | null;
  subjects:    { name: string; total: number | null }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function shortYearLabel(name: string): string {
  const m = name.match(/(\d{2,4})[\/\-](\d{2,4})/);
  if (m) return `${m[1].slice(-2)}/${m[2].slice(-2)}`;
  const m2 = name.match(/(\d{4})/);
  if (m2) return `'${m2[1].slice(-2)}`;
  return name.replace(/Academic Year/i, '').trim().slice(0, 7);
}

function getTimeOfDay() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getTeacherName(ft: { teacher_name: string; teacher_phone: string | null } | string | null): string {
  if (!ft) return '';
  if (typeof ft === 'string') return ft;
  return ft.teacher_name;
}

// ── Chart: Semester bar chart ─────────────────────────────────────────────────
function SemBarChart({
  data, color, unit = '%', max = 100, refLine,
}: {
  data: { label: string; value: number | null }[];
  color: string;
  unit?: string;
  max?: number;
  refLine?: number;
}) {
  const H = 90;
  const actualMax = data.reduce((m, d) => (d.value != null ? Math.max(m, d.value) : m), 0);
  const chartMax = Math.max(max, actualMax, 1);

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H + 16 }}>
        {data.map((d, i) => {
          const filled = d.value != null;
          const h = filled ? Math.max((d.value! / chartMax) * H, 6) : 6;
          const isLatest = i === data.length - 1;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
              {filled ? (
                <Text style={{ fontSize: 10, fontWeight: '800', color, marginBottom: 3 }}>
                  {d.value!.toFixed(0)}{unit}
                </Text>
              ) : (
                <Text style={{ fontSize: 10, color: '#CBD5E1', marginBottom: 3 }}>—</Text>
              )}
              <View style={{ height: H, width: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                {refLine != null && (
                  <View style={{
                    position: 'absolute', left: 0, right: 0,
                    bottom: (refLine / chartMax) * H,
                    height: 1.5, backgroundColor: '#CBD5E1', zIndex: 1,
                  }} />
                )}
                <View style={{
                  height: h,
                  backgroundColor: filled ? color : '#E8EDF3',
                  borderRadius: 7,
                  opacity: filled ? (isLatest ? 1 : 0.65) : 0.4,
                }} />
              </View>
            </View>
          );
        })}
      </View>
      {/* X-axis labels */}
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.map((d, i) => (
          <Text key={i} style={cs.xLabel} numberOfLines={2}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

// ── Chart: Class position (inverted — taller bar = better rank) ───────────────
function PositionChart({ data }: {
  data: { label: string; position: number | null; total: number | null }[];
}) {
  const H = 90;
  const maxPos = data.reduce((m, d) => (d.position != null ? Math.max(m, d.position) : m), 1);

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H + 16 }}>
        {data.map((d, i) => {
          const filled = d.position != null;
          const inv = filled ? maxPos - d.position! + 1 : 0;
          const h = filled ? Math.max((inv / maxPos) * H, 6) : 6;
          const c = d.position === 1 ? '#D97706' : (d.position ?? 99) <= 3 ? '#15803D' : '#4F46E5';
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
              {filled ? (
                <Text style={{ fontSize: 10, fontWeight: '800', color: c, marginBottom: 3 }}>
                  {d.position}{d.total != null ? `/${d.total}` : ''}
                </Text>
              ) : (
                <Text style={{ fontSize: 10, color: '#CBD5E1', marginBottom: 3 }}>—</Text>
              )}
              <View style={{ height: H, width: '100%', justifyContent: 'flex-end' }}>
                <View style={{
                  height: h,
                  backgroundColor: filled ? c : '#E8EDF3',
                  borderRadius: 7,
                  opacity: filled ? (i === data.length - 1 ? 1 : 0.65) : 0.4,
                }} />
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.map((d, i) => (
          <Text key={i} style={cs.xLabel} numberOfLines={2}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

// ── Subject progress row ──────────────────────────────────────────────────────
function SubjectRow({
  name, current, prev,
}: { name: string; current: number | null; prev: number | null }) {
  const pct  = Math.min(current ?? 0, 100);
  const clr  = pct >= 50 ? '#15803D' : '#DC2626';
  const delta = current != null && prev != null ? current - prev : null;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#1C1208' }} numberOfLines={1}>
          {name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {delta != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Ionicons
                name={delta >= 0 ? 'trending-up' : 'trending-down'}
                size={13}
                color={delta >= 0 ? '#15803D' : '#DC2626'}
              />
              <Text style={{ fontSize: 11, fontWeight: '700', color: delta >= 0 ? '#15803D' : '#DC2626' }}>
                {delta >= 0 ? '+' : ''}{delta.toFixed(0)}
              </Text>
            </View>
          )}
          <Text style={{ fontSize: 15, fontWeight: '900', color: clr, minWidth: 36, textAlign: 'right' }}>
            {current != null ? current : '—'}
          </Text>
        </View>
      </View>
      <View style={{ height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
        <View style={{
          height: 8, width: current != null ? `${pct}%` : '0%',
          backgroundColor: clr, borderRadius: 4,
        }} />
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const C      = useTheme();
  const { user } = useAuth();

  const [profile,        setProfile]        = useState<StudentProfile | null>(null);
  const [results,        setResults]        = useState<SemesterResults | null>(null);
  const [attendance,     setAttendance]     = useState<AttendanceSummary | null>(null);
  const [events,         setEvents]         = useState<CalendarEvent[]>([]);
  const [fees,           setFees]           = useState<FeeSummary | null>(null);
  const [schoolLogo,     setSchoolLogo]     = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [allYears,       setAllYears]       = useState<AcademicYear[]>([]);

  // Phase 2: historical progression
  const [progress,       setProgress]       = useState<ProgressPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ── Phase 1: initial data ─────────────────────────────────────────────────
  const loadInitial = useCallback(async () => {
    try {
      const [logo, yearsRes, profileRes] = await Promise.all([
        storage.getSchoolLogo(),
        api.get<AcademicYear[]>('/api/student/academic-years'),
        api.get<StudentProfile>('/api/student/profile'),
      ]);
      setSchoolLogo(logo);
      setProfile(profileRes.data);
      const years = yearsRes.data;
      setAllYears(years);
      const cur = years.find(y => y.is_current) ?? years[0];
      if (cur) {
        const sem = cur.current_semester ?? 1;
        const [resRes, attRes, calRes] = await Promise.all([
          api.get<SemesterResults>('/api/student/results', { params: { academic_year_id: cur.id, semester: sem } }),
          api.get<AttendanceSummary>('/api/student/attendance', { params: { academic_year_id: cur.id, semester: sem } }),
          api.get<CalendarEvent[]>('/api/student/calendar', { params: { from: new Date().toISOString().split('T')[0], to: '' } }),
        ]);
        setResults(resRes.data);
        setAttendance(attRes.data);
        setEvents(calRes.data.slice(0, 3));
      }
      try {
        const feesRes = await api.get<FeeSummary>('/api/student/fees');
        setFees(feesRes.data);
      } catch { /* fees module may be disabled */ }
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // ── Phase 2: historical data for charts ───────────────────────────────────
  const loadHistory = useCallback(async (years: AcademicYear[]) => {
    if (!years.length) { setHistoryLoading(false); return; }
    // Sort oldest-first so chart reads left→right
    const sorted = [...years].sort((a, b) => a.name.localeCompare(b.name));
    const tasks  = sorted.slice(-3).flatMap(y => [1, 2].map(sem => ({ y, sem })));
    const settled = await Promise.allSettled(
      tasks.map(({ y, sem }) =>
        Promise.all([
          api.get<SemesterResults>('/api/student/results',    { params: { academic_year_id: y.id, semester: sem } }),
          api.get<AttendanceSummary>('/api/student/attendance', { params: { academic_year_id: y.id, semester: sem } }),
        ]).then(([r, a]) => ({
          label:        `${shortYearLabel(y.name)}\nS${sem}`,
          average:      r.data.average,
          attendance:   a.data.summary?.rate ?? null,
          position:     r.data.class_position,
          totalStudents:r.data.total_students,
          subjects:     r.data.subjects.map(s => ({ name: s.subject, total: s.total })),
        } as ProgressPoint))
      )
    );
    const pts = settled
      .filter((r): r is PromiseFulfilledResult<ProgressPoint> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(p => p.average != null || p.attendance != null || p.subjects.length > 0);
    setProgress(pts);
    setHistoryLoading(false);
  }, []);

  useEffect(() => { loadInitial(); }, [loadInitial]);
  useEffect(() => {
    if (allYears.length > 0) loadHistory(allYears);
  }, [allYears, loadHistory]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setHistoryLoading(true);
    setProgress([]);
    loadInitial();
  }, [loadInitial]);

  if (loading) return <Spinner message="Loading dashboard…" />;

  // ── Derived values ─────────────────────────────────────────────────────────
  const avgScore = results?.average;
  const avgColor = (avgScore ?? 0) >= 50 ? '#15803D' : '#DC2626';
  const attRate  = attendance?.summary?.rate ?? 0;
  const attColor = attRate >= 75 ? '#1D4ED8' : '#DC2626';

  // Chart data arrays
  const avgData  = progress.map(p => ({ label: p.label, value: p.average }));
  const attData  = progress.map(p => ({ label: p.label, value: p.attendance }));
  const posData  = progress.map(p => ({ label: p.label, position: p.position, total: p.totalStudents }));
  const hasPos   = progress.some(p => p.position != null);
  const hasCharts = progress.length >= 2;

  // Subject rows: most recent semester vs the one before it
  const lastPt     = progress[progress.length - 1];
  const prevPt     = progress[progress.length - 2];
  const curSubjects  = lastPt?.subjects ?? (results?.subjects.map(s => ({ name: s.subject, total: s.total })) ?? []);
  const prevSubjects = prevPt?.subjects ?? [];
  const subjectRows = [...curSubjects]
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .map(s => ({
      name:    s.name,
      current: s.total,
      prev:    prevSubjects.find(ps => ps.name === s.name)?.total ?? null,
    }));

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} />}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: C.primary, paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            {schoolLogo
              ? <Image source={{ uri: schoolLogo }} style={s.schoolLogo} resizeMode="contain" />
              : null}
            <View>
              <Text style={s.greeting}>Good {getTimeOfDay()}</Text>
              <Text style={s.studentName}>{profile?.name ?? user?.name}</Text>
              <Text style={s.classBadge}>{profile?.class_name}{profile?.program ? ` · ${profile.program}` : ''}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push('/profile')} style={[s.avatar, { backgroundColor: C.accent }]}>
            <Text style={s.avatarText}>{(profile?.name ?? user?.name ?? 'S')[0].toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Stat row */}
        <View style={s.statRow}>
          {[
            { label: 'Average',    value: avgScore != null ? `${avgScore.toFixed(1)}%` : '—', color: avgScore != null ? (avgScore >= 50 ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.5)' },
            { label: 'Position',   value: results?.class_position != null ? `${results.class_position}/${results.total_students}` : '—', color: '#fff' },
            { label: 'Attendance', value: `${attRate.toFixed(0)}%`, color: attRate >= 75 ? '#4ade80' : '#f87171' },
          ].map(st => (
            <View key={st.label} style={s.statItem}>
              <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <View style={s.body}>

        {/* Banners */}
        {attRate > 0 && attRate < 75 && (
          <View style={[s.banner, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
            <Ionicons name="warning-outline" size={14} color="#DC2626" />
            <Text style={[s.bannerText, { color: '#DC2626' }]}>
              Your attendance is {attRate.toFixed(0)}% — below the 75% minimum. Please attend regularly.
            </Text>
          </View>
        )}
        {fees && fees.outstanding > 0 && (
          <TouchableOpacity onPress={() => router.push('/fees')}>
            <View style={[s.banner, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
              <Ionicons name="card-outline" size={14} color="#D97706" />
              <Text style={[s.bannerText, { color: '#D97706' }]}>
                Outstanding fees: GH₵{fees.outstanding.toFixed(2)} — Tap to view
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Quick Access ────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: C.textSoft }]}>Quick Access</Text>
        <View style={s.grid}>
          {QUICK_LINKS.map(lnk => (
            <TouchableOpacity
              key={lnk.route}
              style={[s.gridCard, { backgroundColor: lnk.bg }]}
              onPress={() => router.push(lnk.route as any)}
              activeOpacity={0.75}
            >
              <View style={[s.gridIconWrap, { backgroundColor: lnk.tint + '22' }]}>
                <Ionicons name={lnk.icon} size={26} color={lnk.tint} />
              </View>
              <Text style={[s.gridLabel, { color: '#1C1208' }]}>{lnk.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── My Progress ─────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: C.textSoft }]}>My Progress</Text>

        {historyLoading ? (
          <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
            <ActivityIndicator color={C.primary} size="small" />
            <Text style={{ color: C.muted, fontSize: 13, marginTop: 10 }}>Loading progress data…</Text>
          </Card>
        ) : !hasCharts ? (
          <Card style={{ paddingVertical: 20 }}>
            <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 21 }}>
              Academic progression charts will appear here once you have results from at least 2 semesters.
            </Text>
          </Card>
        ) : (
          <>
            {/* Academic Average */}
            <Card style={s.chartCard}>
              <View style={s.chartHeader}>
                <View style={[s.chartDot, { backgroundColor: '#15803D' }]} />
                <Text style={[s.chartTitle, { color: C.text }]}>Academic Average</Text>
              </View>
              <Text style={[s.chartSub, { color: C.muted }]}>Overall score across semesters. Dashed line = 50% pass mark.</Text>
              <SemBarChart data={avgData} color="#15803D" unit="%" max={100} refLine={50} />
            </Card>

            {/* Attendance Rate */}
            <Card style={s.chartCard}>
              <View style={s.chartHeader}>
                <View style={[s.chartDot, { backgroundColor: '#1D4ED8' }]} />
                <Text style={[s.chartTitle, { color: C.text }]}>Attendance Rate</Text>
              </View>
              <Text style={[s.chartSub, { color: C.muted }]}>Attendance % per semester. Dashed line = 75% minimum.</Text>
              <SemBarChart data={attData} color="#1D4ED8" unit="%" max={100} refLine={75} />
            </Card>

            {/* Class Position */}
            {hasPos && (
              <Card style={s.chartCard}>
                <View style={s.chartHeader}>
                  <View style={[s.chartDot, { backgroundColor: '#D97706' }]} />
                  <Text style={[s.chartTitle, { color: C.text }]}>Class Position</Text>
                </View>
                <Text style={[s.chartSub, { color: C.muted }]}>Taller bar = higher rank. Gold = 1st, green = top 3.</Text>
                <PositionChart data={posData} />
              </Card>
            )}
          </>
        )}

        {/* ── Subject Scores ───────────────────────────────────────────────── */}
        {subjectRows.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: C.textSoft }]}>Subject Scores</Text>
            <Card>
              {subjectRows.map((sub, i) => (
                <React.Fragment key={sub.name}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: C.border, marginBottom: 14 }} />}
                  <SubjectRow name={sub.name} current={sub.current} prev={sub.prev} />
                </React.Fragment>
              ))}
              {prevSubjects.length > 0 && (
                <View style={[s.subjectLegend, { borderTopColor: C.border }]}>
                  <Ionicons name="trending-up" size={12} color="#15803D" />
                  <Text style={[s.subjectLegendText, { color: C.muted }]}>
                    Arrows show change from previous semester
                  </Text>
                </View>
              )}
            </Card>
          </>
        )}

        {/* ── Upcoming Events ──────────────────────────────────────────────── */}
        {events.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: C.textSoft }]}>Upcoming Events</Text>
            <Card>
              {events.map((ev, i) => (
                <View key={ev.id} style={[s.eventRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                  <View style={[s.eventDot, { backgroundColor: C.accent }]} />
                  <View style={s.eventBody}>
                    <Text style={[s.eventName, { color: C.text }]}>{ev.name}</Text>
                    <Text style={[s.eventDate, { color: C.muted }]}>{formatDate(ev.date)}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* ── Form Teacher ─────────────────────────────────────────────────── */}
        {profile?.form_teacher && (
          <Card style={s.ftCard}>
            <Ionicons name="person-outline" size={16} color={C.muted as string} />
            <View style={{ flex: 1 }}>
              <Text style={[s.ftLabel, { color: C.muted }]}>Form Teacher</Text>
              <Text style={[s.ftName, { color: C.text }]}>{getTeacherName(profile.form_teacher)}</Text>
            </View>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

// ── Chart shared styles (module-level so they don't rebuild each render) ──────
const cs = StyleSheet.create({
  xLabel: { flex: 1, textAlign: 'center', fontSize: 9, color: '#94A3B8', fontWeight: '600', lineHeight: 13 },
});

const s = StyleSheet.create({
  flex:        { flex: 1 },

  // Header
  header:      { paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  schoolLogo:  { width: 44, height: 44, borderRadius: 10, backgroundColor: '#fff' },
  greeting:    { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 2 },
  studentName: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  classBadge:  { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  avatar:      { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { fontSize: 20, fontWeight: '800', color: '#fff' },
  statRow:     { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 16, padding: 14 },
  statItem:    { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  statLabel:   { fontSize: 11, color: 'rgba(255,255,255,0.6)' },

  // Body
  body:        { padding: 16, gap: 10 },
  sectionTitle:{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 6, marginBottom: 2 },

  // Banners
  banner:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, borderWidth: 1 },
  bannerText:  { fontSize: 13, fontWeight: '600', lineHeight: 18, flex: 1 },

  // Quick Access grid
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard:    {
    width: CARD_W, height: 86, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', gap: 7,
    shadowColor: '#1C1208', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  gridIconWrap:{ width: 46, height: 46, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  gridLabel:   { fontSize: 12, fontWeight: '700', textAlign: 'center' },

  // Charts
  chartCard:   { marginBottom: 4 },
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  chartDot:    { width: 10, height: 10, borderRadius: 5 },
  chartTitle:  { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  chartSub:    { fontSize: 12, lineHeight: 17, marginBottom: 4 },

  // Subject list
  subjectLegend:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, paddingTop: 10, marginTop: 2 },
  subjectLegendText:{ fontSize: 11 },

  // Events
  eventRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  eventDot:  { width: 8, height: 8, borderRadius: 4 },
  eventBody: { flex: 1 },
  eventName: { fontSize: 13, fontWeight: '600' },
  eventDate: { fontSize: 12, marginTop: 2 },

  // Form teacher
  ftCard:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ftLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  ftName:  { fontSize: 14, fontWeight: '700', marginTop: 1 },
});
