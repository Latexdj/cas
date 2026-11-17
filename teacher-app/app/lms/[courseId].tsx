import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { isPickError, pickFile } from '@/lib/files';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, InlineConfirm, Loading, Notice, Picker, Row, Screen, Segmented, Title, errText } from '@/components/ui/kit';

// ─── Types (same shapes as the web course studio) ──────────────────────────
interface Course { id: string; subject_name: string; class_name: string; status: 'draft' | 'published' | 'archived'; description?: string }
interface Lesson { id: string; title: string; content_type: 'text' | 'file' | 'youtube' | 'link'; body?: string; external_url?: string; is_published: boolean; sort_order: number }
interface Mode { id: string; name: string; ca_contribution: number }
interface Assignment {
  id: string; title: string; instructions?: string; max_score: number; due_date?: string; allow_late: boolean; is_published: boolean;
  submission_count?: number; graded_count?: number; assessment_mode_id?: string | null; assessment_mode_name?: string | null; ca_synced_at?: string | null;
}
interface Question { id?: string; question_text: string; question_type: 'mcq' | 'short_answer'; option_a?: string; option_b?: string; option_c?: string; option_d?: string; correct_option?: string; marks: number; explanation?: string }
interface Quiz {
  id: string; title: string; instructions?: string; time_limit_mins?: number | null; max_attempts: number; show_answers_after: boolean; is_published: boolean;
  question_count?: number; total_marks?: number; assessment_mode_id?: string | null; assessment_mode_name?: string | null; ca_synced_at?: string | null;
}
interface Submission { id: string; student_name: string; class_name?: string; submitted_at: string; is_late: boolean; score?: number | null; feedback?: string }
interface Announcement { id: string; title: string; body: string; is_pinned: boolean; created_at: string }

type Tab = 'lessons' | 'assignments' | 'quizzes' | 'submissions' | 'announcements';
type Msg = { text: string; tone: 'ok' | 'bad' } | null;
const when = (s: string) => new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const C = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
      <Text style={{ flex: 1, color: C.text, fontSize: 15 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} importantForAccessibility="no" trackColor={{ true: C.primaryText, false: C.border }} />
    </Pressable>
  );
}
function useModes() {
  const [modes, setModes] = useState<Mode[]>([]);
  useEffect(() => { api.get<Mode[]>('/api/assessment-modes').then(r => setModes(r.data ?? [])).catch(() => {}); }, []);
  return modes;
}
function ModePicker({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint: string }) {
  const modes = useModes();
  return (
    <View style={{ gap: 4 }}>
      <Picker label="Count for CA (optional)" value={value} placeholder="Not a CA assessment"
        options={[{ key: '', label: 'Not a CA assessment' }, ...modes.map(m => ({ key: m.id, label: `${m.name} (${m.ca_contribution}%)` }))]} onChange={onChange} />
      {!!value && <Body small soft>{hint}</Body>}
    </View>
  );
}
function RowActions({ children }: { children: React.ReactNode }) { return <Row style={{ marginTop: 2 }}>{children}</Row>; }

export default function CourseScreen() {
  const { courseId, title } = useLocalSearchParams<{ courseId: string; title?: string }>();
  const C = useTheme();
  const [course, setCourse] = useState<Course | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('lessons');

  useEffect(() => {
    api.get<Course>(`/api/lms/courses/${courseId}`).then(r => setCourse(r.data)).catch(e => setErr(errText(e, 'Could not load this course.')));
  }, [courseId]);

  return (
    <>
      <Stack.Screen options={{ title: course?.subject_name ?? title ?? 'Course' }} />
      {err ? <Screen><Notice tone="bad" text={err} /></Screen> : !course ? <Screen><Loading /></Screen> : (
        <Screen>
          <View style={{ gap: 6 }}>
            <Row>
              <Chip label={course.class_name} tone="brand" />
              <Chip label={course.status === 'published' ? 'Published' : course.status === 'archived' ? 'Archived' : 'Draft'} tone={course.status === 'published' ? 'ok' : 'neutral'} />
            </Row>
            {!!course.description && <Body small soft>{course.description}</Body>}
          </View>
          <Segmented value={tab} onChange={setTab} options={[
            { key: 'lessons', label: 'Lessons' }, { key: 'assignments', label: 'Assignments' }, { key: 'quizzes', label: 'Quizzes' },
            { key: 'submissions', label: 'Submissions' }, { key: 'announcements', label: 'Announcements' },
          ]} />
          <View style={{ gap: 12 }} key={tab}>
            {tab === 'lessons' && <Lessons courseId={courseId} />}
            {tab === 'assignments' && <Assignments courseId={courseId} />}
            {tab === 'quizzes' && <Quizzes courseId={courseId} />}
            {tab === 'submissions' && <Submissions courseId={courseId} />}
            {tab === 'announcements' && <Announcements courseId={courseId} />}
          </View>
        </Screen>
      )}
    </>
  );
}

