// Order the steps: put each procedure's steps in order with the arrows, then
// check. 300 points if right first time, 200 on the second try, 100 on the
// third, 25 after that; "Show the answer" after three tries scores nothing.
// Up to 200 more for finishing quickly.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { shuffle } from '@/lib/games';

const POINTS = [300, 200, 100];

export default function OrderSteps({ procedures, onFinish }: {
  procedures: { title: string; steps: string[] }[];
  onFinish: (score: number, detail: { firstTry: number; jobs: number; seconds: number }) => void;
}) {
  const C = useTheme();
  // Each job starts shuffled, never already in order.
  const starts = useMemo(() => procedures.map(p => {
    const ids = p.steps.map((_, k) => k);
    let order = shuffle(ids);
    while (order.every((v, k) => v === k) && ids.length > 1) order = shuffle(ids);
    return order;
  }), [procedures]);
  const [job, setJob] = useState(0);
  const [order, setOrder] = useState<number[]>(starts[0]);
  const [tries, setTries] = useState(0);
  const [checked, setChecked] = useState<boolean[] | null>(null);
  const [solved, setSolved] = useState<null | { gained: number; shown: boolean }>(null);
  const [total, setTotal] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const started = useRef(Date.now());
  const scroll = useRef<ScrollView>(null);
  const p = procedures[job];
  const lastJob = job === procedures.length - 1;

  useEffect(() => { setOrder(starts[job]); setTries(0); setChecked(null); setSolved(null); scroll.current?.scrollTo({ y: 0, animated: false }); }, [job, starts]);

  function move(pos: number, dir: -1 | 1) {
    const to = pos + dir;
    if (to < 0 || to >= order.length || solved) return;
    const next = [...order];
    [next[pos], next[to]] = [next[to], next[pos]];
    setOrder(next); setChecked(null);
  }
  function check() {
    const marks = order.map((v, k) => v === k);
    const n = tries + 1;
    setTries(n); setChecked(marks);
    if (marks.every(Boolean)) {
      const gained = POINTS[n - 1] ?? 25;
      setSolved({ gained, shown: false }); setTotal(t => t + gained);
      if (n === 1) setFirstTry(f => f + 1);
    }
  }
  function showAnswer() {
    setOrder(p.steps.map((_, k) => k)); setChecked(p.steps.map(() => true)); setSolved({ gained: 0, shown: true });
  }
  function next() {
    if (!lastJob) { setJob(j => j + 1); return; }
    const secs = Math.floor((Date.now() - started.current) / 1000);
    const bonus = Math.max(0, 200 - secs);
    onFinish(total + bonus, { firstTry, jobs: procedures.length, seconds: secs });
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[s.bar, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Text style={[s.barText, { color: C.textSoft }]}>Job {job + 1} of {procedures.length}</Text>
        <Text style={[s.barText, { color: C.text }]}>{total} pts</Text>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={s.page}>
        <Text style={[s.title, { color: C.text }]}>{p.title}</Text>
        <Text style={[s.hint, { color: C.textSoft }]}>Use the arrows to put the steps in order, first step at the top.</Text>
        <View style={{ gap: 8 }}>
          {order.map((step, pos) => {
            const mark = checked?.[pos];
            const border = mark === true ? C.success : mark === false ? C.warning : C.border;
            const bg = mark === true ? C.successLight : mark === false ? C.warningLight : C.surface;
            return (
              <View key={step} style={[s.row, { borderColor: border, backgroundColor: bg }]}>
                <Text style={[s.num, { color: C.textSoft }]}>{pos + 1}</Text>
                <Text style={[s.step, { color: C.text }]}>{p.steps[step]}</Text>
                {!solved && (
                  <View style={s.arrows}>
                    <TouchableOpacity onPress={() => move(pos, -1)} disabled={pos === 0} accessibilityRole="button"
                      accessibilityLabel={`Move "${p.steps[step]}" up`} style={[s.arrow, { opacity: pos === 0 ? 0.3 : 1 }]}>
                      <Ionicons name="chevron-up" size={22} color={C.text} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => move(pos, 1)} disabled={pos === order.length - 1} accessibilityRole="button"
                      accessibilityLabel={`Move "${p.steps[step]}" down`} style={[s.arrow, { opacity: pos === order.length - 1 ? 0.3 : 1 }]}>
                      <Ionicons name="chevron-down" size={22} color={C.text} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        {checked && !solved && (
          <Text style={[s.hint, { color: C.text }]}>
            {checked.filter(Boolean).length} of {checked.length} steps are in the right place (shown in green). Move the others and check again.
          </Text>
        )}
        {solved && (
          <View style={[s.feedback, { backgroundColor: solved.shown ? C.warningLight : C.successLight }]}>
            <Text style={[s.feedbackTitle, { color: solved.shown ? C.warning : C.success }]}>
              {solved.shown ? 'This is the right order. No points for this job.' : `Right order, +${solved.gained} points`}
            </Text>
          </View>
        )}
      </ScrollView>
      <View style={[s.bottom, { backgroundColor: C.surface, borderColor: C.border }]}>
        {solved ? (
          <TouchableOpacity onPress={next} accessibilityRole="button" style={[s.primary, { backgroundColor: C.primary }]}>
            <Text style={s.primaryText}>{lastJob ? 'See my score' : 'Next job'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {tries >= 3 && (
              <TouchableOpacity onPress={showAnswer} accessibilityRole="button" style={[s.secondary, { borderColor: C.borderStrong }]}>
                <Text style={[s.secondaryText, { color: C.text }]}>Show the answer</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={check} accessibilityRole="button" style={[s.primary, { backgroundColor: C.primary, flex: 1 }]}>
              <Text style={s.primaryText}>Check the order</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const s = createThemedStyles({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  barText: { fontSize: 14, fontWeight: '600' },
  page: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingLeft: 12, paddingVertical: 4, minHeight: 56 },
  num: { fontSize: 15, fontWeight: '800', width: 18 },
  step: { flex: 1, fontSize: 15, lineHeight: 21, paddingVertical: 8 },
  arrows: { flexDirection: 'column' },
  arrow: { width: 44, height: 28, alignItems: 'center', justifyContent: 'center' },
  feedback: { borderRadius: 12, padding: 14 },
  feedbackTitle: { fontSize: 15, fontWeight: '700' },
  bottom: { padding: 16, borderTopWidth: 1 },
  primary: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1.5 },
  secondaryText: { fontSize: 15, fontWeight: '700' },
});
