// Reading one story: the cover, a page at a time, then "The end" with the
// credits the CC BY licence asks for.
//
// Layout: upright, the picture is held to a band at the top (smaller for the
// long stories of levels 5-10) and the words get the rest of the screen in
// their own scroll; turned sideways, the picture sits on the left and the
// words on the right. Tapping a picture shows it full screen.
// The reader can make the words larger or smaller (remembered on the device),
// and "Read to me" reads each page aloud with the chosen voice and turns the
// page when it finishes.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, Modal, Pressable, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { LEVELS, hasPicture, isSaved, writtenBy, loadCustom, loadProgress, pictureSources, pictureUri, saveProgress, saveStory, storyById } from '@/lib/storybooks';
import { AUTO, SAMPLE, chooseVoice, chosenVoiceId, englishVoices, speechOptions, voiceToUse, type StoryVoice } from '@/lib/storyVoice';

// Bigger type for early readers; longer stories (5-10) read like a book page.
const TEXT_SIZE: Record<number, number> = { 1: 28, 2: 24, 3: 21, 4: 19 };
// The reader's text size, as steps from small to very large.
const SCALES = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];
const NORMAL = 2;
const K_SCALE = 'cas_storybooks_text_size';

export default function StoryReader() {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [story, setStory] = useState(() => storyById(String(id)));
  const [looked, setLooked] = useState(!!story);
  // A story added in Super Admin may need the saved list loaded first.
  useEffect(() => { if (!story) loadCustom().then(() => { setStory(storyById(String(id))); setLooked(true); }); }, [id, story]);
  const [page, setPage] = useState(0);              // 0 cover, 1..n pages, n+1 the end
  const [saved, setSaved] = useState<boolean | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [noPictures, setNoPictures] = useState(false);
  const [reading, setReading] = useState(false);
  const [scaleStep, setScaleStep] = useState(NORMAL);
  const [zoom, setZoom] = useState(false);
  const [voicesOpen, setVoicesOpen] = useState(false);
  const readingRef = useRef(false);
  const voiceRef = useRef<StoryVoice | null>(null);
  const scroll = useRef<ScrollView>(null);

  const n = story?.pages.length ?? 0;
  const end = n + 1;

  useEffect(() => {
    AsyncStorage.getItem(K_SCALE).then(v => { const k = Number(v); if (v != null && k >= 0 && k < SCALES.length) setScaleStep(k); }).catch(() => {});
    voiceToUse().then(v => { voiceRef.current = v; }).catch(() => {});
  }, []);
  const changeScale = (by: number) => {
    setScaleStep(k => {
      const next = Math.max(0, Math.min(SCALES.length - 1, k + by));
      AsyncStorage.setItem(K_SCALE, String(next)).catch(() => {});
      return next;
    });
  };

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
    if (p === 0) return `${story.title}.${story.author ? ` ${writtenBy(story.author)}.` : ''}`;
    if (p === end) return 'The end.';
    return story.pages[p - 1];
  }, [story, end]);

  const speak = useCallback((p: number) => {
    Speech.stop();
    Speech.speak(textFor(p), {
      ...speechOptions(voiceRef.current),
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
    if (!looked) return <View style={[s.center, { backgroundColor: C.bg }]}><ActivityIndicator color={C.primaryText} /></View>;
    return <View style={[s.center, { backgroundColor: C.bg }]}><Text style={{ color: C.text, fontSize: 16 }}>That story was not found.</Text></View>;
  }

  const scale = SCALES[scaleStep];
  const tablet = Math.min(width, height) >= 600;   // more room: a little larger to start with
  const size = Math.round((TEXT_SIZE[story.level] ?? 18) * scale * (tablet ? 1.2 : 1));
  const slot = page === 0 ? 1 : page + 1;
  const showPicture = page !== end && hasPicture(story, slot);   // pages of added stories may have no picture
  const picture = showPicture ? pictureUri(story, slot, !!saved) : null;
  const levelInfo = LEVELS.find(l => l.level === story.level)!;
  const sideways = width > height && width >= 560;
  // Upright: a band at the top. Long stories and long pages get a smaller one.
  const long = story.level >= 5 || (page > 0 && page <= n && story.pages[page - 1].length > 400);
  const band = Math.round(height * (page === 0 ? 0.42 : long ? 0.24 : 0.36));

  const tools = (
    <>
      <View style={s.sizeGroup} accessibilityRole="adjustable" accessibilityLabel={`Text size ${Math.round(scale * 100)} percent`}>
        <TouchableOpacity onPress={() => changeScale(-1)} disabled={scaleStep === 0} accessibilityRole="button" accessibilityLabel="Smaller text"
          style={[s.sizeBtn, { borderColor: C.borderStrong, opacity: scaleStep === 0 ? 0.35 : 1 }]}>
          <Text style={[s.sizeA, { color: C.text, fontSize: 14 }]}>A</Text>
          <Ionicons name="remove" size={14} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.sizeNow, { color: C.textSoft }]}>{Math.round(scale * 100)}%</Text>
        <TouchableOpacity onPress={() => changeScale(1)} disabled={scaleStep === SCALES.length - 1} accessibilityRole="button" accessibilityLabel="Larger text"
          style={[s.sizeBtn, { borderColor: C.borderStrong, opacity: scaleStep === SCALES.length - 1 ? 0.35 : 1 }]}>
          <Text style={[s.sizeA, { color: C.text, fontSize: 20 }]}>A</Text>
          <Ionicons name="add" size={14} color={C.text} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => setVoicesOpen(true)} accessibilityRole="button" accessibilityLabel="Choose the reading voice"
        style={[s.voiceBtn, { borderColor: C.borderStrong }]}>
        <Ionicons name="mic-outline" size={18} color={C.text} />
        <Text style={[s.voiceText, { color: C.text }]}>Voice</Text>
      </TouchableOpacity>
    </>
  );

  const pictureView = (box: { width: number | string; height: number | string; flex?: number }) => (
    <Pressable onPress={() => picture && setZoom(true)} disabled={!picture} accessibilityRole="imagebutton"
      accessibilityLabel={page === 0 ? `Cover of ${story.title}. Tap to see it larger.` : `Picture for page ${page}. Tap to see it larger.`}
      style={[s.picFrame, box as object, { backgroundColor: C.surface, borderColor: C.border }]}>
      {picture ? (
        <Image source={{ uri: picture }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      ) : saving ? (
        <View style={s.center}>
          <ActivityIndicator color={C.primaryText} />
          <Text style={[s.small, { color: C.textSoft, marginTop: 10 }]}>Getting the pictures, {saving.done} of {saving.total}</Text>
        </View>
      ) : (
        <View style={s.center}><Ionicons name="image-outline" size={40} color={C.muted} /></View>
      )}
      {!!picture && (
        <View style={[s.zoomHint, { backgroundColor: C.surface }]}>
          <Ionicons name="expand-outline" size={16} color={C.text} />
        </View>
      )}
    </Pressable>
  );

  const words = (
    <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={[s.words, sideways && { paddingTop: 20 }]}>
      {noPictures && page === 0 && (
        <Text style={[s.small, { color: C.text }]} accessibilityRole="alert">
          The pictures could not be downloaded. Connect to the school Wi-Fi or the internet to see them. You can still read the words.
        </Text>
      )}
      {page === 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={[s.title, { color: C.text }]}>{story.title}</Text>
          {!!story.author && <Text style={[s.byline, { color: C.textSoft }]}>{writtenBy(story.author)}</Text>}
          {!!story.illustrator && <Text style={[s.byline, { color: C.textSoft }]}>Illustrated by {story.illustrator}</Text>}
          <Text style={[s.small, { color: C.textSoft }]}>{levelInfo.name}: {levelInfo.hint}, {n} pages</Text>
        </View>
      ) : page === end ? (
        <View style={{ gap: 14 }}>
          <Text style={[s.title, { color: C.text }]}>The end</Text>
          <Text style={[s.body, { color: C.text, fontSize: 17, lineHeight: 26 }]}>
            {[story.title, story.author && writtenBy(story.author).replace(/^Written/, 'written'), story.illustrator && `illustrated by ${story.illustrator}`].filter(Boolean).join(', ')}.
          </Text>
          <Text style={[s.small, { color: C.textSoft }]}>
            {story.custom
              ? `This story was added to CAS for schools${story.licence.startsWith('CC') ? `, shared under a Creative Commons Attribution licence (${story.licence})` : ''}.`
              : `This story is from the African Storybook (africanstorybook.org) and is shared under a Creative Commons Attribution licence (${story.licence}).`}
          </Text>
          {!!story.url && (
            <TouchableOpacity onPress={() => Linking.openURL(story.url)} accessibilityRole="link" style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
              <Text style={[s.link, { color: C.primaryText }]}>See this story on africanstorybook.org</Text>
            </TouchableOpacity>
          )}
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
        <Text style={[s.body, { color: C.text, fontSize: size, lineHeight: Math.round(size * 1.5) }]}>{story.pages[page - 1]}</Text>
      )}
    </ScrollView>
  );

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

      {sideways ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {showPicture && (
            <View style={[s.sidePic, { width: Math.min(width * 0.48, 680), paddingLeft: Math.max(16, insets.left) }]}>
              {pictureView({ width: '100%', height: '100%' })}
            </View>
          )}
          <View style={{ flex: 1, paddingRight: insets.right }}>{words}</View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {showPicture && (
            <View style={s.topPic}>{pictureView({ width: Math.min(width - 32, 720), height: band })}</View>
          )}
          {words}
        </View>
      )}

      {!sideways && <View style={[s.tools, { borderTopColor: C.border, backgroundColor: C.surface }]}>{tools}</View>}

      <View style={[s.nav, { borderTopColor: C.border, backgroundColor: C.surface, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity onPress={() => go(page - 1)} disabled={page === 0} accessibilityRole="button" accessibilityLabel="Previous page"
          accessibilityState={{ disabled: page === 0 }} style={[s.navBtn, { borderColor: C.borderStrong, opacity: page === 0 ? 0.35 : 1 }]}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.where, { color: C.textSoft }]} accessibilityLiveRegion="polite">
          {page === 0 ? 'Cover' : page === end ? 'The end' : `Page ${page} of ${n}`}
        </Text>
        {sideways && <View style={[s.tools, s.toolsInline]}>{tools}</View>}
        <TouchableOpacity onPress={() => go(page + 1)} disabled={page === end} accessibilityRole="button" accessibilityLabel={page === 0 ? 'Start reading' : 'Next page'}
          accessibilityState={{ disabled: page === end }} style={[s.navBtn, s.navNext, { backgroundColor: C.primary, opacity: page === end ? 0.35 : 1 }]}>
          {page === 0 && <Text style={s.primaryText}>Start</Text>}
          <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* The picture, full screen */}
      <Modal visible={zoom && !!picture} transparent animationType="fade" onRequestClose={() => setZoom(false)} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={[s.zoomBg, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]} onPress={() => setZoom(false)}
          accessibilityRole="button" accessibilityLabel="Close the picture">
          {!!picture && <Image source={{ uri: picture }} style={{ width: '100%', flex: 1 }} resizeMode="contain" />}
          <View style={s.zoomClose}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
            <Text style={s.zoomCloseText}>Close</Text>
          </View>
        </Pressable>
      </Modal>

      <VoicePicker open={voicesOpen} onClose={() => setVoicesOpen(false)} onChosen={v => { voiceRef.current = v; if (readingRef.current) speak(page); }} />
    </View>
  );
}

