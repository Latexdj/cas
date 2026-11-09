import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { gradeBadge } from '@/lib/grade';
import type { LmsQuizAttemptResponse, LmsQuizQuestion, LmsQuizResult } from '@/types/api';

type Phase = 'start' | 'quiz' | 'review' | 'results';
type Answer = { question_id: string; selected_option?: string; answer_text?: string };

export default function QuizScreen() {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    quizId: string; title: string; instructions: string; question_count: string;
    time_limit_mins: string; total_marks: string; attempt_count: string;
    best_score: string; max_attempts: string;
  }>();

  const [phase, setPhase] = useState<Phase>('start');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<LmsQuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LmsQuizResult | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startTimer(mins: number) {
    setTimeLeft(mins * 60);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      const { data } = await api.post<LmsQuizAttemptResponse>(`/api/lms/quizzes/${params.quizId}/attempt`);
      setAttemptId(data.attempt.id);
      setQuestions(data.questions);
      setAnswers({});
      setCurrentIndex(0);
      setPhase('quiz');
      const limit = data.quiz.time_limit_mins ?? (params.time_limit_mins ? parseInt(params.time_limit_mins, 10) : null);
      if (limit) startTimer(limit);
    } catch (e: any) {
      setStartError(e?.response?.data?.error ?? 'Could not start the quiz. Please try again.');
    } finally {
      setStarting(false);
    }
  }

  function setAnswer(questionId: string, patch: Omit<Answer, 'question_id'>) {
    setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], ...patch, question_id: questionId } }));
  }

  async function handleSubmit(auto: boolean) {
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      const answerList = questions.map(q => ({
        question_id: q.id,
        selected_option: answers[q.id]?.selected_option,
        answer_text: answers[q.id]?.answer_text,
      }));
      const { data } = await api.post<LmsQuizResult>(`/api/lms/attempts/${attemptId}/submit`, { answers: answerList });
      setResult(data);
      setPhase('results');
    } catch (e: any) {
      if (!auto) setStartError(e?.response?.data?.error ?? 'Failed to submit quiz.');
    } finally {
      setSubmitting(false);
    }
  }

  const answeredCount = questions.filter(q => {
    const a = answers[q.id];
    return a && (a.selected_option || a.answer_text?.trim());
  }).length;

  // ── start phase ──────────────────────────────────────────────────────────
  if (phase === 'start') {
    const questionCount = parseInt(params.question_count || '0', 10);
    const totalMarks = parseInt(params.total_marks || '0', 10);
    const timeLimitMins = params.time_limit_mins ? parseInt(params.time_limit_mins, 10) : null;
    const maxAttempts = params.max_attempts ? parseInt(params.max_attempts, 10) : null;
    const attemptCount = parseInt(params.attempt_count || '0', 10);
    const bestScore = params.best_score ? parseFloat(params.best_score) : null;

    return (
      <View style={[s.flex, { backgroundColor: C.bg, paddingTop: insets.top + 16 }]}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={C.muted} />
            <Text style={[s.backText, { color: C.muted }]}>Go back</Text>
          </TouchableOpacity>

          <Text style={[s.quizTitle, { color: C.text }]}>{params.title}</Text>
          {!!params.instructions && <Text style={[s.instructions, { color: C.textSoft }]}>{params.instructions}</Text>}

          <View style={s.statRow}>
            <Card style={s.statCard}><Text style={[s.statValue, { color: C.text }]}>{questionCount}</Text><Text style={[s.statLabel, { color: C.muted }]}>Questions</Text></Card>
            <Card style={s.statCard}><Text style={[s.statValue, { color: C.text }]}>{totalMarks}</Text><Text style={[s.statLabel, { color: C.muted }]}>Marks</Text></Card>
            <Card style={s.statCard}><Text style={[s.statValue, { color: C.text }]}>{timeLimitMins ? `${timeLimitMins}m` : '∞'}</Text><Text style={[s.statLabel, { color: C.muted }]}>Time Limit</Text></Card>
          </View>

          {bestScore != null && (
            <Text style={[s.bestScore, { color: C.success }]}>Your best score: {bestScore}/{totalMarks}</Text>
          )}
          {maxAttempts != null && (
            <Text style={[s.attemptsLeft, { color: C.muted }]}>Attempts used: {attemptCount}/{maxAttempts}</Text>
          )}

          {startError && <Text style={[s.startError, { color: C.danger }]}>{startError}</Text>}

          <Button label={starting ? 'Starting…' : attemptCount ? 'Retake Quiz' : 'Start Quiz'} loading={starting} onPress={handleStart} style={{ marginTop: 20 }} />
        </ScrollView>
      </View>
    );
  }

  // ── quiz phase ───────────────────────────────────────────────────────────
  if (phase === 'quiz') {
    const q = questions[currentIndex];
    const progress = ((currentIndex + 1) / questions.length) * 100;
    const timerRed = timeLeft != null && timeLeft < 60;

    return (
      <View style={[s.flex, { backgroundColor: C.bg, paddingTop: insets.top + 12 }]}>
        <View style={s.quizHeader}>
          <View style={[s.progressTrack, { backgroundColor: C.border }]}>
            <View style={[s.progressFill, { width: `${progress}%`, backgroundColor: C.primary }]} />
          </View>
          {timeLeft != null && (
            <View style={[s.timerBadge, { backgroundColor: timerRed ? C.dangerLight : C.surface }]}>
              <Text style={[s.timerText, { color: timerRed ? C.danger : C.text }]}>{formatTime(timeLeft)}</Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1 }}>
          <Text style={[s.questionIndex, { color: C.muted }]}>Question {currentIndex + 1} of {questions.length} · {q.marks} mark{q.marks === 1 ? '' : 's'}</Text>
          <Text style={[s.questionText, { color: C.text }]}>{q.question_text}</Text>

          {q.question_type === 'mcq' ? (
            (['a', 'b', 'c', 'd'] as const).map(letter => {
              const text = q[`option_${letter}` as const];
              if (!text) return null;
              const selected = answers[q.id]?.selected_option === letter;
              return (
                <TouchableOpacity
                  key={letter}
                  style={[s.option, { borderColor: selected ? C.primary : C.border, backgroundColor: selected ? C.primaryLight : C.surface }]}
                  onPress={() => setAnswer(q.id, { selected_option: letter })}
                  activeOpacity={0.75}
                >
                  <View style={[s.optionLetter, { backgroundColor: selected ? C.primary : C.border }]}>
                    <Text style={[s.optionLetterText, { color: selected ? '#fff' : C.muted }]}>{letter.toUpperCase()}</Text>
                  </View>
                  <Text style={[s.optionText, { color: C.text }]}>{text}</Text>
                </TouchableOpacity>
              );
            })
          ) : (
            <TextInput
              style={[s.shortInput, { color: C.text, borderColor: C.border, backgroundColor: C.surface }]}
              placeholder="Type your answer…"
              placeholderTextColor={C.muted}
              multiline
              value={answers[q.id]?.answer_text ?? ''}
              onChangeText={text => setAnswer(q.id, { answer_text: text })}
            />
          )}
        </ScrollView>

        <View style={[s.navRow, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity disabled={currentIndex === 0} onPress={() => setCurrentIndex(i => i - 1)} style={s.navBtn}>
            <Text style={[s.navBtnText, { color: currentIndex === 0 ? C.muted : C.primary }]}>Previous</Text>
          </TouchableOpacity>
          <View style={s.dotRow}>
            {questions.map((qq, i) => {
              const answered = !!answers[qq.id]?.selected_option || !!answers[qq.id]?.answer_text?.trim();
              const dotColor = i === currentIndex ? C.primary : answered ? C.success : C.border;
              return (
                <TouchableOpacity key={qq.id} onPress={() => setCurrentIndex(i)}>
                  <View style={[s.dot, { backgroundColor: dotColor }]} />
                </TouchableOpacity>
              );
            })}
          </View>
          {currentIndex === questions.length - 1 ? (
            <TouchableOpacity onPress={() => setPhase('review')} style={s.navBtn}>
              <Text style={[s.navBtnText, { color: C.primary, fontWeight: '800' }]}>Review</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setCurrentIndex(i => i + 1)} style={s.navBtn}>
              <Text style={[s.navBtnText, { color: C.primary }]}>Next</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── review phase ─────────────────────────────────────────────────────────
  if (phase === 'review') {
    return (
      <View style={[s.flex, { backgroundColor: C.bg, paddingTop: insets.top + 16 }]}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={[s.quizTitle, { color: C.text }]}>Review your answers</Text>
          <Text style={[s.instructions, { color: C.textSoft }]}>
            {answeredCount} of {questions.length} questions answered. Unanswered questions will be scored zero.
          </Text>

          {questions.map((q, i) => {
            const answered = !!answers[q.id]?.selected_option || !!answers[q.id]?.answer_text?.trim();
            return (
              <TouchableOpacity key={q.id} onPress={() => { setCurrentIndex(i); setPhase('quiz'); }}>
                <Card style={s.reviewRow}>
                  <Text style={[s.reviewIndex, { color: C.text }]} numberOfLines={1}>Q{i + 1}. {q.question_text}</Text>
                  <Text style={[s.reviewStatus, { color: answered ? C.success : C.warning }]}>{answered ? 'Answered' : 'Skipped'}</Text>
                </Card>
              </TouchableOpacity>
            );
          })}

          <Button label={submitting ? 'Submitting…' : 'Submit Quiz'} loading={submitting} onPress={() => handleSubmit(false)} style={{ marginTop: 16 }} />
          <TouchableOpacity onPress={() => setPhase('quiz')} style={{ marginTop: 14, alignSelf: 'center' }}>
            <Text style={{ color: C.muted, fontSize: 13 }}>Back to questions</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── results phase ────────────────────────────────────────────────────────
  if (phase === 'results' && result) {
    const badge = gradeBadge(result.percentage);
    return (
      <View style={[s.flex, { backgroundColor: C.bg, paddingTop: insets.top + 16 }]}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={[s.quizTitle, { color: C.text }]}>Results</Text>
          <Card style={s.resultCard}>
            <Text style={[s.resultScore, { color: C.text }]}>{result.score}/{result.total_marks}</Text>
            <Text style={[s.resultPct, { color: C.muted }]}>{result.percentage}%</Text>
            <View style={[s.badge, { backgroundColor: badge.bg, marginTop: 8 }]}>
              <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </Card>

          {result.questions.map((q, i) => (
            <Card key={q.id} style={s.reviewRow}>
              <Text style={[s.reviewIndex, { color: C.text }]}>Q{i + 1}. {q.question_text}</Text>
              <Text style={[s.resultAnswer, { color: C.muted }]}>Your answer: {q.your_answer ? q.your_answer.toUpperCase() : '—'}</Text>
              {result.show_answers_after && q.correct_answer && (
                <Text style={[s.resultAnswer, { color: C.success }]}>Correct answer: {q.correct_answer.toUpperCase()}</Text>
              )}
              {result.show_answers_after && q.explanation && (
                <Text style={[s.resultExplanation, { color: C.textSoft }]}>{q.explanation}</Text>
              )}
              <Text style={[s.resultMarks, { color: C.muted }]}>{q.marks_awarded}/{q.marks} marks</Text>
            </Card>
          ))}

          <Button label="Back to Course" variant="secondary" onPress={() => router.back()} style={{ marginTop: 16 }} />
        </ScrollView>
      </View>
    );
  }

  return <Spinner message="Loading…" />;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s2 = seconds % 60;
  return `${m}:${s2.toString().padStart(2, '0')}`;
}

const s = StyleSheet.create({
  flex:            { flex: 1 },
  backRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText:        { fontSize: 13, fontWeight: '600' },
  quizTitle:       { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  instructions:    { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  statRow:         { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard:        { flex: 1, alignItems: 'center' },
  statValue:       { fontSize: 18, fontWeight: '800' },
  statLabel:       { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },
  bestScore:       { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  attemptsLeft:    { fontSize: 12 },
  startError:      { fontSize: 13, fontWeight: '600', marginTop: 12 },

  quizHeader:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 8 },
  progressTrack:   { flex: 1, height: 6, borderRadius: 3 },
  progressFill:    { height: 6, borderRadius: 3 },
  timerBadge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  timerText:       { fontSize: 13, fontWeight: '800' },
  questionIndex:   { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  questionText:    { fontSize: 17, fontWeight: '700', marginBottom: 18, lineHeight: 24 },
  option:          { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 10 },
  optionLetter:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionLetterText:{ fontSize: 13, fontWeight: '800' },
  optionText:      { fontSize: 14, flex: 1 },
  shortInput:      { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 14, minHeight: 120, textAlignVertical: 'top' },
  navRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
  navBtn:          { paddingVertical: 8, paddingHorizontal: 4 },
  navBtnText:      { fontSize: 14, fontWeight: '700' },
  dotRow:          { flexDirection: 'row', gap: 6, flexWrap: 'wrap', maxWidth: 160, justifyContent: 'center' },
  dot:             { width: 9, height: 9, borderRadius: 5 },

  reviewRow:       { marginBottom: 8 },
  reviewIndex:     { fontSize: 13, fontWeight: '600' },
  reviewStatus:    { fontSize: 12, fontWeight: '700', marginTop: 4 },

  resultCard:      { alignItems: 'center', marginBottom: 16, paddingVertical: 24 },
  resultScore:     { fontSize: 32, fontWeight: '800' },
  resultPct:       { fontSize: 14, marginTop: 2 },
  badge:           { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeText:       { fontSize: 12, fontWeight: '700' },
  resultAnswer:    { fontSize: 12, marginTop: 4 },
  resultExplanation:{ fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  resultMarks:     { fontSize: 11, marginTop: 6, fontWeight: '600' },
});
