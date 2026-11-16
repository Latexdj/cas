import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { loadSubject, optionImage, paperTitle, questionImages, type PackQuestion, type SubjectPack } from '@/lib/quizPack';
import { QuestionBody } from '@/components/QuestionBody';
import { getProgress, recordRound, type TheoryRating } from '@/lib/quizProgress';
import { clearRound, loadRound, saveRound } from '@/lib/quizRound';
import { RouteError } from '@/components/RouteError';

export { RouteError as ErrorBoundary };

type Mode = 'practice' | 'paper' | 'retry' | 'theory';
const LETTERS = ['a', 'b', 'c', 'd', 'e'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const byNumber = (a: PackQuestion, b: PackQuestion) =>
  (b.year ?? 0) - (a.year ?? 0) || a.paper_id.localeCompare(b.paper_id) || (a.question_no ?? 999) - (b.question_no ?? 999);

function mmss(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PlayScreen() {
  const C = useTheme();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ slug: string; mode: Mode; count?: string; year?: string; paperId?: string; resume?: string }>();
  const mode = (params.mode ?? 'practice') as Mode;

  const [pack, setPack] = useState<SubjectPack | null>(null);
  const [qs, setQs] = useState<PackQuestion[] | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ratings, setRatings] = useState<Record<string, TheoryRating>>({});
  const [showScheme, setShowScheme] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [left, setLeft] = useState(0);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const leftRef = useRef(0);

  const label = useMemo(() => {
    if (!pack) return '';
    if (savedLabel) return savedLabel;
    if (mode === 'paper') { const p = pack.papers.find(x => x.id === params.paperId); return p ? paperTitle(p) : 'Full paper'; }
    if (mode === 'theory') return params.year ? `Theory ${params.year}` : 'Theory';
    if (mode === 'retry') return 'Retry mistakes';
    return params.year ? `Practice ${params.year}` : 'Practice';
  }, [pack, mode, params.paperId, params.year, savedLabel]);

  useEffect(() => {
    (async () => {
      const p = await loadSubject(String(params.slug));
      if (!p) { setQs([]); return; }
      setPack(p);
      // Continue a round the student had not finished.
      if (params.resume === '1') {
        const saved = await loadRound();
        if (saved && saved.slug === p.slug) {
          const byId = new Map(p.questions.map(q => [q.id, q]));
          const list = saved.ids.map(id => byId.get(id)).filter((q): q is PackQuestion => !!q);
          if (list.length) {
            setSavedLabel(saved.label);
            setQs(list);
            setI(Math.min(saved.i, list.length - 1));
            setAnswers(saved.answers);
            setRatings(saved.ratings as Record<string, TheoryRating>);
            setLeft(saved.left); leftRef.current = saved.left;
            return;
          }
        }
      }
      const year = params.year ? Number(params.year) : null;
      const inYear = (q: PackQuestion) => year == null || q.year === year;
      let list: PackQuestion[];
      if (mode === 'paper') list = p.questions.filter(q => q.paper_id === params.paperId && q.question_type === 'objective').sort(byNumber);
      else if (mode === 'theory') list = p.questions.filter(q => q.question_type === 'theory' && inYear(q)).sort(byNumber);
      else if (mode === 'retry') {
        const prog = await getProgress();
        list = shuffle(p.questions.filter(q => q.question_type === 'objective' && prog.objective[q.id]?.ok === false));
      } else list = shuffle(p.questions.filter(q => q.question_type === 'objective' && inYear(q))).slice(0, Number(params.count) || 20);
      setQs(list);
      if (mode === 'paper') { setLeft(list.length * 60); leftRef.current = list.length * 60; }
    })();
  }, [params.slug, params.paperId, params.year, params.count, params.resume, mode]);

  // Keep the round so it can be continued after an interruption.
  const remaining = Math.floor(left / 10);
  useEffect(() => {
    if (!qs?.length || !pack || done) return;
    saveRound({
      slug: pack.slug, subject: pack.subject, mode, label, ids: qs.map(q => q.id), i,
      answers, ratings, left: leftRef.current,
    });
  }, [qs, pack, done, mode, label, i, answers, ratings, remaining]);

  useEffect(() => { if (label) nav.setOptions({ title: label }); }, [label, nav]);

  const finish = useCallback(async () => {
    if (!qs || !pack) return;
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    const objective = qs.filter(q => q.question_type === 'objective' && answers[q.id]).map(q => ({ id: q.id, ok: answers[q.id] === q.correct }));
    const theory = qs.filter(q => q.question_type === 'theory' && ratings[q.id]).map(q => ({ id: q.id, rating: ratings[q.id] }));
    await recordRound(pack.slug, label, objective, theory);
    await clearRound();
    setDone(true);
  }, [qs, pack, answers, ratings, label]);

  // The full-paper clock. Finishing when it runs out marks what was answered.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (mode !== 'paper' || !qs?.length || done) return;
    timer.current = setInterval(() => {
      leftRef.current = Math.max(0, leftRef.current - 1);
      setLeft(leftRef.current);
      if (leftRef.current === 0) {
        if (timer.current) { clearInterval(timer.current); timer.current = null; }
        finishRef.current();
      }
    }, 1000);
    return () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  }, [mode, qs, done]);

  if (!qs) return <View style={[s.center, { backgroundColor: C.bg }]}><ActivityIndicator color={C.primaryText} /></View>;
  if (qs.length === 0) {
    return (
      <View style={[s.center, { backgroundColor: C.bg }]}>
        <Text style={[s.body, { color: C.textSoft, textAlign: 'center' }]}>No questions to show here.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={[s.primary, { backgroundColor: C.primary, marginTop: 16 }]}>
          <Text style={s.primaryText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Results ────────────────────────────────────────────────────────────────
  if (done) {
    const obj = qs.filter(q => q.question_type === 'objective');
    const right = obj.filter(q => answers[q.id] === q.correct).length;
    const theory = qs.filter(q => q.question_type === 'theory');
    const got = theory.filter(q => ratings[q.id] === 'got').length;
    const pct = obj.length ? Math.round((right / obj.length) * 100) : 0;
    const skipped = obj.filter(q => !answers[q.id]).length;
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page}>
        <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border, alignItems: 'center' }]}>
          {obj.length > 0 ? (
            <>
              <Text style={[s.big, { color: C.text }]}>{right}/{obj.length}</Text>
              <Text style={[s.body, { color: C.textSoft }]}>{pct}% right{skipped > 0 ? `, ${skipped} not answered` : ''}</Text>
            </>
          ) : (
            <>
              <Text style={[s.big, { color: C.text }]}>{got}/{theory.length}</Text>
              <Text style={[s.body, { color: C.textSoft }]}>marked &quot;Got it&quot;, {theory.filter(q => ratings[q.id] === 'partly').length} partly</Text>
            </>
          )}
          <Text style={[s.small, { color: C.muted, marginTop: 6 }]}>Saved on this tablet.</Text>
        </View>

        {obj.length > 0 && <Text style={[s.section, { color: C.text }]}>Review</Text>}
        {obj.map((q, n) => {
          const mine = answers[q.id];
          const ok = mine === q.correct;
          return (
            <View key={q.id} style={[s.card, { backgroundColor: C.surface, borderColor: ok ? C.success : C.border }]}>
              <View style={s.reviewHead}>
                <Ionicons name={ok ? 'checkmark-circle' : mine ? 'close-circle' : 'remove-circle'} size={20} color={ok ? C.success : mine ? C.danger : C.muted} />
                <Text style={[s.small, { color: C.textSoft }]}>Question {q.question_no ?? n + 1}{q.year ? `, ${q.year}` : ''}</Text>
              </View>
              <QuestionBody text={q.question_text} images={questionImages(q)} placedElsewhere={q.marking_scheme} textStyle={[s.body, { color: C.text }]} imageHeight={160} />
              <Text style={[s.small, { color: C.textSoft }]}>
                {mine ? `Your answer: ${mine.toUpperCase()}. ${q.options[LETTERS.indexOf(mine)] || '(picture)'}` : 'Not answered'}
              </Text>
              {!ok && q.correct && (
                <Text style={[s.small, { color: C.success, fontWeight: '700' }]}>Answer: {q.correct.toUpperCase()}. {q.options[LETTERS.indexOf(q.correct)] || '(picture)'}</Text>
              )}
              {q.explanation && <Text style={[s.small, { color: C.textSoft }]}>{q.explanation}</Text>}
            </View>
          );
        })}
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={[s.primary, { backgroundColor: C.primary }]}>
          <Text style={s.primaryText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── A question ─────────────────────────────────────────────────────────────
  const q = qs[i];
  const last = i === qs.length - 1;
  const instant = mode === 'practice' || mode === 'retry';
  const chosen = answers[q.id];
  const revealed = instant && !!chosen;
  const pics = questionImages(q);
  const unanswered = qs.filter(x => x.question_type === 'objective' && !answers[x.id]).length;

  function next() { setShowScheme(false); setConfirmFinish(false); if (last) { finish(); } else setI(i + 1); }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.topBar, { borderColor: C.border, backgroundColor: C.surface }]}>
        <Text style={[s.small, { color: C.textSoft }]}>Question {i + 1} of {qs.length}{q.year ? `, ${q.year}` : ''}</Text>
        {mode === 'paper' && (
          <Text style={[s.timer, { color: left < 60 ? C.danger : C.text }]} accessibilityLabel={`${Math.ceil(left / 60)} minutes left`}>{mmss(left)}</Text>
        )}
      </View>
      <View style={[s.progressTrack, { backgroundColor: C.border }]}>
        <View style={[s.progressFill, { backgroundColor: C.primaryText, width: `${((i + 1) / qs.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={s.page}>
        <QuestionBody text={q.question_text} images={pics} placedElsewhere={q.marking_scheme} textStyle={[s.question, { color: C.text }]} />

        {q.question_type === 'objective' ? (
          <View style={{ gap: 10 }}>
            {q.options.map((opt, k) => {
              const letter = LETTERS[k];
              const isChosen = chosen === letter;
              const isRight = q.correct === letter;
              let border = C.border, bg = C.surface, fg = C.text;
              if (revealed && isRight) { border = C.success; bg = C.successLight; }
              else if (revealed && isChosen) { border = C.danger; bg = C.dangerLight; }
              else if (!revealed && isChosen) { border = C.primaryText; bg = C.primaryLight; }
              if (revealed && !isRight && !isChosen) fg = C.textSoft;
              return (
                <TouchableOpacity key={k} disabled={revealed} accessibilityRole="radio" accessibilityState={{ checked: isChosen }}
                  onPress={() => setAnswers(a => ({ ...a, [q.id]: letter }))}
                  style={[s.option, { borderColor: border, backgroundColor: bg }]}>
                  <Text style={[s.optLetter, { color: fg }]}>{letter.toUpperCase()}</Text>
                  <View style={{ flex: 1, gap: 6 }}>
                    {optionImage(q, k) && (
                      <Image source={{ uri: optionImage(q, k)! }} resizeMode="contain" accessibilityLabel={`Option ${letter.toUpperCase()} picture`}
                        style={{ width: '100%', height: 130, backgroundColor: '#FFFFFF', borderRadius: 8 }} />
                    )}
                    {!!opt && <Text style={[s.optText, { color: fg }]}>{opt}</Text>}
                  </View>
                  {revealed && isRight && <Ionicons name="checkmark-circle" size={22} color={C.success} />}
                  {revealed && isChosen && !isRight && <Ionicons name="close-circle" size={22} color={C.danger} />}
                </TouchableOpacity>
              );
            })}
            {revealed && (
              <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Text style={[s.body, { color: chosen === q.correct ? C.success : C.danger, fontWeight: '700' }]}>
                  {chosen === q.correct ? 'Correct' : `The answer is ${q.correct?.toUpperCase()}`}
                </Text>
                {q.explanation && <Text style={[s.body, { color: C.textSoft }]}>{q.explanation}</Text>}
              </View>
            )}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {!showScheme ? (
              <>
                <Text style={[s.body, { color: C.textSoft }]}>Write your answer on paper first.</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => setShowScheme(true)} style={[s.secondary, { borderColor: C.primaryText }]}>
                  <Text style={[s.secondaryText, { color: C.primaryText }]}>Show marking scheme</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <Text style={[s.small, { color: C.textSoft, fontWeight: '700' }]}>MARKING SCHEME</Text>
                  {q.marking_scheme
                    ? <QuestionBody text={q.marking_scheme} images={pics} showUnplaced={false} textStyle={[s.body, { color: C.text }]} />
                    : <Text style={[s.body, { color: C.text }]}>No marking scheme for this question.</Text>}
                </View>
                <Text style={[s.body, { color: C.text, fontWeight: '600' }]}>How did you do?</Text>
                <View style={s.rateRow}>
                  {([['got', 'Got it'], ['partly', 'Partly'], ['missed', 'Missed']] as const).map(([k, l]) => {
                    const on = ratings[q.id] === k;
                    return (
                      <TouchableOpacity key={k} accessibilityRole="radio" accessibilityState={{ checked: on }}
                        onPress={() => setRatings(r => ({ ...r, [q.id]: k }))}
                        style={[s.rate, { borderColor: on ? C.primaryText : C.border, backgroundColor: on ? C.primaryLight : C.surface }]}>
                        <Text style={[s.secondaryText, { color: on ? C.primaryText : C.text }]}>{l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[s.bottom, { borderColor: C.border, backgroundColor: C.surface }]}>
        {confirmFinish ? (
          <View style={{ gap: 8 }}>
            <Text style={[s.body, { color: C.text }]}>{unanswered} question{unanswered === 1 ? '' : 's'} not answered. Finish anyway?</Text>
            <View style={s.navRow}>
              <TouchableOpacity accessibilityRole="button" onPress={() => setConfirmFinish(false)} style={[s.secondary, { borderColor: C.border, flex: 1 }]}>
                <Text style={[s.secondaryText, { color: C.text }]}>Keep going</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={finish} style={[s.primary, { backgroundColor: C.primary, flex: 1 }]}>
                <Text style={s.primaryText}>Finish</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.navRow}>
            {mode === 'paper' && i > 0 && (
              <TouchableOpacity accessibilityRole="button" onPress={() => setI(i - 1)} style={[s.secondary, { borderColor: C.border, flex: 1 }]}>
                <Text style={[s.secondaryText, { color: C.text }]}>Previous</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity accessibilityRole="button"
              disabled={instant && !revealed}
              onPress={() => (mode === 'paper' && last && unanswered > 0 ? setConfirmFinish(true) : next())}
              style={[s.primary, { backgroundColor: C.primary, flex: 2, opacity: (instant && !revealed) ? 0.45 : 1 }]}>
              <Text style={s.primaryText}>
                {last ? (mode === 'paper' ? 'Finish paper' : 'See results') : (q.question_type === 'theory' && !ratings[q.id] ? 'Skip' : 'Next')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const s = createThemedStyles({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  page:          { padding: 16, gap: 14, paddingBottom: 32 },
  topBar:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  timer:         { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 4 },
  progressFill:  { height: 4 },
  question:      { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  image:         { width: '100%', height: 220, backgroundColor: '#FFFFFF', borderRadius: 12 },
  option:        { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5 },
  optLetter:     { fontSize: 16, fontWeight: '800', width: 20 },
  optText:       { fontSize: 16, flex: 1, lineHeight: 22 },
  card:          { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  body:          { fontSize: 15, lineHeight: 22 },
  small:         { fontSize: 13, lineHeight: 18 },
  big:           { fontSize: 40, fontWeight: '800' },
  section:       { fontSize: 17, fontWeight: '700', marginTop: 4 },
  reviewHead:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottom:        { padding: 12, borderTopWidth: 1 },
  navRow:        { flexDirection: 'row', gap: 10 },
  primary:       { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondary:     { minHeight: 50, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { fontSize: 16, fontWeight: '700' },
  rateRow:       { flexDirection: 'row', gap: 8 },
  rate:          { flex: 1, minHeight: 50, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