// ── Choosing the reading voice ──
function VoicePicker({ open, onClose, onChosen }: { open: boolean; onClose: () => void; onChosen: (v: StoryVoice | null) => void }) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const [voices, setVoices] = useState<StoryVoice[] | null>(null);
  const [chosen, setChosen] = useState(AUTO);

  useEffect(() => {
    if (!open) return;
    englishVoices().then(setVoices).catch(() => setVoices([]));
    chosenVoiceId().then(setChosen).catch(() => {});
    return () => { Speech.stop(); };
  }, [open]);

  const tryVoice = (v: StoryVoice | null) => { Speech.stop(); Speech.speak(SAMPLE, speechOptions(v)); };
  async function pick(id: string) {
    setChosen(id);
    await chooseVoice(id);
    onChosen(await voiceToUse());
  }
  const best = voices?.find(v => v.offline) ?? voices?.[0] ?? null;

  const row = (key: string, label: string, detail: string, v: StoryVoice | null) => (
    <View key={key} style={[s.voiceRow, { borderColor: chosen === key ? C.primaryText : C.border, backgroundColor: chosen === key ? C.primaryLight : C.surface }]}>
      <TouchableOpacity onPress={() => pick(key)} style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}
        accessibilityRole="radio" accessibilityState={{ checked: chosen === key }} accessibilityLabel={`${label}. ${detail}`}>
        <Text style={[s.voiceLabel, { color: C.text }]}>{label}</Text>
        <Text style={[s.small, { color: C.textSoft }]}>{detail}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => tryVoice(v)} accessibilityRole="button" accessibilityLabel={`Try ${label}`}
        style={[s.tryBtn, { borderColor: C.borderStrong }]}>
        <Ionicons name="play" size={14} color={C.text} />
        <Text style={[s.tryText, { color: C.text }]}>Try</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <Pressable style={s.sheetBg} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { backgroundColor: C.bg, paddingBottom: insets.bottom + 16 }]}>
        <View style={s.sheetHead}>
          <Text style={[s.sheetTitle, { color: C.text }]}>Reading voice</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Done" style={[s.tryBtn, { borderColor: C.borderStrong }]}>
            <Text style={[s.tryText, { color: C.text }]}>Done</Text>
          </TouchableOpacity>
        </View>
        <Text style={[s.small, { color: C.textSoft }]}>
          These are the English voices on this device. African English voices are listed first when the device has them. To get more, open the phone&apos;s Settings, then Text-to-speech, and install voice data for English.
        </Text>
        {voices === null ? <ActivityIndicator color={C.primaryText} style={{ marginTop: 16 }} /> : (
          <FlatList
            data={voices}
            keyExtractor={v => v.id}
            style={{ marginTop: 8 }}
            contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
            ListHeaderComponent={row(AUTO, 'Best available', best ? `Now: ${best.label}` : 'The phone\'s default voice', best)}
            ListHeaderComponentStyle={{ marginBottom: 8 }}
            renderItem={({ item }) => row(item.id, item.label, item.detail, item)}
            ListEmptyComponent={<Text style={[s.small, { color: C.text }]}>This device lists no English voices. The phone&apos;s default voice is used.</Text>}
          />
        )}
      </View>
    </Modal>
  );
}

