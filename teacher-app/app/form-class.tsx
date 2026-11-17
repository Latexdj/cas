import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/text';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, Loading, Notice, Picker, Row, Screen, Segmented, errText } from '@/components/ui/kit';

interface Year { id: string; name: string; is_current: boolean; current_semester?: number }
interface Att { present: number; absent: number; late: number; excused: number; total: number; pct: number | null }
interface Student { id: string; name: string; student_code: string; picture_url?: string | null; gender?: string | null; program_name?: string | null; house?: string | null; attendance: Att; has_remarks: boolean }
interface Remark { student_id: string; attitude: string | null; conduct: string | null; general_remarks: string | null }
interface Result { student_id: string; name: string; student_code: string; average: number | null; class_position: number | null; overall_grade: string; subjects: { subject: string; ca_score: number | null; exam_score: number | null; total: number | null; grade: string | null }[] }
interface Flagged { student_id: string; student_name: string; flags: { type: string; severity: 'high' | 'medium' | 'low'; detail: string }[]; days_since_last_action: number }
interface Letter { id: string; letter_type: string; subject: string; issued_date: string; status: string; ref_number?: string; academic_year_name?: string }
type Tab = 'overview' | 'remarks' | 'attendance' | 'results' | 'flagged';

const RATINGS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const FLAG_LABELS: Record<string, string> = {
  stale_serious_case: 'Serious case not followed up', escalation_trajectory: 'Getting more serious',
  category_concentration: 'Same kind of offence', time_density: 'Many in a short time', repeat_offense: 'Repeat offence',
};
const K = 'cas_t_form_class';
const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const empty = (id: string): Remark => ({ student_id: id, attitude: null, conduct: null, general_remarks: null });

function Avatar({ s, size = 40 }: { s: Pick<Student, 'name' | 'picture_url'>; size?: number }) {
  const C = useTheme();
  return s.picture_url
    ? <Image source={{ uri: s.picture_url }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityLabel={`Photo of ${s.name}`} />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.textSoft, fontWeight: '700', fontSize: size * 0.4 }}>{s.name[0]}</Text>
      </View>;
}

