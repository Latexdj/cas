import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { QuestionBody } from '@/components/QuestionBody';
import { SharedInfo } from '@/components/SharedInfo';
import { getResult, saveAnswers, startTest, submitTest, type CtAttempt, type CtResult } from '@/lib/classTests';
import { RouteError } from '@/components/RouteError';

export { RouteError as ErrorBoundary };

const LETTERS = ['a', 'b', 'c', 'd', 'e'];
type Answers = Record<string, { selected: string | null; text: string | null }>;

function mmss(sec: number) { const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; }

export default function TakeTest() {
  const C = useTheme();
  const nav = useNavigation();
  const { id, result: resultId } = useLocalSearchParams<{ id: string; result?: string }>();
  const [data, setData] = useState<CtAttempt | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [i, setI] = useState(0);
  const [result, setResult] = useState<CtResult | null>(null);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'waiting'>('saved');
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const offset = useRef(0);   // server clock minus tablet clock
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        if (resultId) { setResult(await getResult(String(resultId))); return; }
        const d = await startTest(String(id));
        offset.current = Date.parse(d.attempt.server_now) - Date.now();
        setData(d); setAnswers(d.answers);
        nav.setOptions({ title: d.quiz.title });
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the test.'); }
    })();
  }, [id, resultId, nav]);

  const submit = useCallback(async () => {
    if (!data || submitted.current) return;
    submitted.current = true; setSubmitting(true); setConfirm(false);
    try {
      const all = Object.entries(answers).map(([qid, a]) => ({ question_id: qid, selected: a.selected, text: a.text }));
      setResult(await submitTest(data.attempt.id, all));
    } catch (e) {
      submitted.current = false;
      setError(e instanceof Error ? `${e.message} Your answers are kept; try Submit again.` : 'Could not submit. Try again.');
    } finally { setSubmitting(false); }
  }, [data, answers]);

  // The clock follows the server's deadline; at zero the test submits itself.
  const submitRef = useRef(submit); submitRef.current = submit;
  useEffect(() => {
    if (!data?.attempt.deadline_at || result) return;
    const tick = () => {
      const secs = Math.max(0, Math.round((Date.parse(data.attempt.deadline_at!) - (Date.now() + offset.current)) / 1000));
      setLeft(secs);
      if (secs === 0) submitRef.current();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data, result]);

  async function persist(qid: string, a: { selected: string | null; text: string | null }) {
    if (!data) return;
    setSaveState('saving');
    try {
      const ok = await saveAnswers(data.attempt.id, [{ question_id: qid, selected: a.selected, text: a.text }]);
      setSaveState(ok ? 'saved' : 'waiting');
    } catch (e) { setSaveState('waiting'); setError(e instanceof Error ? e.message : ''); }
  }
  function choose(qid: string, letter: string) {
    const a = { selected: letter, text: null };
    setAnswers(prev => ({ ...prev, [qid]: a }));
    persist(qid, a);
  }
  function typeText(qid: string, text: string) {
    const a = { selected: null, text };
    setAnswers(prev => ({ ...prev, [qid]: a }));
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => persist(qid, a), 900);
  }

  // ── Result ──
  if (result) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page}>
        <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[s.label, { color: C.textSoft }]}>{result.late ? 'Time ran out. Your answers were submitted.' : 'Submitted'}</Text>
          <Text style={[s.big, { color: C.text }]}>{result.score ?? 0} / {result.max_score}</Text>
          {result.needs_marking && <Text style={[s.body, { color: C.textSoft }]}>Your teacher will mark your written answers, so your score may go up.</Text>}
        </View>
        {result.review ? result.review.map((q, n) => {
          const ok = q.type === 'mcq' ? q.your_answer === q.correct : null;
          return (
            <View key={q.id} style={[s.card, { backgroundColor: C.surface, borderColor: ok === true ? C.success : C.border }]}>
              <View style={s.reviewHead}>
                {q.type === 'mcq' && <Ionicons name={ok ? 'checkmark-circle' : q.your_answer ? 'close-circle' : 'remove-circle'} size={20} color={ok ? C.success : q.your_answer ? C.danger : C.muted} />}
                <Text style={[s.label, { color: C.textSoft }]}>Question {n + 1}, {q.marks} mark{q.marks === 1 ? '' : 's'}</Text>
              </View>
              {q.info && <SharedInfo text={q.info.text} html={q.info.html} images={q.info.images || []} fontSize={14} />}
              <QuestionBody text={q.text} html={q.html} images={q.images || []} imageHeight={180} textStyle={[s.body, { color: C.text }]} />
              {q.type === 'mcq' ? (
                <>
                  <Text style={[s.small, { color: C.textSoft }]}>
                    {q.your_answer ? `Your answer: ${q.your_answer.toUpperCase()}. ${q.options[LETTERS.indexOf(q.your_answer)] ?? ''}` : 'Not answered'}
                  </Text>
                  {!!q.your_answer && !!q.option_images?.[LETTERS.indexOf(q.your_answer)] && (
                    <Image source={{ uri: q.option_images[LETTERS.indexOf(q.your_answer)]! }} resizeMode="contain" accessibilityLabel="Picture for your answer" style={s.optImgSmall} />
                  )}
                  {!ok && q.correct && <Text style={[s.small, { color: C.success, fontWeight: '700' }]}>Answer: {q.correct.toUpperCase()}. {q.options[LETTERS.indexOf(q.correct)]}</Text>}
                  {!ok && !!q.correct && !!q.option_images?.[LETTERS.indexOf(q.correct)] && (
                    <Image source={{ uri: q.option_images[LETTERS.indexOf(q.correct)]! }} resizeMode="contain" accessibilityLabel="Picture for the right answer" style={s.optImgSmall} />
                  )}
                  {q.explanation && <QuestionBody text={q.explanation} html={q.explanation_html} images={[]} showUnplaced={false} textStyle={[s.small, { color: C.textSoft }]} />}
                </>
              ) : (
                <>
                  <Text style={[s.small, { color: C.textSoft }]}>Your answer: {q.your_answer || 'Not answered'}</Text>
                  <Text style={[s.small, { color: C.text }]}>{q.marks_awarded == null ? 'Not marked yet' : `Marks: ${q.marks_awarded} of ${q.marks}`}</Text>
                </>
              )}
            </View>
          );
        }) : <Text style={[s.small, { color: C.textSoft }]}>Your teacher will go through the answers.</Text>}
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={[s.primary, { backgroundColor: C.primary }]}>
          <Text style={s.primaryText}>Back to Offline Assessment</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (error && !data) {
    return (
      <View style={[s.center, { backgroundColor: C.bg }]}>
        <Text style={[s.body, { color: C.textSoft, textAlign: 'center' }]}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={[s.primary, { backgroundColor: C.primary, marginTop: 16 }]}>
          <Text style={s.primaryText}>Back</Text>
        </Pressable>
      </View>
    );
  }
  if (!data) return <View style={[s.center, { backgroundColor: C.bg }]}><ActivityIndicator color={C.primaryText} /></View>;

  // ── Taking the test ──
  const qs = data.questions;
  const q = qs[i];
  const last = i === qs.length - 1;
  const unanswered = qs.filter(x => { const a = answers[x.id]; return !(a?.selected || a?.text?.trim()); }).length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.topBar, { borderColor: C.border, backgroundColor: C.surface }]}>
        <Text style={[s.small, { color: C.textSoft }]}>Question {i + 1} of {qs.length}, {q.marks} mark{q.marks === 1 ? '' : 's'}</Text>
        {left != null && <Text style={[s.timer, { color: left < 60 ? C.danger : C.text }]} accessibilityLabel={`${Math.ceil(left / 60)} minutes left`}>{mmss(left)}</Text>}
      </View>
      {saveState === 'waiting' && (
        <View style={[s.warn, { backgroundColor: C.warningLight, borderColor: C.warning }]}>
          <Text style={[s.small, { color: C.text }]}>Saving paused: reconnect to the school Wi-Fi. Your answers are kept on this tablet.</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        {i === 0 && !!data.quiz.instructions && <Text style={[s.small, { color: C.textSoft }]}>{data.quiz.instructions}</Text>}
        {q.info && <SharedInfo key={`info-${q.id}`} text={q.info.text} html={q.info.html} images={q.info.images || []} />}
        <QuestionBody text={q.text} html={q.html} images={q.images || []} textStyle={[s.question, { color: C.text }]} />
        {q.type === 'mcq' ? (
          <View style={{ gap: 10 }}>
            {q.options.map((opt, k) => {
              const letter = LETTERS[k];
              const on = answers[q.id]?.selected === letter;
              return (
                <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => choose(q.id, letter)}
                  style={[s.option, { borderColor: on ? C.primaryText : C.border, backgroundColor: on ? C.primaryLight : C.surface }]}>
                  <Text style={[s.optLetter, { color: on ? C.primaryText : C.text }]}>{letter.toUpperCase()}</Text>
                  <View style={{ flex: 1, gap: 6 }}>
                    {!!opt && (q.options_html?.[k]
                      ? <QuestionBody text={opt} html={q.options_html[k]} images={[]} showUnplaced={false} textStyle={[s.optText, { color: C.text }]} />
                      : <Text style={[s.optText, { color: C.text }]}>{opt}</Text>)}
                    {!!q.option_images?.[k] && (
                      <Image source={{ uri: q.option_images[k]! }} resizeMode="contain" accessibilityLabel={`Picture for option ${letter.toUpperCase()}`} style={s.optImg} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <TextInput value={answers[q.id]?.text ?? ''} onChangeText={(t) => typeText(q.id, t)} multiline placeholder="Write your answer"
            placeholderTextColor={C.placeholder} accessibilityLabel="Your answer" textAlignVertical="top"
            style={[s.answer, { borderColor: C.borderStrong, color: C.text, backgroundColor: C.surface }]} />
        )}
        <Text style={[s.small, { color: C.muted }]}>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}</Text>
        {!!error && <Text style={[s.small, { color: C.danger }]}>{error}</Text>}
      </ScrollView>

      <View style={[s.bottom, { borderColor: C.border, backgroundColor: C.surface }]}>
        {confirm ? (
          <View style={{ gap: 8 }}>
            <Text style={[s.body, { color: C.text }]}>
              {unanswered ? `${unanswered} question${unanswered === 1 ? '' : 's'} not answered. ` : ''}Submit the test? You can't change answers afterwards.
            </Text>
            <View style={s.navRow}>
              <Pressable accessibilityRole="button" onPress={() => setConfirm(false)} style={[s.secondary, { borderColor: C.border, flex: 1 }]}>
                <Text style={[s.secondaryText, { color: C.text }]}>Keep going</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={submit} disabled={submitting} style={[s.primary, { backgroundColor: C.primary, flex: 1 }]}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>Submit</Text>}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={s.navRow}>
            <Pressable accessibilityRole="button" onPress={() => setI(i - 1)} disabled={i === 0}
              style={[s.secondary, { borderColor: C.border, flex: 1, opacity: i === 0 ? 0.4 : 1 }]}>
              <Text style={[s.secondaryText, { color: C.text }]}>Previous</Text>
            </Pressable>
            {last ? (
              <Pressable accessibilityRole="button" onPress={() => setConfirm(true)} style={[s.primary, { backgroundColor: C.primary, flex: 2 }]}>
                <Text style={s.primaryText}>Finish test</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setI(i + 1)} style={[s.primary, { backgroundColor: C.primary, flex: 2 }]}>
                <Text style={s.primaryText}>Next</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const s = createThemedStyles({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  page:          { padding: 20, gap: 14, paddingBottom: 32 },
  topBar:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1 },
  timer:         { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  warn:          { paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1 },
  question:      { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  option:        { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5 },
  optLetter:     { fontSize: 16, fontWeight: '800', width: 20 },
  optText:       { fontSize: 16, lineHeight: 22 },
  optImg:        { width: '100%', height: 140, backgroundColor: '#FFFFFF', borderRadius: 8 },
  optImgSmall:   { width: '100%', height: 110, backgroundColor: '#FFFFFF', borderRadius: 8 },
  answer:        { minHeight: 180, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, lineHeight: 22 },
  card:          { padding: 16, borderRadius: 16, borderWidth: 1, gap: 8 },
  reviewHead:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label:         { fontSize: 13, fontWeight: '600' },
  big:           { fontSize: 40, fontWeight: '800' },
  body:          { fontSize: 15, lineHeight: 22 },
  small:         { fontSize: 13, lineHeight: 18 },
  bottom:        { padding: 12, borderTopWidth: 1 },
  navRow:        { flexDirection: 'row', gap: 10 },
  primary:       { minHeight: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondary:     { minHeight: 50, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { fontSize: 16, fontWeight: '600' },
});