const s = createThemedStyles({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topPic: { alignItems: 'center', paddingTop: 12, paddingHorizontal: 16 },
  sidePic: { paddingVertical: 16, paddingRight: 8 },
  picFrame: { alignSelf: 'center', borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 4 },
  zoomHint: { position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', opacity: 0.9 },
  words: { padding: 16, paddingBottom: 28, gap: 14 },
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
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  toolsInline: { flex: 1, borderTopWidth: 0, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center', gap: 20 },
  sizeGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sizeBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 52, minHeight: 44, borderWidth: 1.5, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 10 },
  sizeA: { fontWeight: '800' },
  sizeNow: { fontSize: 14, fontWeight: '700', minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
  voiceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12 },
  voiceText: { fontSize: 15, fontWeight: '700' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, gap: 12 },
  navBtn: { minWidth: 56, minHeight: 52, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  navNext: { borderWidth: 0, flexDirection: 'row', gap: 4, paddingHorizontal: 14 },
  where: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  zoomBg: { flex: 1, backgroundColor: 'rgba(11,61,46,0.96)', paddingHorizontal: 12, alignItems: 'center' },
  zoomClose: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  zoomCloseText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  sheetBg: { flex: 1, backgroundColor: 'rgba(11,61,46,0.55)' },
  sheet: { maxHeight: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '800' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  voiceLabel: { fontSize: 16, fontWeight: '700' },
  tryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12 },
  tryText: { fontSize: 14, fontWeight: '700' },
});