// ─── Lessons ───────────────────────────────────────────────────────────────
function Lessons({ courseId }: { courseId: string }) {
  const C = useTheme();
  const [list, setList] = useState<Lesson[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [editing, setEditing] = useState<Lesson | 'new' | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get<Lesson[]>(`/api/lms/courses/${courseId}/lessons`); setList(data ?? []); }
    catch (e) { setList([]); setMsg({ text: errText(e, 'Could not load the lessons.'), tone: 'bad' }); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    try { await api.delete(`/api/lms/lessons/${id}`); setList(p => p?.filter(l => l.id !== id) ?? p); setMsg({ text: 'Lesson deleted.', tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not delete the lesson.'), tone: 'bad' }); }
    setConfirm(null);
  }
  async function publish(l: Lesson) {
    try { await api.put(`/api/lms/lessons/${l.id}`, { is_published: !l.is_published }); setList(p => p?.map(x => (x.id === l.id ? { ...x, is_published: !x.is_published } : x)) ?? p); }
    catch (e) { setMsg({ text: errText(e, 'Could not update the lesson.'), tone: 'bad' }); }
  }

  if (editing) return <LessonForm courseId={courseId} lesson={editing === 'new' ? null : editing} nextOrder={list?.length ?? 0}
    onDone={saved => { setEditing(null); if (saved) { setMsg({ text: 'Lesson saved.', tone: 'ok' }); load(); } }} />;

  return (
    <>
      <Button label="Add lesson" icon="add" onPress={() => setEditing('new')} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {list === null ? <Loading /> : list.length === 0 ? <Empty icon="book-outline" title="No lessons yet" text="Add notes, a file, a video or a link." /> : list.map((l, i) => (
        <Card key={l.id}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Text style={{ color: C.muted, fontSize: 14, fontWeight: '700', width: 22 }}>{i + 1}</Text>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{l.title}</Text>
            <Chip label={{ text: 'Notes', file: 'File', youtube: 'Video', link: 'Link' }[l.content_type]} />
          </View>
          {confirm === l.id ? (
            <InlineConfirm question={`Delete "${l.title}"?`} confirmLabel="Delete" onConfirm={() => remove(l.id)} onCancel={() => setConfirm(null)} />
          ) : (
            <RowActions>
              <Button label={l.is_published ? 'Published' : 'Draft'} kind="secondary" icon={l.is_published ? 'eye-outline' : 'eye-off-outline'} onPress={() => publish(l)} />
              <Button label="Edit" kind="quiet" onPress={() => setEditing(l)} />
              <Button label="Delete" kind="quiet" onPress={() => setConfirm(l.id)} />
            </RowActions>
          )}
        </Card>
      ))}
      {list && list.length > 0 && <Body small soft>Tap Published or Draft to show or hide a lesson from students.</Body>}
    </>
  );
}

function LessonForm({ courseId, lesson, nextOrder, onDone }: { courseId: string; lesson: Lesson | null; nextOrder: number; onDone: (saved: boolean) => void }) {
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [type, setType] = useState<Lesson['content_type']>(lesson?.content_type ?? 'text');
  const [body, setBody] = useState(lesson?.body ?? '');
  const [url, setUrl] = useState(lesson?.external_url ?? '');
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [published, setPublished] = useState(lesson?.is_published ?? false);
  const [order, setOrder] = useState(String(lesson?.sort_order ?? nextOrder));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function choose() {
    const f = await pickFile(['image/*', 'application/pdf'], 10);
    if (isPickError(f)) { setErr(f.error); return; }
    if (!f) return;
    if (f.mime.startsWith('image/')) {
      try {
        const out = await ImageManipulator.manipulateAsync(f.uri, [{ resize: { width: 1200 } }], { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true });
        setFile({ name: f.name, data: `data:image/jpeg;base64,${out.base64}` }); return;
      } catch { /* fall back to the original */ }
    }
    setFile({ name: f.name, data: f.data });
  }
  async function save() {
    if (!title.trim()) { setErr('Give the lesson a title.'); return; }
    if ((type === 'youtube' || type === 'link') && !/^https?:\/\//i.test(url.trim())) { setErr('Enter a web address starting with https://'); return; }
    if (type === 'file' && !file && !lesson) { setErr('Choose an image or PDF.'); return; }
    setBusy(true); setErr('');
    const payload: Record<string, unknown> = { title: title.trim(), content_type: type, is_published: published, sort_order: parseInt(order, 10) || 0 };
    if (type === 'text') payload.body = body;
    if (type === 'youtube' || type === 'link') payload.external_url = url.trim();
    if (type === 'file' && file) payload.file_data = file.data;
    try {
      if (lesson) await api.put(`/api/lms/lessons/${lesson.id}`, payload);
      else await api.post(`/api/lms/courses/${courseId}/lessons`, payload);
      onDone(true);
    } catch (e) { setErr(errText(e, 'Could not save the lesson.')); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <Title>{lesson ? 'Edit lesson' : 'Add lesson'}</Title>
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="Lesson title" />
      <ChoiceChips label="Content" value={type} onChange={setType}
        options={[{ key: 'text', label: 'Notes' }, { key: 'file', label: 'File' }, { key: 'youtube', label: 'YouTube video' }, { key: 'link', label: 'Link' }]} />
      {type === 'text' && <Field label="Notes" value={body} onChangeText={setBody} multiline style={{ minHeight: 160 }} placeholder="Lesson content" />}
      {(type === 'youtube' || type === 'link') && (
        <Field label={type === 'youtube' ? 'YouTube address' : 'Web address'} value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url"
          placeholder={type === 'youtube' ? 'https://youtu.be/…' : 'https://'} />
      )}
      {type === 'file' && (
        <View style={{ gap: 4 }}>
          <Button label={file ? file.name : 'Choose an image or PDF'} kind="secondary" icon="attach-outline" onPress={choose} />
          {lesson && !file && <Body small soft>Leave this to keep the current file.</Body>}
        </View>
      )}
      <Field label="Position in the list" value={order} onChangeText={setOrder} keyboardType="number-pad" hint="Lower numbers come first." />
      <Toggle label="Published to students" value={published} onChange={setPublished} />
      <Notice tone="bad" text={err || null} />
      <Row>
        <Button label="Save lesson" grow busy={busy} onPress={save} />
        <Button label="Cancel" kind="secondary" grow onPress={() => onDone(false)} />
      </Row>
    </Card>
  );
}

// ─── Assignments ───────────────────────────────────────────────────────────
function Assignments({ courseId }: { courseId: string }) {
  const C = useTheme();
  const [list, setList] = useState<Assignment[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [editing, setEditing] = useState<Assignment | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'delete' | 'sync' } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get<Assignment[]>(`/api/lms/courses/${courseId}/assignments`); setList(data ?? []); }
    catch (e) { setList([]); setMsg({ text: errText(e, 'Could not load the assignments.'), tone: 'bad' }); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  async function act(a: Assignment, kind: 'delete' | 'sync') {
    setBusy(true);
    try {
      if (kind === 'delete') { await api.delete(`/api/lms/assignments/${a.id}`); setList(p => p?.filter(x => x.id !== a.id) ?? p); setMsg({ text: 'Assignment deleted.', tone: 'ok' }); }
      else {
        const { data } = await api.post<{ message: string; student_count: number }>(`/api/lms/assignments/${a.id}/sync-to-ca`, {});
        setMsg({ text: `${data.message}. ${data.student_count} student scores recorded.`, tone: 'ok' }); load();
      }
    } catch (e) { setMsg({ text: errText(e, kind === 'delete' ? 'Could not delete the assignment.' : 'Could not send the scores to CA.'), tone: 'bad' }); }
    finally { setBusy(false); setConfirm(null); }
  }

  if (editing) return <AssignmentForm courseId={courseId} item={editing === 'new' ? null : editing}
    onDone={saved => { setEditing(null); if (saved) { setMsg({ text: 'Assignment saved.', tone: 'ok' }); load(); } }} />;

  return (
    <>
      <Button label="Add assignment" icon="add" onPress={() => setEditing('new')} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {list === null ? <Loading /> : list.length === 0 ? <Empty icon="create-outline" title="No assignments yet" /> : list.map(a => (
        <Card key={a.id}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{a.title}</Text>
            <Chip label={a.is_published ? 'Published' : 'Draft'} tone={a.is_published ? 'ok' : 'neutral'} />
          </View>
          <Body small soft>
            Out of {Number(a.max_score)}{a.due_date ? `. Due ${when(a.due_date)}` : ''}
            {a.submission_count !== undefined ? `. ${a.submission_count} submitted, ${a.graded_count ?? 0} graded` : ''}
          </Body>
          {!!a.assessment_mode_name && <Body small soft>Counts for CA: {a.assessment_mode_name}{a.ca_synced_at ? `. Sent ${when(a.ca_synced_at)}` : ''}</Body>}
          {confirm?.id === a.id ? (
            <InlineConfirm busy={busy} danger={confirm.kind === 'delete'}
              question={confirm.kind === 'delete' ? `Delete "${a.title}"?` : `Send the scores for "${a.title}" to the CA register? This creates or updates a CA assessment.`}
              confirmLabel={confirm.kind === 'delete' ? 'Delete' : 'Send to CA'} onConfirm={() => act(a, confirm.kind)} onCancel={() => setConfirm(null)} />
          ) : (
            <RowActions>
              {!!a.assessment_mode_id && <Button label="Send to CA" kind="secondary" icon="cloud-upload-outline" onPress={() => setConfirm({ id: a.id, kind: 'sync' })} />}
              <Button label="Edit" kind="quiet" onPress={() => setEditing(a)} />
              <Button label="Delete" kind="quiet" onPress={() => setConfirm({ id: a.id, kind: 'delete' })} />
            </RowActions>
          )}
        </Card>
      ))}
    </>
  );
}

// "YYYY-MM-DD HH:MM" <-> the datetime-local value the web sends.
const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function AssignmentForm({ courseId, item, onDone }: { courseId: string; item: Assignment | null; onDone: (saved: boolean) => void }) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [instructions, setInstructions] = useState(item?.instructions ?? '');
  const [max, setMax] = useState(item ? String(item.max_score) : '');
  const [due, setDue] = useState(toLocalInput(item?.due_date));
  const [late, setLate] = useState(item?.allow_late ?? false);
  const [published, setPublished] = useState(item?.is_published ?? true);
  const [mode, setMode] = useState(item?.assessment_mode_id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    const maxN = parseInt(max, 10);
    if (!title.trim()) { setErr('Give the assignment a title.'); return; }
    if (!maxN || maxN <= 0) { setErr('Enter the highest score, for example 20.'); return; }
    const d = due.trim();
    if (d && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(d)) { setErr('Write the due date like 2026-11-30 17:00.'); return; }
    setBusy(true); setErr('');
    const payload = {
      title: title.trim(), instructions: instructions.trim() || null, max_score: maxN,
      due_date: d ? new Date(d.length === 10 ? `${d}T23:59` : d.replace(' ', 'T')).toISOString() : null,
      allow_late: late, is_published: published, assessment_mode_id: mode || null,
    };
    try {
      if (item) await api.put(`/api/lms/assignments/${item.id}`, payload);
      else await api.post(`/api/lms/courses/${courseId}/assignments`, payload);
      onDone(true);
    } catch (e) { setErr(errText(e, 'Could not save the assignment.')); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <Title>{item ? 'Edit assignment' : 'Add assignment'}</Title>
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Instructions" value={instructions} onChangeText={setInstructions} multiline style={{ minHeight: 120 }} />
      <Field label="Highest score" value={max} onChangeText={setMax} keyboardType="number-pad" placeholder="For example 20" />
      <Field label="Due (optional)" value={due} onChangeText={setDue} placeholder="2026-11-30 17:00" hint="Year-month-day, then the time. Leave the time out for the end of the day." />
      <ModePicker value={mode} onChange={setMode} hint="After grading, use Send to CA to put the scores in the CA register." />
      <Toggle label="Accept late submissions" value={late} onChange={setLate} />
      <Toggle label="Published to students" value={published} onChange={setPublished} />
      <Notice tone="bad" text={err || null} />
      <Row>
        <Button label="Save assignment" grow busy={busy} onPress={save} />
        <Button label="Cancel" kind="secondary" grow onPress={() => onDone(false)} />
      </Row>
    </Card>
  );
}

// ─── Quizzes ───────────────────────────────────────────────────────────────
function Quizzes({ courseId }: { courseId: string }) {
  const C = useTheme();
  const [list, setList] = useState<Quiz[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [editing, setEditing] = useState<Quiz | 'new' | null>(null);
  const [builder, setBuilder] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'delete' | 'sync' } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get<Quiz[]>(`/api/lms/courses/${courseId}/quizzes`); setList(data ?? []); }
    catch (e) { setList([]); setMsg({ text: errText(e, 'Could not load the quizzes.'), tone: 'bad' }); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  async function publish(q: Quiz) {
    try { await api.put(`/api/lms/quizzes/${q.id}`, { is_published: !q.is_published }); setList(p => p?.map(x => (x.id === q.id ? { ...x, is_published: !x.is_published } : x)) ?? p); }
    catch (e) { setMsg({ text: errText(e, 'Could not update the quiz.'), tone: 'bad' }); }
  }
  async function act(q: Quiz, kind: 'delete' | 'sync') {
    setBusy(true);
    try {
      if (kind === 'delete') { await api.delete(`/api/lms/quizzes/${q.id}`); setList(p => p?.filter(x => x.id !== q.id) ?? p); setMsg({ text: 'Quiz deleted.', tone: 'ok' }); }
      else {
        const { data } = await api.post<{ message: string; student_count: number }>(`/api/lms/quizzes/${q.id}/sync-to-ca`, {});
        setMsg({ text: `${data.message}. ${data.student_count} student scores recorded.`, tone: 'ok' }); load();
      }
    } catch (e) { setMsg({ text: errText(e, kind === 'delete' ? 'Could not delete the quiz.' : 'Could not send the scores to CA.'), tone: 'bad' }); }
    finally { setBusy(false); setConfirm(null); }
  }

  if (builder) return <QuizBuilder quizId={builder} onDone={saved => { setBuilder(null); if (saved) setMsg({ text: 'Questions saved.', tone: 'ok' }); load(); }} />;
  if (editing) return <QuizForm courseId={courseId} quiz={editing === 'new' ? null : editing}
    onDone={id => { const wasNew = editing === 'new'; setEditing(null); if (id) { if (wasNew) setBuilder(id); else { setMsg({ text: 'Quiz saved.', tone: 'ok' }); load(); } } }} />;

  return (
    <>
      <Button label="Add quiz" icon="add" onPress={() => setEditing('new')} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {list === null ? <Loading /> : list.length === 0 ? <Empty icon="help-circle-outline" title="No quizzes yet" /> : list.map(q => (
        <Card key={q.id}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{q.title}</Text>
          <Body small soft>{q.question_count ?? 0} questions, {Number(q.total_marks ?? 0)} marks{q.time_limit_mins ? `, ${q.time_limit_mins} minutes` : ''}</Body>
          {!!q.assessment_mode_name && <Body small soft>Counts for CA: {q.assessment_mode_name}{q.ca_synced_at ? `. Sent ${when(q.ca_synced_at)}` : ''}</Body>}
          {confirm?.id === q.id ? (
            <InlineConfirm busy={busy} danger={confirm.kind === 'delete'}
              question={confirm.kind === 'delete' ? `Delete "${q.title}"?` : `Send the scores for "${q.title}" to the CA register? This creates or updates a CA assessment.`}
              confirmLabel={confirm.kind === 'delete' ? 'Delete' : 'Send to CA'} onConfirm={() => act(q, confirm.kind)} onCancel={() => setConfirm(null)} />
          ) : (
            <RowActions>
              <Button label="Questions" kind="secondary" icon="list-outline" onPress={() => setBuilder(q.id)} />
              <Button label={q.is_published ? 'Published' : 'Draft'} kind="secondary" icon={q.is_published ? 'eye-outline' : 'eye-off-outline'} onPress={() => publish(q)} />
              {!!q.assessment_mode_id && <Button label="Send to CA" kind="quiet" onPress={() => setConfirm({ id: q.id, kind: 'sync' })} />}
              <Button label="Edit" kind="quiet" onPress={() => setEditing(q)} />
              <Button label="Delete" kind="quiet" onPress={() => setConfirm({ id: q.id, kind: 'delete' })} />
            </RowActions>
          )}
        </Card>
      ))}
    </>
  );
}

function QuizForm({ courseId, quiz, onDone }: { courseId: string; quiz: Quiz | null; onDone: (id: string | null) => void }) {
  const [title, setTitle] = useState(quiz?.title ?? '');
  const [instructions, setInstructions] = useState(quiz?.instructions ?? '');
  const [limit, setLimit] = useState(quiz?.time_limit_mins ? String(quiz.time_limit_mins) : '');
  const [attempts, setAttempts] = useState(String(quiz?.max_attempts ?? 1));
  const [answers, setAnswers] = useState(quiz?.show_answers_after ?? false);
  const [published, setPublished] = useState(quiz?.is_published ?? false);
  const [mode, setMode] = useState(quiz?.assessment_mode_id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!title.trim()) { setErr('Give the quiz a title.'); return; }
    setBusy(true); setErr('');
    const payload = {
      title: title.trim(), instructions: instructions.trim() || null, time_limit_mins: limit ? parseInt(limit, 10) || null : null,
      max_attempts: parseInt(attempts, 10) || 1, show_answers_after: answers, is_published: published, assessment_mode_id: mode || null,
    };
    try {
      if (quiz) { await api.put(`/api/lms/quizzes/${quiz.id}`, payload); onDone(quiz.id); }
      else { const { data } = await api.post<{ id: string }>(`/api/lms/courses/${courseId}/quizzes`, payload); onDone(data.id); }
    } catch (e) { setErr(errText(e, 'Could not save the quiz.')); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <Title>{quiz ? 'Edit quiz' : 'New quiz'}</Title>
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Instructions" value={instructions} onChangeText={setInstructions} multiline style={{ minHeight: 100 }} />
      <Row>
        <View style={{ flex: 1 }}><Field label="Time limit in minutes" value={limit} onChangeText={setLimit} keyboardType="number-pad" placeholder="No limit" /></View>
        <View style={{ flex: 1 }}><Field label="Attempts allowed" value={attempts} onChangeText={setAttempts} keyboardType="number-pad" /></View>
      </Row>
      <ModePicker value={mode} onChange={setMode} hint="After students finish the quiz, use Send to CA to put the scores in the CA register." />
      <Toggle label="Show answers after submitting" value={answers} onChange={setAnswers} />
      <Toggle label="Published to students" value={published} onChange={setPublished} />
      <Notice tone="bad" text={err || null} />
      <Row>
        <Button label={quiz ? 'Save changes' : 'Next: add questions'} grow busy={busy} onPress={save} />
        <Button label="Cancel" kind="secondary" grow onPress={() => onDone(null)} />
      </Row>
    </Card>
  );
}

const blank = (): Question => ({ question_text: '', question_type: 'mcq', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'a', marks: 1, explanation: '' });

function QuizBuilder({ quizId, onDone }: { quizId: string; onDone: (saved: boolean) => void }) {
  const C = useTheme();
  const [qs, setQs] = useState<Question[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get<Question[]>(`/api/lms/quizzes/${quizId}/questions`).then(r => setQs(r.data?.length ? r.data.map(q => ({ ...q, question_type: q.question_type === 'mcq' ? 'mcq' as const : 'short_answer' as const })) : [blank()])).catch(() => setQs([blank()]));
  }, [quizId]);
  const upd = (i: number, p: Partial<Question>) => setQs(prev => prev?.map((q, j) => (j === i ? { ...q, ...p } : q)) ?? prev);

  async function save() {
    if (!qs) return;
    const bad = qs.findIndex(q => !q.question_text.trim() || (q.question_type === 'mcq' && (!q.option_a?.trim() || !q.option_b?.trim())));
    if (bad >= 0) { setErr(`Question ${bad + 1} needs its text${qs[bad].question_type === 'mcq' ? ' and at least options A and B' : ''}.`); return; }
    setBusy(true); setErr('');
    try { await api.put(`/api/lms/quizzes/${quizId}`, { questions: qs }); onDone(true); }
    catch (e) { setErr(errText(e, 'Could not save the questions.')); }
    finally { setBusy(false); }
  }

  if (!qs) return <Loading />;
  const total = qs.reduce((s, q) => s + (q.marks || 0), 0);
  return (
    <>
      <Button label="Back to quizzes" kind="quiet" icon="chevron-back" onPress={() => onDone(false)} style={{ alignSelf: 'flex-start' }} />
      <Title sub={`${qs.length} questions, ${total} marks`}>Questions</Title>
      {qs.map((q, i) => (
        <Card key={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '800' }}>Question {i + 1}</Text>
            <Pressable onPress={() => setQs(p => p?.filter((_, j) => j !== i) ?? p)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove question ${i + 1}`}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trash-outline" size={20} color={C.danger} />
            </Pressable>
          </View>
          <Field label="Question" value={q.question_text} onChangeText={t => upd(i, { question_text: t })} multiline style={{ minHeight: 70 }} />
          <ChoiceChips value={q.question_type} onChange={t => upd(i, { question_type: t })} options={[{ key: 'mcq', label: 'Multiple choice' }, { key: 'short_answer', label: 'Short answer' }]} />
          <Field label="Marks" value={String(q.marks)} onChangeText={t => upd(i, { marks: parseInt(t, 10) || 1 })} keyboardType="number-pad" style={{ maxWidth: 120 }} />
          {q.question_type === 'mcq' && (
            <View style={{ gap: 8 }}>
              <Body small soft>Tap the circle beside the correct answer.</Body>
              {(['a', 'b', 'c', 'd'] as const).map(o => {
                const key = `option_${o}` as 'option_a'; const on = q.correct_option === o;
                return (
                  <View key={o} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Pressable onPress={() => upd(i, { correct_option: o })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Option ${o.toUpperCase()} is correct`}
                      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={24} color={on ? C.success : C.muted} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Field label={`Option ${o.toUpperCase()}`} value={q[key] ?? ''} onChangeText={t => upd(i, { [key]: t })} />
                    </View>
                  </View>
                );
              })}
              <Field label="Explanation (optional)" value={q.explanation ?? ''} onChangeText={t => upd(i, { explanation: t })} hint="Shown to students after they submit." />
            </View>
          )}
        </Card>
      ))}
      <Button label="Add question" kind="secondary" icon="add" onPress={() => setQs(p => [...(p ?? []), blank()])} />
      <Notice tone="bad" text={err || null} />
      <Button label="Save questions" busy={busy} onPress={save} />
    </>
  );
}

