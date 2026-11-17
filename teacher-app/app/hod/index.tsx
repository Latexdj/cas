import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { hasModule, useAccess } from '@/lib/access';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, ListRow, Loading, Notice, Picker, Progress, Row, Screen, Segmented, errText } from '@/components/ui/kit';

interface Overview {
  hod_type: 'subject' | 'programme'; subjects_linked?: boolean; programme_name: string; department: string;
  teacher_count: number; class_count: number; student_count: number; outstanding_absences: number; pending_remedials: number;
  assessments_total: number; assessments_scored: number;
}
interface ClassRow {
  class_name: string; student_count: number; form_teacher_name?: string | null; form_teacher_phone?: string | null;
  subject?: string | null; teacher_name?: string | null; teacher_phone?: string | null;
}
interface TeacherRow {
  id: string; name: string; phone: string | null; teacher_code: string | null; form_class: string | null; outstanding_absences: number;
  pending_remedials: number; last_attendance_date: string | null; assessments_total: number; assessments_with_scores: number; teaches_only?: boolean;
}
interface AbsenceRow { id: string; date: string; subject: string; class_name: string; status: string; reason: string | null; periods_lost: number | null; teacher_id: string; teacher_name: string }
interface QueueItem {
  id: string; subject: string; class_name: string; status: string; submitted_at: string; teacher_name: string;
  academic_year: string; academic_year_id: string; semester: number; student_count: number; scored_count: number;
}
interface StudentResult {
  student_id: string; student_code: string; name: string; average: number | null; class_position: number | null; class_total: number;
  subjects: { subject: string; ca_score: number | null; exam_score: number | null; total: number | null; grade: string | null }[];
}
interface Year { id: string; name: string; is_current: boolean; current_semester: number }
type Tab = 'overview' | 'approvals' | 'results' | 'classes' | 'teachers' | 'absences';

const K = 'cas_t_hod';
const LEGACY = '__legacy__';
const STATUSES = ['Absent', 'Remedial Scheduled', 'Made Up', 'Cleared', 'Verified', 'Excused'];
const fmt = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
const statusTone = (s: string) => (s === 'Absent' ? 'bad' : s === 'Remedial Scheduled' ? 'warn' : s === 'Excused' ? 'neutral' : 'ok') as 'bad' | 'warn' | 'neutral' | 'ok';

function Stat({ label, value, sub, colour }: { label: string; value: string | number; sub?: string; colour?: string }) {
  const C = useTheme();
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, gap: 2 }}>
      <Text style={{ color: colour ?? C.text, fontSize: 24, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      {!!sub && <Text style={{ color: C.muted, fontSize: 12 }}>{sub}</Text>}
    </View>
  );
}

