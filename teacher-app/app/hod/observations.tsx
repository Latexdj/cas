import React, { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { downloadAndShare, isPickError, pickFile } from '@/lib/files';
import { SelfieCamera } from '@/components/SelfieCamera';
import { compressPhoto } from '@/lib/compressPhoto';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, InlineConfirm, Loading, Notice, Picker, Progress, Row, Screen, Segmented, Title, errText } from '@/components/ui/kit';

interface Year { id: string; name: string; is_current: boolean; current_semester?: number }
interface ObsItem { id: string; observed_teacher_name: string; observer_name: string; subject: string | null; class_names: string | null; academic_year_name: string | null; semester: number | null; observed_at: string | null; scheduled_at: string | null; status: string; open_actions: number }
interface Teacher { id: string; name: string; department: string | null }
interface LessonOpt { timetable_id: string; subject: string; class_names: string }
interface Analytics {
  actions: { open: number; done: number; overdue: number };
  coverage: { teacher_id: string; teacher_name: string; department: string | null; observation_count: number; last_observed_at: string | null }[];
  score_trend: { criterion_id: string; criterion_name: string; avg_score: number | null; n: number }[];
}
interface Criterion { id: string; name: string; nts_domain: string | null }
interface Detail {
  id: string; status: string; observed_teacher_id: string; observed_teacher_name: string; observer_name: string; subject: string | null; class_names: string | null;
  academic_year_name: string | null; semester: number | null; glow_notes: string | null; grow_notes: string | null; recommended_action: string | null; evidence_notes: string | null;
  scores: { criterion_id: string; score: number | null; note: string | null }[]; actions: { id: string; description: string; due_date: string | null; status: 'Open' | 'Done' }[];
  photos: { id: string; photo_url: string; caption: string | null }[]; teacher_ack_at: string | null; teacher_comment: string | null;
}
type Msg = { text: string; tone: 'ok' | 'bad' } | null;

