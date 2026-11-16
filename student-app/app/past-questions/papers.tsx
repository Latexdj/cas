import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { EXAM_ORDER, examName, loadSubject, paperTitle, type SubjectPack } from '@/lib/quizPack';
import { RouteError } from '@/components/RouteError';

export { RouteError as ErrorBoundary };

/** Every full paper of a subject, grouped by exam, newest first. */
export default function AllPapers() {
  const C = useTheme();
  const nav = useNavigation();
  const { slug, exam } = useLocalSearchParams<{ slug: string; exam?: string }>();
  const [pack, setPack] = useState<SubjectPack | null | undefined>(undefined);

  useEffect(() => {
    loadSubject(String(slug)).then(p => {
      setPack(p);
      if (p) nav.setOptions({ title: `${p.subject} papers` });
    });
  }, [slug, nav]);

  if (pack === undefined) return <View style={[s.center, { backgroundColor: C.bg }]}><ActivityIndicator color={C.primaryText} /></View>;
  if (!pack) return <View style={[s.center, { backgroundColor: C.bg }]}><Text style={{ color: C.textSoft }}>This subject is no longer on the tablet.</Text></View>;

  const papers = pack.papers
    .filter(p => !exam || p.exam === exam)
    .map(p => ({ ...p, n: pack.questions.filter(q => q.paper_id === p.id && q.question_type === 'objective').length }))
    .filter(p => p.n > 0)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || String(a.paper_label).localeCompare(String(b.paper_label)));
  const groups = EXAM_ORDER.map(e => ({ exam: e, papers: papers.filter(p => p.exam === e) })).filter(g => g.papers.length);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page}>
      <Text style={[s.lead, { color: C.textSoft }]}>Timed like the real exam: one minute a question, marked at the end.</Text>
      {groups.map(g => (
        <View key={g.exam} style={{ gap: 8 }}>
          {groups.length > 1 && <Text style={[s.group, { color: C.text }]}>{examName(g.exam)}</Text>}
          <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            {g.papers.map((p, i) => (
              <Pressable key={p.id} accessibilityRole="button"
                onPress={() => router.push({ pathname: '/past-questions/play', params: { slug: pack.slug, mode: 'paper', paperId: p.id } })}
                style={({ pressed }) => [s.row, i > 0 && { borderTopWidth: 1, borderColor: C.border }, { opacity: pressed ? 0.8 : 1 }]}>
                <View style={[s.year, { backgroundColor: C.primaryLight }]}>
                  <Text style={[s.yearText, { color: C.primaryText }]}>{p.year ?? '-'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.title, { color: C.text }]}>{paperTitle(p)}</Text>
                  <Text style={[s.sub, { color: C.textSoft }]}>{p.n} questions, {p.n} minutes</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={C.muted} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const s = createThemedStyles({
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  page:     { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 18 },
  lead:     { fontSize: 15, lineHeight: 22 },
  group:    { fontSize: 18, fontWeight: '800' },
  card:     { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, minHeight: 64 },
  year:     { width: 58, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  yearText: { fontSize: 15, fontWeight: '800' },
  title:    { fontSize: 16, fontWeight: '700' },
  sub:      { fontSize: 13, marginTop: 2 },
});
