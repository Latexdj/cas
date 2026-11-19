// One game: choose a subject (quiz games) or trade (CTVET games), play, then
// see the score, personal best and this week's leaderboard.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { formatScore, gameByKey, lessonNow, loadSchedule, recordPlay, shuffle } from '@/lib/games';
import { ctvetPools, pastQuestionPools, pickLadder, type ClimbPools, type ClimbQ } from '@/lib/climbQuestions';
import CediClimb from '@/components/games/CediClimb';
import { TRADES } from '@/lib/gameContent';
import { examFilter, loadSubject, localManifest, type PackQuestion, type PackSubjectInfo } from '@/lib/quizPack';
import QuizRace from '@/components/games/QuizRace';
import MatchPairs from '@/components/games/MatchPairs';
import OrderSteps from '@/components/games/OrderSteps';
import Leaderboard from '@/components/games/Leaderboard';

type Round =
  | { type: 'quiz'; questions: PackQuestion[] }
  | { type: 'match'; pairs: [string, string][] }
  | { type: 'order'; procedures: { title: string; steps: string[] }[] }
  | { type: 'climb'; ladder: ClimbQ[]; spares: ClimbPools };

// Objective past questions the quiz can mark: an answer and at least two choices.
// Questions that need shared information are left out: a game shows one question alone.
const playable = (q: PackQuestion) => q.question_type === 'objective' && !!q.correct && !q.group_id && q.options.filter(o => o !== null).length >= 2;

