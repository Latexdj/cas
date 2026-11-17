import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Body, Card, ChoiceChips, Chip, Empty, Loading, Notice, Row, Screen, Segmented, errText } from '@/components/ui/kit';

type Status = 'Present' | 'Absent' | 'Late' | 'Excused';
interface Session { id: string; date: string; subject: string; class_name: string; lesson_end_time: string | null; total: number; present: number; absent: number; late: number; excused: number }
interface Rec { id: string; status: Status; student_id: string; student_code: string; name: string; class_name: string }
interface AtRisk { id: string; student_code: string; name: string; class_name: string; total_sessions: number; present: number; absent: number; late: number; excused: number; present_pct: number | null }

const RISK = 75;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const dayLabel = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
function editable(date: string, end: string | null) {
  if (!end) return true;
  const t = new Date(`${date.slice(0, 10)}T${end.slice(0, 8)}`);
  return isNaN(t.getTime()) || Date.now() <= t.getTime() + 30 * 60 * 1000;
}

export default function StudentAttendanceScreen() {
  const C = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<'sessions' | 'risk'>('sessions');
  const [days, setDays] = useState(30);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [risk, setRisk] = useState<AtRisk[] | null>(null);
  const [belowOnly, setBelowOnly] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [records, setRecords] = useState<Rec[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  const range = () => ({ from: ymd(new Date(Date.now() - days * 86400000)), to: ymd(new Date()) });
  const loadSessions = useCallback(async () => {
    if (!user) return;
    try { const { data } = await api.get<Session[]>(`/api/student-attendance/teacher/${user.id}`, { params: range() }); setSessions(Array.isArray(data) ? data : []); }
    catch (e) { setSessions([]); setMsg({ text: errText(e, 'Could not load the registers.'), tone: 'bad' }); }
  }, [user, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRisk = useCallback(async () => {
    if (!user) return;
    try { const { data } = await api.get<AtRisk[]>(`/api/student-attendance/report/teacher/${user.id}/students`, { params: range() }); setRisk(Array.isArray(data) ? data : []); }
    catch (e) { setRisk([]); setMsg({ text: errText(e, 'Could not load student attendance.'), tone: 'bad' }); }
  }, [user, days]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSessions(null); setRisk(null); loadSessions(); if (tab === 'risk') loadRisk(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'risk' && risk === null) loadRisk(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openSession(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id); setRecords(null); setMsg(null);
    try { const { data } = await api.get<{ records: Rec[] }>(`/api/student-attendance/session/${id}`); setRecords(data.records ?? []); }
    catch (e) { setRecords([]); setMsg({ text: errText(e, 'Could not open this register.'), tone: 'bad' }); }
  }
  async function setStatus(s: Session, r: Rec, status: 'Present' | 'Absent' | 'Late') {
    if (r.status === status) return;
    setSaving(r.id); setMsg(null);
    try {
      // The server may record Excused instead (a clinic visit), so use what it returns.
      const { data } = await api.patch<{ status: Status }>(`/api/student-attendance/records/${r.id}`, { status });
      const updated = (records ?? []).map(x => (x.id === r.id ? { ...x, status: data.status } : x));
      setRecords(updated);
      const count = (st: Status) => updated.filter(x => x.status === st).length;
      setSessions(prev => prev?.map(x => (x.id === s.id ? { ...x, present: count('Present'), absent: count('Absent'), late: count('Late'), excused: count('Excused') } : x)) ?? prev);
      if (data.status !== status) setMsg({ text: `${r.name} is recorded as ${data.status} because of a clinic visit.`, tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not change the status. Try again.'), tone: 'bad' }); }
    finally { setSaving(null); }
  }

  const tone = (st: Status) => (st === 'Present' ? 'ok' : st === 'Absent' ? 'bad' : st === 'Late' ? 'warn' : 'neutral') as 'ok' | 'bad' | 'warn' | 'neutral';
  const riskShown = (risk ?? []).filter(x => !belowOnly || (x.present_pct ?? 100) < RISK);
  const byClass = riskShown.reduce<Record<string, AtRisk[]>>((m, x) => { (m[x.class_name] ||= []).push(x); return m; }, {});

  return (
    <Screen onRefresh={() => (tab === 'sessions' ? loadSessions() : loadRisk())}>
      <Segmented value={tab} onChange={setTab} options={[{ key: 'sessions', label: 'Registers' }, { key: 'risk', label: 'At risk' }]} />
      <ChoiceChips value={days} onChange={setDays} options={[{ key: 7, label: 'Last 7 days' }, { key: 30, label: 'Last 30 days' }, { key: 90, label: 'Last 90 days' }]} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />

      {tab === 'sessions' ? (
        sessions === null ? <Loading /> : sessions.length === 0 ? (
          <Empty icon="clipboard-outline" title="No registers in this period" text="Registers you take when you submit attendance appear here." />
        ) : sessions.map(s => {
          const isOpen = openId === s.id; const canEdit = editable(s.date, s.lesson_end_time);
          return (
            <Card key={s.id}>
              <Pressable onPress={() => openSession(s.id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} style={{ gap: 6 }}>
                <Body small soft>{dayLabel(s.date)}</Body>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{s.class_name}, {s.subject}</Text>
                <Row>
                  <Chip label={`${s.present} present`} tone="ok" />
                  {s.absent > 0 && <Chip label={`${s.absent} absent`} tone="bad" />}
                  {s.late > 0 && <Chip label={`${s.late} late`} tone="warn" />}
                  {s.excused > 0 && <Chip label={`${s.excused} excused`} />}
                </Row>
              </Pressable>
              {isOpen && (records === null ? <Loading /> : (
                <View style={{ gap: 2 }}>
                  <Body small soft>{canEdit ? 'You can correct this register until 30 minutes after the lesson ends.' : 'This register can no longer be changed (more than 30 minutes after the lesson).'}</Body>
                  {records.map(r => (
                    <View key={r.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: C.border, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: C.text, fontSize: 15, flex: 1 }}>{r.name}</Text>
                        {!canEdit && <Chip label={r.status} tone={tone(r.status)} />}
                      </View>
                      {canEdit && (
                        <Row>
                          {(['Present', 'Absent', 'Late'] as const).map(st => {
                            const on = r.status === st;
                            return (
                              <Pressable key={st} onPress={() => setStatus(s, r, st)} disabled={saving === r.id} accessibilityRole="radio" accessibilityState={{ checked: on }}
                                accessibilityLabel={`${r.name}: ${st}`}
                                style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: 'center',
                                  borderColor: on ? (st === 'Present' ? C.success : st === 'Absent' ? C.danger : C.warning) : C.border,
                                  backgroundColor: on ? (st === 'Present' ? C.successLight : st === 'Absent' ? C.dangerLight : C.warningLight) : C.surface, opacity: saving === r.id ? 0.5 : 1 }}>
                                <Text style={{ color: C.text, fontSize: 14, fontWeight: on ? '700' : '500' }}>{st}</Text>
                              </Pressable>
                            );
                          })}
                          {r.status === 'Excused' && <Chip label="Excused" />}
                        </Row>
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </Card>
          );
        })
      ) : (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Body style={{ flex: 1 }}>Only students below {RISK}% attendance</Body>
            <Switch value={belowOnly} onValueChange={setBelowOnly} accessibilityLabel={`Only students below ${RISK}%`} trackColor={{ true: C.primaryText, false: C.border }} />
          </Card>
          {risk === null ? <Loading /> : riskShown.length === 0 ? (
            <Empty icon="happy-outline" title={belowOnly ? `No student is below ${RISK}%` : 'No attendance in this period'} />
          ) : Object.entries(byClass).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([cls, list]) => (
            <Card key={cls}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>{cls}</Text>
              {list.sort((a, b) => (a.present_pct ?? 100) - (b.present_pct ?? 100)).map(x => {
                const pct = x.present_pct;
                return (
                  <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderColor: C.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 15 }}>{x.name}</Text>
                      <Body small soft>{x.student_code}. Absent {x.absent}, late {x.late}, of {x.total_sessions}</Body>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: pct == null ? C.muted : pct < RISK ? C.danger : C.success }}>{pct == null ? 'None' : `${pct}%`}</Text>
                  </View>
                );
              })}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
