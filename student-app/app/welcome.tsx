// The app's front door, before sign-in. Three layouts:
//   phone        one column of cards
//   tablet       larger type, Learning Materials across the top, a 2-column grid
//   tablet wide  (landscape) a green panel with the school and sign-in on the
//                left, the cards on the right
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { storage } from '@/lib/storage';
import { useIsDark, useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';
import { findSchoolServer } from '@/lib/schoolServer';

type Tone = 'green' | 'gold';
interface Item { key: string; title: string; sub: string; icon: keyof typeof Ionicons.glyphMap; tone: Tone; route: Href }

export default function WelcomeScreen() {
  const C = useTheme();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [logo, setLogo] = useState<string | null>(null);
  const [hasServer, setHasServer] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => { storage.getSchoolLogo().then(setLogo); }, []);
  // Class tests run on the school server, so that card only shows on its Wi-Fi.
  useEffect(() => { findSchoolServer().then(sv => setHasServer(!!sv)).catch(() => {}); }, []);

  const tablet = Math.min(width, height) >= 560;
  const wide = tablet && width > height && width >= 900;   // landscape tablet
  const gap = tablet ? 16 : 10;

  const items: Item[] = [
    { key: 'pq', title: 'Past Questions', sub: 'Practise WASSCE and BECE questions offline', icon: 'help-circle-outline', tone: 'gold', route: '/past-questions' },
    ...(hasServer ? [{ key: 'tests', title: 'Offline Assessment', sub: 'Take tests your teacher has opened', icon: 'clipboard-outline', tone: 'green', route: '/class-tests' } as Item] : []),
    { key: 'stories', title: 'Storybooks', sub: 'African picture books to read, or have read aloud', icon: 'book-outline', tone: 'gold', route: '/storybooks' },
    { key: 'games', title: 'Games', sub: 'Learning games, outside lesson times', icon: 'game-controller-outline', tone: 'green', route: '/games' },
  ];
  // Tablets: two large cards per row (three across only in landscape, when
  // there is room); an odd last card stretches across.
  const cols = !tablet ? 1 : wide && items.length % 3 === 0 && gridWidth >= 660 ? 3 : 2;
  const tileWidth = gridWidth ? (gridWidth - gap * (cols - 1)) / cols : undefined;
  const stretched = (i: number) => tablet && cols === 2 && items.length % 2 === 1 && i === items.length - 1;
  const toneBg = (t: Tone) => (t === 'gold' ? C.accentLight : C.primaryLight);
  const toneFg = (t: Tone) => (t === 'gold' ? (isDark ? C.accent : '#9A6F1E') : C.primaryText);

  // ── Pieces ──
  const LogoMark = ({ size, onGreen }: { size: number; onGreen?: boolean }) => logo
    ? <Image source={{ uri: logo }} style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: onGreen ? 'rgba(255,255,255,0.12)' : C.border }} resizeMode="contain" accessibilityLabel="School logo" />
    : (
      <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: onGreen ? 'rgba(255,255,255,0.14)' : C.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="school" size={size * 0.5} color="#FFFFFF" />
      </View>
    );

  const hero = (
    <Pressable onPress={() => router.push('/materials')} accessibilityRole="button"
      accessibilityLabel="Learning Materials. Textbooks, notes and videos for your class. Works without internet."
      style={({ pressed }) => [s.hero, tablet && s.heroTablet, { backgroundColor: pressed ? C.primaryMid : C.primary }]}>
      <View style={[s.heroIcon, tablet && s.heroIconTablet]}>
        <Ionicons name="folder-open" size={tablet ? 40 : 30} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[s.heroTitle, tablet && s.heroTitleTablet]}>Learning Materials</Text>
        <Text style={[s.heroSub, tablet && s.heroSubTablet]}>Textbooks, notes and videos for your class. Works without internet.</Text>
      </View>
      {/* Inline colours: the same light circle in both themes. */}
      <View style={[s.heroGo, { backgroundColor: '#F4EFE6' }, tablet && { width: 48, height: 48, borderRadius: 24 }]}>
        <Ionicons name="arrow-forward" size={tablet ? 24 : 20} color="#0B3D2E" />
      </View>
    </Pressable>
  );

  const tile = (it: Item, i: number) => {
    const long = stretched(i);
    return (
    <Pressable key={it.key} onPress={() => router.push(it.route)} accessibilityRole="button" accessibilityLabel={`${it.title}. ${it.sub}`}
      style={({ pressed }) => [
        tablet ? (long ? s.tileLong : s.tileTablet) : s.row,
        { width: tablet && !long ? tileWidth : '100%', backgroundColor: pressed ? C.surfaceWarm : C.surface, borderColor: C.border },
      ]}>
      <View style={[tablet ? s.tileIconTablet : s.rowIcon, { backgroundColor: toneBg(it.tone) }]}>
        <Ionicons name={it.icon} size={tablet ? 32 : 26} color={toneFg(it.tone)} />
      </View>
      <View style={tablet && !long ? { gap: 6 } : { flex: 1, gap: tablet ? 6 : 2 }}>
        <Text style={[tablet ? s.tileTitleTablet : s.rowTitle, { color: C.text }]}>{it.title}</Text>
        <Text style={[tablet ? s.tileSubTablet : s.rowSub, { color: C.muted }]}>{it.sub}</Text>
      </View>
      {(!tablet || long) && <Ionicons name="chevron-forward" size={tablet ? 24 : 20} color={C.muted} />}
    </Pressable>
    );
  };

  const grid = (
    <View onLayout={(e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width)} style={[s.grid, { gap }]}>
      {items.map(tile)}
    </View>
  );

  const hint = 'Learning materials are stored on this device and work without internet.';

  // ── Landscape tablet: panel + cards ──
  if (wide) {
    return (
      <View style={[s.split, { backgroundColor: C.bg }]}>
        <View style={[s.panel, { backgroundColor: C.primary, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32, paddingLeft: insets.left + 40 }]}>
          <View style={{ gap: 20 }}>
            <LogoMark size={88} onGreen />
            <View style={{ gap: 8 }}>
              <Text style={s.panelTitle}>CAS Student</Text>
              <Text style={s.panelSub}>Your school's learning, on this tablet.</Text>
            </View>
          </View>
          <View style={{ gap: 14 }}>
            <Pressable onPress={() => router.push('/login')} accessibilityRole="button" accessibilityLabel="Student login. Results, attendance, fees and more."
              style={({ pressed }) => [s.panelLogin, { backgroundColor: pressed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)' }]}>
              <Ionicons name="person-circle-outline" size={28} color="#FFFFFF" />
              <View style={{ flex: 1 }}>
                <Text style={s.panelLoginTitle}>Student login</Text>
                <Text style={s.panelLoginSub}>Results, attendance, fees and more</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
            </Pressable>
            <Text style={s.panelHint}>{hint}</Text>
          </View>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.splitContent, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32, paddingRight: insets.right + 40 }]}>
          <AppUpdateBanner />
          {hero}
          {grid}
        </ScrollView>
      </View>
    );
  }

  // ── Phone and portrait tablet ──
  return (
    <ScrollView style={{ backgroundColor: C.bg }}
      contentContainerStyle={[s.page, tablet && s.pageTablet, { paddingTop: insets.top + (tablet ? 48 : 28), paddingBottom: insets.bottom + 28 }]}>
      <View style={[s.inner, tablet && { maxWidth: 860, gap: 24 }]}>
        <View style={s.header}>
          <LogoMark size={tablet ? 72 : 52} />
          <View style={{ flex: 1 }}>
            <Text style={[s.title, tablet && s.titleTablet, { color: C.text }]}>CAS Student</Text>
            <Text style={[s.subtitle, tablet && s.subtitleTablet, { color: C.muted }]}>Your school's learning, on this device</Text>
          </View>
          {tablet && (
            <Pressable onPress={() => router.push('/login')} accessibilityRole="button" accessibilityLabel="Student login"
              style={({ pressed }) => [s.loginPill, { borderColor: C.borderStrong, backgroundColor: pressed ? C.surfaceWarm : C.surface }]}>
              <Ionicons name="person-circle-outline" size={24} color={C.text} />
              <Text style={[s.loginPillText, { color: C.text }]}>Student login</Text>
            </Pressable>
          )}
        </View>

        <AppUpdateBanner />
        {hero}
        {grid}

        {!tablet && (
          <Pressable onPress={() => router.push('/login')} accessibilityRole="button" accessibilityLabel="Student login. Results, attendance, fees and more."
            style={({ pressed }) => [s.loginRow, { borderColor: C.borderStrong, backgroundColor: pressed ? C.surfaceWarm : 'transparent' }]}>
            <Ionicons name="person-circle-outline" size={26} color={C.text} />
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: C.text }]}>Student login</Text>
              <Text style={[s.rowSub, { color: C.muted }]}>Results, attendance, fees and more</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.muted} />
          </Pressable>
        )}

        <Text style={[s.hint, tablet && { fontSize: 15 }, { color: C.muted }]}>{hint}</Text>
      </View>
    </ScrollView>
  );
}