export default function GameScreen() {
  const C = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const game = gameByKey(String(key));
  const [subjects, setSubjects] = useState<PackSubjectInfo[] | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [result, setResult] = useState<{ score: number; best: number; newBest: boolean; line: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [plays, setPlays] = useState(0);

  useEffect(() => {
    if (game?.type === 'quiz' || (game?.type === 'climb' && game.exam)) localManifest().then(m => setSubjects(m?.subjects ?? [])).catch(() => setSubjects([]));
    if (game?.type === 'climb') setChoice('all');   // every subject
  }, [game?.type, game?.exam]);

  const start = useCallback(async () => {
    if (!game || !choice) return;
    setMsg(''); setBusy(true);
    try {
      const lock = lessonNow(await loadSchedule());
      if (lock.locked) { setMsg(`Games are closed during lessons. They open again at ${lock.until}.`); return; }
      if (game.type === 'climb') {
        const src = game.exam ? await pastQuestionPools(game.exam as 'BECE' | 'WASSCE') : ctvetPools();
        const picked = pickLadder(src.pools);
        if (!picked) { setMsg(`There are not enough ${game.exam ?? ''} objective questions on this device yet for a full climb. Open Past Questions and get more subjects.`); return; }
        setRound({ type: 'climb', ladder: picked.ladder, spares: picked.spares });
      } else if (game.type === 'quiz') {
        const pack = await loadSubject(choice);
        if (!pack) { setMsg('That subject is not on this device yet. Open Past Questions to download it.'); return; }
        const inExam = examFilter(pack, game.exam);
        const pool = pack.questions.filter(q => inExam(q) && playable(q));
        if (pool.length < 5) { setMsg(`There are not enough ${game.exam} objective questions in ${pack.subject} yet. Choose another subject.`); return; }
        setRound({ type: 'quiz', questions: shuffle(pool).slice(0, 10) });
      } else {
        const trade = TRADES.find(t => t.key === choice)!;
        if (game.type === 'match') setRound({ type: 'match', pairs: shuffle(trade.tools).slice(0, 6) });
        else setRound({ type: 'order', procedures: shuffle(trade.procedures).slice(0, 2) });
      }
      setResult(null);
    } finally { setBusy(false); }
  }, [game, choice]);

  async function finish(score: number, line: string) {
    const r = await recordPlay(game!.key, score);
    setResult({ score, best: r.best, newBest: r.newBest, line });
    setRound(null); setPlays(p => p + 1);
  }

  if (!game) return <View style={[s.center, { backgroundColor: C.bg }]}><Text style={{ color: C.text }}>That game was not found.</Text></View>;

  // ── Playing ──
  if (round) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ title: game.title }} />
        {round.type === 'quiz' && <QuizRace questions={round.questions} onFinish={(sc, d) => finish(sc, `${d.correct} of ${d.total} correct`)} />}
        {round.type === 'match' && <MatchPairs pairs={round.pairs} onFinish={(sc, d) => finish(sc, `${d.misses} miss${d.misses === 1 ? '' : 'es'}, ${d.seconds} seconds`)} />}
        {round.type === 'order' && <OrderSteps procedures={round.procedures} onFinish={(sc, d) => finish(sc, `${d.firstTry} of ${d.jobs} right first time`)} />}
        {round.type === 'climb' && <CediClimb ladder={round.ladder} spares={round.spares}
          onFinish={(won, d) => finish(won, d.answered === 15 ? 'All 15 questions answered' : d.walked ? `Walked away after ${d.answered} question${d.answered === 1 ? '' : 's'}` : `${d.answered} question${d.answered === 1 ? '' : 's'} answered`)} />}
      </View>
    );
  }

  // ── Choosing (and the result of the last game) ──
  const options = game.type === 'quiz'
    ? (subjects ?? []).map(sub => ({ key: sub.slug, label: sub.name }))
    : TRADES.map(t => ({ key: t.key, label: t.name }));

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page}>
      <Stack.Screen options={{ title: game.title }} />
      {result ? (
        <View style={[s.result, { backgroundColor: C.surface, borderColor: result.newBest ? C.accent : C.border }]}>
          <Text style={[s.resultLabel, { color: C.textSoft }]}>{result.newBest ? 'New personal best' : 'Your score'}</Text>
          <Text style={[s.resultScore, { color: C.text }]}>{formatScore(game.key, result.score)}</Text>
          <Text style={[s.resultLine, { color: C.textSoft }]}>{result.line}. Your best: {formatScore(game.key, result.best)}.</Text>
        </View>
      ) : (
        <Text style={[s.blurb, { color: C.textSoft }]}>{game.blurb}</Text>
      )}

      {game.type === 'climb' ? (
        game.exam && subjects !== null && !subjects.length ? (
          <View style={[s.empty, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.blurb, { color: C.text }]}>This game uses the past questions on this device, and none are downloaded yet.</Text>
            <TouchableOpacity onPress={() => router.push('/past-questions')} accessibilityRole="button" style={[s.secondary, { borderColor: C.borderStrong }]}>
              <Text style={[s.secondaryText, { color: C.text }]}>Get past questions</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[s.blurb, { color: C.text }]}>
            {game.exam
              ? `Questions come from the ${game.exam} past questions of every subject on this device${subjects?.length ? ` (${subjects.length} subject${subjects.length === 1 ? '' : 's'})` : ''}, easy at the bottom and hard at the top.`
              : 'Questions come from the tools and procedures of all seven trades, easy at the bottom and hard at the top.'}
          </Text>
        )
      ) : (<>
      <Text style={[s.label, { color: C.text }]}>{game.type === 'quiz' ? 'Choose a subject' : 'Choose your trade'}</Text>
      {game.type === 'quiz' && subjects === null ? <ActivityIndicator color={C.primaryText} /> :
        game.type === 'quiz' && !subjects?.length ? (
          <View style={[s.empty, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.blurb, { color: C.text }]}>This game uses the past questions on this device, and none are downloaded yet.</Text>
            <TouchableOpacity onPress={() => router.push('/past-questions')} accessibilityRole="button" style={[s.secondary, { borderColor: C.borderStrong }]}>
              <Text style={[s.secondaryText, { color: C.text }]}>Get past questions</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.chips}>
            {options.map(o => (
              <TouchableOpacity key={o.key} onPress={() => setChoice(o.key)} accessibilityRole="radio" accessibilityState={{ checked: choice === o.key }}
                style={[s.chip, { borderColor: choice === o.key ? C.primaryText : C.border, backgroundColor: choice === o.key ? C.primaryLight : C.surface }]}>
                <Text style={[s.chipText, { color: choice === o.key ? C.primaryText : C.text }]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </>)}

      {!!msg && <Text style={[s.msg, { color: C.danger }]} accessibilityRole="alert">{msg}</Text>}
      <TouchableOpacity onPress={start} disabled={!choice || busy} accessibilityRole="button"
        style={[s.primary, { backgroundColor: C.primary, opacity: !choice || busy ? 0.5 : 1 }]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : (
          <>
            <Ionicons name="play" size={18} color="#FFFFFF" />
            <Text style={s.primaryText}>{result ? 'Play again' : 'Start'}</Text>
          </>
        )}
      </TouchableOpacity>

      <Leaderboard game={game.key} refreshKey={plays} />
    </ScrollView>
  );
}

const s = createThemedStyles({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  blurb: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 15, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  empty: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  msg: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  primary: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, alignSelf: 'flex-start', paddingHorizontal: 14 },
  secondaryText: { fontSize: 15, fontWeight: '700' },
  result: { borderWidth: 2, borderRadius: 18, padding: 18, alignItems: 'center', gap: 4 },
  resultLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  resultScore: { fontSize: 44, fontWeight: '900', fontVariant: ['tabular-nums'] },
  resultLine: { fontSize: 14, textAlign: 'center' },
});
