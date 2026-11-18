// Games: learning games by level. Open only outside the student's lessons.
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { GAMES, LEVELS, formatScore, lessonNow, loadSchedule, personalBests, sendScores, type GameLevel, type GameSchedule } from '@/lib/games';

const K_LEVEL = 'cas_g_level';
const ICON: Record<string, keyof typeof Ionicons.glyphMap> = { quiz: 'timer-outline', match: 'grid-outline', order: 'list-outline', climb: 'trending-up-outline' };

export default function GamesScreen() {
  const C = useTheme();
  const [level, setLevel] = useState<GameLevel>('SHS');
  const [schedule, setSchedule] = useState<GameSchedule | null>(null);
  const [bests, setBests] = useState<Record<string, number>>({});
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    setSchedule(await loadSchedule());
    setBests(await personalBests());
    sendScores().catch(() => {});
  }, []);
  useEffect(() => { AsyncStorage.getItem(K_LEVEL).then(v => { if (v && LEVELS.some(l => l.key === v)) setLevel(v as GameLevel); }).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // The lock can change while the screen is open.
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const lock = lessonNow(schedule, now);
  const pick = (l: GameLevel) => { setLevel(l); AsyncStorage.setItem(K_LEVEL, l).catch(() => {}); };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.primaryText} />}>
      {lock.locked && (
        <View style={[s.lock, { backgroundColor: C.warningLight, borderColor: C.warning }]} accessibilityRole="alert">
          <Ionicons name="time-outline" size={22} color={C.warning} />
          <Text style={[s.lockText, { color: C.text }]}>
            Games are closed during lessons. They open again at {lock.until}{schedule?.class_name ? `, after ${schedule.class_name}'s lesson` : ''}.
          </Text>
        </View>
      )}

      <View style={[s.levels, { borderColor: C.border, backgroundColor: C.surface }]} accessibilityRole="tablist">
        {LEVELS.map(l => (
          <TouchableOpacity key={l.key} onPress={() => pick(l.key)} accessibilityRole="tab" accessibilityState={{ selected: level === l.key }}
            style={[s.levelBtn, level === l.key && { backgroundColor: C.primary }]}>
            <Text style={[s.levelText, { color: level === l.key ? '#FFFFFF' : C.textSoft }]}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {GAMES.filter(g => g.level === level).map(g => (
        <TouchableOpacity key={g.key} disabled={lock.locked} onPress={() => router.push({ pathname: '/games/[key]', params: { key: g.key } })}
          accessibilityRole="button" accessibilityState={{ disabled: lock.locked }}
          style={[s.card, { backgroundColor: C.surface, borderColor: C.border, opacity: lock.locked ? 0.55 : 1 }]}>
          <View style={[s.icon, { backgroundColor: C.primaryLight }]}>
            <Ionicons name={ICON[g.type]} size={26} color={C.primaryText} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.title, { color: C.text }]}>{g.title}</Text>
            <Text style={[s.blurb, { color: C.textSoft }]}>{g.blurb}</Text>
            {bests[g.key] != null && <Text style={[s.best, { color: C.primaryText }]}>Your best: {formatScore(g.key, bests[g.key])}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.muted} />
        </TouchableOpacity>
      ))}

      <Text style={[s.foot, { color: C.textSoft }]}>
        Games work without internet. Leaderboards reset every Monday and need the school Wi-Fi or the internet to update.
      </Text>
    </ScrollView>
  );
}

const s = createThemedStyles({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  lock: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14 },
  lockText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  levels: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  levelBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  levelText: { fontSize: 15, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 16, padding: 14 },
  icon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  blurb: { fontSize: 14, lineHeight: 20 },
  best: { fontSize: 13, fontWeight: '700' },
  foot: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 4 },
});
