import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, Loading, Notice, Picker, Row, Screen, Title, errText } from '@/components/ui/kit';

interface Year { id: string; name: string; is_current: boolean }
export interface Course {
  id: string; subject_name: string; class_name: string; status: 'draft' | 'published' | 'archived';
  lesson_count: number; assignment_count: number; quiz_count: number; pending_submissions: number; semester?: number | null; description?: string;
}
const K = 'cas_t_lms_filter';
const SEMS = [{ key: '', label: 'All semesters' }, { key: '1', label: 'Semester 1' }, { key: '2', label: 'Semester 2' }];

export default function CoursesScreen() {
  const C = useTheme();
  const [years, setYears] = useState<Year[]>([]);
  const [yearId, setYearId] = useState('');
  const [sem, setSem] = useState('');
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (y: string, s: string) => {
    if (!y) { setCourses([]); return; }
    setCourses(null);
    try {
      const { data } = await api.get<Course[]>('/api/lms/my-courses', { params: { academic_year_id: y, ...(s ? { semester: s } : {}) } });
      setCourses(data ?? []);
    } catch (e) { setCourses([]); setMsg({ text: errText(e, 'Could not load your courses.'), tone: 'bad' }); }
  }, []);

  useEffect(() => {
    (async () => {
      let saved: { yearId?: string; sem?: string } = {};
      try { saved = JSON.parse((await AsyncStorage.getItem(K)) || '{}'); } catch { /* none */ }
      try {
        const { data } = await api.get<Year[]>('/api/academic-years');
        setYears(data ?? []);
        const y = (data ?? []).find(x => x.id === saved.yearId)?.id ?? (data ?? []).find(x => x.is_current)?.id ?? data?.[0]?.id ?? '';
        setYearId(y); setSem(saved.sem ?? '');
        load(y, saved.sem ?? '');
      } catch (e) { setCourses([]); setMsg({ text: errText(e, 'Could not load the academic years.'), tone: 'bad' }); }
    })();
  }, [load]);

  function change(y: string, s: string) {
    setYearId(y); setSem(s); load(y, s);
    AsyncStorage.setItem(K, JSON.stringify({ yearId: y, sem: s })).catch(() => {});
  }
  async function toggle(c: Course) {
    const next = c.status === 'published' ? 'draft' : 'published';
    setToggling(c.id); setMsg(null);
    try { await api.patch(`/api/lms/courses/${c.id}`, { status: next }); setCourses(p => p?.map(x => (x.id === c.id ? { ...x, status: next } : x)) ?? p); }
    catch (e) { setMsg({ text: errText(e, 'Could not change the course.'), tone: 'bad' }); }
    finally { setToggling(null); }
  }

  if (creating) {
    return <NewCourse years={years} defaultYear={yearId} onCancel={() => setCreating(false)}
      onCreated={() => { setCreating(false); setMsg({ text: 'Course created.', tone: 'ok' }); load(yearId, sem); }} />;
  }

  return (
    <Screen onRefresh={() => load(yearId, sem)}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Body soft style={{ flex: 1 }}>Your online courses: lessons, assignments, quizzes and announcements.</Body>
      </Row>
      <Button label="Create course" icon="add" onPress={() => setCreating(true)} />
      <Card>
        <Picker label="Academic year" value={yearId || null} options={years.map(y => ({ key: y.id, label: y.name }))} onChange={y => change(y, sem)} />
        <ChoiceChips label="Semester" value={sem} options={SEMS} onChange={s => change(yearId, s)} />
      </Card>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {courses === null ? <Loading /> : courses.length === 0 ? (
        <Empty icon="school-outline" title="No courses yet" text="Create a course for a class you teach." />
      ) : courses.map(c => (
        <Card key={c.id} accent={c.status === 'published' ? C.success : undefined}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 17, fontWeight: '800' }}>{c.subject_name}</Text>
            <Chip label={c.status === 'published' ? 'Published' : c.status === 'archived' ? 'Archived' : 'Draft'} tone={c.status === 'published' ? 'ok' : c.status === 'archived' ? 'warn' : 'neutral'} />
          </View>
          <Row>
            <Chip label={c.class_name} tone="brand" />
            {!!c.semester && <Chip label={`Semester ${c.semester}`} />}
            {c.pending_submissions > 0 && <Chip label={`${c.pending_submissions} to grade`} tone="bad" />}
          </Row>
          <Body small soft>{c.lesson_count} lessons, {c.assignment_count} assignments, {c.quiz_count} quizzes</Body>
          <Row>
            <Button label="Open course" grow icon="chevron-forward" onPress={() => router.push({ pathname: '/lms/[courseId]', params: { courseId: c.id, title: c.subject_name } })} />
            <Button label={c.status === 'published' ? 'Unpublish' : 'Publish'} kind="secondary" busy={toggling === c.id} onPress={() => toggle(c)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

function NewCourse({ years, defaultYear, onCancel, onCreated }: { years: Year[]; defaultYear: string; onCancel: () => void; onCreated: () => void }) {
  const [subjects, setSubjects] = useState<string[] | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [subject, setSubject] = useState<string | null>(null);
  const [cls, setCls] = useState<string | null>(null);
  const [yearId, setYearId] = useState(defaultYear || years.find(y => y.is_current)?.id || '');
  const [sem, setSem] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get<{ subjects: string[]; classes: string[] }>('/api/lms/my-timetable-assignments')
      .then(r => { setSubjects(r.data?.subjects ?? []); setClasses(r.data?.classes ?? []); })
      .catch(() => setSubjects([]));
  }, []);

  async function create() {
    if (!subject || !cls || !yearId) { setErr('Choose the subject, class and academic year.'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/api/lms/courses', { subject_name: subject, class_name: cls, academic_year_id: yearId, semester: sem ? parseInt(sem, 10) : null, description: desc.trim() || null });
      onCreated();
    } catch (e) { setErr(errText(e, 'Could not create the course. Try again.')); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <Title sub="Courses are for the subjects and classes on your timetable.">Create course</Title>
      {subjects === null ? <Loading /> : (
        <Card>
          {subjects.length === 0 && <Notice tone="info" text="You have no timetable lessons yet. Ask your admin to put your subjects and classes on the timetable first." />}
          <Picker label="Subject" value={subject} options={subjects.map(s => ({ key: s, label: s }))} onChange={setSubject} />
          <Picker label="Class" value={cls} options={classes.map(c => ({ key: c, label: c }))} onChange={setCls} searchable={classes.length > 8} />
          <Picker label="Academic year" value={yearId || null} options={years.map(y => ({ key: y.id, label: y.name }))} onChange={setYearId} />
          <ChoiceChips label="Semester (optional)" value={sem} options={[{ key: '', label: 'Any' }, { key: '1', label: 'Semester 1' }, { key: '2', label: 'Semester 2' }]} onChange={setSem} />
          <Field label="Description (optional)" value={desc} onChangeText={setDesc} multiline style={{ minHeight: 80 }} />
          <Notice tone="bad" text={err || null} />
          <Row>
            <Button label="Create course" grow busy={busy} disabled={subjects.length === 0} onPress={create} />
            <Button label="Cancel" kind="secondary" grow onPress={onCancel} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}