export default function HodScreen() {
  const C = useTheme();
  const a = useAccess();
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [dept, setDept] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const dq: Record<string, string> = dept && dept !== LEGACY ? { dept_id: dept } : {};

  useEffect(() => {
    (async () => {
      let saved = '';
      try { saved = (await AsyncStorage.getItem(K)) || ''; } catch { /* none */ }
      try {
        const { data } = await api.get<{ depts: { id: string; name: string }[] }>('/api/hod/check');
        const d = data.depts ?? [];
        setDepts(d);
        setDept(d.some(x => x.id === saved) ? saved : d[0]?.id ?? LEGACY);
      } catch { setErr('Could not load your department. Check that you are a head of department.'); }
    })();
  }, []);
  useEffect(() => {
    if (!dept) return;
    AsyncStorage.setItem(K, dept).catch(() => {});
    setOverview(null); setTab('overview');
    api.get<Overview>('/api/hod/overview', { params: dq }).then(r => setOverview(r.data)).catch(() => setErr('Could not load your department. Check that you are a head of department.'));
  }, [dept]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Screen><Notice tone="bad" text={err} /></Screen>;
  if (!dept || !overview) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>{overview.programme_name || overview.department || 'My Department'}</Text>
        <Body small soft>{overview.hod_type === 'subject' ? 'Subject department' : 'Programme'}</Body>
      </View>
      {depts.length > 1 && <Picker label="Department" value={dept} options={depts.map(d => ({ key: d.id, label: d.name }))} onChange={setDept} />}
      <Segmented value={tab} onChange={setTab} options={[
        { key: 'overview', label: 'Overview' }, { key: 'approvals', label: 'Approvals' }, { key: 'results', label: 'Results' },
        { key: 'classes', label: 'Classes' }, { key: 'teachers', label: 'Teachers' }, { key: 'absences', label: 'Absences' },
      ]} />
      <View key={`${dept}-${tab}`} style={{ gap: 12 }}>
        {tab === 'overview' && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Stat label="Teachers" value={overview.teacher_count} />
              <Stat label="Classes" value={overview.class_count} />
              <Stat label="Students" value={overview.student_count} />
              <Stat label="Lessons missed" value={overview.outstanding_absences} sub="not yet made up" colour={overview.outstanding_absences ? C.danger : undefined} />
              <Stat label="Remedials" value={overview.pending_remedials} sub="still to hold" colour={overview.pending_remedials ? C.warning : undefined} />
              <Stat label="Assessments" value={overview.assessments_total} sub={`${overview.assessments_scored} with scores`} />
            </View>
            {overview.assessments_total > 0 && (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}><Body small>Scores recorded</Body><Body small>{overview.assessments_scored} of {overview.assessments_total}</Body></Row>
                <Progress value={overview.assessments_scored / overview.assessments_total} />
              </Card>
            )}
            {(hasModule(a, 'inventory') || hasModule(a, 'lesson_observation') || hasModule(a, 'department_budgets')) && (
              <Card style={{ paddingVertical: 4 }}>
                {hasModule(a, 'inventory') && <ListRow icon="cube-outline" title="Department Inventory" sub="Items, issues, returns and loans" onPress={() => router.push('/hod/inventory')} />}
                {hasModule(a, 'lesson_observation') && <ListRow icon="eye-outline" title="Department Observations" sub="Observe lessons in your department" onPress={() => router.push('/hod/observations')} />}
                {hasModule(a, 'department_budgets') && <ListRow icon="wallet-outline" title="Budgets" sub="Draft and submit your budget" onPress={() => router.push('/budgets')} />}
              </Card>
            )}
          </>
        )}
        {tab === 'approvals' && <Approvals dq={dq} />}
        {tab === 'results' && <Results dq={dq} />}
        {tab === 'classes' && <Classes dq={dq} ov={overview} />}
        {tab === 'teachers' && <Teachers dq={dq} />}
        {tab === 'absences' && <Absences dq={dq} />}
      </View>
    </Screen>
  );
}

function call(phone?: string | null) { if (phone) Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {}); }

