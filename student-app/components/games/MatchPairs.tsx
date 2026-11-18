// Match pairs: turn two cards; a tool and its use stay face up. The score is
// 600, plus up to 400 for speed, minus 30 for each pair that did not match.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { shuffle } from '@/lib/games';

interface Card { id: string; pair: number; kind: 'tool' | 'use'; text: string }

export default function MatchPairs({ pairs, onFinish }: {
  pairs: [string, string][];
  onFinish: (score: number, detail: { misses: number; seconds: number }) => void;
}) {
  const C = useTheme();
  const cards = useMemo<Card[]>(() => shuffle(pairs.flatMap(([tool, use], n) => [
    { id: `t${n}`, pair: n, kind: 'tool' as const, text: tool },
    { id: `u${n}`, pair: n, kind: 'use' as const, text: use },
  ])), [pairs]);
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [misses, setMisses] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const started = useRef(Date.now());
  const busy = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  function flip(card: Card) {
    if (busy.current || matched.has(card.pair) || open.includes(card.id)) return;
    const now = [...open, card.id];
    setOpen(now);
    if (now.length < 2) return;
    const [a, b] = now.map(id => cards.find(c => c.id === id)!);
    if (a.pair === b.pair && a.kind !== b.kind) {
      const done = new Set(matched).add(a.pair);
      setMatched(done); setOpen([]);
      if (done.size === pairs.length) {
        const secs = Math.floor((Date.now() - started.current) / 1000);
        const score = Math.max(50, 600 + Math.max(0, 400 - secs * 4) - misses * 30);
        setTimeout(() => onFinish(score, { misses, seconds: secs }), 600);
      }
    } else {
      setMisses(m => m + 1);
      busy.current = true;
      setTimeout(() => { setOpen([]); busy.current = false; }, 1100);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[s.bar, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Text style={[s.barText, { color: C.textSoft }]}>Matched {matched.size} of {pairs.length}</Text>
        <Text style={[s.barText, { color: C.textSoft }]}>Misses {misses}</Text>
        <Text style={[s.barText, { color: C.text, fontVariant: ['tabular-nums'] }]}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Text>
      </View>
      <ScrollView contentContainerStyle={s.grid}>
        {cards.map(card => {
          const up = open.includes(card.id) || matched.has(card.pair);
          const done = matched.has(card.pair);
          const back = card.kind === 'tool' ? C.primary : C.accent;
          return (
            <TouchableOpacity key={card.id} onPress={() => flip(card)} disabled={up} accessibilityRole="button"
              accessibilityLabel={up ? `${card.kind === 'tool' ? 'Tool' : 'Use'}: ${card.text}` : `Face-down ${card.kind === 'tool' ? 'tool' : 'use'} card`}
              style={[s.card, up
                ? { backgroundColor: done ? C.successLight : C.surface, borderColor: done ? C.success : C.borderStrong }
                : { backgroundColor: back, borderColor: back }]}>
              {up ? (
                <>
                  <Text style={[s.kind, { color: done ? C.success : C.textSoft }]}>{card.kind === 'tool' ? 'TOOL' : 'USE'}</Text>
                  <Text style={[card.kind === 'tool' ? s.toolText : s.useText, { color: C.text }]}>{card.text}</Text>
                  {done && <Ionicons name="checkmark-circle" size={18} color={C.success} style={{ position: 'absolute', top: 8, right: 8 }} />}
                </>
              ) : (
                <>
                  <Ionicons name={card.kind === 'tool' ? 'construct-outline' : 'help-outline'} size={26} color="#FFFFFF" />
                  <Text style={s.backText}>{card.kind === 'tool' ? 'Tool' : 'Use'}</Text>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = createThemedStyles({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  barText: { fontSize: 14, fontWeight: '600' },
  grid: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  card: { width: '47%', minHeight: 104, borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 6 },
  kind: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  toolText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  useText: { fontSize: 14, lineHeight: 19, textAlign: 'center' },
  backText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
