import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { CtError, getSession, listTests, signIn, signOut, type CtSession, type CtTest } from '@/lib/classTests';
import { findSchoolServer, type SchoolServer } from '@/lib/schoolServer';
import { RouteError } from '@/components/RouteError';

export { RouteError as ErrorBoundary };

export default function ClassTestsHome() {
  const C = useTheme();
  const [session, setSession] = useState<CtSession | null | undefined>(undefined);
  const [server, setServer] = useState<SchoolServer | null | undefined>(undefined);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tests, setTests] = useState<CtTest[] | null>(null);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    getSession().then(setSession);
    findSchoolServer().then(setServer).catch(() => setServer(null));
  }, []);

  const load = useCallback(async () => {
    try { const d = await listTests(); setTests(d.tests); setLoadErr(''); }
    catch (e) {
      if (e instanceof CtError && e.status === 401) { setSession(null); return; }
      setLoadErr(e instanceof Error ? e.message : 'Could not load the tests.');
    }
  }, []);

  // Refresh when coming back from a test, and every 15 seconds so newly opened tests appear.
  useFocusEffect(useCallback(() => {
    if (!session) return;
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [session, load]));

  async function doSignIn() {
    setBusy(true); setErr('');
    try { const s = await signIn(code, password); setPassword(''); setSession(s); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  async function doSignOut() { await signOut(); setSession(null); setTests(null); setCode(''); }

  if (session === undefined) return <View style={[s.center, { backgroundColor: C.bg }]}><ActivityIndicator color={C.primaryText} /></View>;

  // ── Sign in ──
  if (!session) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[s.title, { color: C.text }]}>Sign in for class tests</Text>
          <Text style={[s.sub, { color: C.textSoft }]}>Use your CAS student ID and password. This works on the school Wi-Fi without internet.</Text>
          <Text style={[s.sub, { color: server ? C.success : C.textSoft }]}>
            {server === undefined ? 'Looking for the school server…' : server ? `School server found${server.info.school_name ? `: ${server.info.school_name}` : ''}` : 'No school server found. Connect to the school Wi-Fi.'}
          </Text>
          <TextInput value={code} onChangeText={setCode} placeholder="Student ID" placeholderTextColor={C.placeholder} autoCapitalize="characters"
            autoCorrect={false} accessibilityLabel="Student ID" style={[s.input, { borderColor: C.borderStrong, color: C.text, backgroundColor: C.bg }]} />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={C.placeholder} secureTextEntry
            accessibilityLabel="Password" onSubmitEditing={doSignIn} style={[s.input, { borderColor: C.borderStrong, color: C.text, backgroundColor: C.bg }]} />
          <Pressable accessibilityRole="button" onPress={doSignIn} disabled={busy || !code.trim() || !password}
            style={[s.primary, { backgroundColor: C.primary, opacity: busy || !code.trim() || !password ? 0.5 : 1 }]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>Sign in</Text>}
          </Pressable>
          {!!err && <Text style={[s.sub, { color: C.danger }]} accessibilityLiveRegion="polite">{err}</Text>}
        </View>
      </ScrollView>
    );
  }

  // ── Tests ──
  const openTests = (tests ?? []).filter(t => t.open);
  const doneTests = (tests ?? []).filter(t => !t.open);
  const Card = ({ t }: { t: CtTest }) => {
    const chip = t.state === 'submitted' ? { label: 'Submitted', fg: C.success, bg: C.successLight }
      : t.state === 'in_progress' ? { label: 'In progress', fg: C.warning, bg: C.warningLight }
      : { label: 'Not started', fg: C.textSoft, bg: C.bg };
    return (
      <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={s.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={[s.testTitle, { color: C.text }]}>{t.title}</Text>
            <Text style={[s.sub, { color: C.textSoft }]}>
              {t.subject}{t.teacher ? `, ${t.teacher}` : ''}. {t.question_count} question{t.question_count === 1 ? '' : 's'}, {t.total_marks} marks{t.time_limit_mins ? `, ${t.time_limit_mins} minutes` : ''}.
            </Text>
          </View>
          <View style={[s.chip, { backgroundColor: chip.bg, borderColor: C.border }]}><Text style={[s.chipText, { color: chip.fg }]}>{chip.label}</Text></View>
        </View>
        {t.result && (
          <Text style={[s.sub, { color: C.text }]}>
            Score: {t.result.score ?? 0} of {t.result.max_score}{t.result.needs_marking ? '. Your teacher still has to mark some answers.' : ''}
          </Text>
        )}
        <View style={s.row}>
          {t.can_start && (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/class-tests/[id]', params: { id: t.id } })}
              style={[s.primary, { backgroundColor: C.primary, flexGrow: 1 }]}>
              <Text style={s.primaryText}>{t.state === 'in_progress' ? 'Continue' : 'Start test'}</Text>
            </Pressable>
          )}
          {t.result && (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/class-tests/[id]', params: { id: t.id, result: t.result!.attempt_id } })}
              style={[s.secondary, { borderColor: C.border, flexGrow: 1 }]}>
              <Text style={[s.secondaryText, { color: C.text }]}>See result</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.primaryText} />}>
      <View style={[s.who, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Ionicons name="person-circle-outline" size={30} color={C.primaryText} />
        <View style={{ flex: 1 }}>
          <Text style={[s.whoName, { color: C.text }]}>{session.name}</Text>
          <Text style={[s.sub, { color: C.textSoft }]}>{session.class_name}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={doSignOut} style={[s.secondary, { borderColor: C.border, minHeight: 44 }]}>
          <Text style={[s.secondaryText, { color: C.text }]}>Sign out</Text>
        </Pressable>
      </View>
      <Text style={[s.note, { color: C.muted }]}>Sign out when you finish, so the next student can use this tablet.</Text>

      {!!loadErr && <Text style={[s.sub, { color: C.danger }]}>{loadErr}</Text>}
      {tests === null && !loadErr ? <ActivityIndicator color={C.primaryText} />
        : openTests.length === 0 && doneTests.length === 0 ? (
          <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.title, { color: C.text }]}>No tests open for {session.class_name}</Text>
            <Text style={[s.sub, { color: C.textSoft }]}>When your teacher opens a test, it appears here. This page checks every few seconds.</Text>
          </View>
        ) : (
          <>
            {openTests.length > 0 && <Text style={[s.section, { color: C.text }]}>Open now</Text>}
            {openTests.map(t => <Card key={t.id} t={t} />)}
            {doneTests.length > 0 && <Text style={[s.section, { color: C.text }]}>Finished</Text>}
            {doneTests.map(t => <Card key={t.id} t={t} />)}
          </>
        )}
    </ScrollView>
  );
}

const s = createThemedStyles({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page:          { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 14 },
  card:          { padding: 18, borderRadius: 16, borderWidth: 1, gap: 12 },
  cardHead:      { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title:         { fontSize: 18, fontWeight: '700' },
  testTitle:     { fontSize: 17, fontWeight: '700' },
  sub:           { fontSize: 14, lineHeight: 20 },
  note:          { fontSize: 13 },
  section:       { fontSize: 18, fontWeight: '800', marginTop: 8 },
  input:         { minHeight: 52, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 17 },
  primary:       { minHeight: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondary:     { minHeight: 50, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  row:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  chipText:      { fontSize: 12, fontWeight: '700' },
  who:           { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  whoName:       { fontSize: 16, fontWeight: '700' },
});