const s = createThemedStyles({
  // phone / portrait
  page:            { flexGrow: 1, paddingHorizontal: 20, justifyContent: 'center' },
  pageTablet:      { paddingHorizontal: 40, alignItems: 'center' },
  inner:           { width: '100%', gap: 14 },
  header:          { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  title:           { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  titleTablet:     { fontSize: 36 },
  subtitle:        { fontSize: 14, marginTop: 2 },
  subtitleTablet:  { fontSize: 17, marginTop: 4 },
  loginPill:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 26, paddingHorizontal: 18, minHeight: 52 },
  loginPillText:   { fontSize: 16, fontWeight: '700' },

  // Learning Materials
  hero:            { borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroTablet:      { borderRadius: 24, paddingVertical: 28, paddingHorizontal: 28, gap: 22 },
  heroIcon:        { width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  heroIconTablet:  { width: 76, height: 76, borderRadius: 22 },
  heroTitle:       { fontSize: 19, fontWeight: '800', color: '#FFFFFF' },
  heroTitleTablet: { fontSize: 26 },
  heroSub:         { fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.75)' },
  heroSubTablet:   { fontSize: 16, lineHeight: 23 },
  heroGo:          { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  // feature cards
  grid:            { flexDirection: 'row', flexWrap: 'wrap' },
  row:             { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 14 },
  rowIcon:         { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle:        { fontSize: 17, fontWeight: '800' },
  rowSub:          { fontSize: 13, lineHeight: 18 },
  tileTablet:      { borderWidth: 1, borderRadius: 20, padding: 24, gap: 18, minHeight: 190 },
  tileLong:        { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, padding: 24, gap: 20 },
  tileIconTablet:  { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tileTitleTablet: { fontSize: 22, fontWeight: '800' },
  tileSubTablet:   { fontSize: 16, lineHeight: 22 },

  loginRow:        { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginTop: 4 },
  hint:            { fontSize: 12, lineHeight: 18, marginTop: 4 },

  // landscape tablet
  split:           { flex: 1, flexDirection: 'row' },
  panel:           { width: '36%', maxWidth: 460, paddingRight: 36, justifyContent: 'space-between' },
  panelTitle:      { fontSize: 40, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.8 },
  panelSub:        { fontSize: 18, lineHeight: 26, color: 'rgba(255,255,255,0.75)' },
  panelLogin:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 16 },
  panelLoginTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  panelLoginSub:   { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  panelHint:       { fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.6)' },
  splitContent:    { flexGrow: 1, justifyContent: 'center', paddingLeft: 40, gap: 20 },
});
