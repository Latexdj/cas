import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import type { LmsAssignment, LmsAnnouncement, LmsLesson, LmsQuiz } from '@/types/api';

type Tab = 'lessons' | 'assignments' | 'quizzes' | 'announcements';

export default function CourseDetailScreen() {
  const C   = useTheme();
  const nav = useNavigation();
  const { courseId } = useLocalSearchParams<{ courseId: string }>();

  const [courseLoading, setCourseLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('lessons');

  const [lessons,      setLessons]      = useState<LmsLesson[]>([]);
  const [assignments,  setAssignments]  = useState<LmsAssignment[]>([]);
  const [quizzes,      setQuizzes]      = useState<LmsQuiz[]>([]);
  const [announcements,setAnnouncements]= useState<LmsAnnouncement[]>([]);
  const [loaded,       setLoaded]       = useState<Record<Tab, boolean>>({ lessons: false, assignments: false, quizzes: false, announcements: false });
  const [tabLoading,   setTabLoading]   = useState(false);

  useEffect(() => {
    api.get(`/api/lms/courses/${courseId}`)
      .then(({ data }) => nav.setOptions({ title: data.subject_name }))
      .catch(() => {})
      .finally(() => setCourseLoading(false));
  }, [courseId]);

  async function loadTab(t: Tab) {
    setTab(t);
    if (loaded[t]) return;
    setTabLoading(true);
    try {
      if (t === 'lessons') {
        const { data } = await api.get<LmsLesson[]>(`/api/lms/courses/${courseId}/lessons`);
        setLessons(data);
      } else if (t === 'assignments') {
        const { data } = await api.get<LmsAssignment[]>(`/api/lms/courses/${courseId}/assignments`);
        setAssignments(data);
      } else if (t === 'quizzes') {
        const { data } = await api.get<LmsQuiz[]>(`/api/lms/courses/${courseId}/quizzes`);
        setQuizzes(data);
      } else {
        const { data } = await api.get<LmsAnnouncement[]>(`/api/lms/courses/${courseId}/announcements`);
        setAnnouncements(data);
      }
      setLoaded(prev => ({ ...prev, [t]: true }));
    } catch { /* non-fatal */ }
    finally { setTabLoading(false); }
  }

  useEffect(() => { loadTab('lessons'); }, [courseId]);

  async function refreshAssignments() {
    const { data } = await api.get<LmsAssignment[]>(`/api/lms/courses/${courseId}/assignments`);
    setAssignments(data);
  }

  function startQuiz(q: LmsQuiz) {
    router.push({
      pathname: '/lms/quiz/[quizId]',
      params: {
        quizId: q.id,
        title: q.title,
        instructions: q.instructions ?? '',
        question_count: String(q.question_count),
        time_limit_mins: q.time_limit_mins != null ? String(q.time_limit_mins) : '',
        total_marks: String(q.total_marks),
        attempt_count: String(q.attempt_count ?? 0),
        best_score: q.best_score != null ? String(q.best_score) : '',
        max_attempts: q.max_attempts != null ? String(q.max_attempts) : '',
      },
    });
  }

  if (courseLoading) return <Spinner message="Loading course…" />;

  return (
    <ScrollView style={[s.flex, { backgroundColor: C.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={[s.tabRow, { backgroundColor: C.surface, borderColor: C.border }]}>
        {(['lessons', 'assignments', 'quizzes', 'announcements'] as Tab[]).map(t => (
          <TouchableOpacity key={t} onPress={() => loadTab(t)} style={[s.tabBtn, tab === t && { backgroundColor: C.primary }]}>
            <Text style={[s.tabText, { color: tab === t ? '#fff' : C.textSoft }]} numberOfLines={1}>
              {t[0].toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tabLoading ? (
        <Spinner message="Loading…" />
      ) : (
        <>
          {tab === 'lessons' && <LessonsTab lessons={lessons} C={C} />}
          {tab === 'assignments' && (
            <AssignmentsTab assignments={assignments} C={C} onSubmitted={refreshAssignments} />
          )}
          {tab === 'quizzes' && <QuizzesTab quizzes={quizzes} C={C} onStart={startQuiz} />}
          {tab === 'announcements' && <AnnouncementsTab announcements={announcements} C={C} />}
        </>
      )}
    </ScrollView>
  );
}

// ── Lessons ──────────────────────────────────────────────────────────────────

function LessonsTab({ lessons, C }: { lessons: LmsLesson[]; C: any }) {
  if (lessons.length === 0) return <Text style={[s.empty, { color: C.muted }]}>No lessons published yet.</Text>;
  return (
    <>
      {lessons.map(lesson => (
        <Card key={lesson.id} style={s.lessonCard}>
          <Text style={[s.lessonTitle, { color: C.text }]}>{lesson.title}</Text>
          {lesson.content_type === 'text' && lesson.body && (
            <Text style={[s.lessonBody, { color: C.textSoft }]}>{lesson.body}</Text>
          )}
          {(lesson.content_type === 'youtube' || lesson.content_type === 'link') && lesson.external_url && (
            <TouchableOpacity onPress={() => Linking.openURL(lesson.external_url!)} style={s.lessonLink}>
              <Ionicons name={lesson.content_type === 'youtube' ? 'logo-youtube' : 'link-outline'} size={16} color={C.primary} />
              <Text style={[s.lessonLinkText, { color: C.primary }]}>
                {lesson.content_type === 'youtube' ? 'Watch video' : 'Open link'}
              </Text>
            </TouchableOpacity>
          )}
          {lesson.content_type === 'file' && lesson.file_url && (
            <TouchableOpacity onPress={() => Linking.openURL(lesson.file_url!)} style={s.lessonLink}>
              <Ionicons name="document-outline" size={16} color={C.primary} />
              <Text style={[s.lessonLinkText, { color: C.primary }]}>Open file</Text>
            </TouchableOpacity>
          )}
        </Card>
      ))}
    </>
  );
}

// ── Assignments ──────────────────────────────────────────────────────────────

function AssignmentsTab({ assignments, C, onSubmitted }: { assignments: LmsAssignment[]; C: any; onSubmitted: () => void }) {
  if (assignments.length === 0) return <Text style={[s.empty, { color: C.muted }]}>No assignments yet.</Text>;
  return (
    <>
      {assignments.map(a => <AssignmentCard key={a.id} assignment={a} C={C} onSubmitted={onSubmitted} />)}
    </>
  );
}

function AssignmentCard({ assignment: a, C, onSubmitted }: { assignment: LmsAssignment; C: any; onSubmitted: () => void }) {
  const [expanded, setExpanded] = useState(a.status === 'not_submitted');
  const [bodyText, setBodyText] = useState(a.body_text ?? '');
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusCfg = {
    not_submitted: { label: 'Not Submitted', color: C.warning, bg: C.warningLight },
    submitted:     { label: 'Submitted',     color: '#1D4ED8', bg: '#DBEAFE' },
    graded:        { label: 'Graded',        color: C.success, bg: C.successLight },
  }[a.status];
  const overdue = a.status === 'not_submitted' && a.due_date && new Date(a.due_date) < new Date();

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      let file_data: string | undefined;
      if (file) {
        const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        const mime = file.mimeType || 'application/octet-stream';
        file_data = `data:${mime};base64,${base64}`;
      }
      await api.post(`/api/lms/assignments/${a.id}/submit`, { body_text: bodyText, ...(file_data ? { file_data } : {}) });
      setFile(null);
      onSubmitted();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card style={s.assignCard}>
      <View style={s.assignHeader}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={[s.assignTitle, { color: C.text }]}>{a.title}</Text>
          {a.due_date && (
            <Text style={[s.dueDate, { color: overdue ? C.danger : C.muted }]}>
              {overdue ? '⚠ Overdue · ' : 'Due: '}{formatDate(a.due_date)}
            </Text>
          )}
        </View>
        <View style={[s.badge, { backgroundColor: statusCfg.bg }]}>
          <Text style={[s.badgeText, { color: statusCfg.color }]}>
            {a.status === 'graded' ? `Graded: ${a.score}/${a.max_score ?? '—'}` : statusCfg.label}
          </Text>
        </View>
      </View>

      {a.instructions && <Text style={[s.instructions, { color: C.textSoft }]}>{a.instructions}</Text>}

      {a.status === 'graded' && !expanded && (
        <>
          {a.feedback && <Text style={[s.feedback, { color: C.textSoft }]}>Feedback: {a.feedback}</Text>}
        </>
      )}

      {a.status !== 'graded' && a.status === 'submitted' && !expanded && (
        <TouchableOpacity onPress={() => setExpanded(true)}>
          <Text style={[s.resubmitLink, { color: C.primary }]}>Submitted · Resubmit</Text>
        </TouchableOpacity>
      )}

      {expanded && (
        <View style={s.assignForm}>
          <TextInput
            style={[s.textarea, { color: C.text, borderColor: C.border, backgroundColor: C.bg }]}
            placeholder="Write your answer…"
            placeholderTextColor={C.muted}
            multiline
            numberOfLines={4}
            value={bodyText}
            onChangeText={setBodyText}
          />
          <TouchableOpacity onPress={pickFile} style={[s.attachBtn, { borderColor: C.border }]}>
            <Ionicons name="attach-outline" size={16} color={C.primary} />
            <Text style={[s.attachText, { color: C.primary }]} numberOfLines={1}>
              {file ? file.name : 'Attach a file'}
            </Text>
          </TouchableOpacity>
          {error && <Text style={[s.errorText, { color: C.danger }]}>{error}</Text>}
          <Button
            label={submitting ? 'Submitting…' : 'Submit'}
            size="sm"
            loading={submitting}
            disabled={!bodyText.trim() && !file}
            onPress={submit}
            style={{ marginTop: 10, alignSelf: 'flex-start' }}
          />
        </View>
      )}
    </Card>
  );
}

// ── Quizzes ──────────────────────────────────────────────────────────────────

function QuizzesTab({ quizzes, C, onStart }: { quizzes: LmsQuiz[]; C: any; onStart: (q: LmsQuiz) => void }) {
  if (quizzes.length === 0) return <Text style={[s.empty, { color: C.muted }]}>No quizzes yet.</Text>;
  return (
    <>
      {quizzes.map(q => {
        const maxed = q.max_attempts != null && (q.attempt_count ?? 0) >= q.max_attempts;
        const badge = maxed
          ? { label: 'Max Attempts', color: C.danger, bg: C.dangerLight }
          : q.best_score != null
            ? { label: `Best: ${q.best_score}/${q.total_marks}`, color: '#1D4ED8', bg: '#DBEAFE' }
            : { label: 'Not Attempted', color: C.muted, bg: C.surfaceWarm };
        return (
          <Card key={q.id} style={s.quizCard}>
            <Text style={[s.quizTitle, { color: C.text }]}>{q.title}</Text>
            <Text style={[s.quizMeta, { color: C.muted }]}>
              {q.question_count} question{q.question_count === 1 ? '' : 's'} · {q.total_marks} marks
              {q.time_limit_mins ? ` · ${q.time_limit_mins} min` : ''}
            </Text>
            <View style={s.quizFooter}>
              <View style={[s.badge, { backgroundColor: badge.bg }]}>
                <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
              {!maxed && (
                <Button label={q.attempt_count ? 'Retake Quiz' : 'Start Quiz'} size="sm" onPress={() => onStart(q)} />
              )}
            </View>
          </Card>
        );
      })}
    </>
  );
}

// ── Announcements ────────────────────────────────────────────────────────────

function AnnouncementsTab({ announcements, C }: { announcements: LmsAnnouncement[]; C: any }) {
  if (announcements.length === 0) return <Text style={[s.empty, { color: C.muted }]}>No announcements yet.</Text>;
  return (
    <>
      {announcements.map(an => (
        <Card key={an.id} style={s.annCard}>
          {an.is_pinned && (
            <View style={s.pinnedRow}>
              <Ionicons name="pin" size={13} color={C.accent} />
              <Text style={[s.pinnedText, { color: C.accent }]}>Pinned</Text>
            </View>
          )}
          <Text style={[s.annTitle, { color: C.text }]}>{an.title}</Text>
          <Text style={[s.annBody, { color: C.textSoft }]}>{an.body}</Text>
          <Text style={[s.annDate, { color: C.muted }]}>{formatDate(an.created_at)}</Text>
        </Card>
      ))}
    </>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const s = StyleSheet.create({
  flex:          { flex: 1 },
  tabRow:        { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, marginBottom: 16, gap: 4 },
  tabBtn:        { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabText:       { fontSize: 12, fontWeight: '700' },
  empty:         { textAlign: 'center', marginTop: 32, fontSize: 14 },

  lessonCard:    { marginBottom: 10 },
  lessonTitle:   { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  lessonBody:    { fontSize: 13, lineHeight: 20 },
  lessonLink:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  lessonLinkText:{ fontSize: 13, fontWeight: '700' },

  assignCard:    { marginBottom: 12 },
  assignHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  assignTitle:   { fontSize: 14, fontWeight: '700' },
  dueDate:       { fontSize: 12, fontWeight: '600', marginTop: 3 },
  badge:         { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText:     { fontSize: 11, fontWeight: '700' },
  instructions:  { fontSize: 13, lineHeight: 19, marginTop: 8 },
  feedback:      { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  resubmitLink:  { fontSize: 12, fontWeight: '700', marginTop: 8 },
  assignForm:    { marginTop: 10 },
  textarea:      { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  attachBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 10 },
  attachText:    { fontSize: 13, fontWeight: '600', flex: 1 },
  errorText:     { fontSize: 12, fontWeight: '600', marginTop: 8 },

  quizCard:      { marginBottom: 10 },
  quizTitle:     { fontSize: 14, fontWeight: '700' },
  quizMeta:      { fontSize: 12, marginTop: 2, marginBottom: 10 },
  quizFooter:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  annCard:       { marginBottom: 10 },
  pinnedRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  pinnedText:    { fontSize: 11, fontWeight: '700' },
  annTitle:      { fontSize: 14, fontWeight: '700' },
  annBody:       { fontSize: 13, lineHeight: 19, marginTop: 4 },
  annDate:       { fontSize: 11, marginTop: 8 },
});
