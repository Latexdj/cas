import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { importUsb, localManifest, updateOnline, type PackManifest } from '@/lib/quizPack';
import { getProgress, type QuizSession } from '@/lib/quizProgress';

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PastQuestionsHome() {
  const C = useTheme();
  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [status,   setStatus]   = useState('');
  const [last,     setLast]     = useState<Record<string, QuizSession>>({});

  const check = useCallback(async () => {
    setBusy(true);
    setStatus('Checking for new questions…');
    const r = await updateOnline(msg => setStatus(msg));
    if (r.status === 'updated') { setManifest(r.manifest); setStatus(`Updated ${r.changed} subject${r.changed === 1 ? '' : 's'}.`); }
    else if (r.status === 'current') { setManifest(r.manifest); setStatus('You have the latest questions.'); }
    else if (r.status === 'offline') setStatus('No internet. You can still practise with the questions on this tablet.');
    else setStatus('The update stopped part way. Try again when the connection is better.');
    setBusy(false);
  }, []);

  useEffect(() => {
    (async () => {
      setManifest(await localManifest());
      const usb = await importUsb();
      if (usb) { setManifest(usb); setStatus('Loaded new questions from the Past Questions folder.'); }
      setLoading(false);
      await check();
    })();
  }, [check]);

  // Refresh each subject's last round when coming back from a round.
  useFocusEffect(useCallback(() => {
    getProgress().then(p => {
      const m: Record<string, QuizSession> = {};
      for (const s of p.sessions) if (!m[s.slug]) m[s.slug] = s;
      setLast(m);
    });
  }, []));

  if (loading) {
    return <View style={[s.center, { backgroundColor: C.bg }]}><ActivityIndicator color={C.primaryText} /></View>;
  }

  const subjects = manifest?.subjects ?? [];
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page}
      refreshControl={<RefreshControl refreshing={false} onRefresh={check} tintColor={C.primaryText} />}>
      <View style={[s.statusCard, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.statusTitle, { color: C.text }]}>
            {manifest?.published_at ? `Questions updated ${fmtDate(manifest.published_at)}` : 'No questions on this tablet yet'}
          </Text>
          {!!status && <Text style={[s.statusText, { color: C.textSoft }]} accessibilityLiveRegion="polite">{status}</Text>}
        </View>
        <TouchableOpacity onPress={check} disabled={busy} accessibilityRole="button" accessibilityLabel="Check for updates"
          style={[s.updateBtn, { borderColor: C.border, opacity: busy ? 0.5 : 1 }]}>
          {busy ? <ActivityIndicator size="small" color={C.primaryText} /> : <Ionicons name="refresh" size={20} color={C.primaryText} />}
        </TouchableOpacity>
      </View>

      {subjects.length === 0 ? (
        <View style={[s.empty, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="cloud-download-outline" size={36} color={C.muted} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Get the past questions</Text>
          <Text style={[s.emptyText, { color: C.textSoft }]}>
            Connect this tablet to the internet once and tap the refresh button, or ask the school to copy the Past Questions folder onto it.
          </Text>
        </View>
      ) : subjects.map(sub => {
        const l = last[sub.slug];
        return (
          <TouchableOpacity key={sub.slug} onPress={() => router.push({ pathname: '/past-questions/[slug]', params: { slug: sub.slug } })}
            accessibilityRole="button" accessibilityLabel={`${sub.name}, ${sub.count} questions`}
            style={[s.row, { backgroundColor: C.surface, borderColor: C.border }]} activeOpacity={0.8}>
            <View style={[s.badge, { backgroundColor: C.primaryLight }]}>
              <Text style={[s.badgeText, { color: C.primaryText }]}>{sub.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: C.text }]}>{sub.name}</Text>
              <Text style={[s.rowSub, { color: C.textSoft }]}>
                {sub.count} question{sub.count === 1 ? '' : 's'}{l ? ` · last round ${l.score}/${l.total}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.muted} />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = createThemedStyles({
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page:        { padding: 16, gap: 10, paddingBottom: 40 },
  statusCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 6 },
  statusTitle: { fontSize: 15, fontWeight: '700' },
  statusText:  { fontSize: 13, marginTop: 3 },
  updateBtn:   { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty:       { alignItems: 'center', padding: 24, borderRadius: 16, borderWidth: 1, gap: 8 },
  emptyTitle:  { fontSize: 17, fontWeight: '700' },
  emptyText:   { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, minHeight: 64 },
  badge:       { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText:   { fontSize: 18, fontWeight: '800' },
  rowTitle:    { fontSize: 16, fontWeight: '700' },
  rowSub:      { fontSize: 13, marginTop: 2 },
});