// ─── Submissions ───────────────────────────────────────────────────────────
function Submissions({ courseId }: { courseId: string }) {
  const C = useTheme();
  const [list, setList] = useState<Assignment[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [subs, setSubs] = useState<Record<string, Submission[] | null>>({});
  const [filter, setFilter] = useState<'all' | 'ungraded' | 'graded'>('all');
  const [edits, setEdits] = useState<Record<string, { score: string; feedback: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    api.get<Assignment[]>(`/api/lms/courses/${courseId}/assignments`).then(r => setList(r.data ?? [])).catch(e => { setList([]); setMsg({ text: errText(e, 'Could not load the assignments.'), tone: 'bad' }); });
  }, [courseId]);

  async function expand(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (subs[id]) return;
    setSubs(p => ({ ...p, [id]: null }));
    try { const { data } = await api.get<Submission[]>(`/api/lms/assignments/${id}/submissions`); setSubs(p => ({ ...p, [id]: data ?? [] })); }
    catch { setSubs(p => ({ ...p, [id]: [] })); }
  }
  async function grade(a: Assignment, s: Submission) {
    const e = edits[s.id]; if (!e) return;
    const score = e.score.trim() === '' ? null : parseFloat(e.score);
    if (score != null && (isNaN(score) || score < 0 || score > Number(a.max_score))) { setMsg({ text: `The score must be between 0 and ${Number(a.max_score)}.`, tone: 'bad' }); return; }
    setSaving(s.id); setMsg(null);
    try {
      await api.patch(`/api/lms/submissions/${s.id}/grade`, { score, feedback: e.feedback });
      setSubs(p => ({ ...p, [a.id]: (p[a.id] ?? []).map(x => (x.id === s.id ? { ...x, score, feedback: e.feedback } : x)) }));
      setEdits(p => { const n = { ...p }; delete n[s.id]; return n; });
      setMsg({ text: `Grade saved for ${s.student_name}.`, tone: 'ok' });
    } catch (err) { setMsg({ text: errText(err, 'Could not save the grade.'), tone: 'bad' }); }
    finally { setSaving(null); }
  }
  const shown = (l: Submission[]) => (filter === 'ungraded' ? l.filter(s => s.score == null) : filter === 'graded' ? l.filter(s => s.score != null) : l);

  return (
    <>
      <ChoiceChips value={filter} onChange={setFilter} options={[{ key: 'all', label: 'All' }, { key: 'ungraded', label: 'Not graded' }, { key: 'graded', label: 'Graded' }]} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {list === null ? <Loading /> : list.length === 0 ? <Empty icon="file-tray-outline" title="No assignments in this course" /> : list.map(a => {
        const isOpen = open === a.id; const l = subs[a.id];
        return (
          <Card key={a.id}>
            <Pressable onPress={() => expand(a.id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{a.title}</Text>
                <Body small soft>Out of {Number(a.max_score)}{a.submission_count !== undefined ? `. ${a.submission_count} submitted, ${a.graded_count ?? 0} graded` : ''}</Body>
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={C.muted} />
            </Pressable>
            {isOpen && (l === null || l === undefined ? <Loading /> : shown(l).length === 0 ? <Body soft>No submissions here.</Body> : shown(l).map(s => {
              const e = edits[s.id] ?? { score: s.score?.toString() ?? '', feedback: s.feedback ?? '' };
              const dirty = !!edits[s.id];
              return (
                <View key={s.id} style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.bg }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{s.student_name}</Text>
                      <Body small soft>{s.class_name ? `${s.class_name}, ` : ''}{when(s.submitted_at)}</Body>
                    </View>
                    {s.is_late && <Chip label="Late" tone="warn" />}
                    {s.score != null && !dirty && <Chip label={`${Number(s.score)} of ${Number(a.max_score)}`} tone="ok" />}
                  </View>
                  <Row>
                    <View style={{ width: 110 }}>
                      <Field label="Score" value={e.score} keyboardType="decimal-pad" onChangeText={t => setEdits(p => ({ ...p, [s.id]: { ...e, score: t } }))} />
                    </View>
                    <View style={{ flex: 1, minWidth: 160 }}>
                      <Field label="Feedback" value={e.feedback} multiline onChangeText={t => setEdits(p => ({ ...p, [s.id]: { ...e, feedback: t } }))} />
                    </View>
                  </Row>
                  {dirty && <Button label="Save grade" busy={saving === s.id} onPress={() => grade(a, s)} />}
                </View>
              );
            }))}
          </Card>
        );
      })}
    </>
  );
}

// ─── Announcements ─────────────────────────────────────────────────────────
function Announcements({ courseId }: { courseId: string }) {
  const C = useTheme();
  const [list, setList] = useState<Announcement[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get<Announcement[]>(`/api/lms/courses/${courseId}/announcements`); setList(data ?? []); }
    catch (e) { setList([]); setMsg({ text: errText(e, 'Could not load the announcements.'), tone: 'bad' }); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  async function post() {
    if (!title.trim() || !body.trim()) { setMsg({ text: 'Write a title and the message.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post(`/api/lms/courses/${courseId}/announcements`, { title: title.trim(), body: body.trim(), is_pinned: pinned });
      setWriting(false); setTitle(''); setBody(''); setPinned(false); setMsg({ text: 'Announcement posted.', tone: 'ok' }); load();
    } catch (e) { setMsg({ text: errText(e, 'Could not post the announcement.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api.delete(`/api/lms/announcements/${id}`); setList(p => p?.filter(a => a.id !== id) ?? p); }
    catch (e) { setMsg({ text: errText(e, 'Could not delete the announcement.'), tone: 'bad' }); }
    setConfirm(null);
  }

  return (
    <>
      {writing ? (
        <Card>
          <Title>New announcement</Title>
          <Field label="Title" value={title} onChangeText={setTitle} />
          <Field label="Message" value={body} onChangeText={setBody} multiline style={{ minHeight: 120 }} />
          <Toggle label="Pin to the top" value={pinned} onChange={setPinned} />
          <Row>
            <Button label="Post announcement" grow busy={busy} onPress={post} />
            <Button label="Cancel" kind="secondary" grow onPress={() => setWriting(false)} />
          </Row>
        </Card>
      ) : <Button label="Add announcement" icon="add" onPress={() => { setWriting(true); setMsg(null); }} />}
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {list === null ? <Loading /> : list.length === 0 ? <Empty icon="megaphone-outline" title="No announcements yet" /> : list.map(a => (
        <Card key={a.id} accent={a.is_pinned ? C.warning : undefined}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{a.title}</Text>
            {a.is_pinned && <Chip label="Pinned" tone="warn" />}
          </View>
          <Body>{a.body}</Body>
          <Body small soft>{new Date(a.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Body>
          {confirm === a.id
            ? <InlineConfirm question={`Delete "${a.title}"?`} confirmLabel="Delete" onConfirm={() => remove(a.id)} onCancel={() => setConfirm(null)} />
            : <RowActions><Button label="Delete" kind="quiet" onPress={() => setConfirm(a.id)} /></RowActions>}
        </Card>
      ))}
    </>
  );
}
