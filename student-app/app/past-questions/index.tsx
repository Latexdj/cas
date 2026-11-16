import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { loadSubject, type PackManifest } from '@/lib/quizPack';
import { getProgress } from '@/lib/quizProgress';
import { loadRound, type SavedRound } from '@/lib/quizRound';
import { checkForUpdates, startPackSync, usePackSync } from '@/lib/packSync';
import { RouteError } from '@/components/RouteError';

export { RouteError as ErrorBoundary };

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface SubjectStats { tried: number; right: number; objective: number }

async function subjectStats(manifest: PackManifest): Promise<Record<string, SubjectStats>> {
  const progress = await getProgress();
  const out: Record<string, SubjectStats> = {};
  for (const s of manifest.subjects) {
    const pack = await loadSubject(s.slug);
    const obj = (pack?.questions ?? []).filter(q => q.question_type === 'objective');
    const tried = obj.filter(q => progress.objective[q.id]);
    out[s.slug] = { objective: obj.length, tried: tried.length, right: tried.filter(q => progress.objective[q.id].ok).length };
  }
  return out;
}

export default function PastQuestionsHome() {
  const C = useTheme();
  const { width } = useWindowDimensions();
  const sync = usePackSync();
  const [stats, setStats] = useState<Record<string, SubjectStats>>({});
  const [round, setRound] = useState<SavedRound | null>(null);

  useEffect(() => { startPackSync(); }, []);

  // Progress and any unfinished round change while the student practises.
  useFocusEffect(useCallback(() => {
    loadRound().then(setRound);
    if (sync.manifest) subjectStats(sync.manifest).then(setStats);
  }, [sync.manifest]));

  if (!sync.ready) {
    return <View style={[s.center, { backgroundColor: C.bg }]}><ActivityIndicator color={C.primaryText} /></View>;
  }

  const subjects = sync.manifest?.subjects ?? [];
  const total = subjects.reduce((n, x) => n + x.count, 0);
  const cols = width >= 900 ? 3 : width >= 600 ? 2 : 1;
  const connected = !!sync.server;
  const roundSubjectHere = round && subjects.some(x => x.slug === round.slug);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => checkForUpdates(true)} tintColor={C.primaryText} />}>

      {/* Where the questions came from, and how fresh they are */}
      <Pressable onPress={() => router.push('/past-questions/updates')} accessibilityRole="button"
        accessibilityLabel="Get new questions"
        style={({ pressed }) => [s.statusBar, { backgroundColor: C.surface, borderColor: C.border, opacity: pressed ? 0.85 : 1 }]}>
        <View style={[s.dot, { backgroundColor: sync.busy ? C.accent : connected ? C.success : C.muted }]} />
        <View style={{ flex: 1 }}>
          <Text style={[s.statusTitle, { color: C.text }]} numberOfLines={1}>
            {sync.busy ? 'Checking for new questions'
              : sync.manifest?.published_at ? `Questions from ${fmtDate(sync.manifest.published_at)}` : 'No questions yet'}
          </Text>
          <Text style={[s.statusSub, { color: C.textSoft }]} numberOfLines={2} accessibilityLiveRegion="polite">
            {sync.busy ? sync.status
              : connected ? `School server connected${sync.server?.info.school_name ? `, ${sync.server.info.school_name}` : ''}`
              : sync.status || 'Tap to get new questions'}
          </Text>
        </View>
        {sync.busy ? <ActivityIndicator size="small" color={C.primaryText} /> : <Ionicons name="chevron-forward" size={20} color={C.muted} />}
      </Pressable>

      {roundSubjectHere && round && (
        <View style={[s.continueCard, { backgroundColor: C.surface, borderColor: C.accent }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.continueTitle, { color: C.text }]}>Continue where you stopped</Text>
            <Text style={[s.statusSub, { color: C.textSoft }]}>
              {round.label}, {round.subject}. Question {round.i + 1} of {round.ids.length}.
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/past-questions/play', params: { slug: round.slug, mode: round.mode, resume: '1' } })}
            style={({ pressed }) => [s.smallBtn, { backgroundColor: C.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={s.smallBtnText}>Continue</Text>
          </Pressable>
        </View>
      )}

      {subjects.length === 0 ? (
        <View style={[s.empty, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="library-outline" size={34} color={C.primaryText} />
          <Text style={[s.emptyTitle, { color: C.text }]}>No past questions on this tablet yet</Text>
          <Text style={[s.emptyText, { color: C.textSoft }]}>
            They come from the school server on the Wi-Fi, from the internet, or from a USB drive.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/past-questions/updates')}
            style={({ pressed }) => [s.primaryBtn, { backgroundColor: C.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={s.primaryBtnText}>Get questions</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={s.sectionHead}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Subjects</Text>
            <Text style={[s.sectionMeta, { color: C.muted }]}>{total} questions</Text>
          </View>
          <View style={s.grid}>
            {subjects.map(sub => {
              const st = stats[sub.slug];
              const frac = st && st.objective ? st.tried / st.objective : 0;
              const pct = st && st.tried ? Math.round((st.right / st.tried) * 100) : null;
              return (
                <Pressable key={sub.slug} onPress={() => router.push({ pathname: '/past-questions/[slug]', params: { slug: sub.slug } })}
                  accessibilityRole="button" accessibilityLabel={`${sub.name}, ${sub.count} questions`}
                  style={({ pressed }) => [s.card, {
                    width: cols === 1 ? '100%' : `${100 / cols - 2}%`,
                    backgroundColor: C.surface, borderColor: C.border, opacity: pressed ? 0.9 : 1,
                  }]}>
                  <View style={s.cardTop}>
                    <View style={[s.initial, { backgroundColor: C.primaryLight }]}>
                      <Text style={[s.initialText, { color: C.primaryText }]}>{sub.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cardTitle, { color: C.text }]} numberOfLines={2}>{sub.name}</Text>
                      <Text style={[s.cardMeta, { color: C.textSoft }]}>{sub.count} questions</Text>
                    </View>
                  </View>
                  <View style={[s.track, { backgroundColor: C.border }]}>
                    <View style={[s.fill, { width: `${Math.round(frac * 100)}%`, backgroundColor: C.primaryText }]} />
                  </View>
                  <Text style={[s.cardMeta, { color: C.textSoft }]}>
                    {!st || st.tried === 0 ? 'Not started' : `${st.tried} of ${st.objective} tried, ${pct}% right`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={() => router.push('/past-questions/updates')} accessibilityRole="button"
            style={({ pressed }) => [s.linkRow, { borderColor: C.border, opacity: pressed ? 0.85 : 1 }]}>
            <Ionicons name="cloud-download-outline" size={22} color={C.primaryText} />
            <View style={{ flex: 1 }}>
              <Text style={[s.linkTitle, { color: C.text }]}>Get new questions</Text>
              <Text style={[s.statusSub, { color: C.textSoft }]}>School server, internet or USB drive</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.muted} />
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const s = createThemedStyles({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page:          { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 14 },
  statusBar:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, minHeight: 64 },
  dot:           { width: 10, height: 10, borderRadius: 5 },
  statusTitle:   { fontSize: 15, fontWeight: '700' },
  statusSub:     { fontSize: 13, lineHeight: 18, marginTop: 1 },
  continueCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1.5 },
  continueTitle: { fontSize: 16, fontWeight: '700' },
  smallBtn:      { minHeight: 44, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  smallBtnText:  { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  sectionHead:   { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10 },
  sectionTitle:  { fontSize: 20, fontWeight: '800' },
  sectionMeta:   { fontSize: 13 },
  grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  card:          { padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  cardTop:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  initial:       { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  initialText:   { fontSize: 20, fontWeight: '800' },
  cardTitle:     { fontSize: 17, fontWeight: '700' },
  cardMeta:      { fontSize: 13, marginTop: 2 },
  track:         { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill:          { height: 6, borderRadius: 3 },
  linkRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderTopWidth: 1, marginTop: 8, minHeight: 60 },
  linkTitle:     { fontSize: 15, fontWeight: '700' },
  empty:         { padding: 20, borderRadius: 16, borderWidth: 1, gap: 10 },
  emptyTitle:    { fontSize: 18, fontWeight: '700' },
  emptyText:     { fontSize: 14, lineHeight: 20 },
  primaryBtn:    { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryBtnText:{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
