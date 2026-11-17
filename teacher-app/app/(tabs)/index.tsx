import React, { useCallback, useState } from 'react';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { loadAccess } from '@/lib/access';
import { getSettings, refreshReminders, saveSettings } from '@/lib/reminders';
import { Platform } from 'react-native';
import { Body, Button, Card, Chip, Notice, Progress, Screen, SectionLabel } from '@/components/ui/kit';

interface Slot { id: string; start_time: string; end_time: string; subject: string; class_names: string; room?: string | null }
interface Recorded { id: string; subject: string; class_names: string }
interface CalEvent { id: string; name: string; date: string; type: string }
interface Summary { present_periods: number; absent_periods: number; excused_periods: number; total_scheduled: number; attendance_pct: number | null }
interface MeetingRow { meeting_type: string; present: number; absent: number; total: number; pct: number | null }
interface NoticeRow { id: string; title: string; body: string; priority: 'normal' | 'important' | 'urgent'; author_name: string; is_pinned: boolean; created_at: string }
interface Alert { id: string; message: string; is_read: boolean }
interface Query { id: string; status: string; subject?: string; title?: string }

const toMin = (t?: string | null) => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hm = (t?: string | null) => (t ?? '').slice(0, 5);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function TodayScreen() {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [queries, setQueries] = useState<Query[]>([]);
  const [dayStatus, setDayStatus] = useState<{ status: string; label: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [askReminders, setAskReminders] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setError('');
    const today = ymd(new Date());
    const future = ymd(new Date(Date.now() + 14 * 86400000));
    const r = await Promise.allSettled([
      api.get(`/api/timetable/today/${user.id}`),
      api.get(`/api/attendance/today/${user.id}`),
      api.get(`/api/school-calendar?from=${today}&to=${future}`),
      api.get('/api/attendance/my-summary'),
      api.get('/api/meetings/my-summary'),
      api.get(`/api/school-calendar/day-status?date=${today}`),
      api.get<NoticeRow[]>('/api/notices'),
      api.get<Alert[]>('/api/result-submissions/notifications'),
      api.get<Query[]>('/api/discipline/queries'),
    ]);
    const val = <T,>(i: number): T | null => (r[i].status === 'fulfilled' ? (r[i] as PromiseFulfilledResult<{ data: T }>).value.data : null);
    const tt = val<any>(0); setSlots(Array.isArray(tt) ? tt : tt?.slots ?? tt?.timetable ?? []);
    const at = val<any>(1); setRecorded(Array.isArray(at) ? at : at?.records ?? []);
    const ev = val<any>(2); setEvents(Array.isArray(ev) ? ev : ev?.events ?? []);
    setSummary(val<Summary>(3));
    const mt = val<MeetingRow[]>(4); setMeetings(Array.isArray(mt) ? mt : []);
    setDayStatus(val(5));
    setNotices(val<NoticeRow[]>(6) ?? []);
    setAlerts((val<Alert[]>(7) ?? []).filter(a => !a.is_read));
    setQueries((val<Query[]>(8) ?? []).filter(q => ['issued', 'acknowledged'].includes(q.status)));
    if (r[0].status === 'rejected') setError('Could not load today\'s lessons. Pull down to try again.');
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => {
    load();
    loadAccess();
    refreshReminders().catch(() => {});
    if (Platform.OS !== 'web') getSettings().then(st => setAskReminders(!st.enabled && !st.prompted)).catch(() => {});
  }, [load]));

  const isDone = (s: Slot) => recorded.some(a => {
    if (a.subject.toLowerCase() !== s.subject.toLowerCase()) return false;
    const sc = s.class_names.split(',').map(c => c.trim().toLowerCase());
    return a.class_names.split(',').map(c => c.trim().toLowerCase()).some(c => sc.includes(c));
  });
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  const phase = (s: Slot): 'done' | 'later' | 'now' | 'missed' =>
    isDone(s) ? 'done' : nowMin < toMin(s.start_time) ? 'later' : nowMin <= toMin(s.end_time) ? 'now' : 'missed';
  const focus = slots.find(s => phase(s) === 'now') ?? slots.find(s => phase(s) === 'later') ?? slots.find(s => phase(s) === 'missed');
  const doneCount = slots.filter(isDone).length;
  const missed = slots.filter(s => phase(s) === 'missed').length;
  const submit = (s: Slot) => router.push({ pathname: '/(tabs)/submit', params: { slotId: s.id } });
  const pctTone = (p: number | null) => (p == null ? C.muted : p >= 90 ? C.success : p >= 75 ? C.warning : C.danger);

  const dayBanner = dayStatus && dayStatus.status !== 'normal' ? (() => {
    const title = dayStatus.status === 'vacation' ? 'School vacation' : dayStatus.status === 'holiday' ? 'Public holiday'
      : dayStatus.status === 'closed' ? 'School closed' : 'School event today';
    return <Notice tone={dayStatus.status === 'closed' ? 'bad' : 'info'} text={`${title}. ${dayStatus.label ? `${dayStatus.label}. ` : ''}No lessons are scheduled today.`} />;
  })() : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <Screen onRefresh={load}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }} accessibilityRole="header">Today</Text>
            <Text style={{ color: C.textSoft, fontSize: 15 }}>
              {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/notifications')} accessibilityRole="button"
            accessibilityLabel={alerts.length ? `${alerts.length} unread alerts` : 'Alerts'} hitSlop={8}
            style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }}>
            <Ionicons name="notifications-outline" size={22} color={C.text} />
            {alerts.length > 0 && <View style={{ position: 'absolute', top: 8, right: 9, width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger }} />}
          </Pressable>
        </View>

        <AppUpdateBanner />
        <Notice text={error} tone="bad" />

        {askReminders && (
          <Card accent={C.accent}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Get a bell before each lesson</Text>
            <Body soft>CAS can ring your phone a few minutes before every lesson and remedial, with the class and subject.</Body>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Set it up" grow onPress={async () => { await saveSettings({ ...(await getSettings()), prompted: true }); setAskReminders(false); router.push('/reminders'); }} />
              <Button label="Not now" kind="secondary" grow onPress={async () => { await saveSettings({ ...(await getSettings()), prompted: true }); setAskReminders(false); }} />
            </View>
          </Card>
        )}
        {dayBanner}

        {queries.length > 0 && (
          <Pressable onPress={() => router.push('/conduct')} accessibilityRole="button">
            <Notice tone="bad" text={`You have ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'} waiting for your response. Tap to open.`} />
          </Pressable>
        )}
        {alerts.length > 0 && (
          <Pressable onPress={() => router.push('/(tabs)/notifications')} accessibilityRole="button">
            <Notice tone="info" text={alerts.length === 1 ? alerts[0].message : `${alerts.length} unread alerts. Tap to read them.`} />
          </Pressable>
        )}

        {notices.map(n => (
          <Card key={n.id} accent={n.priority === 'urgent' ? C.danger : n.priority === 'important' ? C.warning : undefined}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {n.priority !== 'normal' && <Chip label={n.priority === 'urgent' ? 'Urgent' : 'Important'} tone={n.priority === 'urgent' ? 'bad' : 'warn'} />}
              {n.is_pinned && <Chip label="Pinned" tone="brand" />}
            </View>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{n.title}</Text>
            <Body soft>{n.body}</Body>
            <Body small soft>{n.author_name}, {new Date(n.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Body>
          </Card>
        ))}

        {!loading && slots.length > 0 && (
          <Body soft>
            <Text style={{ fontWeight: '700', color: C.text }}>{doneCount} of {slots.length}</Text> lessons recorded today
            {missed > 0 ? <Text style={{ color: C.danger, fontWeight: '700' }}>{`, ${missed} not recorded`}</Text> : null}
          </Body>
        )}

        {!loading && focus && (() => {
          const ph = phase(focus);
          return (
            <Card accent={ph === 'missed' ? C.danger : C.accent}>
              <Text style={{ color: ph === 'missed' ? C.danger : C.warning, fontSize: 14, fontWeight: '700' }}>
                {ph === 'now' ? 'Now' : ph === 'later' ? `Next, at ${hm(focus.start_time)}` : 'Ended, not recorded yet'}
              </Text>
              <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>{focus.class_names}</Text>
              <Body soft>{focus.subject}, {hm(focus.start_time)} to {hm(focus.end_time)}{focus.room ? `, ${focus.room}` : ''}</Body>
              <Button label="Submit attendance" onPress={() => submit(focus)} />
            </Card>
          );
        })()}

        <SectionLabel>All lessons today</SectionLabel>
        {loading ? <Body soft>Loading…</Body> : slots.length === 0 ? (
          <Card><Body soft>No lessons on your timetable today. Your weekly timetable is under Timetable.</Body></Card>
        ) : slots.map(s => {
          const ph = phase(s);
          const bar = ph === 'done' ? C.primaryText : ph === 'now' ? C.accent : ph === 'missed' ? C.danger : C.border;
          return (
            <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: bar }} />
              <View style={{ flex: 1 }}>
                <Body small soft>{hm(s.start_time)} to {hm(s.end_time)}</Body>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{s.class_names}</Text>
                <Body small soft>{s.subject}{ph === 'now' ? ', on now' : ph === 'later' ? ', later today' : ''}</Body>
                {ph === 'missed' && <Text style={{ color: C.danger, fontSize: 13, fontWeight: '700' }}>Not recorded</Text>}
              </View>
              {ph === 'done' ? <Chip label="Recorded" tone="ok" /> : (
                <Button label="Submit" kind={ph === 'later' ? 'secondary' : 'primary'} onPress={() => submit(s)} style={{ minHeight: 44 }} />
              )}
            </Card>
          );
        })}

        {summary && (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Body soft>My attendance this semester</Body>
              <Text style={{ color: pctTone(summary.attendance_pct), fontSize: 20, fontWeight: '800' }}>
                {summary.attendance_pct != null ? `${summary.attendance_pct}%` : 'None yet'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {[['Present', summary.present_periods, C.success], ['Absent', summary.absent_periods, summary.absent_periods ? C.danger : C.muted],
                ['Excused', summary.excused_periods, C.muted], ['Scheduled', summary.total_scheduled, C.muted]].map(([l, v, col]) => (
                <View key={l as string} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: col as string, fontSize: 18, fontWeight: '800' }}>{v as number}</Text>
                  <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{l as string}</Text>
                </View>
              ))}
            </View>
            {summary.total_scheduled > 0 && <Progress value={(summary.attendance_pct ?? 0) / 100} />}
          </Card>
        )}

        {meetings.length > 0 && (
          <Card>
            <Body soft>Meeting attendance this semester</Body>
            {meetings.map(m => (
              <View key={m.meeting_type} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>
                    {m.meeting_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bPlc\b/, 'PLC')}
                  </Text>
                  <Text style={{ color: pctTone(m.pct), fontSize: 14, fontWeight: '700' }}>{m.pct != null ? `${m.pct}%` : ''} ({m.present}/{m.total})</Text>
                </View>
                {m.total > 0 && <Progress value={(m.pct ?? 0) / 100} />}
              </View>
            ))}
          </Card>
        )}

        {events.length > 0 && (
          <>
            <SectionLabel>Coming up</SectionLabel>
            <Card style={{ gap: 6 }}>
              {events.slice(0, 6).map(e => (
                <View key={e.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 36 }}>
                  <Text style={{ color: C.textSoft, fontSize: 13, width: 92 }}>
                    {new Date(`${e.date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{e.name}</Text>
                  <Chip label={e.type} tone={e.type === 'Holiday' ? 'warn' : e.type === 'Closed Day' ? 'bad' : 'brand'} />
                </View>
              ))}
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}
