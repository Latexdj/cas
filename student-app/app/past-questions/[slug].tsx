import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { EXAM_ORDER, examFilter, examName, loadSubject, paperTitle, type SubjectPack } from '@/lib/quizPack';
import { clearSubject, getProgress, type QuizProgress } from '@/lib/quizProgress';
import { RouteError } from '@/components/RouteError';

export { RouteError as ErrorBoundary };

const COUNTS = [10, 20, 40];
type IconName = keyof typeof Ionicons.glyphMap;

export default function SubjectScreen() {
  const C = useTheme();
  const nav = useNavigation();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ slug: string; exam?: string }>();
  const slug = params.slug;
  const [pack, setPack] = useState<SubjectPack | null | undefined>(undefined);
  const [progress, setProgress] = useState<QuizProgress | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [count, setCount] = useState(20);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exam, setExam] = useState<string | null>(params.exam || null);

  useEffect(() => {
    loadSubject(String(slug)).then(p => {
      setPack(p);
      if (p) nav.setOptions({ title: p.subject });
    });
  }, [slug, nav]);
  useFocusEffect(useCallback(() => { getProgress().then(setProgress); }, []));

  // The exams this subject has papers for; an exam that no longer exists falls back to all.
  const exams = useMemo(() => EXAM_ORDER.filter(e => pack?.papers.some(p => p.exam === e)), [pack]);
  const activeExam = exam && exams.includes(exam) ? exam : null;

  const stats = useMemo(() => {
    if (!pack || !progress) return null;
    const inExam = examFilter(pack, activeExam);
    const qs = pack.questions.filter(inExam);
    const obj = qs.filter(q => q.question_type === 'objective');
    const theory = qs.filter(q => q.question_type === 'theory');
    const done = obj.filter(q => progress.objective[q.id]);
    return {
      obj, theory,
      done: done.length,
      right: done.filter(q => progress.objective[q.id].ok).length,
      wrong: obj.filter(q => progress.objective[q.id] && !progress.objective[q.id].ok).length,
      theoryDone: theory.filter(q => progress.theory[q.id]).length,
      years: [...new Set(qs.map(q => q.year).filter((y): y is number => y != null))].sort((a, b) => b - a),
      sessions: progress.sessions.filter(x => x.slug === pack.slug).slice(0, 5),
    };
  }, [pack, progress, activeExam]);

  if (pack === undefined || !stats) {
    return <View style={[s.center, { backgroundColor: C.bg }]}><ActivityIndicator color={C.primaryText} /></View>;
  }
  if (pack === null) {
    return <View style={[s.center, { backgroundColor: C.bg }]}><Text style={{ color: C.textSoft }}>This subject is no longer on the tablet.</Text></View>;
  }

  const go = (extra: Record<string, string>) => router.push({ pathname: '/past-questions/play', params: { slug: pack.slug, ...(activeExam ? { exam: activeExam } : {}), ...extra } });
  const inExam = examFilter(pack, activeExam);
  const inYear = (t: 'objective' | 'theory') => pack.questions.filter(q => inExam(q) && q.question_type === t && (year == null || q.year === year)).length;
  const papers = pack.papers
    .filter(p => !activeExam || p.exam === activeExam)
    .map(p => ({ ...p, n: pack.questions.filter(q => q.paper_id === p.id && q.question_type === 'objective').length }))
    .filter(p => p.n > 0)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || String(a.paper_label).localeCompare(String(b.paper_label)));
  const shownPapers = papers.slice(0, 3);
  const wide = width >= 700;
  const pctRight = stats.done ? Math.round((stats.right / stats.done) * 100) : null;
  const objInYear = inYear('objective');
  const theoryInYear = inYear('theory');

  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[s.chip, { borderColor: on ? C.primaryText : C.border, backgroundColor: on ? C.primaryLight : 'transparent' }]}>
      <Text style={[s.chipText, { color: on ? C.primaryText : C.textSoft }]}>{label}</Text>
    </Pressable>
  );
  const ModeHead = ({ icon, title, sub }: { icon: IconName; title: string; sub: string }) => (
    <View style={s.modeHead}>
      <View style={[s.modeIcon, { backgroundColor: C.primaryLight }]}><Ionicons name={icon} size={22} color={C.primaryText} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.modeTitle, { color: C.text }]}>{title}</Text>
        <Text style={[s.modeSub, { color: C.textSoft }]}>{sub}</Text>
      </View>
    </View>
  );
  const Primary = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [s.primary, { backgroundColor: C.primary, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }]}>
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
  const card = [s.card, { backgroundColor: C.surface, borderColor: C.border }];

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page}>
      {exams.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipRow} accessibilityRole="radiogroup" accessibilityLabel="Exam">
          <Chip on={!activeExam} label="All exams" onPress={() => { setExam(null); setYear(null); }} />
          {exams.map(e => <Chip key={e} on={activeExam === e} label={examName(e)} onPress={() => { setExam(e); setYear(null); }} />)}
        </ScrollView>
      )}

      {/* How far the student has got */}
      <View style={card}>
        <View style={s.summaryRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryBig, { color: C.text }]}>{stats.done} of {stats.obj.length}</Text>
            <Text style={[s.modeSub, { color: C.textSoft }]}>objective questions tried</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.summaryBig, { color: pctRight == null ? C.muted : C.text }]}>{pctRight == null ? 'None' : `${pctRight}%`}</Text>
            <Text style={[s.modeSub, { color: C.textSoft }]}>right last time</Text>
          </View>
        </View>
        <View style={[s.track, { backgroundColor: C.border }]}>
          <View style={[s.fill, { width: `${stats.obj.length ? (stats.done / stats.obj.length) * 100 : 0}%`, backgroundColor: C.primaryText }]} />
        </View>
        {stats.theory.length > 0 && (
          <Text style={[s.modeSub, { color: C.textSoft }]}>Theory: {stats.theoryDone} of {stats.theory.length} marked</Text>
        )}
      </View>

      <View style={[s.modes, wide && { flexDirection: 'row', flexWrap: 'wrap' }]}>
        {stats.obj.length > 0 && (
          <View style={[card, wide && s.half]}>
            <ModeHead icon="flash-outline" title="Practice" sub="Mixed questions, marked straight away with the explanation." />
            {stats.years.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipRow} accessibilityLabel="Year">
                <Chip on={year == null} label="All years" onPress={() => setYear(null)} />
                {stats.years.map(y => <Chip key={y} on={year === y} label={String(y)} onPress={() => setYear(y)} />)}
              </ScrollView>
            )}
            <View style={s.chips}>
              {COUNTS.map(n => <Chip key={n} on={count === n} label={`${n} questions`} onPress={() => setCount(n)} />)}
            </View>
            <Primary label={objInYear ? `Start ${Math.min(count, objInYear)} questions` : 'No objective questions for this year'} disabled={!objInYear}
              onPress={() => go({ mode: 'practice', count: String(count), ...(year != null ? { year: String(year) } : {}) })} />
          </View>
        )}

        {papers.length > 0 && (
          <View style={[card, wide && s.half]}>
            <ModeHead icon="time-outline" title="Full paper" sub="Like the real exam: one minute a question, marked at the end." />
            {shownPapers.map(p => (
              <Pressable key={p.id} onPress={() => go({ mode: 'paper', paperId: p.id })} accessibilityRole="button"
                style={({ pressed }) => [s.paperRow, { borderColor: C.border, opacity: pressed ? 0.8 : 1 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.paperTitle, { color: C.text }]}>{paperTitle(p)}</Text>
                  <Text style={[s.modeSub, { color: C.textSoft }]}>{p.n} questions, {p.n} minutes</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={C.muted} />
              </Pressable>
            ))}
            {papers.length > shownPapers.length && (
              <Pressable accessibilityRole="button"
                onPress={() => router.push({ pathname: '/past-questions/papers', params: { slug: pack.slug, ...(activeExam ? { exam: activeExam } : {}) } })}
                style={({ pressed }) => [s.paperRow, { borderColor: C.border, opacity: pressed ? 0.8 : 1 }]}>
                <Text style={[s.paperTitle, { color: C.primaryText, flex: 1 }]}>Show all {papers.length} papers</Text>
                <Ionicons name="chevron-forward" size={20} color={C.primaryText} />
              </Pressable>
            )}
          </View>
        )}

        {stats.theory.length > 0 && (
          <View style={[card, wide && s.half]}>
            <ModeHead icon="create-outline" title="Theory" sub="Write your answer on paper, then mark yourself against the marking scheme." />
            <Primary label={theoryInYear ? `Start ${theoryInYear} theory question${theoryInYear === 1 ? '' : 's'}` : 'No theory for this year'}
              disabled={!theoryInYear} onPress={() => go({ mode: 'theory', ...(year != null ? { year: String(year) } : {}) })} />
          </View>
        )}

        {stats.wrong > 0 && (
          <View style={[card, wide && s.half]}>
            <ModeHead icon="refresh-outline" title="Retry my mistakes"
              sub={`${stats.wrong} question${stats.wrong === 1 ? '' : 's'} you got wrong last time.`} />
            <Primary label="Retry" onPress={() => go({ mode: 'retry' })} />
          </View>
        )}
      </View>

      {stats.sessions.length > 0 && (
        <View style={card}>
          <Text style={[s.modeTitle, { color: C.text }]}>Recent rounds</Text>
          {stats.sessions.map(x => (
            <View key={x.at} style={[s.sessionRow, { borderColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.sessionLabel, { color: C.text }]}>{x.label}</Text>
                <Text style={[s.modeSub, { color: C.muted }]}>{new Date(x.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
              </View>
              <Text style={[s.sessionScore, { color: C.text }]}>{x.score}/{x.total}</Text>
            </View>
          ))}
          {confirmClear ? (
            <View style={{ gap: 10 }}>
              <Text style={[s.modeSub, { color: C.text }]}>Forget your answers for {pack.subject} on this tablet?</Text>
              <View style={s.chips}>
                <Pressable accessibilityRole="button" style={[s.chip, { borderColor: C.danger }]}
                  onPress={async () => { await clearSubject(pack.slug, pack.questions.map(q => q.id)); setConfirmClear(false); setProgress(await getProgress()); }}>
                  <Text style={[s.chipText, { color: C.danger }]}>Clear progress</Text>
                </Pressable>
                <Chip on={false} label="Cancel" onPress={() => setConfirmClear(false)} />
              </View>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setConfirmClear(true)} style={s.clearLink}>
              <Text style={[s.chipText, { color: C.danger }]}>Clear progress</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const s = createThemedStyles({
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  page:         { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 16 },
  card:         { padding: 18, borderRadius: 16, borderWidth: 1, gap: 14 },
  half:         { width: '48.5%' },
  modes:        { gap: 16, justifyContent: 'space-between' },
  summaryRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  summaryBig:   { fontSize: 26, fontWeight: '800' },
  track:        { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill:         { height: 8, borderRadius: 4 },
  modeHead:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeIcon:     { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modeTitle:    { fontSize: 17, fontWeight: '700' },
  modeSub:      { fontSize: 14, lineHeight: 20 },
  chips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  chipScroll:   { flexGrow: 0, flexShrink: 0 },
  chip:         { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  chipText:     { fontSize: 14, fontWeight: '600' },
  primary:      { minHeight: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText:  { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  paperRow:     { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingVertical: 12, minHeight: 60 },
  paperTitle:   { fontSize: 15, fontWeight: '700' },
  sessionRow:   { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingVertical: 10 },
  sessionLabel: { fontSize: 15, fontWeight: '600' },
  sessionScore: { fontSize: 16, fontWeight: '800' },
  clearLink:    { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
