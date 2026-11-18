// Storybooks: picture books from the African Storybook Project, by level.
// Every story's words are in the app; the pictures are saved per story.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Linking, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { findSchoolServer } from '@/lib/schoolServer';
import { LEVELS, byline, library, loadProgress, pictureSources, pictureUri, saveStory, savedIds, type Progress, type Story } from '@/lib/storybooks';

const K_LEVEL = 'cas_storybooks_level';
type Filter = 0 | Story['level'];

export default function StorybooksScreen() {
  const C = useTheme();
  const stories = library().stories;
  const [level, setLevel] = useState<Filter>(0);
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [coverBase, setCoverBase] = useState<string | null>(Platform.OS === 'web' ? library().image_base : null);
  const [bulk, setBulk] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [bulkNote, setBulkNote] = useState('');
  const stop = useRef(false);

  const refresh = useCallback(async () => {
    setSaved(await savedIds());
    setProgress(await loadProgress());
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => {
    AsyncStorage.getItem(K_LEVEL).then(v => { const n = Number(v); if (n >= 1 && n <= 4) setLevel(n as Filter); }).catch(() => {});
    // Covers of stories not saved yet come from the school server, which costs no data.
    if (Platform.OS !== 'web') findSchoolServer().then(sv => { if (sv) setCoverBase(`${sv.base}/storybooks`); }).catch(() => {});
  }, []);

  const pick = (l: Filter) => { setLevel(l); AsyncStorage.setItem(K_LEVEL, String(l)).catch(() => {}); };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stories.filter(st => (!level || st.level === level) && (!mine || saved.has(st.id))
      && (!q || st.title.toLowerCase().includes(q) || st.author.toLowerCase().includes(q)));
  }, [stories, level, mine, saved, query]);

  async function saveAll() {
    const todo = stories.filter(st => !saved.has(st.id));
    if (!todo.length) return;
    stop.current = false; setBulkNote('');
    const sources = await pictureSources();
    let done = 0, failed = 0;
    setBulk({ done, total: todo.length, failed });
    for (const st of todo) {
      if (stop.current) break;
      const ok = await saveStory(st, sources);
      done++; if (!ok) failed++;
      setBulk({ done, total: todo.length, failed });
      if (ok) setSaved(prev => new Set(prev).add(st.id));
      // Many failures in a row means no connection: stop rather than try every story.
      if (failed >= 3 && failed === done) break;
    }
    setBulk(null);
    if (failed) setBulkNote(failed === done ? 'Could not get the pictures. Connect to the school Wi-Fi or the internet and try again.' : `${done - failed} stories saved. ${failed} could not be saved; try again later.`);
    else setBulkNote(stop.current ? 'Stopped. The stories saved so far stay on this device.' : 'Every story is on this device now.');
  }
  const row = ({ item: st }: { item: Story }) => {
    const p = progress[st.id];
    const isSaved = saved.has(st.id);
    const cover = isSaved && Platform.OS !== 'web' ? null : coverBase ? `${coverBase}/${st.id}/01.jpg` : null;
    const status = p?.finished ? 'Read' : p && p.page > 0 ? `Page ${Math.min(p.page, st.pages.length)} of ${st.pages.length}` : null;
    return (
      <TouchableOpacity onPress={() => router.push({ pathname: '/storybooks/[id]', params: { id: st.id } })} accessibilityRole="button"
        accessibilityLabel={`${st.title}, level ${st.level}, ${st.pages.length} pages${status ? `, ${status}` : ''}`}
        style={[s.row, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Cover story={st} saved={isSaved} remote={cover} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[s.title, { color: C.text }]} numberOfLines={2}>{st.title}</Text>
          <Text style={[s.meta, { color: C.textSoft }]} numberOfLines={1}>Level {st.level}, {st.pages.length} pages, {byline(st.author)}</Text>
          {(status || isSaved) && (
            <View style={s.tags}>
              {status && <Text style={[s.tag, { color: p?.finished ? C.success : C.primaryText }]}>{status}</Text>}
              {isSaved && Platform.OS !== 'web' && <Text style={[s.tag, { color: C.textSoft }]}>On this device</Text>}
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={C.muted} />
      </TouchableOpacity>
    );
  };

  const header = (
    <View style={{ gap: 12, marginBottom: 4 }}>
      <View style={[s.search, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Ionicons name="search" size={18} color={C.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Find a story or writer" placeholderTextColor={C.muted}
          style={[s.searchInput, { color: C.text }]} accessibilityLabel="Find a story or writer" returnKeyType="search" />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {([0, 1, 2, 3, 4] as Filter[]).map(l => {
          const on = level === l;
          const info = LEVELS.find(x => x.level === l);
          return (
            <TouchableOpacity key={l} onPress={() => pick(l)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={[s.chip, { borderColor: on ? C.primaryText : C.border, backgroundColor: on ? C.primaryLight : C.surface }]}>
              <Text style={[s.chipText, { color: on ? C.primaryText : C.text }]}>{info ? `${info.name}: ${info.hint}` : 'All levels'}</Text>
            </TouchableOpacity>
          );
        })}
        {Platform.OS !== 'web' && (
          <TouchableOpacity onPress={() => setMine(m => !m)} accessibilityRole="checkbox" accessibilityState={{ checked: mine }}
            style={[s.chip, { borderColor: mine ? C.primaryText : C.border, backgroundColor: mine ? C.primaryLight : C.surface }]}>
            <Text style={[s.chipText, { color: mine ? C.primaryText : C.text }]}>On this device</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <Text style={[s.count, { color: C.textSoft }]}>{shown.length} {shown.length === 1 ? 'story' : 'stories'}</Text>
    </View>
  );

  const left = stories.length - saved.size;
  const footer = (
    <View style={{ gap: 12, marginTop: 8 }}>
      {Platform.OS !== 'web' && (
        <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[s.cardTitle, { color: C.text }]}>Keep every story on this device</Text>
          {bulk ? (
            <>
              <Text style={[s.meta, { color: C.textSoft }]}>Saving pictures: {bulk.done} of {bulk.total} stories.</Text>
              <View style={[s.bar, { backgroundColor: C.border }]}><View style={[s.barFill, { backgroundColor: C.primary, width: `${Math.round((bulk.done / bulk.total) * 100)}%` }]} /></View>
              <TouchableOpacity onPress={() => { stop.current = true; }} accessibilityRole="button" style={[s.secondary, { borderColor: C.borderStrong }]}>
                <Text style={[s.secondaryText, { color: C.text }]}>Stop</Text>
              </TouchableOpacity>
            </>
          ) : left > 0 ? (
            <>
              <Text style={[s.meta, { color: C.textSoft }]}>
                Stories you open are saved as you read them. To read all {left} remaining stories without Wi-Fi later, save them now (about {Math.max(1, Math.round(left * 0.4))} MB). Best done on the school Wi-Fi.
              </Text>
              <TouchableOpacity onPress={saveAll} accessibilityRole="button" style={[s.secondary, { borderColor: C.borderStrong }]}>
                <Ionicons name="download-outline" size={18} color={C.text} />
                <Text style={[s.secondaryText, { color: C.text }]}>Save all stories</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[s.meta, { color: C.textSoft }]}>All {stories.length} stories are on this device and can be read without Wi-Fi.</Text>
          )}
          {!!bulkNote && !bulk && <Text style={[s.meta, { color: C.text }]} accessibilityRole="alert">{bulkNote}</Text>}
        </View>
      )}
      <Text style={[s.credit, { color: C.textSoft }]}>
        These stories come from the African Storybook (africanstorybook.org), written and illustrated by African authors and artists, and shared under a Creative Commons Attribution licence (CC BY).
      </Text>
      <TouchableOpacity onPress={() => Linking.openURL('https://africanstorybook.org')} accessibilityRole="link" style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
        <Text style={[s.link, { color: C.primaryText }]}>Visit africanstorybook.org</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={s.page}
      data={shown}
      keyExtractor={st => st.id}
      renderItem={row}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={
        <Text style={[s.meta, { color: C.text }]}>
          {mine ? 'No stories at this level are on this device yet. Open a story to save it, or turn off "On this device".' : 'No story matches that search. Try part of the title or the writer\'s name.'}
        </Text>
      }
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      initialNumToRender={12}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
    />
  );
}

function Cover({ story, saved, remote }: { story: Story; saved: boolean; remote: string | null }) {
  const C = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = (saved ? pictureUri(story, 1, true) : null) ?? remote;
  if (!uri || failed) {
    return (
      <View style={[s.cover, s.coverEmpty, { backgroundColor: C.primaryLight }]}>
        <Ionicons name="book-outline" size={24} color={C.primaryText} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[s.cover, { backgroundColor: C.border }]} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />;
}

const s = createThemedStyles({
  page: { padding: 16, paddingBottom: 40 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  chips: { gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600' },
  count: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 10 },
  cover: { width: 64, height: 64, borderRadius: 8 },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 14, lineHeight: 20 },
  tags: { flexDirection: 'row', gap: 12 },
  tag: { fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6 },
  secondary: { minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, alignSelf: 'flex-start', paddingHorizontal: 14, flexDirection: 'row', gap: 8 },
  secondaryText: { fontSize: 15, fontWeight: '700' },
  credit: { fontSize: 13, lineHeight: 19 },
  link: { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
});
