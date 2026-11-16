import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { importUsb, importZip, localManifest, updatePack, type PackManifest } from '@/lib/quizPack';
import { findSchoolServer, getManualAddress, setManualAddress, tryAddress, type SchoolServer } from '@/lib/schoolServer';
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
  // Loading a pack .zip from a USB drive.
  const [usbBusy,  setUsbBusy]  = useState(false);
  const [usbMsg,   setUsbMsg]   = useState<{ text: string; tone: 'ok' | 'bad' | 'info' } | null>(null);
  const [olderUri, setOlderUri] = useState<string | null>(null);
  // The CAS School Server on the school Wi-Fi.
  const [server,   setServer]   = useState<SchoolServer | null | undefined>(undefined);   // undefined = searching
  const [manual,   setManual]   = useState<string | null>(null);
  const [editAddr, setEditAddr] = useState(false);
  const [addr,     setAddr]     = useState('');
  const [addrMsg,  setAddrMsg]  = useState('');
  const [addrBusy, setAddrBusy] = useState(false);

  async function loadZip(uri: string, force = false) {
    setUsbBusy(true); setOlderUri(null);
    setUsbMsg({ text: 'Loading the questions from the drive…', tone: 'info' });
    const r = await importZip(uri, { force });
    if (r.status === 'loaded') {
      setManifest(r.manifest);
      setUsbMsg({ text: `Loaded ${r.questions} questions in ${r.manifest.subjects.length} subject${r.manifest.subjects.length === 1 ? '' : 's'}. You can remove the drive.`, tone: 'ok' });
    } else if (r.status === 'older') {
      setOlderUri(uri);
      setUsbMsg({
        text: r.fileVersion === r.tabletVersion
          ? 'This tablet already has these questions (same pack version).'
          : `This pack (version ${r.fileVersion}) is older than the questions on this tablet (version ${r.tabletVersion}).`,
        tone: 'info',
      });
    } else setUsbMsg({ text: r.message, tone: 'bad' });
    setUsbBusy(false);
  }

  async function pickFromDrive() {
    setUsbMsg(null); setOlderUri(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (!/\.zip$/i.test(a.name ?? '')) { setUsbMsg({ text: 'Choose the .zip file of the Past Questions pack.', tone: 'bad' }); return; }
    await loadZip(a.uri);
  }

  const check = useCallback(async (fresh = false) => {
    setBusy(true);
    setStatus('Checking for new questions…');
    setServer(undefined);
    const local = await localManifest();
    const find = () => findSchoolServer({ fresh, packVersion: local?.version ?? null }).then(sv => { setServer(sv); return sv; });
    const r = await updatePack(find, msg => setStatus(msg));
    const from = r.status === 'updated' || r.status === 'current'
      ? (r.source === 'school' ? ' from the school server' : r.source === 'online' ? ' from the internet' : '') : '';
    if (r.status === 'updated') { setManifest(r.manifest); setStatus(`Updated ${r.changed} subject${r.changed === 1 ? '' : 's'}${from}.`); }
    else if (r.status === 'current') { setManifest(r.manifest); setStatus(`You have the latest questions${from ? ` (checked${from})` : ''}.`); }
    else if (r.status === 'offline') setStatus('No internet or school server. You can still practise with the questions on this tablet.');
    else setStatus('The update stopped part way. Try again when the connection is better.');
    setBusy(false);
  }, []);

  useEffect(() => { getManualAddress().then(setManual); }, []);

  async function saveAddress() {
    const v = addr.trim();
    if (!v) return;
    setAddrBusy(true); setAddrMsg('');
    const sv = await tryAddress(v);
    setAddrBusy(false);
    if (sv) { setServer(sv); setManual(sv.address); setEditAddr(false); setAddr(''); check(); }
    else setAddrMsg('No school server answered at that address. Check the address on the server PC and that this tablet is on the school Wi-Fi.');
  }
  async function forgetAddress() {
    await setManualAddress(null); setManual(null); check(true);
  }

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
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => check()} tintColor={C.primaryText} />}>
      <View style={[s.statusCard, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.statusTitle, { color: C.text }]}>
            {manifest?.published_at ? `Questions updated ${fmtDate(manifest.published_at)}` : 'No questions on this tablet yet'}
          </Text>
          {!!status && <Text style={[s.statusText, { color: C.textSoft }]} accessibilityLiveRegion="polite">{status}</Text>}
        </View>
        <TouchableOpacity onPress={() => check()} disabled={busy} accessibilityRole="button" accessibilityLabel="Check for updates"
          style={[s.updateBtn, { borderColor: C.border, opacity: busy ? 0.5 : 1 }]}>
          {busy ? <ActivityIndicator size="small" color={C.primaryText} /> : <Ionicons name="refresh" size={20} color={C.primaryText} />}
        </TouchableOpacity>
      </View>

      <View style={[s.usbCard, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={s.usbHead}>
          <Ionicons name="server-outline" size={22} color={C.primaryText} />
          <View style={{ flex: 1 }}>
            <Text style={[s.statusTitle, { color: C.text }]}>School server</Text>
            <Text style={[s.statusText, { color: server ? C.success : C.textSoft }]} accessibilityLiveRegion="polite">
              {server === undefined ? 'Looking on the school Wi-Fi…'
                : server ? `Connected${server.info.school_name ? ` to ${server.info.school_name}` : ''} at ${server.address}`
                : 'Not found on this Wi-Fi.'}
            </Text>
          </View>
          {server === undefined && <ActivityIndicator size="small" color={C.primaryText} />}
        </View>
        {editAddr ? (
          <View style={{ gap: 8 }}>
            <Text style={[s.statusText, { color: C.textSoft }]}>Type the address shown on the school server PC, for example 192.168.88.10.</Text>
            <TextInput value={addr} onChangeText={setAddr} placeholder="192.168.88.10" placeholderTextColor={C.placeholder}
              autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" accessibilityLabel="School server address"
              style={[s.input, { borderColor: C.border, color: C.text, backgroundColor: C.bg }]} onSubmitEditing={saveAddress} />
            <View style={s.rowBtns}>
              <TouchableOpacity accessibilityRole="button" onPress={saveAddress} disabled={addrBusy || !addr.trim()}
                style={[s.usbBtn, { flex: 1, backgroundColor: C.primary, opacity: addrBusy || !addr.trim() ? 0.5 : 1 }]}>
                {addrBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.usbBtnText}>Connect</Text>}
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => { setEditAddr(false); setAddrMsg(''); }}
                style={[s.usbBtn, s.outlineBtn, { borderColor: C.border }]}>
                <Text style={[s.outlineText, { color: C.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
            {!!addrMsg && <Text style={[s.statusText, { color: C.danger }]}>{addrMsg}</Text>}
          </View>
        ) : (
          <View style={s.rowBtns}>
            <TouchableOpacity accessibilityRole="button" onPress={() => check(true)} disabled={busy}
              style={[s.usbBtn, s.outlineBtn, { borderColor: C.border, opacity: busy ? 0.5 : 1 }]}>
              <Text style={[s.outlineText, { color: C.text }]}>Find again</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => setEditAddr(true)} style={[s.usbBtn, s.outlineBtn, { borderColor: C.border }]}>
              <Text style={[s.outlineText, { color: C.text }]}>Enter address</Text>
            </TouchableOpacity>
            {!!manual && (
              <TouchableOpacity accessibilityRole="button" onPress={forgetAddress} style={[s.usbBtn, s.outlineBtn, { borderColor: C.border }]}>
                <Text style={[s.outlineText, { color: C.text }]}>Forget {manual}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={[s.usbCard, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={s.usbHead}>
          <Ionicons name="hardware-chip-outline" size={22} color={C.primaryText} />
          <Text style={[s.statusTitle, { color: C.text, flex: 1 }]}>Load from USB drive</Text>
        </View>
        <Text style={[s.statusText, { color: C.textSoft }]}>
          Plug in the flash drive with the Past Questions .zip file, tap Choose file, then pick the file on the drive.
        </Text>
        <TouchableOpacity onPress={pickFromDrive} disabled={usbBusy} accessibilityRole="button"
          style={[s.usbBtn, { backgroundColor: C.primary, opacity: usbBusy ? 0.5 : 1 }]}>
          {usbBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.usbBtnText}>Choose file</Text>}
        </TouchableOpacity>
        {usbMsg && (
          <Text accessibilityLiveRegion="polite"
            style={[s.statusText, { color: usbMsg.tone === 'ok' ? C.success : usbMsg.tone === 'bad' ? C.danger : C.textSoft }]}>
            {usbMsg.text}
          </Text>
        )}
        {olderUri && !usbBusy && (
          <TouchableOpacity onPress={() => loadZip(olderUri, true)} accessibilityRole="button" style={[s.usbLink]}>
            <Text style={[s.usbLinkText, { color: C.primaryText }]}>Load it anyway</Text>
          </TouchableOpacity>
        )}
      </View>

      {subjects.length === 0 ? (
        <View style={[s.empty, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="cloud-download-outline" size={36} color={C.muted} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Get the past questions</Text>
          <Text style={[s.emptyText, { color: C.textSoft }]}>
            Join the school Wi-Fi with the school server, connect to the internet, or load the Past Questions pack from a USB drive above, then tap the refresh button.
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
  usbCard:     { padding: 14, borderRadius: 16, borderWidth: 1, gap: 10, marginBottom: 6 },
  usbHead:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  usbBtn:      { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  usbBtnText:  { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  rowBtns:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  outlineBtn:  { paddingHorizontal: 14, borderWidth: 1, backgroundColor: 'transparent' },
  outlineText: { fontSize: 15, fontWeight: '600' },
  input:       { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  usbLink:     { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  usbLinkText: { fontSize: 15, fontWeight: '700' },
  empty:       { alignItems: 'center', padding: 24, borderRadius: 16, borderWidth: 1, gap: 8 },
  emptyTitle:  { fontSize: 17, fontWeight: '700' },
  emptyText:   { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, minHeight: 64 },
  badge:       { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText:   { fontSize: 18, fontWeight: '800' },
  rowTitle:    { fontSize: 16, fontWeight: '700' },
  rowSub:      { fontSize: 13, marginTop: 2 },
});
