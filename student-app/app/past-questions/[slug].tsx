import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { loadSubject, paperTitle, type SubjectPack } from '@/lib/quizPack';
import { clearSubject, getProgress, type QuizProgress } from '@/lib/quizProgress';

const COUNTS = [10, 20, 40];

export default function SubjectScreen() {
  const C = useTheme();
  const nav = useNavigation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [pack, setPack] = useState<SubjectPack | null | undefined>(undefined);
  const [progress, setProgress] = useState<QuizProgress | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [count, setCount] = useState(20);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    loadSubject(String(slug)).then(p => {
      setPack(p);
      if (p) nav.setOptions({ title: p.subject });
    });
  }, [slug, nav]);
  useFocusEffect(useCallback(() => { getProgress().then(setProgress); }, []));

  const stats = useMemo(() => {
    if (!pack || !progress) return null;
    const obj = pack.questions.filter(q => q.question_type === 'objective');
    const theory = pack.questions.filter(q => q.question_type === 'theory');
    const done = obj.filter(q => progress.objective[q.id]);
    return {
      obj, theory,
      done: done.length,
      right: done.filter(q => progress.objective[q.id].ok).length,
      wrong: obj.filter(q => progress.objective[q.id] && !progress.objective[q.id].ok).length,
      theoryDone: theory.filter(q => progress.theory[q.id]).length,
      years: [...new Set(pack.questions.map(q => q.year).filter((y): y is number => y != null))].sort((a, b) => b - a),
      sessions: progress.sessions.filter(x => x.slug === pack.slug).slice(0, 5),
    };
  }, [pack, progress]);

  if (pack === undefined || !stats) {
    return <View style={[s.center, { backgroundColor: C.bg }]}><ActivityIndicator color={C.primaryText} /></View>;
  }
  if (pack === null) {
    return <View style={[s.center, { backgroundColor: C.bg }]}><Text style={{ color: C.textSoft }}>This subject is no longer on the tablet.</Text></View>;
  }

  const go = (params: Record<string, string>) => router.push({ pathname: '/past-questions/play', params: { slug: pack.slug, ...params } });
  const inYear = (t: 'objective' | 'theory') => pack.questions.filter(q => q.question_type === t && (year == null || q.year === year)).length;
  const papers = pack.papers
    .map(p => ({ ...p, n: pack.questions.filter(q => q.paper_id === p.id && q.question_type === 'objective').length }))
    .filter(p => p.n > 0);

  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[s.chip, { borderColor: on ? C.primaryText : C.border, backgroundColor: on ? C.primaryLight : 'transparent' }]}>
      <Text style={[s.chipText, { color: on ? C.primaryText : C.textSoft }]}>{label}</Text>
    </TouchableOpacity>
  );
  const Card = ({ children }: { children: React.ReactNode }) => (
    <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>{children}</View>
  );
  const Primary = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={[s.primary, { backgroundColor: C.primary, opacity: disabled ? 0.45 : 1 }]}>
      <Text style={s.primaryText}>{label}</Text>
    </TouchableOpacity>
  );

  const objInYear = inYear('objective');
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page}>
      <View style={s.statRow}>
        <View style={[s.stat, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[s.statNum, { color: C.text }]}>{stats.done}/{stats.obj.length}</Text>
          <Text style={[s.statLabel, { color: C.textSoft }]}>objectives tried</Text>
        </View>
        <View style={[s.stat, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[s.statNum, { color: C.text }]}>{stats.done ? Math.round((stats.right / stats.done) * 100) : 0}%</Text>
          <Text style={[s.statLabel, { color: C.textSoft }]}>right last time</Text>
        </View>
      </View>

      {stats.obj.length > 0 && (
        <Card>
          <Text style={[s.cardTitle, { color: C.text }]}>Practice</Text>
          <Text style={[s.cardSub, { color: C.textSoft }]}>Mixed objectives. Each answer is marked straight away with the explanation.</Text>
          {stats.years.length > 1 && (
            <View style={s.chips}>
              <Chip on={year == null} label="All years" onPress={() => setYear(null)} />
              {stats.years.map(y => <Chip key={y} on={year === y} label={String(y)} onPress={() => setYear(y)} />)}
            </View>
          )}
          <View style={s.chips}>
            {COUNTS.map(n => <Chip key={n} on={count === n} label={`${n} questions`} onPress={() => setCount(n)} />)}
          </View>
          <Primary label={objInYear ? `Start (${Math.min(count, objInYear)} questions)` : 'No objectives for this year'} disabled={!objInYear}
            onPress={() => go({ mode: 'practice', count: String(count), ...(year != null ? { year: String(year) } : {}) })} />
        </Card>
      )}

      {papers.length > 0 && (
        <Card>
          <Text style={[s.cardTitle, { color: C.text }]}>Full paper</Text>
          <Text style={[s.cardSub, { color: C.textSoft }]}>Like the real exam: timed, one minute a question, marked at the end.</Text>
          {papers.map(p => (
            <TouchableOpacity key={p.id} onPress={() => go({ mode: 'paper', paperId: p.id })} accessibilityRole="button"
              style={[s.paperRow, { borderColor: C.border }]}>
              <Text style={[s.paperTitle, { color: C.text }]}>{paperTitle(p)}</Text>
              <Text style={[s.paperSub, { color: C.textSoft }]}>{p.n} questions · {p.n} min</Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {stats.theory.length > 0 && (
        <Card>
          <Text style={[s.cardTitle, { color: C.text }]}>Theory</Text>
          <Text style={[s.cardSub, { color: C.textSoft }]}>
            Write your answer on paper, then compare it with the marking scheme and mark yourself. {stats.theoryDone} of {stats.theory.length} done.
          </Text>
          <Primary label={inYear('theory') ? `Start theory (${inYear('theory')})` : 'No theory for this year'} disabled={!inYear('theory')}
            onPress={() => go({ mode: 'theory', ...(year != null ? { year: String(year) } : {}) })} />
        </Card>
      )}

      {stats.wrong > 0 && (
        <Card>
          <Text style={[s.cardTitle, { color: C.text }]}>Retry my mistakes</Text>
          <Text style={[s.cardSub, { color: C.textSoft }]}>{stats.wrong} question{stats.wrong === 1 ? '' : 's'} you got wrong last time.</Text>
          <Primary label="Retry" onPress={() => go({ mode: 'retry' })} />
        </Card>
      )}

      {stats.sessions.length > 0 && (
        <Card>
          <Text style={[s.cardTitle, { color: C.text }]}>Recent rounds</Text>
          {stats.sessions.map(x => (
            <View key={x.at} style={s.sessionRow}>
              <Text style={[s.sessionLabel, { color: C.textSoft }]}>{x.label} · {new Date(x.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
              <Text style={[s.sessionScore, { color: C.text }]}>{x.score}/{x.total}</Text>
            </View>
          ))}
          {confirmClear ? (
            <View style={s.confirm}>
              <Text style={[s.cardSub, { color: C.text }]}>Forget your answers for {pack.subject} on this tablet?</Text>
              <View style={s.chips}>
                <TouchableOpacity accessibilityRole="button" style={[s.chip, { borderColor: C.danger }]}
                  onPress={async () => { await clearSubject(pack.slug, pack.questions.map(q => q.id)); setConfirmClear(false); setProgress(await getProgress()); }}>
                  <Text style={[s.chipText, { color: C.danger }]}>Clear progress</Text>
                </TouchableOpacity>
                <Chip on={false} label="Cancel" onPress={() => setConfirmClear(false)} />
              </View>
            </View>
          ) : (
            <TouchableOpacity accessibilityRole="button" onPress={() => setConfirmClear(true)} style={s.clearLink}>
              <Text style={[s.chipText, { color: C.danger }]}>Clear progress</Text>
            </TouchableOpacity>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const s = createThemedStyles({
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  page:         { padding: 16, gap: 12, paddingBottom: 40 },
  statRow:      { flexDirection: 'row', gap: 10 },
  stat:         { flex: 1, padding: 14, borderRadius: 16, borderWidth: 1 },
  statNum:      { fontSize: 22, fontWeight: '800' },
  statLabel:    { fontSize: 13, marginTop: 2 },
  card:         { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
  cardTitle:    { fontSize: 17, fontWeight: '700' },
  cardSub:      { fontSize: 14, lineHeight: 20 },
  chips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  chipText:     { fontSize: 14, fontWeight: '600' },
  primary:      { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText:  { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  paperRow:     { borderTopWidth: 1, paddingVertical: 12, minHeight: 56 },
  paperTitle:   { fontSize: 15, fontWeight: '600' },
  paperSub:     { fontSize: 13, marginTop: 2 },
  sessionRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  sessionLabel: { fontSize: 14, flex: 1 },
  sessionScore: { fontSize: 14, fontWeight: '700' },
  confirm:      { gap: 8 },
  clearLink:    { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
