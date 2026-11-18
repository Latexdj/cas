// This week's leaderboard for one game: class or school, top 10, and the
// student's own place when it is further down.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { formatScore, loadBoard, type Board, type BoardRow } from '@/lib/games';

const weekLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function Leaderboard({ game, refreshKey = 0 }: { game: string; refreshKey?: number }) {
  const C = useTheme();
  const [scope, setScope] = useState<'class' | 'school'>('class');
  const [board, setBoard] = useState<Board | null>(null);
  const [reason, setReason] = useState<'signed-out' | 'offline' | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await loadBoard(game, scope);
    if ('board' in r) { setBoard(r.board); setReason(null); } else { setBoard(null); setReason(r.reason); }
    setLoading(false);
  }, [game, scope]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const row = (r: BoardRow, k: string) => (
    <View key={k} style={[s.row, { backgroundColor: r.me ? C.primaryLight : 'transparent' }]}>
      <Text style={[s.rank, { color: r.rank <= 3 ? C.accent : C.textSoft }]}>{r.rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.name, { color: C.text, fontWeight: r.me ? '800' : '600' }]}>{r.me ? `${r.name} (you)` : r.name}</Text>
        {scope === 'school' && !!r.class_name && <Text style={[s.cls, { color: C.textSoft }]}>{r.class_name}</Text>}
      </View>
      <Text style={[s.score, { color: C.text }]}>{formatScore(game, r.score)}</Text>
    </View>
  );

  return (
    <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={s.head}>
        <Text style={[s.title, { color: C.text }]}>Leaderboard</Text>
        <View style={[s.seg, { borderColor: C.border }]} accessibilityRole="tablist">
          {(['class', 'school'] as const).map(k => (
            <TouchableOpacity key={k} onPress={() => setScope(k)} accessibilityRole="tab" accessibilityState={{ selected: scope === k }}
              style={[s.segBtn, scope === k && { backgroundColor: C.primary }]}>
              <Text style={[s.segText, { color: scope === k ? '#FFFFFF' : C.textSoft }]}>{k === 'class' ? 'My class' : 'School'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {loading ? <ActivityIndicator color={C.primaryText} style={{ marginVertical: 16 }} />
        : reason === 'signed-out' ? (
          <Text style={[s.note, { color: C.textSoft }]}>Sign in to appear on the leaderboard: with your CAS account, or on a school tablet with your Offline Assessment sign-in.</Text>
        ) : reason === 'offline' ? (
          <Text style={[s.note, { color: C.textSoft }]}>The leaderboard needs the school Wi-Fi or the internet. Your scores are saved and will be sent when you are connected.</Text>
        ) : board && (
          <>
            <Text style={[s.note, { color: C.textSoft }]}>
              This week, from {weekLabel(board.week_start)}{board.scope === 'class' && board.class_name ? `, ${board.class_name}` : ''}. {board.players} player{board.players === 1 ? '' : 's'}.
            </Text>
            {board.top.length ? board.top.map((r, k) => row(r, `t${k}`)) : <Text style={[s.note, { color: C.text }]}>No scores yet this week. Be the first.</Text>}
            {board.me && !board.top.some(r => r.me) && (
              <>
                <Text style={[s.gap, { color: C.textSoft }]}>…</Text>
                {row(board.me, 'me')}
              </>
            )}
            {board.personal_best != null && <Text style={[s.note, { color: C.textSoft }]}>Your best ever: {formatScore(game, board.personal_best)}</Text>}
          </>
        )}
    </View>
  );
}

const s = createThemedStyles({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 17, fontWeight: '800' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  segText: { fontSize: 13, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10 },
  rank: { fontSize: 16, fontWeight: '800', width: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
  name: { fontSize: 15 },
  cls: { fontSize: 12 },
  score: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  gap: { textAlign: 'center', fontSize: 16 },
});