export default function FormClassScreen() {
  const C = useTheme();
  const pctColour = (p: number | null) => (p == null ? C.muted : p >= 80 ? C.success : p >= 60 ? C.warning : C.danger);
  const [years, setYears] = useState<Year[]>([]);
  const [yearId, setYearId] = useState('');
  const [sem, setSem] = useState('1');
  const [tab, setTab] = useState<Tab>('overview');
  const [assignment, setAssignment] = useState<{ class_name: string; academic_year?: string } | null | undefined>(undefined);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [onExeat, setOnExeat] = useState<Set<string>>(new Set());
  const [remarks, setRemarks] = useState<Record<string, Remark>>({});
  const [draft, setDraft] = useState<Record<string, Remark>>({});
  const [locked, setLocked] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [att, setAtt] = useState<Record<string, Att> | null>(null);
  const [ai, setAi] = useState<Record<string, { busy?: boolean; text?: string; err?: string }>>({});
  const [aiUsed, setAiUsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [open, setOpen] = useState<Student | null>(null);

  useEffect(() => {
    api.get<string[]>('/api/exeat/on-exeat-ids').then(r => setOnExeat(new Set(r.data))).catch(() => {});
    (async () => {
      let saved: { yearId?: string; sem?: string; tab?: Tab } = {};
      try { saved = JSON.parse((await AsyncStorage.getItem(K)) || '{}'); } catch { /* none */ }
      try {
        const { data } = await api.get<Year[]>('/api/academic-years');
        setYears(data);
        const y = data.find(x => x.id === saved.yearId) ?? data.find(x => x.is_current) ?? data[0];
        if (!y) { setAssignment(null); return; }
        setYearId(y.id); setSem(saved.yearId === y.id && saved.sem ? saved.sem : String(y.current_semester ?? 1));
        if (saved.tab) setTab(saved.tab);
      } catch { setAssignment(null); }
    })();
  }, []);
  useEffect(() => { if (yearId) AsyncStorage.setItem(K, JSON.stringify({ yearId, sem, tab })).catch(() => {}); }, [yearId, sem, tab]);

  useEffect(() => {
    if (!yearId) return;
    setAssignment(undefined);
    api.get(`/api/form-teacher/assignment`, { params: { academic_year_id: yearId } }).then(r => setAssignment(r.data ?? null)).catch(() => setAssignment(null));
  }, [yearId]);

  useEffect(() => {
    if (!assignment?.class_name) return;
    setStudents(null); setResults(null); setAtt(null);
    api.get<Student[]>('/api/form-teacher/students', { params: { academic_year_id: yearId, semester: sem } })
      .then(r => setStudents(r.data ?? [])).catch(e => { setStudents([]); setMsg({ text: errText(e, 'Could not load your class.'), tone: 'bad' }); });
  }, [assignment, yearId, sem]);

  useEffect(() => {
    if (!assignment?.class_name || !students) return;
    const cls = assignment.class_name;
    const loadResults = () => api.get<Result[]>('/api/results', { params: { academic_year_id: yearId, semester: sem, class_name: cls } })
      .then(r => setResults(r.data ?? [])).catch(() => setResults([]));
    if (tab === 'remarks') {
      api.get<{ remarks: Remark[]; locked?: boolean }>('/api/form-teacher/remarks', { params: { academic_year_id: yearId, semester: sem } }).then(r => {
        const m: Record<string, Remark> = {};
        for (const x of r.data.remarks ?? []) m[x.student_id] = x;
        setRemarks(m); setLocked(!!r.data.locked);
        setDraft(Object.fromEntries(students.map(s => [s.id, m[s.id] ?? empty(s.id)])));
      }).catch(e => setMsg({ text: errText(e, 'Could not load the remarks.'), tone: 'bad' }));
      if (results === null) loadResults();
    } else if (tab === 'attendance' && att === null) {
      api.get<(Att & { student_id: string })[]>('/api/form-teacher/attendance', { params: { academic_year_id: yearId, semester: sem } })
        .then(r => setAtt(Object.fromEntries((r.data ?? []).map(x => [x.student_id, x])))).catch(() => setAtt({}));
    } else if (tab === 'results' && results === null) loadResults();
  }, [tab, students]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    if (!students?.length) return null;
    const p = students.map(s => s.attendance.pct).filter((x): x is number => x != null);
    return { avg: p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : null, remarks: students.filter(s => s.has_remarks).length };
  }, [students]);

  const upd = (id: string, f: keyof Remark, v: string | null) => setDraft(p => ({ ...p, [id]: { ...(p[id] ?? empty(id)), [f]: v || null } }));
  async function draftAI(id: string) {
    setAi(p => ({ ...p, [id]: { busy: true } }));
    try {
      const { data } = await api.post<{ draft: string }>('/api/ai/draft-remark', { student_id: id, academic_year_id: yearId, semester: parseInt(sem, 10), track: 'secondary_overall' });
      setAi(p => ({ ...p, [id]: { text: data.draft } }));
    } catch (e) { setAi(p => ({ ...p, [id]: { err: errText(e, 'No draft available. Write the remark yourself.') } })); }
  }
  async function save() {
    setSaving(true); setMsg(null);
    try {
      await api.post('/api/form-teacher/remarks', { academic_year_id: yearId, semester: sem, remarks: Object.values(draft).map(r => ({ ...r, ai_drafted: aiUsed.has(r.student_id) })) });
      setRemarks({ ...draft });
      setStudents(p => p?.map(s => { const d = draft[s.id]; return d && (d.attitude || d.conduct || d.general_remarks) ? { ...s, has_remarks: true } : s; }) ?? p);
      setMsg({ text: 'Remarks saved.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not save the remarks. Try again.'), tone: 'bad' }); }
    finally { setSaving(false); }
  }

  const filters = (
    <Card>
      <Picker label="Academic year" value={yearId || null} options={years.map(y => ({ key: y.id, label: y.name }))} onChange={setYearId} />
      <ChoiceChips label="Semester" value={sem} onChange={setSem} options={[{ key: '1', label: 'Semester 1' }, { key: '2', label: 'Semester 2' }]} />
    </Card>
  );

  if (assignment === undefined) return <Screen><Loading /></Screen>;
  if (assignment === null) return (
    <Screen>
      <Empty icon="people-circle-outline" title="No form class this year" text="You are not the form teacher of a class for this academic year. Ask your administrator if this is wrong." />
      {filters}
    </Screen>
  );

  // ── One student ──
  if (open) {
    const r = results?.find(x => x.student_id === open.id) ?? null;
    const a = att?.[open.id] ?? open.attendance;
    const rem = remarks[open.id] ?? draft[open.id];
    return (
      <Screen>
        <Button label="Back to the class" kind="quiet" icon="chevron-back" onPress={() => setOpen(null)} style={{ alignSelf: 'flex-start' }} />
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar s={open} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{open.name}</Text>
            <Body small soft>{[open.student_code, open.program_name, open.gender, open.house].filter(Boolean).join(', ')}</Body>
          </View>
        </Card>
        <Card>
          <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '700' }}>Attendance this semester</Text>
          <Row style={{ justifyContent: 'space-between' }}>
            {([['Present', a.present, C.success], ['Absent', a.absent, C.danger], ['Late', a.late, C.warning], ['Excused', a.excused, C.textSoft], ['Total', a.total, C.text]] as const).map(([l, v, col]) => (
              <View key={l} style={{ alignItems: 'center', minWidth: 52 }}>
                <Text style={{ color: col, fontSize: 18, fontWeight: '800' }}>{v}</Text>
                <Body small soft>{l}</Body>
              </View>
            ))}
          </Row>
          {a.pct != null && <Body small style={{ color: pctColour(a.pct), fontWeight: '700' }}>{a.pct}% attendance</Body>}
        </Card>
        {r ? (
          <Card>
            <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '700' }}>Results</Text>
            <Row style={{ justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}><Text style={{ color: C.success, fontSize: 18, fontWeight: '800' }}>{r.average ?? 'None'}</Text><Body small soft>Average</Body></View>
              <View style={{ alignItems: 'center' }}><Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>{r.class_position ? ordinal(r.class_position) : 'None'}</Text><Body small soft>Position</Body></View>
              <View style={{ alignItems: 'center' }}><Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>{r.overall_grade || 'None'}</Text><Body small soft>Grade</Body></View>
            </Row>
            {r.subjects.map(s => (
              <View key={s.subject} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderColor: C.border }}>
                <Text style={{ flex: 1, color: C.text, fontSize: 14 }}>{s.subject}</Text>
                <Text style={{ color: C.textSoft, fontSize: 13, width: 92, textAlign: 'right' }}>CA {s.ca_score ?? '-'}, exam {s.exam_score ?? '-'}</Text>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '800', width: 64, textAlign: 'right' }}>{s.total ?? '-'} {s.grade && s.grade !== '-' ? s.grade : ''}</Text>
              </View>
            ))}
          </Card>
        ) : results === null ? null : <Body soft>No results for this semester yet.</Body>}
        {rem && (rem.attitude || rem.conduct || rem.general_remarks) && (
          <Card>
            <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '700' }}>Your remarks</Text>
            {!!rem.attitude && <Body>Attitude: {rem.attitude}</Body>}
            {!!rem.conduct && <Body>Conduct: {rem.conduct}</Body>}
            {!!rem.general_remarks && <Body soft>{rem.general_remarks}</Body>}
          </Card>
        )}
      </Screen>
    );
  }

  const list = students ?? [];
  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>{assignment.class_name}</Text>
        {!!assignment.academic_year && <Body small soft>{assignment.academic_year}, semester {sem}</Body>}
      </View>
      {filters}
      <Segmented value={tab} onChange={t => { setTab(t); setMsg(null); }} options={[
        { key: 'overview', label: 'Students' },
        { key: 'remarks', label: stats ? `Remarks ${stats.remarks}/${list.length}` : 'Remarks' },
        { key: 'attendance', label: 'Attendance' }, { key: 'results', label: 'Results' }, { key: 'flagged', label: 'Flagged' },
      ]} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />

      {students === null ? <Loading /> : tab === 'overview' ? (
        <>
          <Row>
            <Chip label={`${list.length} students`} />
            {stats?.avg != null && <Chip label={`${stats.avg}% average attendance`} tone={stats.avg >= 80 ? 'ok' : stats.avg >= 60 ? 'warn' : 'bad'} />}
            {stats && <Chip label={`Remarks for ${stats.remarks} of ${list.length}`} tone={stats.remarks === list.length ? 'ok' : 'warn'} />}
          </Row>
          {list.length === 0 ? <Empty icon="people-outline" title={`No active students in ${assignment.class_name}`} /> : list.map(s => (
            <Pressable key={s.id} onPress={() => setOpen(s)} accessibilityRole="button" accessibilityLabel={`${s.name}, ${s.attendance.pct ?? 'no'} percent attendance`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: pressed ? C.bg : C.surface })}>
              <Avatar s={s} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{s.name}</Text>
                <Body small soft>{s.student_code}{s.program_name ? `, ${s.program_name}` : ''}</Body>
                <Row style={{ marginTop: 4 }}>
                  {onExeat.has(s.id) && <Chip label="On exeat" tone="warn" />}
                  {s.has_remarks && <Chip label="Remarks done" tone="ok" />}
                </Row>
              </View>
              <Text style={{ color: pctColour(s.attendance.pct), fontSize: 15, fontWeight: '800' }}>{s.attendance.pct != null ? `${s.attendance.pct}%` : ''}</Text>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          ))}
        </>
      ) : tab === 'remarks' ? (
        <>
          <Body small soft>Attitude, conduct and a general remark for each report card.</Body>
          {locked && <Notice tone="info" text="Results for this class are published, so remarks are locked. Ask your administrator if a change is needed." />}
          {!locked && <Button label="Save all remarks" busy={saving} onPress={save} />}
          {list.map(s => {
            const d = draft[s.id] ?? empty(s.id); const r = results?.find(x => x.student_id === s.id); const a = ai[s.id] ?? {};
            return (
              <Card key={s.id}>
                <Pressable onPress={() => setOpen(s)} accessibilityRole="button" accessibilityLabel={`Open ${s.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar s={s} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{s.name}</Text>
                    <Body small soft>
                      Attendance {s.attendance.pct != null ? `${s.attendance.pct}%` : 'none'}
                      {r ? `. ${r.class_position ? `${ordinal(r.class_position)}, ` : ''}average ${r.average ?? 'none'}, grade ${r.overall_grade || 'none'}` : results ? '. No results yet' : ''}
                    </Body>
                  </View>
                  {remarks[s.id] && <Chip label="Saved" tone="ok" />}
                </Pressable>
                <ChoiceChips label="Attitude" value={d.attitude} onChange={v => !locked && upd(s.id, 'attitude', d.attitude === v ? null : v)} options={RATINGS.map(o => ({ key: o, label: o }))} />
                <ChoiceChips label="Conduct" value={d.conduct} onChange={v => !locked && upd(s.id, 'conduct', d.conduct === v ? null : v)} options={RATINGS.map(o => ({ key: o, label: o }))} />
                <Field label="General remark" value={d.general_remarks ?? ''} editable={!locked} multiline onChangeText={t => upd(s.id, 'general_remarks', t)}
                  placeholder="For example, a diligent student who shows great potential" />
                {!locked && <Button label={a.busy ? 'Drafting…' : 'Draft with AI'} kind="secondary" icon="sparkles-outline" busy={a.busy} onPress={() => draftAI(s.id)} style={{ alignSelf: 'flex-start' }} />}
                {!!a.err && <Body small style={{ color: C.danger }}>{a.err}</Body>}
                {!!a.text && (
                  <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.successLight }}>
                    <Text style={{ color: C.success, fontSize: 13, fontWeight: '700' }}>AI draft. Read it before you use it.</Text>
                    <Body>{a.text}</Body>
                    <Row>
                      <Button label="Use this draft" onPress={() => { upd(s.id, 'general_remarks', a.text!); setAiUsed(p => new Set(p).add(s.id)); setAi(p => ({ ...p, [s.id]: {} })); }} />
                      <Button label="Dismiss" kind="quiet" onPress={() => setAi(p => ({ ...p, [s.id]: {} }))} />
                    </Row>
                  </View>
                )}
              </Card>
            );
          })}
          {!locked && list.length > 3 && <Button label="Save all remarks" busy={saving} onPress={save} />}
        </>
      ) : tab === 'attendance' ? (
        att === null ? <Loading /> : Object.keys(att).length === 0 ? <Empty icon="calendar-outline" title="No attendance this semester" /> : (
          <Card>
            <Body small soft>All lessons recorded for this class this semester, lowest first.</Body>
            {Object.entries(att).sort(([, a], [, b]) => (a.pct ?? 0) - (b.pct ?? 0)).map(([id, a]) => {
              const s = list.find(x => x.id === id);
              return (
                <Pressable key={id} onPress={() => s && setOpen(s)} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: C.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 15 }}>{s?.name ?? id}</Text>
                    <Body small soft>Present {a.present}, absent {a.absent}, late {a.late}, excused {a.excused}, of {a.total}</Body>
                  </View>
                  <Text style={{ color: pctColour(a.pct), fontSize: 15, fontWeight: '800' }}>{a.pct != null ? `${a.pct}%` : ''}</Text>
                </Pressable>
              );
            })}
          </Card>
        )
      ) : tab === 'results' ? (
        results === null ? <Loading /> : results.length === 0 ? <Empty icon="bar-chart-outline" title="No results for this semester" /> : (
          <Card>
            {[...results].sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999)).map(r => {
              const s = list.find(x => x.id === r.student_id);
              return (
                <Pressable key={r.student_id} onPress={() => s && setOpen(s)} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: C.border }}>
                  <Text style={{ width: 36, color: r.class_position && r.class_position <= 3 ? C.warning : C.textSoft, fontWeight: '800', fontSize: 14 }}>{r.class_position ? ordinal(r.class_position) : '-'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 15 }}>{r.name}</Text>
                    <Body small soft>{r.student_code}, {r.subjects.length} subjects</Body>
                  </View>
                  <Text style={{ color: r.average == null ? C.muted : r.average >= 70 ? C.success : r.average >= 50 ? C.warning : C.danger, fontSize: 15, fontWeight: '800' }}>{r.average ?? ''}</Text>
                  <Chip label={r.overall_grade || 'None'} />
                </Pressable>
              );
            })}
          </Card>
        )
      ) : <FlaggedList />}
    </Screen>
  );
}

function FlaggedList() {
  const C = useTheme();
  const [list, setList] = useState<Flagged[] | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [letters, setLetters] = useState<Letter[] | null>(null);
  useEffect(() => {
    api.get<{ students: Flagged[] }>('/api/form-teacher/flagged-students').then(r => setList(r.data.students ?? [])).catch(e => { setList([]); setErr(errText(e, 'Could not load flagged students.')); });
  }, []);
  function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setLetters(null);
    api.get<{ letters: Letter[] }>(`/api/form-teacher/student-letters/${id}`).then(r => setLetters(r.data.letters ?? [])).catch(() => setLetters([]));
  }
  if (list === null) return <Loading />;
  if (err) return <Notice tone="bad" text={err} />;
  if (list.length === 0) return <Empty icon="flag-outline" title="No flagged students" text="No student in your class matches a discipline warning this year." />;
  return (
    <>
      <Body small soft>{list.length} students in your class have discipline warnings. Tap one for their letter history.</Body>
      {list.map(s => (
        <Card key={s.student_id}>
          <Pressable onPress={() => toggle(s.student_id)} accessibilityRole="button" accessibilityState={{ expanded: open === s.student_id }} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{s.student_name}</Text>
              <Body small soft>{s.days_since_last_action} days since the last letter</Body>
            </View>
            <Row>{s.flags.map((f, i) => <Chip key={i} label={FLAG_LABELS[f.type] ?? f.type} tone={f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : 'ok'} />)}</Row>
            {s.flags[0] && <Body small soft>{s.flags[0].detail}</Body>}
          </Pressable>
          {open === s.student_id && (letters === null ? <Loading /> : letters.length === 0 ? <Body soft>No letters on record.</Body> : letters.map(l => (
            <View key={l.id} style={{ gap: 2, paddingVertical: 8, borderTopWidth: 1, borderColor: C.border }}>
              <Row><Chip label={l.letter_type.replace(/_/g, ' ')} tone="bad" /><Chip label={l.status} /></Row>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{l.subject}</Text>
              <Body small soft>{fmtDate(l.issued_date)}{l.academic_year_name ? `, ${l.academic_year_name}` : ''}{l.ref_number ? `. Ref ${l.ref_number}` : ''}</Body>
            </View>
          )))}
        </Card>
      ))}
    </>
  );
}
