// Cedi Climb: 15 questions up a ladder of cedi prizes. A wrong answer drops you
// to the last safe level you passed (question 5 and question 10); you may walk
// away with what you have at any time. Three helps, each once: Drop two,
// Swap, Second chance.
import React, { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { QuestionBody } from '@/components/QuestionBody';
import { bandFor, type ClimbPools, type ClimbQ } from '@/lib/climbQuestions';

export const LADDER = [50, 100, 200, 400, 800, 1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 400000, 750000];
const SAFE = new Set([4, 9]);   // question 5 and question 10
export const cedis = (n: number) => `GH₵ ${n.toLocaleString('en-GB')}`;
const secondsFor = (n: number) => (n < 5 ? 30 : n < 10 ? 45 : 60);
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** What a player keeps after a wrong answer on question n (0-based). */
const safeAmount = (n: number) => (n > 9 ? LADDER[9] : n > 4 ? LADDER[4] : 0);

export default function CediClimb({ ladder, spares, onFinish }: {
  ladder: ClimbQ[];
  spares: ClimbPools;
  onFinish: (won: number, detail: { answered: number; walked: boolean; won: number }) => void;
}) {
  const C = useTheme();
  const [n, setN] = useState(0);
  const [q, setQ] = useState<ClimbQ>(ladder[0]);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [tried, setTried] = useState<Set<number>>(new Set());
  const [used, setUsed] = useState({ drop: false, swap: false, second: false });
  const [secondArmed, setSecondArmed] = useState(false);
  const [state, setState] = useState<'asking' | 'right' | 'wrong' | 'timeout'>('asking');
  const [left, setLeft] = useState(secondsFor(0));
  const [confirmWalk, setConfirmWalk] = useState(false);
  const [showLadder, setShowLadder] = useState(false);
  const [note, setNote] = useState('');
  const pool = useRef<ClimbPools>({ easy: [...spares.easy], medium: [...spares.medium], hard: [...spares.hard] });
  const scroll = useRef<ScrollView>(null);
  const banked = n > 0 ? LADDER[n - 1] : 0;

  useEffect(() => {
    if (state !== 'asking' || confirmWalk) return;
    if (left <= 0) { setState('timeout'); return; }
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, state, confirmWalk]);

  function pick(i: number) {
    if (state !== 'asking' || removed.has(i) || tried.has(i)) return;
    setConfirmWalk(false);
    if (i === q.correct) { setState('right'); setNote(''); return; }
    if (secondArmed) {
      setSecondArmed(false);
      setTried(new Set(tried).add(i));
      setNote(`${LETTERS[i]} is not right. Your second chance is used; choose again.`);
      return;
    }
    setTried(new Set(tried).add(i));
    setState('wrong');
  }
  function drop() {
    if (used.drop || state !== 'asking') return;
    const wrong = q.options.map((_, i) => i).filter(i => i !== q.correct && !tried.has(i));
    const go = wrong.sort(() => Math.random() - 0.5).slice(0, 2);
    setRemoved(new Set([...removed, ...go])); setUsed(u => ({ ...u, drop: true }));
  }
  function swap() {
    if (used.swap || state !== 'asking') return;
    const band = bandFor(n);
    const list = pool.current[band].length ? pool.current[band] : pool.current.medium.length ? pool.current.medium : pool.current.easy;
    const next = list.shift();
    if (!next) { setNote('There is no other question to swap in.'); return; }
    setQ({ ...next, band }); setRemoved(new Set()); setTried(new Set()); setSecondArmed(false);
    setLeft(secondsFor(n)); setUsed(u => ({ ...u, swap: true })); setNote('New question.');
  }
  function second() {
    if (used.second || state !== 'asking') return;
    setSecondArmed(true); setUsed(u => ({ ...u, second: true }));
    setNote('Second chance is on: if your first answer is wrong, you can try again.');
  }
  function next() {
    if (n === LADDER.length - 1) { onFinish(LADDER[n], { answered: 15, walked: false, won: LADDER[n] }); return; }
    const m = n + 1;
    setN(m); setQ(ladder[m]); setRemoved(new Set()); setTried(new Set()); setSecondArmed(false);
    setState('asking'); setLeft(secondsFor(m)); setNote('');
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  const finishLost = () => onFinish(safeAmount(n), { answered: n, walked: false, won: safeAmount(n) });

  const helps: { key: keyof typeof used; label: string; icon: keyof typeof Ionicons.glyphMap; run: () => void }[] = [
    { key: 'drop', label: 'Drop two', icon: 'remove-circle-outline', run: drop },
    { key: 'swap', label: 'Swap', icon: 'swap-horizontal-outline', run: swap },
    { key: 'second', label: 'Second chance', icon: 'refresh-outline', run: second },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* Where you are on the ladder */}
      <View style={[s.top, { backgroundColor: C.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.topLabel}>Question {n + 1} of 15{SAFE.has(n) ? ', a safe level' : ''}</Text>
          <Text style={s.topPrize}>For {cedis(LADDER[n])}</Text>
          <Text style={s.topSub}>You have {cedis(banked)}. If wrong, you keep {cedis(safeAmount(n))}.</Text>
        </View>
        {state === 'asking' && (
          <View style={s.clock} accessibilityLabel={`${left} seconds left`}>
            <Text style={[s.clockText, { color: left <= 5 ? '#FFD2C9' : '#FFFFFF' }]}>{left}</Text>
            <Text style={s.clockUnit}>sec</Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={() => setShowLadder(v => !v)} accessibilityRole="button" style={[s.ladderToggle, { borderColor: C.border, backgroundColor: C.surface }]}>
        <Text style={[s.ladderToggleText, { color: C.primaryText }]}>{showLadder ? 'Hide the ladder' : 'See the ladder'}</Text>
        <Ionicons name={showLadder ? 'chevron-up' : 'chevron-down'} size={18} color={C.primaryText} />
      </TouchableOpacity>
      {showLadder && (
        <View style={[s.ladder, { backgroundColor: C.surface, borderColor: C.border }]}>
          {[...LADDER].map((v, i) => ({ v, i })).reverse().map(({ v, i }) => (
            <View key={i} style={[s.rung, i === n && { backgroundColor: C.primaryLight }]}>
              <Text style={[s.rungNo, { color: C.textSoft }]}>{i + 1}</Text>
              <Text style={[s.rungValue, { color: i < n ? C.success : C.text, fontWeight: SAFE.has(i) || i === n ? '800' : '500' }]}>{cedis(v)}</Text>
              {SAFE.has(i) && <Text style={[s.safeTag, { color: C.accent }]}>SAFE</Text>}
              {i < n && <Ionicons name="checkmark" size={16} color={C.success} />}
            </View>
          ))}
        </View>
      )}

      <ScrollView ref={scroll} contentContainerStyle={s.page}>
        <Text style={[s.subject, { color: C.textSoft }]}>{q.subject}{q.source ? `, ${q.source}` : ''}</Text>
        <QuestionBody text={q.text} images={q.images} textStyle={[s.question, { color: C.text }]} imageHeight={170} />
        <View style={{ gap: 10 }}>
          {q.options.map((opt, i) => {
            if (removed.has(i)) return <View key={i} style={[s.option, s.gone, { borderColor: C.border }]}><Text style={[s.letter, { color: C.muted }]}>{LETTERS[i]}</Text></View>;
            const reveal = state !== 'asking';
            const isRight = i === q.correct, wasTried = tried.has(i);
            let border = C.border, bg = C.surface, fg = C.text;
            if (reveal && isRight) { border = C.success; bg = C.successLight; }
            else if (wasTried) { border = C.danger; bg = C.dangerLight; fg = C.textSoft; }
            return (
              <TouchableOpacity key={i} disabled={reveal || wasTried} onPress={() => pick(i)} accessibilityRole="button"
                accessibilityLabel={`${LETTERS[i]}: ${opt || 'picture'}`} style={[s.option, { borderColor: border, backgroundColor: bg }]}>
                <Text style={[s.letter, { color: fg }]}>{LETTERS[i]}</Text>
                <View style={{ flex: 1, gap: 6 }}>
                  {q.optionImages[i] && (
                    <Image source={{ uri: q.optionImages[i]! }} resizeMode="contain" accessibilityLabel={`Option ${LETTERS[i]} picture`}
                      style={{ width: '100%', height: 110, backgroundColor: '#FFFFFF', borderRadius: 8 }} />
                  )}
                  {!!opt && <Text style={[s.optText, { color: fg }]}>{opt}</Text>}
                </View>
                {reveal && isRight && <Ionicons name="checkmark-circle" size={22} color={C.success} />}
                {wasTried && <Ionicons name="close-circle" size={22} color={C.danger} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {!!note && state === 'asking' && <Text style={[s.note, { color: C.text }]}>{note}</Text>}

        {state !== 'asking' && (
          <View style={[s.feedback, { backgroundColor: state === 'right' ? C.successLight : C.dangerLight }]} accessibilityRole="alert">
            <Text style={[s.feedbackTitle, { color: state === 'right' ? C.success : C.danger }]}>
              {state === 'right'
                ? (n === 14 ? `You reached the top: ${cedis(LADDER[14])}!` : `Correct. You now have ${cedis(LADDER[n])}.`)
                : `${state === 'timeout' ? 'Time is up.' : 'Not right.'} The answer is ${LETTERS[q.correct]}. You leave with ${cedis(safeAmount(n))}.`}
            </Text>
            {!!q.explanation && <Text style={[s.small, { color: C.text }]}>{q.explanation}</Text>}
          </View>
        )}
      </ScrollView>

      <View style={[s.bottom, { backgroundColor: C.surface, borderColor: C.border }]}>
        {state === 'asking' ? (
          confirmWalk ? (
            <View style={{ gap: 8 }}>
              <Text style={[s.small, { color: C.text }]}>Walk away with {cedis(banked)}? You keep it and the climb ends.</Text>
              <View style={s.rowGap}>
                <TouchableOpacity onPress={() => setConfirmWalk(false)} accessibilityRole="button" style={[s.secondary, { borderColor: C.borderStrong, flex: 1 }]}>
                  <Text style={[s.secondaryText, { color: C.text }]}>Keep playing</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onFinish(banked, { answered: n, walked: true, won: banked })} accessibilityRole="button"
                  style={[s.primary, { backgroundColor: C.primary, flex: 1 }]}>
                  <Text style={s.primaryText}>Walk away</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={s.rowGap}>
                {helps.map(h => (
                  <TouchableOpacity key={h.key} onPress={h.run} disabled={used[h.key]} accessibilityRole="button"
                    accessibilityLabel={`${h.label}${used[h.key] ? ', used' : ''}`}
                    style={[s.help, { borderColor: used[h.key] ? C.border : C.primaryText, opacity: used[h.key] ? 0.4 : 1 }]}>
                    <Ionicons name={h.icon} size={20} color={C.primaryText} />
                    <Text style={[s.helpText, { color: C.primaryText }]}>{h.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => setConfirmWalk(true)} accessibilityRole="button" style={[s.secondary, { borderColor: C.borderStrong }]}>
                <Text style={[s.secondaryText, { color: C.text }]}>Walk away with {cedis(banked)}</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          <TouchableOpacity onPress={state === 'right' ? next : finishLost} accessibilityRole="button" style={[s.primary, { backgroundColor: C.primary }]}>
            <Text style={s.primaryText}>{state === 'right' ? (n === 14 ? 'Collect your prize' : `Climb to question ${n + 2}`) : 'See my result'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = createThemedStyles({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  topLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },
  topPrize: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  topSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  clock: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  clockText: { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  clockUnit: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '700', marginTop: -2 },
  ladderToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderBottomWidth: 1 },
  ladderToggleText: { fontSize: 14, fontWeight: '700' },
  ladder: { borderBottomWidth: 1, paddingVertical: 6 },
  rung: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 3 },
  rungNo: { width: 22, fontSize: 13, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  rungValue: { flex: 1, fontSize: 14, fontVariant: ['tabular-nums'] },
  safeTag: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  page: { padding: 16, gap: 14, paddingBottom: 28 },
  subject: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  question: { fontSize: 17, lineHeight: 25, fontWeight: '600' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14, minHeight: 56 },
  gone: { borderStyle: 'dashed', opacity: 0.5 },
  letter: { fontSize: 16, fontWeight: '800', width: 20 },
  optText: { fontSize: 16, lineHeight: 22 },
  note: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  feedback: { borderRadius: 12, padding: 14, gap: 6 },
  feedbackTitle: { fontSize: 15, fontWeight: '800', lineHeight: 21 },
  small: { fontSize: 14, lineHeight: 20 },
  bottom: { padding: 12, borderTopWidth: 1 },
  rowGap: { flexDirection: 'row', gap: 8 },
  help: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4 },
  helpText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  primary: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, paddingHorizontal: 12 },
  secondaryText: { fontSize: 15, fontWeight: '700' },
});