const SCORES = [{ key: '', label: 'Not seen' }, { key: '1', label: '1 Ineffective' }, { key: '2', label: '2 Developing' }, { key: '3', label: '3 Effective' }, { key: '4', label: '4 Highly effective' }];
const TONE: Record<string, 'warn' | 'brand' | 'ok' | 'neutral'> = { Scheduled: 'warn', Completed: 'brand', Acknowledged: 'brand', Closed: 'ok' };
const STATUS_LABEL: Record<string, string> = { Scheduled: 'In progress', Completed: 'Sent to teacher', Acknowledged: 'Acknowledged', Closed: 'Closed' };
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const when = (d: string | null) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function ObservationsScreen() {
  const C = useTheme();
  const [tab, setTab] = useState<'list' | 'analytics'>('list');
  const [list, setList] = useState<ObsItem[] | null>(null);
  const [years, setYears] = useState<Year[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [dl, setDl] = useState(false);

  const load = useCallback(() => {
    api.get<ObsItem[]>('/api/lesson-observation').then(r => setList(r.data ?? [])).catch(e => { setList([]); setMsg({ text: errText(e, 'Could not load observations.'), tone: 'bad' }); });
  }, []);
  useEffect(() => { load(); api.get<Year[]>('/api/academic-years').then(r => setYears(r.data ?? [])).catch(() => {}); }, [load]);

  if (open) return <ObservationDetail id={open} years={years} onBack={() => { setOpen(null); load(); }} />;
  if (starting) return <Start years={years} onCancel={() => setStarting(false)} onCreated={id => { setStarting(false); setOpen(id); }} />;

  async function blank() {
    setDl(true);
    const e = await downloadAndShare('/api/lesson-observation/blank-form/pdf', 'lesson-observation-blank-form.pdf', 'application/pdf');
    if (e) setMsg({ text: e, tone: 'bad' });
    setDl(false);
  }
  return (
    <Screen onRefresh={load}>
      <Body soft>Observe lessons in your department, score them and give feedback.</Body>
      <Row>
        <Button label="Start observation" icon="add" grow onPress={() => { setStarting(true); setMsg(null); }} />
        <Button label="Blank form" kind="secondary" icon="document-outline" busy={dl} onPress={blank} />
      </Row>
      <Segmented value={tab} onChange={setTab} options={[{ key: 'list', label: 'Observations' }, { key: 'analytics', label: 'Analytics' }]} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {tab === 'list' ? (list === null ? <Loading /> : list.length === 0 ? <Empty icon="eye-outline" title="No observations yet" /> : list.map(o => (
        <Pressable key={o.id} onPress={() => setOpen(o.id)} accessibilityRole="button"
          style={({ pressed }) => ({ padding: 14, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: pressed ? C.bg : C.surface })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{o.observed_teacher_name}</Text>
            <Chip label={STATUS_LABEL[o.status] ?? o.status} tone={TONE[o.status] ?? 'neutral'} />
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </View>
          <Body small soft>{[o.subject, o.class_names].filter(Boolean).join(', ') || 'No lesson chosen'}. {when(o.observed_at || o.scheduled_at)}</Body>
          <Body small soft>By {o.observer_name}{o.academic_year_name ? `. ${o.academic_year_name}` : ''}{o.semester ? `, semester ${o.semester}` : ''}{o.open_actions ? `. ${o.open_actions} actions open` : ''}</Body>
        </Pressable>
      ))) : <AnalyticsView years={years} />}
    </Screen>
  );
}

function AnalyticsView({ years }: { years: Year[] }) {
  const C = useTheme();
  const cur = years.find(y => y.is_current) ?? years[0];
  const [year, setYear] = useState(cur?.id ?? '');
  const [sem, setSem] = useState(cur?.current_semester ? String(cur.current_semester) : '');
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    setA(null);
    api.get<Analytics>('/api/lesson-observation/analytics', { params: { ...(year ? { academic_year_id: year } : {}), ...(sem ? { semester: sem } : {}) } }).then(r => setA(r.data)).catch(() => {});
  }, [year, sem]);
  return (
    <>
      <Card>
        <Picker label="Academic year" value={year} options={[{ key: '', label: 'All years' }, ...years.slice(0, 3).map(y => ({ key: y.id, label: y.name }))]} onChange={setYear} />
        <ChoiceChips label="Semester" value={sem} onChange={setSem} options={[{ key: '', label: 'Both' }, { key: '1', label: 'Semester 1' }, { key: '2', label: 'Semester 2' }]} />
      </Card>
      {!a ? <Loading /> : (
        <>
          <Row>
            <Chip label={`${a.actions.open} actions open`} tone="warn" />
            <Chip label={`${a.actions.done} done`} tone="ok" />
            <Chip label={`${a.actions.overdue} overdue`} tone={a.actions.overdue ? 'bad' : 'neutral'} />
          </Row>
          <Card>
            <Title sub="Least observed first, this academic year.">Who has been observed</Title>
            {a.coverage.length === 0 ? <Body soft>No teachers in scope.</Body> : a.coverage.map(c => (
              <View key={c.teacher_id} style={{ flexDirection: 'row', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderColor: C.border }}>
                <Text style={{ flex: 1, color: C.text, fontSize: 14 }}>{c.teacher_name}{c.department ? `, ${c.department}` : ''}</Text>
                <Text style={{ color: c.observation_count ? C.textSoft : C.danger, fontSize: 13, fontWeight: '600' }}>
                  {c.observation_count ? `${c.observation_count} ${c.observation_count === 1 ? 'time' : 'times'}, last ${day(c.last_observed_at)}` : 'Never'}
                </Text>
              </View>
            ))}
          </Card>
          <Card>
            <Title>Average score by criterion</Title>
            {a.score_trend.length === 0 ? <Body soft>No scored observations yet.</Body> : a.score_trend.map(s => (
              <View key={s.criterion_id} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}><Body small>{s.criterion_name}</Body><Body small soft>{s.avg_score ?? 'None'} from {s.n}</Body></Row>
                <Progress value={(s.avg_score ?? 0) / 4} />
              </View>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function LessonPicker({ teacherId, year, sem, value, onChange }: { teacherId: string; year: string; sem: string; value: string; onChange: (o: LessonOpt | null) => void }) {
  const [opts, setOpts] = useState<LessonOpt[] | null>(null);
  useEffect(() => {
    if (!teacherId) { setOpts([]); return; }
    setOpts(null);
    api.get<LessonOpt[]>(`/api/lesson-observation/teacher-lessons/${teacherId}`, { params: { ...(year ? { academic_year_id: year } : {}), ...(sem ? { semester: sem } : {}) } })
      .then(r => setOpts(r.data ?? [])).catch(() => setOpts([]));
  }, [teacherId, year, sem]);
  if (!teacherId) return null;
  if (opts === null) return <Loading label="Loading their timetable…" />;
  if (opts.length === 0) return <Body small soft>This teacher has no lessons on the timetable for this year and semester. The observation will have no subject or class.</Body>;
  return <Picker label="Lesson" value={value || null} placeholder="Choose from their timetable" options={opts.map(o => ({ key: o.timetable_id, label: o.subject, sub: o.class_names }))}
    onChange={id => onChange(opts.find(o => o.timetable_id === id) ?? null)} />;
}

function Start({ years, onCancel, onCreated }: { years: Year[]; onCancel: () => void; onCreated: (id: string) => void }) {
  const cur = years.find(y => y.is_current) ?? years[0];
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [f, setF] = useState({ teacher: '', type: 'drop_in' as 'drop_in' | 'scheduled', year: cur?.id ?? '', sem: cur?.current_semester ? String(cur.current_semester) : '', timetable_id: '', subject: '', class_names: '', date: '', time: '08:00', mode: 'live' as 'live' | 'paper_entered_later', observed: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api.get<Teacher[]>('/api/lesson-observation/observable-teachers').then(r => setTeachers(r.data ?? [])).catch(() => setTeachers([])); }, []);
  async function create() {
    if (!f.teacher) { setErr('Choose the teacher to observe.'); return; }
    if (f.type === 'scheduled' && !DATE.test(f.date)) { setErr('Write the date like 2026-11-20.'); return; }
    if (f.mode === 'paper_entered_later' && !DATE.test(f.observed)) { setErr('Write the lesson date like 2026-11-17.'); return; }
    setBusy(true); setErr('');
    try {
      const { data } = await api.post<{ id: string }>('/api/lesson-observation', {
        observed_teacher_id: f.teacher, observation_type: f.type, subject: f.subject || undefined, class_names: f.class_names || undefined, timetable_id: f.timetable_id || undefined,
        academic_year_id: f.year || undefined, semester: f.sem ? Number(f.sem) : undefined,
        scheduled_at: f.type === 'scheduled' ? new Date(`${f.date}T${f.time || '08:00'}`).toISOString() : undefined,
        observed_at: f.mode === 'paper_entered_later' ? new Date(f.observed).toISOString() : undefined, entry_mode: f.mode,
      });
      onCreated(data.id);
    } catch (e) { setErr(errText(e, 'Could not start the observation.')); setBusy(false); }
  }
  return (
    <Screen>
      <Card>
        <Title>Start observation</Title>
        {teachers === null ? <Loading /> : <Picker label="Teacher" value={f.teacher || null} searchable={teachers.length > 8}
          options={teachers.map(t => ({ key: t.id, label: t.name, sub: t.department ?? undefined }))} onChange={v => setF(p => ({ ...p, teacher: v, timetable_id: '', subject: '', class_names: '' }))} />}
        <ChoiceChips label="When" value={f.type} onChange={v => setF(p => ({ ...p, type: v }))} options={[{ key: 'drop_in', label: 'Now (drop-in)' }, { key: 'scheduled', label: 'Scheduled' }]} />
        <Picker label="Academic year" value={f.year || null} options={years.slice(0, 3).map(y => ({ key: y.id, label: y.name }))} onChange={v => setF(p => ({ ...p, year: v }))} />
        <ChoiceChips label="Semester" value={f.sem} onChange={v => setF(p => ({ ...p, sem: v }))} options={[{ key: '1', label: 'Semester 1' }, { key: '2', label: 'Semester 2' }]} />
        <LessonPicker teacherId={f.teacher} year={f.year} sem={f.sem} value={f.timetable_id}
          onChange={o => setF(p => ({ ...p, timetable_id: o?.timetable_id ?? '', subject: o?.subject ?? '', class_names: o?.class_names ?? '' }))} />
        {f.type === 'scheduled' && (
          <Row>
            <View style={{ flex: 1, minWidth: 140 }}><Field label="Date" value={f.date} onChangeText={v => setF(p => ({ ...p, date: v }))} placeholder="2026-11-20" /></View>
            <View style={{ flex: 1, minWidth: 100 }}><Field label="Time" value={f.time} onChangeText={v => setF(p => ({ ...p, time: v }))} /></View>
          </Row>
        )}
        <ChoiceChips label="Scoring" value={f.mode} onChange={v => setF(p => ({ ...p, mode: v }))} options={[{ key: 'live', label: 'In the app' }, { key: 'paper_entered_later', label: 'From a paper form' }]} />
        {f.mode === 'paper_entered_later' && <Field label="Date of the lesson" value={f.observed} onChangeText={v => setF(p => ({ ...p, observed: v }))} placeholder="2026-11-17" />}
        <Notice tone="bad" text={err || null} />
        <Row>
          <Button label="Create and continue" grow busy={busy} onPress={create} />
          <Button label="Cancel" kind="secondary" grow onPress={onCancel} />
        </Row>
      </Card>
    </Screen>
  );
}

function ObservationDetail({ id, years, onBack }: { id: string; years: Year[]; onBack: () => void }) {
  const C = useTheme();
  const [o, setO] = useState<Detail | null>(null);
  const [crit, setCrit] = useState<Criterion[]>([]);
  const [scores, setScores] = useState<Record<string, { score: number | null; note: string }>>({});
  const [text, setText] = useState({ glow: '', grow: '', action: '', evidence: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [confirm, setConfirm] = useState<'delete' | 'close' | 'publish' | null>(null);
  const [camera, setCamera] = useState(false);
  const [newAction, setNewAction] = useState({ desc: '', due: '' });
  const [editing, setEditing] = useState(false);
  const [setup, setSetup] = useState({ type: 'scheduled' as 'drop_in' | 'scheduled', year: '', sem: '', timetable_id: '', subject: '', class_names: '', date: '', time: '' });

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([api.get<Detail>(`/api/lesson-observation/${id}`), api.get<Criterion[]>('/api/lesson-observation/criteria')]);
      setO(d.data); setCrit(c.data ?? []);
      setText({ glow: d.data.glow_notes ?? '', grow: d.data.grow_notes ?? '', action: d.data.recommended_action ?? '', evidence: d.data.evidence_notes ?? '' });
      setScores(Object.fromEntries((d.data.scores ?? []).map(s => [s.criterion_id, { score: s.score, note: s.note ?? '' }])));
    } catch (e) { setMsg({ text: errText(e, 'Could not open the observation.'), tone: 'bad' }); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const reload = async () => { try { const { data } = await api.get<Detail>(`/api/lesson-observation/${id}`); setO(data); } catch { /* keep */ } };

  async function save(publish: boolean) {
    setBusy(publish ? 'publish' : 'save'); setMsg(null);
    try {
      await api.patch(`/api/lesson-observation/${id}`, {
        scores: crit.map(c => ({ criterion_id: c.id, score: scores[c.id]?.score ?? null, note: scores[c.id]?.note || undefined })),
        glow_notes: text.glow, grow_notes: text.grow, recommended_action: text.action, evidence_notes: text.evidence, status: publish ? 'Completed' : undefined,
      });
      await reload(); setMsg({ text: publish ? 'Sent to the teacher.' : 'Draft saved.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not save.'), tone: 'bad' }); }
    finally { setBusy(null); setConfirm(null); }
  }
  async function act(kind: 'delete' | 'close') {
    setBusy(kind);
    try {
      if (kind === 'delete') { await api.delete(`/api/lesson-observation/${id}`); onBack(); return; }
      await api.patch(`/api/lesson-observation/${id}`, { status: 'Closed' }); await reload(); setMsg({ text: 'Observation closed.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'That did not work.'), tone: 'bad' }); }
    finally { setBusy(null); setConfirm(null); }
  }
  async function addPhoto(dataUrl: string) {
    setBusy('photo');
    try { await api.post(`/api/lesson-observation/${id}/photos`, { photo_base64: dataUrl }); await reload(); }
    catch (e) { setMsg({ text: errText(e, 'Could not add the photo.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function choosePhoto() {
    const f = await pickFile(['image/*'], 15);
    if (isPickError(f)) { setMsg({ text: f.error, tone: 'bad' }); return; }
    if (!f) return;
    // Shrunk like lesson-submission photos (about 40 KB) before it goes up.
    try { addPhoto((await compressPhoto(f.uri)).dataUrl); }
    catch { setMsg({ text: 'That file could not be read as a picture.', tone: 'bad' }); }
  }
  async function removePhoto(pid: string) {
    try { await api.delete(`/api/lesson-observation/${id}/photos/${pid}`); await reload(); } catch (e) { setMsg({ text: errText(e, 'Could not remove the photo.'), tone: 'bad' }); }
  }
  async function addAction() {
    if (!newAction.desc.trim()) return;
    if (newAction.due && !DATE.test(newAction.due)) { setMsg({ text: 'Write the due date like 2026-12-01.', tone: 'bad' }); return; }
    try { await api.post(`/api/lesson-observation/${id}/actions`, { description: newAction.desc.trim(), due_date: newAction.due || undefined }); setNewAction({ desc: '', due: '' }); await reload(); }
    catch (e) { setMsg({ text: errText(e, 'Could not add the action.'), tone: 'bad' }); }
  }
  async function toggleAction(aid: string, status: 'Open' | 'Done') {
    try { await api.patch(`/api/lesson-observation/${id}/actions/${aid}`, { status: status === 'Open' ? 'Done' : 'Open' }); await reload(); } catch { /* keep */ }
  }
  async function pdf() {
    setBusy('pdf');
    const e = await downloadAndShare(`/api/lesson-observation/${id}/pdf`, `lesson-observation-${id}.pdf`, 'application/pdf');
    if (e) setMsg({ text: e, tone: 'bad' });
    setBusy(null);
  }
  function startEdit() {
    if (!o) return;
    const d = (o as unknown as { scheduled_at?: string; timetable_id?: string; academic_year_id?: string; observation_type?: 'drop_in' | 'scheduled' });
    setSetup({ type: d.observation_type ?? 'scheduled', year: d.academic_year_id ?? '', sem: o.semester ? String(o.semester) : '', timetable_id: d.timetable_id ?? '', subject: o.subject ?? '', class_names: o.class_names ?? '',
      date: d.scheduled_at?.slice(0, 10) ?? '', time: d.scheduled_at?.slice(11, 16) ?? '' });
    setEditing(true);
  }
  async function saveSetup() {
    if (setup.type === 'scheduled' && setup.date && !DATE.test(setup.date)) { setMsg({ text: 'Write the date like 2026-11-20.', tone: 'bad' }); return; }
    setBusy('setup');
    try {
      await api.patch(`/api/lesson-observation/${id}`, {
        observation_type: setup.type, subject: setup.subject || null, class_names: setup.class_names || null, timetable_id: setup.timetable_id || null,
        academic_year_id: setup.year || null, semester: setup.sem ? Number(setup.sem) : null,
        scheduled_at: setup.type === 'scheduled' && setup.date ? new Date(`${setup.date}T${setup.time || '08:00'}`).toISOString() : null,
      });
      await reload(); setEditing(false);
    } catch (e) { setMsg({ text: errText(e, 'Could not save the details.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }

  if (!o) return <Screen><Button label="Back" kind="quiet" icon="chevron-back" onPress={onBack} style={{ alignSelf: 'flex-start' }} />{msg ? <Notice tone="bad" text={msg.text} /> : <Loading />}</Screen>;
  const editable = o.status === 'Scheduled';

  return (
    <Screen>
      <Button label="Back to observations" kind="quiet" icon="chevron-back" onPress={onBack} style={{ alignSelf: 'flex-start' }} />
      <View style={{ gap: 4 }}>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{o.observed_teacher_name}</Text>
        <Body small soft>{[o.subject, o.class_names].filter(Boolean).join(', ') || 'Observation'}. Observer {o.observer_name}{o.academic_year_name ? `. ${o.academic_year_name}` : ''}{o.semester ? `, semester ${o.semester}` : ''}</Body>
        <Row><Chip label={STATUS_LABEL[o.status] ?? o.status} tone={TONE[o.status] ?? 'neutral'} /></Row>
      </View>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {editable ? (
        confirm === 'delete'
          ? <InlineConfirm question="Delete this observation? This cannot be undone." confirmLabel="Delete" busy={busy === 'delete'} onConfirm={() => act('delete')} onCancel={() => setConfirm(null)} />
          : <Row><Button label={editing ? 'Cancel editing' : 'Edit details'} kind="secondary" onPress={() => (editing ? setEditing(false) : startEdit())} /><Button label="Delete" kind="quiet" onPress={() => setConfirm('delete')} /></Row>
      ) : <Button label="Share the report (PDF)" kind="secondary" icon="share-outline" busy={busy === 'pdf'} onPress={pdf} />}

      {editing && (
        <Card>
          <Title>Details</Title>
          <ChoiceChips label="When" value={setup.type} onChange={v => setSetup(p => ({ ...p, type: v }))} options={[{ key: 'drop_in', label: 'Drop-in' }, { key: 'scheduled', label: 'Scheduled' }]} />
          <Picker label="Academic year" value={setup.year || null} options={years.slice(0, 3).map(y => ({ key: y.id, label: y.name }))} onChange={v => setSetup(p => ({ ...p, year: v }))} />
          <ChoiceChips label="Semester" value={setup.sem} onChange={v => setSetup(p => ({ ...p, sem: v }))} options={[{ key: '1', label: 'Semester 1' }, { key: '2', label: 'Semester 2' }]} />
          <LessonPicker teacherId={o.observed_teacher_id} year={setup.year} sem={setup.sem} value={setup.timetable_id}
            onChange={x => setSetup(p => ({ ...p, timetable_id: x?.timetable_id ?? '', subject: x?.subject ?? '', class_names: x?.class_names ?? '' }))} />
          {setup.type === 'scheduled' && (
            <Row>
              <View style={{ flex: 1, minWidth: 140 }}><Field label="Date" value={setup.date} onChangeText={v => setSetup(p => ({ ...p, date: v }))} /></View>
              <View style={{ flex: 1, minWidth: 100 }}><Field label="Time" value={setup.time} onChangeText={v => setSetup(p => ({ ...p, time: v }))} /></View>
            </Row>
          )}
          <Button label="Save details" busy={busy === 'setup'} onPress={saveSetup} />
        </Card>
      )}

      <Card>
        <Title sub={editable ? 'Score each part of the lesson from 1 to 4.' : undefined}>Rubric</Title>
        {crit.map(c => {
          const s = scores[c.id];
          return (
            <View key={c.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderColor: C.border }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{c.name}</Text>
              {!!c.nts_domain && <Body small soft>{c.nts_domain}</Body>}
              {editable ? (
                <>
                  <ChoiceChips value={s?.score ? String(s.score) : ''} options={SCORES} onChange={v => setScores(p => ({ ...p, [c.id]: { score: v ? Number(v) : null, note: p[c.id]?.note ?? '' } }))} />
                  <Field label="Note (optional)" value={s?.note ?? ''} onChangeText={v => setScores(p => ({ ...p, [c.id]: { score: p[c.id]?.score ?? null, note: v } }))} />
                </>
              ) : (
                <>
                  <Text style={{ color: C.primaryText, fontSize: 14, fontWeight: '700' }}>{SCORES.find(x => x.key === String(s?.score ?? ''))?.label ?? 'Not seen'}</Text>
                  {!!s?.note && <Body small soft>{s.note}</Body>}
                </>
              )}
            </View>
          );
        })}
      </Card>

      <Card>
        {editable ? (
          <>
            <Field label="What went well" value={text.glow} onChangeText={v => setText(p => ({ ...p, glow: v }))} multiline placeholder="For example, clear instructions and strong board work" />
            <Field label="What to work on" value={text.grow} onChangeText={v => setText(p => ({ ...p, grow: v }))} multiline placeholder="For example, checking understanding before moving on" />
            <Field label="Recommended action" value={text.action} onChangeText={v => setText(p => ({ ...p, action: v }))} multiline placeholder="The specific how, for example a quick thumbs check every 10 minutes" />
            <Field label="Your private notes (the teacher does not see these)" value={text.evidence} onChangeText={v => setText(p => ({ ...p, evidence: v }))} multiline />
          </>
        ) : (
          <>
            <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '700' }}>What went well</Text><Body>{o.glow_notes || 'None'}</Body>
            <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '700' }}>What to work on</Text><Body>{o.grow_notes || 'None'}</Body>
            <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '700' }}>Recommended action</Text><Body>{o.recommended_action || 'None'}</Body>
          </>
        )}
      </Card>

      <Card>
        <Title>Evidence photos</Title>
        {camera ? <SelfieCamera facing="back" onTaken={p => { setCamera(false); addPhoto(p.dataUrl); }} onCancel={() => setCamera(false)} /> : (
          <>
            {o.photos.length === 0 ? <Body soft>No photos yet.</Body> : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {o.photos.map(p => (
                  <View key={p.id} style={{ gap: 4 }}>
                    <Image source={{ uri: p.photo_url }} style={{ width: 120, height: 90, borderRadius: 10 }} accessibilityLabel={p.caption || 'Evidence photo'} />
                    <Button label="Remove" kind="quiet" onPress={() => removePhoto(p.id)} />
                  </View>
                ))}
              </View>
            )}
            <Row>
              {Platform.OS !== 'web' && <Button label="Take photo" kind="secondary" icon="camera-outline" busy={busy === 'photo'} grow onPress={() => setCamera(true)} />}
              <Button label="Choose photo" kind="secondary" icon="image-outline" busy={busy === 'photo'} grow onPress={choosePhoto} />
            </Row>
          </>
        )}
      </Card>

      {editable ? (
        confirm === 'publish'
          ? <InlineConfirm danger={false} question="Send this observation to the teacher? You cannot change the scores after." confirmLabel="Send" busy={busy === 'publish'} onConfirm={() => save(true)} onCancel={() => setConfirm(null)} />
          : <Row><Button label="Save draft" kind="secondary" grow busy={busy === 'save'} onPress={() => save(false)} /><Button label="Send to teacher" grow onPress={() => setConfirm('publish')} /></Row>
      ) : (
        <>
          <Card>
            <Title>Follow-up actions</Title>
            {o.actions.length === 0 ? <Body soft>No actions yet.</Body> : o.actions.map(a => (
              <Pressable key={a.id} onPress={() => toggleAction(a.id, a.status)} accessibilityRole="checkbox" accessibilityState={{ checked: a.status === 'Done' }}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44, paddingVertical: 4 }}>
                <Ionicons name={a.status === 'Done' ? 'checkbox' : 'square-outline'} size={22} color={a.status === 'Done' ? C.success : C.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: a.status === 'Done' ? C.muted : C.text, fontSize: 15, textDecorationLine: a.status === 'Done' ? 'line-through' : 'none' }}>{a.description}</Text>
                  {!!a.due_date && <Body small soft>Due {day(a.due_date)}</Body>}
                </View>
              </Pressable>
            ))}
            {o.status !== 'Closed' && (
              <View style={{ gap: 8 }}>
                <Field label="New action" value={newAction.desc} onChangeText={v => setNewAction(p => ({ ...p, desc: v }))} />
                <Field label="Due (optional)" value={newAction.due} onChangeText={v => setNewAction(p => ({ ...p, due: v }))} placeholder="2026-12-01" />
                <Button label="Add action" kind="secondary" disabled={!newAction.desc.trim()} onPress={addAction} />
              </View>
            )}
          </Card>
          <Card>
            <Title>Teacher's response</Title>
            {o.teacher_ack_at ? (
              <>
                <Body small soft>Acknowledged {day(o.teacher_ack_at)}</Body>
                {!!o.teacher_comment && <Body>{o.teacher_comment}</Body>}
              </>
            ) : <Body soft>Not acknowledged yet.</Body>}
          </Card>
          {o.status !== 'Closed' && (confirm === 'close'
            ? <InlineConfirm danger={false} question="Close this observation? It is marked as fully done." confirmLabel="Close it" busy={busy === 'close'} onConfirm={() => act('close')} onCancel={() => setConfirm(null)} />
            : <Button label="Close observation" kind="secondary" onPress={() => setConfirm('close')} />)}
        </>
      )}
    </Screen>
  );
}
