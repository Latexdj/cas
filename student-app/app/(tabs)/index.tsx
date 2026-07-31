import React, { useCallback, useEffect, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { storage } from '@/lib/storage';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { StudentProfile, SemesterResults, AttendanceSummary, CalendarEvent, AcademicYear, FeeSummary } from '@/types/api';

interface QuickLink { label: string; icon: string; route: string; color: string; }

const QUICK_LINKS: QuickLink[] = [
  { label: 'Results',    icon: '🎓', route: '/results',    color: '#E8F2EC' },
  { label: 'Attendance', icon: '✅', route: '/attendance', color: '#EFF6FF' },
  { label: 'Timetable',  icon: '📅', route: '/timetable',  color: '#FEF3C7' },
  { label: 'Fees',       icon: '💳', route: '/fees',       color: '#FEF2F2' },
  { label: 'Clearance',  icon: '📋', route: '/clearance',  color: '#F0FDF4' },
  { label: 'Library',    icon: '📚', route: '/library',    color: '#EDE9FE' },
  { label: 'Exeat',      icon: '🚪', route: '/exeat',      color: '#FFF7ED' },
  { label: 'LMS',        icon: '💡', route: '/lms',        color: '#ECFDF5' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const { user, logout } = useAuth();

  const [profile,     setProfile]     = useState<StudentProfile | null>(null);
  const [results,     setResults]     = useState<SemesterResults | null>(null);
  const [attendance,  setAttendance]  = useState<AttendanceSummary | null>(null);
  const [events,      setEvents]      = useState<CalendarEvent[]>([]);
  const [fees,        setFees]        = useState<FeeSummary | null>(null);
  const [schoolLogo,  setSchoolLogo]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [currentYear, setCurrentYear] = useState<AcademicYear | null>(null);

  const load = useCallback(async () => {
    try {
      const [logo, yearsRes, profileRes] = await Promise.all([
        storage.getSchoolLogo(),
        api.get<AcademicYear[]>('/api/student/academic-years'),
        api.get<StudentProfile>('/api/student/profile'),
      ]);
      setSchoolLogo(logo);
      setProfile(profileRes.data);
      const cur = yearsRes.data.find(y => y.is_current) ?? yearsRes.data[0];
      setCurrentYear(cur);
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

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner message="Loading dashboard…" />;

  const avgColor = (results?.average ?? 0) >= 50 ? C.success : C.danger;
  const attRate  = attendance?.rate ?? 0;
  const attColor = attRate >= 75 ? C.success : C.danger;

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
    >
      {/* Header */}
      <View style={[s.header, { backgroundColor: C.primary, paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            {schoolLogo
              ? <Image source={{ uri: schoolLogo }} style={s.schoolLogo} resizeMode="contain" />
              : null}
            <View>
              <Text style={s.greeting}>Good {getTimeOfDay()}</Text>
              <Text style={s.studentName}>{profile?.name ?? user?.name}</Text>
              <Text style={s.classBadge}>{profile?.class_name} {profile?.program ? `· ${profile.program}` : ''}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push('/profile')} style={[s.avatar, { backgroundColor: C.accent }]}>
            <Text style={s.avatarText}>{(profile?.name ?? user?.name ?? 'S')[0].toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Stat row */}
        <View style={s.statRow}>
          {[
            { label: 'Average',  value: results?.average != null ? `${results.average.toFixed(1)}%` : '—', color: avgColor },
            { label: 'Position', value: results?.class_position != null ? `${results.class_position}/${results.total_students}` : '—', color: '#fff' },
            { label: 'Attendance', value: `${attRate.toFixed(0)}%`, color: attColor === C.success ? '#4ade80' : '#f87171' },
          ].map(st => (
            <View key={st.label} style={s.statItem}>
              <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.body}>
        {/* Warnings */}
        {attRate > 0 && attRate < 75 && (
          <View style={[s.banner, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
            <Text style={[s.bannerText, { color: C.danger }]}>⚠ Your attendance is {attRate.toFixed(0)}% — below the 75% minimum. Please attend regularly.</Text>
          </View>
        )}
        {fees && fees.outstanding > 0 && (
          <TouchableOpacity onPress={() => router.push('/fees')}>
            <View style={[s.banner, { backgroundColor: C.warningLight, borderColor: C.warning }]}>
              <Text style={[s.bannerText, { color: C.warning }]}>💳 Outstanding fees: GH₵{fees.outstanding.toFixed(2)} — Tap to view</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Quick links */}
        <Text style={[s.sectionTitle, { color: C.textSoft }]}>Quick Access</Text>
        <View style={s.grid}>
          {QUICK_LINKS.map(lnk => (
            <TouchableOpacity key={lnk.route} style={[s.gridItem, { backgroundColor: lnk.color }]} onPress={() => router.push(lnk.route as any)}>
              <Text style={s.gridIcon}>{lnk.icon}</Text>
              <Text style={[s.gridLabel, { color: C.text }]}>{lnk.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Upcoming events */}
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

        {/* Form teacher */}
        {profile?.form_teacher && (
          <Card style={s.formTeacherCard}>
            <Text style={[s.formTeacherLabel, { color: C.muted }]}>Form Teacher</Text>
            <Text style={[s.formTeacherName, { color: C.text }]}>{profile.form_teacher}</Text>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const s = StyleSheet.create({
  flex:            { flex: 1 },
  header:          { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerLeft:      { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  schoolLogo:      { width: 44, height: 44, borderRadius: 10, backgroundColor: '#fff' },
  greeting:        { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 2 },
  studentName:     { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  classBadge:      { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  avatar:          { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText:      { fontSize: 20, fontWeight: '800', color: '#fff' },
  statRow:         { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 14 },
  statItem:        { flex: 1, alignItems: 'center' },
  statValue:       { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  statLabel:       { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  body:            { padding: 16, gap: 12 },
  banner:          { borderRadius: 12, padding: 12, borderWidth: 1 },
  bannerText:      { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  sectionTitle:    { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, marginTop: 4 },
  grid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem:        { width: '22%', aspectRatio: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 6 },
  gridIcon:        { fontSize: 24 },
  gridLabel:       { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  eventRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  eventDot:        { width: 8, height: 8, borderRadius: 4 },
  eventBody:       { flex: 1 },
  eventName:       { fontSize: 13, fontWeight: '600' },
  eventDate:       { fontSize: 12, marginTop: 2 },
  formTeacherCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  formTeacherLabel:{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  formTeacherName: { fontSize: 14, fontWeight: '700' },
});
