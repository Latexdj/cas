// Reading one story: the cover, a page at a time, then "The end" with the
// credits the CC BY licence asks for. "Read to me" reads each page aloud with
// the phone's own voice and turns the page when it finishes.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { LEVELS, isSaved, writtenBy, loadProgress, pictureSources, pictureUri, saveProgress, saveStory, storyById } from '@/lib/storybooks';

const TEXT_SIZE = { 1: 28, 2: 24, 3: 20, 4: 19 } as const;

export default function StoryReader() {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const story = storyById(String(id));
  const [page, setPage] = useState(0);              // 0 cover, 1..n pages, n+1 the end
  const [saved, setSaved] = useState<boolean | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [noPictures, setNoPictures] = useState(false);
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);
  const scroll = useRef<ScrollView>(null);

  const n = story?.pages.length ?? 0;
  const end = n + 1;

  // Pictures: use the saved ones, or save them now.
  useEffect(() => {
    if (!story) return;
    let live = true;
    (async () => {
      const prev = (await loadProgress())[story.id];
      if (live && prev && !prev.finished && prev.page > 0 && prev.page <= n) setPage(prev.page);
      if (await isSaved(story.id)) { if (live) setSaved(true); return; }
      if (live) { setSaved(false); setSaving({ done: 0, total: story.pictures }); }
      const ok = await saveStory(story, await pictureSources(), (done, total) => { if (live) setSaving({ done, total }); });
      if (!live) return;
      setSaving(null); setSaved(ok); setNoPictures(!ok);
    })();
    return () => { live = false; };
  }, [story, n]);

  const textFor = useCallback((p: number) => {
    if (!story) return '';
    if (p === 0) return `${story.title}. ${writtenBy(story.author)}.`;
    if (p === end) return 'The end.';
    return story.pages[p - 1];
  }, [story, end]);

  const speak = useCallback((p: number) => {
    Speech.stop();
    Speech.speak(textFor(p), {
      language: 'en', rate: 0.85,
      onDone: () => {
        if (!readingRef.current) return;
        if (p < end) setTimeout(() => { if (readingRef.current) go(p + 1, true); }, 700);
        else { readingRef.current = false; setReading(false); }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textFor, end]);

  function go(p: number, fromSpeech = false) {
    const next = Math.max(0, Math.min(end, p));
    setPage(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
    if (story) saveProgress(story.id, Math.min(next, n), next === end).catch(() => {});
    if (readingRef.current) speak(next);
    else if (!fromSpeech) Speech.stop();
  }

  function toggleReading() {
    if (readingRef.current) { readingRef.current = false; setReading(false); Speech.stop(); return; }
    readingRef.current = true; setReading(true); speak(page);
  }
  useEffect(() => () => { readingRef.current = false; Speech.stop(); }, []);

  if (!story) {
    return <View style={[s.center, { backgroundColor: C.bg }]}><Text style={{ color: C.text, fontSize: 16 }}>That story was not found.</Text></View>;
  }

  const size = TEXT_SIZE[story.level];
  const picWidth = Math.min(width - 32, 560);
  const picture = page === end ? null : pictureUri(story, page === 0 ? 1 : page + 1, !!saved);
  const levelInfo = LEVELS.find(l => l.level === story.level)!;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{
        title: story.title,
        headerRight: () => (
          <TouchableOpacity onPress={toggleReading} accessibilityRole="button" accessibilityState={{ selected: reading }}
            accessibilityLabel={reading ? 'Stop reading aloud' : 'Read to me'} hitSlop={8}
            style={[s.readBtn, { backgroundColor: reading ? C.primary : 'transparent', borderColor: C.primaryText }]}>
            <Ionicons name={reading ? 'stop' : 'volume-high-outline'} size={18} color={reading ? '#FFFFFF' : C.primaryText} />
            <Text style={[s.readText, { color: reading ? '#FFFFFF' : C.primaryText }]}>{reading ? 'Stop' : 'Read to me'}</Text>
          </TouchableOpacity>
        ),
      }} />

      <ScrollView ref={scroll} contentContainerStyle={[s.page, { paddingBottom: 24 }]}>
        {page !== end && (
          <View style={[s.picFrame, { width: picWidth, height: picWidth, backgroundColor: C.surface, borderColor: C.border }]}>
            {picture ? (
              <Image source={{ uri: picture }} style={{ width: picWidth - 2, height: picWidth - 2, borderRadius: 11 }} resizeMode="contain"
                accessibilityLabel={page === 0 ? `Cover of ${story.title}` : `Picture for page ${page}`} />
            ) : saving ? (
              <View style={s.center}>
                <ActivityIndicator color={C.primaryText} />
                <Text style={[s.small, { color: C.textSoft, marginTop: 10 }]}>Getting the pictures, {saving.done} of {saving.total}</Text>
              </View>
            ) : (
              <View style={s.center}>
                <Ionicons name="image-outline" size={40} color={C.muted} />
              </View>
            )}
          </View>
        )}

        {noPictures && page === 0 && (
          <Text style={[s.small, { color: C.text }]} accessibilityRole="alert">
            The pictures could not be downloaded. Connect to the school Wi-Fi or the internet to see them. You can still read the words.
          </Text>
        )}

        {page === 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={[s.title, { color: C.text }]}>{story.title}</Text>
            <Text style={[s.byline, { color: C.textSoft }]}>{writtenBy(story.author)}</Text>
            <Text style={[s.byline, { color: C.textSoft }]}>Illustrated by {story.illustrator}</Text>
            <Text style={[s.small, { color: C.textSoft }]}>{levelInfo.name}: {levelInfo.hint}, {n} pages</Text>
          </View>
        ) : page === end ? (
          <View style={{ gap: 14 }}>
            <Text style={[s.title, { color: C.text }]}>The end</Text>
            <Text style={[s.body, { color: C.text, fontSize: 17, lineHeight: 26 }]}>
              {story.title}: {writtenBy(story.author).replace(/^Written/, 'written')}, illustrated by {story.illustrator}.
            </Text>
            <Text style={[s.small, { color: C.textSoft }]}>
              This story is from the African Storybook (africanstorybook.org) and is shared under a Creative Commons Attribution licence ({story.licence}).
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL(story.url)} accessibilityRole="link" style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
              <Text style={[s.link, { color: C.primaryText }]}>See this story on africanstorybook.org</Text>
            </TouchableOpacity>
            <View style={s.endBtns}>
              <TouchableOpacity onPress={() => go(0)} accessibilityRole="button" style={[s.secondary, { borderColor: C.borderStrong }]}>
                <Ionicons name="refresh" size={18} color={C.text} />
                <Text style={[s.secondaryText, { color: C.text }]}>Read it again</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" style={[s.primary, { backgroundColor: C.primary }]}>
                <Ionicons name="library-outline" size={18} color="#FFFFFF" />
                <Text style={s.primaryText}>Choose another story</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={[s.body, { color: C.text, fontSize: size, lineHeight: Math.round(size * 1.45) }]}>{story.pages[page - 1]}</Text>
        )}
      </ScrollView>

      <View style={[s.nav, { borderTopColor: C.border, backgroundColor: C.surface, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity onPress={() => go(page - 1)} disabled={page === 0} accessibilityRole="button" accessibilityLabel="Previous page"
          accessibilityState={{ disabled: page === 0 }} style={[s.navBtn, { borderColor: C.borderStrong, opacity: page === 0 ? 0.35 : 1 }]}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.where, { color: C.textSoft }]} accessibilityLiveRegion="polite">
          {page === 0 ? 'Cover' : page === end ? 'The end' : `Page ${page} of ${n}`}
        </Text>
        <TouchableOpacity onPress={() => go(page + 1)} disabled={page === end} accessibilityRole="button" accessibilityLabel={page === 0 ? 'Start reading' : 'Next page'}
          accessibilityState={{ disabled: page === end }} style={[s.navBtn, s.navNext, { backgroundColor: C.primary, opacity: page === end ? 0.35 : 1 }]}>
          {page === 0 && <Text style={s.primaryText}>Start</Text>}
          <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = createThemedStyles({
  page: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  picFrame: { alignSelf: 'center', borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  title: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  byline: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  body: { fontWeight: '500' },
  link: { fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  endBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primary: { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  secondaryText: { fontSize: 15, fontWeight: '700' },
  readBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 12, minHeight: 36 },
  readText: { fontSize: 14, fontWeight: '700' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, gap: 12 },
  navBtn: { minWidth: 56, minHeight: 52, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  navNext: { borderWidth: 0, flexDirection: 'row', gap: 4, paddingHorizontal: 14 },
  where: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
