import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { getGps } from '@/lib/gps';
import { SelfieCamera, type Selfie } from '@/components/SelfieCamera';
import { Body, Button, Card, Chip, Empty, Field, Loading, Notice, Row, Screen, SectionLabel, errText } from '@/components/ui/kit';

interface Duty {
  id: string; date: string; start_time: string; end_time: string; subject: string; class_name: string; hall_name: string; role: string;
  check_in_id: string | null; checked_in_at: string | null; is_manual: boolean; register_count: number; student_count: number;
}
interface Student { id: string; student_code: string; name: string; class_name: string; status: 'Present' | 'Absent' | null }

const localYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const longDate = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }); };
const hm = (t: string) => t.slice(0, 5);

export default function InvigilationScreen() {
  const C = useTheme();
  const today = localYmd();
  const [duties, setDuties] = useState<Duty[] | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  // Check-in
  const [checkIn, setCheckIn] = useState<Duty | null>(null);
  const [gps, setGps] = useState(''); const [gpsErr, setGpsErr] = useState(''); const [gpsBusy, setGpsBusy] = useState(false);
  const [camera, setCamera] = useState(false); const [selfie, setSelfie] = useState<Selfie | null>(null);
  const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false);
  const [ciErr, setCiErr] = useState(''); const [locFail, setLocFail] = useState(false); const [reason, setReason] = useState('');

  // Register
  const [reg, setReg] = useState<Duty | null>(null);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [marks, setMarks] = useState<Record<string, 'Present' | 'Absent'>>({});
  const [regErr, setRegErr] = useState(''); const [regDone, setRegDone] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get<Duty[]>('/api/exams/sessions/duties/mine'); setDuties(Array.isArray(data) ? data : []); }
    catch (e) { setDuties(prev => prev ?? []); setMsg({ text: errText(e, 'Could not load your duties.'), tone: 'bad' }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function refreshGps() {
    setGpsBusy(true); setGpsErr('');
    const r = await getGps();
    if ('gps' in r) setGps(r.gps); else setGpsErr(r.error);
    setGpsBusy(false);
  }
  function openCheckIn(d: Duty) {
    setCheckIn(d); setSelfie(null); setNotes(''); setCiErr(''); setLocFail(false); setReason(''); setCamera(false); setMsg(null);
    refreshGps();
  }
  async function submitCheckIn(asPending = false) {
    if (!checkIn) return;
    if (!gps && !asPending) { setCiErr('Your location is needed. Tap Refresh.'); return; }
    if (!selfie) { setCiErr('Take a selfie at the venue first.'); return; }
    if (asPending && !reason.trim()) { setCiErr('Explain why your location is correct.'); return; }
    setBusy(true); setCiErr('');
    try {
      await api.post(`/api/exams/sessions/${checkIn.id}/check-in`, {
        gpsCoordinates: gps, imageBase64: selfie.dataUrl, photoSizeKb: selfie.kb, notes: notes.trim() || undefined,
        ...(asPending ? { submitPending: true, pendingReason: reason.trim() } : {}),
      });
      setCheckIn(null);
      setMsg({ text: asPending ? 'Check-in sent to the admin for review.' : 'You are checked in.', tone: 'ok' });
      load();
    } catch (e) {
      const data = (e as { response?: { data?: { locationFailure?: boolean } } }).response?.data;
      setCiErr(errText(e, 'Check-in failed. Try again.')); setLocFail(!!data?.locationFailure);
    } finally { setBusy(false); }
  }

  async function openRegister(d: Duty) {
    setReg(d); setStudents(null); setRegErr(''); setRegDone(false); setMsg(null);
    try {
      const { data } = await api.get<Student[]>(`/api/exams/sessions/${d.id}/register`);
      setStudents(data);
      setMarks(Object.fromEntries(data.map(s => [s.id, s.status ?? 'Present'])));
    } catch (e) { setStudents([]); setRegErr(errText(e, 'Could not load the students.')); }
  }
  async function submitRegister() {
    if (!reg || !students) return;
    setBusy(true); setRegErr('');
    try {
      await api.post(`/api/exams/sessions/${reg.id}/register`, { records: students.map(s => ({ student_id: s.id, status: marks[s.id] ?? 'Present' })) });
      setRegDone(true); load();
    } catch (e) { setRegErr(errText(e, 'Could not submit the register.')); }
    finally { setBusy(false); }
  }

  // ── Register view ──
  if (reg) {
    const present = (students ?? []).filter(s => (marks[s.id] ?? 'Present') === 'Present').length;
    const absent = (students?.length ?? 0) - present;
    return (
      <Screen>
        <Button label="Back to duties" kind="quiet" icon="chevron-back" onPress={() => setReg(null)} style={{ alignSelf: 'flex-start' }} />
        <Card>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{reg.subject}, {reg.class_name}</Text>
          <Body small soft>{longDate(reg.date)}, {reg.hall_name}</Body>
          <Row><Chip label={`${present} present`} tone="ok" /><Chip label={`${absent} absent`} tone={absent ? 'bad' : 'neutral'} /></Row>
        </Card>
        <Notice tone="ok" text={regDone ? `Register submitted: ${present} present, ${absent} absent.` : null} />
        <Notice tone="bad" text={regErr || null} />
        {students === null ? <Loading /> : students.length === 0 ? <Empty icon="people-outline" title="No students for this session" /> : (
          <>
            <Body small soft>Everyone starts as present. Tap a student to mark them absent.</Body>
            {students.map(s => {
              const isPresent = (marks[s.id] ?? 'Present') === 'Present';
              return (
                <Pressable key={s.id} onPress={() => setMarks(m => ({ ...m, [s.id]: isPresent ? 'Absent' : 'Present' }))}
                  accessibilityRole="switch" accessibilityState={{ checked: isPresent }} accessibilityLabel={`${s.name}, ${isPresent ? 'present' : 'absent'}`}
                  style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1,
                    borderColor: isPresent ? C.border : C.danger, backgroundColor: isPresent ? C.surface : C.dangerLight }}>
                  <Ionicons name={isPresent ? 'checkmark-circle' : 'close-circle'} size={24} color={isPresent ? C.success : C.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{s.name}</Text>
                    <Body small soft>{s.student_code}, {s.class_name}</Body>
                  </View>
                  <Text style={{ color: isPresent ? C.success : C.danger, fontSize: 13, fontWeight: '700' }}>{isPresent ? 'Present' : 'Absent'}</Text>
                </Pressable>
              );
            })}
            <Button label={`Submit register (${present} present, ${absent} absent)`} busy={busy} onPress={submitRegister} />
          </>
        )}
      </Screen>
    );
  }

  // ── Check-in view ──
  if (checkIn) {
    return (
      <Screen>
        <Button label="Back to duties" kind="quiet" icon="chevron-back" onPress={() => setCheckIn(null)} style={{ alignSelf: 'flex-start' }} />
        <Card>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>Check in at {checkIn.hall_name}</Text>
          <Body small soft>{checkIn.subject}, {checkIn.class_name}, {hm(checkIn.start_time)} to {hm(checkIn.end_time)}</Body>
        </Card>
        <Card>
          <SectionLabel right={<Button label="Refresh" kind="quiet" onPress={refreshGps} busy={gpsBusy} />}>Your location</SectionLabel>
          {gpsBusy ? <Body soft>Finding your location…</Body> : gps ? <Body>{gps}</Body> : <Body style={{ color: C.danger }}>{gpsErr || 'No location yet.'}</Body>}
        </Card>
        <Card>
          <SectionLabel>Selfie at the venue</SectionLabel>
          {camera ? <SelfieCamera onTaken={s => { setSelfie(s); setCamera(false); }} onCancel={() => setCamera(false)} />
            : selfie ? (
              <View style={{ gap: 8 }}>
                <Image source={{ uri: selfie.uri }} style={{ width: 120, height: 160, borderRadius: 12 }} accessibilityLabel="Your selfie" />
                <Button label="Retake" kind="secondary" onPress={() => setCamera(true)} style={{ alignSelf: 'flex-start' }} />
              </View>
            ) : <Button label="Take a selfie" icon="camera-outline" kind="secondary" onPress={() => setCamera(true)} />}
        </Card>
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 80 }} />
        <Notice tone="bad" text={ciErr || null} />
        {locFail && (
          <Card accent={C.warning}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Still at the venue?</Text>
            <Body soft>Your location did not match the hall. Explain why, and an admin will review your check-in.</Body>
            <Field label="Reason" value={reason} onChangeText={setReason} multiline placeholder="For example, the GPS is weak inside the hall" />
            <Button label="Send for admin review" kind="secondary" busy={busy} onPress={() => submitCheckIn(true)} />
          </Card>
        )}
        <Button label="Check in" busy={busy} disabled={!selfie || (!gps && !locFail)} onPress={() => submitCheckIn(false)} />
      </Screen>
    );
  }

  // ── Duty list ──
  const list = duties ?? [];
  const groups: [string, Duty[]][] = [
    ['Today', list.filter(d => d.date.slice(0, 10) === today)],
    ['Upcoming', list.filter(d => d.date.slice(0, 10) > today)],
    ['Past (last 30 days)', list.filter(d => d.date.slice(0, 10) < today).reverse()],
  ];
  return (
    <Screen onRefresh={load}>
      <Body soft>Your exam invigilation sessions. On the day, check in at the hall and take the register.</Body>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {duties === null ? <Loading /> : list.length === 0 ? (
        <Empty icon="document-lock-outline" title="No invigilation duties" text="Exam sessions you are assigned to appear here." />
      ) : groups.filter(([, g]) => g.length).map(([label, g]) => (
        <View key={label} style={{ gap: 10 }}>
          <SectionLabel>{label}</SectionLabel>
          {g.map(d => {
            const isToday = label === 'Today'; const isPast = label.startsWith('Past');
            const checked = !!d.check_in_id; const regOk = d.register_count > 0;
            return (
              <Card key={d.id} style={isPast ? { opacity: 0.85 } : undefined}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{d.subject}</Text>
                    <Body small soft>{d.class_name}, {d.hall_name}</Body>
                    {!isToday && <Body small soft>{longDate(d.date)}</Body>}
                  </View>
                  <Text style={{ color: C.textSoft, fontSize: 14, fontWeight: '600' }}>{hm(d.start_time)} to {hm(d.end_time)}</Text>
                </View>
                <Row>
                  <Chip tone={checked ? (d.is_manual ? 'neutral' : 'ok') : 'neutral'}
                    label={checked ? `Checked in${d.checked_in_at ? ` ${new Date(d.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}${d.is_manual ? ' by admin' : ''}` : 'Not checked in'} />
                  <Chip tone={regOk ? 'ok' : 'neutral'} label={`Register ${d.register_count} of ${d.student_count}`} />
                </Row>
                {isToday && (
                  <Row>
                    {!checked && <Button label="Check in" grow onPress={() => openCheckIn(d)} />}
                    <Button label={regOk ? 'Edit register' : 'Take register'} kind={checked ? 'primary' : 'secondary'} grow disabled={!checked} onPress={() => openRegister(d)} />
                  </Row>
                )}
                {isToday && !checked && <Body small soft>Check in first to take the register.</Body>}
                {isPast && !checked && <Body small style={{ color: C.danger }}>No check-in was recorded for this session.</Body>}
              </Card>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}