// ── Approvals ──
function Approvals({ dq }: { dq: Record<string, string> }) {
  const C = useTheme();
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [open, setOpen] = useState<QueueItem | null>(null);
  const [preview, setPreview] = useState<StudentResult[] | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  const load = useCallback(() => {
    setQueue(null);
    api.get<QueueItem[]>('/api/result-submissions/hod-queue').then(r => setQueue(r.data ?? [])).catch(e => { setQueue([]); setMsg({ text: errText(e, 'Could not load the submissions.'), tone: 'bad' }); });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openItem(q: QueueItem) {
    setOpen(q); setComment(''); setMsg(null); setPreview(null);
    try {
      const { data } = await api.get<StudentResult[]>('/api/hod/results', { params: { academic_year_id: q.academic_year_id, semester: q.semester, class_name: q.class_name, ...dq } });
      setPreview(data ?? []);
    } catch { setPreview([]); }
  }
  async function review(action: 'approve' | 'reject') {
    if (!open) return;
    if (action === 'reject' && !comment.trim()) { setMsg({ text: 'Give a reason so the teacher knows what to fix.', tone: 'bad' }); return; }
    setBusy(action); setMsg(null);
    try {
      await api.post('/api/result-submissions/hod-review', { submission_id: open.id, action, comment: comment.trim() || undefined });
      setMsg({ text: action === 'approve' ? `Approved ${open.subject} for ${open.class_name}.` : `Sent ${open.subject} for ${open.class_name} back to ${open.teacher_name}.`, tone: 'ok' });
      setOpen(null); load();
    } catch (e) { setMsg({ text: errText(e, 'Could not send your review.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }

  if (open) {
    const subjectRows = (preview ?? []).map(s => ({ s, row: s.subjects.find(x => x.subject.toLowerCase() === open.subject.toLowerCase()) ?? s.subjects[0] }));
    return (
      <>
        <Button label="Back to submissions" kind="quiet" icon="chevron-back" onPress={() => setOpen(null)} style={{ alignSelf: 'flex-start' }} />
        <Card>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{open.subject}, {open.class_name}</Text>
          <Body small soft>From {open.teacher_name}, {fmt(open.submitted_at)}. {open.academic_year}, semester {open.semester}.</Body>
          <Chip label={`${open.scored_count} of ${open.student_count} students scored`} tone={open.scored_count >= open.student_count ? 'ok' : 'warn'} />
        </Card>
        <Card>
          <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '700' }}>Submitted results</Text>
          {preview === null ? <Loading /> : subjectRows.length === 0 ? <Body soft>No results found for this class.</Body> : subjectRows.map(({ s, row }) => (
            <View key={s.student_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderColor: C.border, gap: 8 }}>
              <Text style={{ flex: 1, color: C.text, fontSize: 14 }}>{s.name}</Text>
              <Text style={{ color: C.textSoft, fontSize: 13 }}>CA {row?.ca_score ?? '-'}, exam {row?.exam_score ?? '-'}</Text>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '800', minWidth: 54, textAlign: 'right' }}>{row?.total ?? '-'} {row?.grade ?? ''}</Text>
            </View>
          ))}
        </Card>
        <Field label="Comment" hint="Needed if you send it back." value={comment} onChangeText={setComment} multiline placeholder="A note or the reason" />
        <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
        <Row>
          <Button label="Approve" grow busy={busy === 'approve'} disabled={!!busy} onPress={() => review('approve')} />
          <Button label="Send back" kind="danger" grow busy={busy === 'reject'} disabled={!!busy} onPress={() => review('reject')} />
        </Row>
      </>
    );
  }
  return (
    <>
      <Body small soft>Results teachers have submitted for your approval.</Body>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {queue === null ? <Loading /> : queue.length === 0 ? <Empty icon="checkmark-done-outline" title="Nothing waiting" text="Results teachers submit to you appear here." /> : queue.map(q => (
        <Pressable key={q.id} onPress={() => openItem(q)} accessibilityRole="button"
          style={({ pressed }) => ({ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: pressed ? C.bg : C.surface, gap: 4 })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{q.subject}, {q.class_name}</Text>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </View>
          <Body small soft>{q.teacher_name}, {fmt(q.submitted_at)}. {q.scored_count} of {q.student_count} scored.</Body>
        </Pressable>
      ))}
    </>
  );
}

// ── Results ──
function Results({ dq }: { dq: Record<string, string> }) {
  const C = useTheme();
  const [classes, setClasses] = useState<string[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [cls, setCls] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [sem, setSem] = useState<'1' | '2'>('1');
  const [rows, setRows] = useState<StudentResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ class_name: string }[]>('/api/hod/classes', { params: dq }).then(r => {
      const seen = new Set<string>();
      setClasses(r.data.map(c => c.class_name).filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }));
    }).catch(() => {});
    api.get<Year[]>('/api/academic-years').then(r => {
      setYears(r.data); const cur = r.data.find(y => y.is_current);
      if (cur) { setYear(cur.id); setSem(String(cur.current_semester ?? 1) as '1' | '2'); }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function view() {
    if (!cls || !year) { setErr('Choose a class and an academic year.'); return; }
    setBusy(true); setErr('');
    try { const { data } = await api.get<StudentResult[]>('/api/hod/results', { params: { academic_year_id: year, semester: sem, class_name: cls, ...dq } }); setRows([...data].sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999))); }
    catch (e) { setRows(null); setErr(errText(e, 'Could not load the results.')); }
    finally { setBusy(false); }
  }
  const withAvg = (rows ?? []).filter(r => r.average != null);
  const avg = withAvg.length ? Math.round(withAvg.reduce((s, r) => s + (r.average ?? 0), 0) / withAvg.length) : null;

  return (
    <>
      <Card>
        <Picker label="Class" value={cls} options={classes.map(c => ({ key: c, label: c }))} onChange={setCls} searchable={classes.length > 8} />
        <Picker label="Academic year" value={year} options={years.map(y => ({ key: y.id, label: y.name }))} onChange={setYear} />
        <ChoiceChips label="Semester" value={sem} onChange={setSem} options={[{ key: '1', label: 'Semester 1' }, { key: '2', label: 'Semester 2' }]} />
        <Button label="View results" busy={busy} onPress={view} />
      </Card>
      <Notice tone="bad" text={err || null} />
      {rows && (rows.length === 0 ? <Empty icon="bar-chart-outline" title="No results for this class" /> : (
        <>
          <Row>
            <Chip label={`${rows.length} students`} />
            {avg != null && <Chip label={`Class average ${avg}%`} tone="brand" />}
            <Chip label={`${withAvg.filter(r => (r.average ?? 0) >= 50).length} passing`} tone="ok" />
            <Chip label={`${withAvg.filter(r => (r.average ?? 0) < 40).length} at risk`} tone="bad" />
          </Row>
          <Card>
            {rows.map(r => {
              const isOpen = open === r.student_id; const risk = r.average != null && r.average < 40;
              return (
                <View key={r.student_id} style={{ borderTopWidth: 1, borderColor: C.border }}>
                  <Pressable onPress={() => setOpen(isOpen ? null : r.student_id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                    <Text style={{ width: 30, color: C.textSoft, fontWeight: '800' }}>{r.class_position ?? '-'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 15 }}>{r.name}</Text>
                      <Body small soft>{r.subjects.length} subjects</Body>
                    </View>
                    <Text style={{ color: r.average == null ? C.muted : risk ? C.danger : C.success, fontSize: 15, fontWeight: '800' }}>{r.average != null ? `${r.average}%` : ''}</Text>
                    {risk && <Chip label="At risk" tone="bad" />}
                  </Pressable>
                  {isOpen && r.subjects.map(s => (
                    <View key={s.subject} style={{ flexDirection: 'row', paddingVertical: 4, paddingLeft: 40, gap: 8 }}>
                      <Text style={{ flex: 1, color: C.text, fontSize: 14 }}>{s.subject}</Text>
                      <Text style={{ color: C.textSoft, fontSize: 13 }}>Exam {s.exam_score ?? '-'}</Text>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', minWidth: 54, textAlign: 'right' }}>{s.total ?? '-'} {s.grade ?? ''}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </Card>
        </>
      ))}
    </>
  );
}

// ── Classes ──
function Classes({ dq, ov }: { dq: Record<string, string>; ov: Overview }) {
  const C = useTheme();
  const [rows, setRows] = useState<ClassRow[] | null>(null);
  useEffect(() => { api.get<ClassRow[]>('/api/hod/classes', { params: dq }).then(r => setRows(r.data ?? [])).catch(() => setRows([])); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const isSubject = ov.hod_type === 'subject';
  if (rows === null) return <Loading />;
  if (rows.length === 0) return (
    <Empty icon="school-outline" title={isSubject ? "No class takes this department's subjects this term" : 'No classes in this programme'}
      text={isSubject ? (ov.subjects_linked ? 'Check the timetable or the curriculum allocations.' : "Ask the admin to link this department's subjects in Curriculum, Subjects.") : 'Check that students have the right programme.'} />
  );
  return (
    <>
      {isSubject && ov.subjects_linked === false && <Body small soft>Classes are worked out from teachers' departments until the admin links subjects to departments.</Body>}
      {rows.map((c, i) => {
        const name = isSubject ? c.teacher_name : c.form_teacher_name; const phone = isSubject ? c.teacher_phone : c.form_teacher_phone;
        return (
          <Card key={`${c.class_name}-${c.subject ?? ''}-${i}`}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: '700' }}>{c.class_name}</Text>
              <Body small soft>{c.student_count} students</Body>
            </View>
            {!!c.subject && <Body small soft>{c.subject}</Body>}
            {name ? (
              <Row style={{ alignItems: 'center' }}>
                <Chip label={isSubject ? 'Teacher' : 'Form teacher'} tone="ok" />
                <Text style={{ flex: 1, color: C.text, fontSize: 14 }}>{name}</Text>
                {!!phone && <Button label="Call" kind="quiet" icon="call-outline" onPress={() => call(phone)} />}
              </Row>
            ) : <Chip label={isSubject ? 'No teacher on the timetable' : 'No form teacher'} tone="warn" />}
          </Card>
        );
      })}
    </>
  );
}

// ── Teachers ──
function Teachers({ dq }: { dq: Record<string, string> }) {
  const C = useTheme();
  const [rows, setRows] = useState<TeacherRow[] | null>(null);
  useEffect(() => { api.get<TeacherRow[]>('/api/hod/teachers', { params: dq }).then(r => setRows(r.data ?? [])).catch(() => setRows([])); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (rows === null) return <Loading />;
  if (rows.length === 0) return <Empty icon="people-outline" title="No teachers in this department" />;
  return (
    <>
      {rows.map(t => (
        <Card key={t.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{t.name}</Text>
              <Body small soft>{[t.teacher_code, t.form_class ? `Form teacher, ${t.form_class}` : null, t.teaches_only ? 'Teaches here, other department' : null].filter(Boolean).join('. ')}</Body>
            </View>
            {!!t.phone && <Button label="Call" kind="quiet" icon="call-outline" onPress={() => call(t.phone)} />}
          </View>
          <Row>
            <Chip label={`${t.outstanding_absences} lessons missed`} tone={t.outstanding_absences ? 'bad' : 'neutral'} />
            <Chip label={`${t.pending_remedials} remedials to hold`} tone={t.pending_remedials ? 'warn' : 'neutral'} />
          </Row>
          {t.assessments_total > 0 ? (
            <View style={{ gap: 4 }}>
              <Body small soft>Assessments this term: {t.assessments_with_scores} of {t.assessments_total} scored</Body>
              <Progress value={t.assessments_with_scores / t.assessments_total} />
            </View>
          ) : <Body small soft>No assessments recorded yet.</Body>}
          {!!t.last_attendance_date && <Body small soft>Last clocked in {fmt(t.last_attendance_date)}</Body>}
        </Card>
      ))}
    </>
  );
}

// ── Absences ──
function Absences({ dq }: { dq: Record<string, string> }) {
  const C = useTheme();
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [teacher, setTeacher] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<AbsenceRow[] | null>(null);
  useEffect(() => { api.get<TeacherRow[]>('/api/hod/teachers', { params: dq }).then(r => setTeachers(r.data.map(t => ({ id: t.id, name: t.name })))).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setRows(null);
    api.get<AbsenceRow[]>('/api/hod/absences', { params: { ...dq, ...(teacher ? { teacherId: teacher } : {}), ...(status ? { status } : {}) } })
      .then(r => setRows(r.data ?? [])).catch(() => setRows([]));
  }, [teacher, status]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Card>
        <Picker label="Teacher" value={teacher} options={[{ key: '', label: 'All teachers' }, ...teachers.map(t => ({ key: t.id, label: t.name }))]} onChange={setTeacher} searchable={teachers.length > 8} />
        <Picker label="Status" value={status} options={[{ key: '', label: 'All statuses' }, ...STATUSES.map(s => ({ key: s, label: s }))]} onChange={setStatus} />
      </Card>
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty icon="calendar-clear-outline" title="No absences found" /> : rows.map(r => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{r.teacher_name}</Text>
            <Chip label={r.status} tone={statusTone(r.status)} />
          </View>
          <Body small soft>{fmt(r.date)}. {r.subject}, {r.class_name}{r.periods_lost ? `. ${r.periods_lost} ${r.periods_lost === 1 ? 'period' : 'periods'}` : ''}</Body>
          {!!r.reason && <Body small>{r.reason}</Body>}
        </Card>
      ))}
    </>
  );
}
