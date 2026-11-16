import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { checkForUpdates, connectToAddress, forgetManualAddress, loadZipFile, startPackSync, usePackSync } from '@/lib/packSync';
import { getManualAddress } from '@/lib/schoolServer';
import { RouteError } from '@/components/RouteError';

export { RouteError as ErrorBoundary };

export default function GetNewQuestions() {
  const C = useTheme();
  const sync = usePackSync();
  const [manual, setManual] = useState<string | null>(null);
  const [editAddr, setEditAddr] = useState(false);
  const [addr, setAddr] = useState('');
  const [addrMsg, setAddrMsg] = useState('');
  const [addrBusy, setAddrBusy] = useState(false);
  const [usbBusy, setUsbBusy] = useState(false);
  const [usbMsg, setUsbMsg] = useState<{ text: string; tone: 'ok' | 'bad' | 'info' } | null>(null);
  const [olderUri, setOlderUri] = useState<string | null>(null);

  useEffect(() => { startPackSync(); getManualAddress().then(setManual); }, []);

  const toneColor = (t: 'ok' | 'bad' | 'info') => (t === 'ok' ? C.success : t === 'bad' ? C.danger : C.textSoft);

  async function saveAddress() {
    if (!addr.trim()) return;
    setAddrBusy(true); setAddrMsg('');
    const ok = await connectToAddress(addr);
    setAddrBusy(false);
    if (ok) { setManual((await getManualAddress())); setEditAddr(false); setAddr(''); }
    else setAddrMsg('No school server answered at that address. Check the address shown on the server PC, and that this tablet is on the school Wi-Fi.');
  }

  async function loadZip(uri: string, force = false) {
    setUsbBusy(true); setOlderUri(null);
    setUsbMsg({ text: 'Loading the questions from the drive…', tone: 'info' });
    const r = await loadZipFile(uri, force);
    if (r.status === 'loaded') {
      setUsbMsg({ text: `Loaded ${r.questions} questions in ${r.manifest.subjects.length} subject${r.manifest.subjects.length === 1 ? '' : 's'}. You can remove the drive.`, tone: 'ok' });
    } else if (r.status === 'older') {
      setOlderUri(uri);
      setUsbMsg({
        text: r.fileVersion === r.tabletVersion
          ? 'This tablet already has these questions.'
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
      copyToCacheDirectory: true, multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (!/\.zip$/i.test(a.name ?? '')) { setUsbMsg({ text: 'Choose the .zip file of the Past Questions pack.', tone: 'bad' }); return; }
    await loadZip(a.uri);
  }

  const server = sync.server;
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={[s.lead, { color: C.textSoft }]}>
        New questions arrive by themselves whenever this tablet can reach the school server or the internet. A USB drive works anywhere.
      </Text>

      {/* Automatic: school server and internet */}
      <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={s.head}>
          <View style={[s.icon, { backgroundColor: C.primaryLight }]}><Ionicons name="wifi" size={22} color={C.primaryText} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: C.text }]}>School server</Text>
            <Text style={[s.sub, { color: server ? C.success : C.textSoft }]} accessibilityLiveRegion="polite">
              {server === undefined ? 'Looking on the school Wi-Fi…'
                : server ? `Connected${server.info.school_name ? ` to ${server.info.school_name}` : ''} at ${server.address}`
                : 'Not found on this Wi-Fi'}
            </Text>
          </View>
          {server === undefined && <ActivityIndicator size="small" color={C.primaryText} />}
        </View>

        {editAddr ? (
          <View style={{ gap: 10 }}>
            <Text style={[s.sub, { color: C.textSoft }]}>Type the address shown on the school server PC, for example 192.168.88.10.</Text>
            <TextInput value={addr} onChangeText={setAddr} placeholder="192.168.88.10" placeholderTextColor={C.placeholder}
              autoFocus autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation"
              accessibilityLabel="School server address" onSubmitEditing={saveAddress}
              style={[s.input, { borderColor: C.borderStrong, color: C.text, backgroundColor: C.bg }]} />
            <View style={s.row}>
              <Pressable accessibilityRole="button" onPress={saveAddress} disabled={addrBusy || !addr.trim()}
                style={[s.btn, s.btnGrow, { backgroundColor: C.primary, opacity: addrBusy || !addr.trim() ? 0.5 : 1 }]}>
                {addrBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.btnText}>Connect</Text>}
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setEditAddr(false); setAddrMsg(''); }}
                style={[s.btn, s.btnOutline, { borderColor: C.border }]}>
                <Text style={[s.btnOutlineText, { color: C.text }]}>Cancel</Text>
              </Pressable>
            </View>
            {!!addrMsg && <Text style={[s.sub, { color: C.danger }]}>{addrMsg}</Text>}
          </View>
        ) : (
          <View style={s.row}>
            <Pressable accessibilityRole="button" onPress={() => checkForUpdates(true)} disabled={sync.busy}
              style={[s.btn, s.btnGrow, { backgroundColor: C.primary, opacity: sync.busy ? 0.5 : 1 }]}>
              {sync.busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.btnText}>Check for new questions</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setEditAddr(true)} style={[s.btn, s.btnOutline, { borderColor: C.border }]}>
              <Text style={[s.btnOutlineText, { color: C.text }]}>Enter address</Text>
            </Pressable>
          </View>
        )}

        {!!sync.status && (
          <Text style={[s.sub, { color: toneColor(sync.tone) }]} accessibilityLiveRegion="polite">{sync.status}</Text>
        )}
        {!!manual && !editAddr && (
          <Pressable accessibilityRole="button" onPress={async () => { await forgetManualAddress(); setManual(null); }} style={s.link}>
            <Text style={[s.linkText, { color: C.primaryText }]}>Stop using {manual} and search again</Text>
          </Pressable>
        )}
      </View>

      {/* USB drive */}
      <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={s.head}>
          <View style={[s.icon, { backgroundColor: C.primaryLight }]}><Ionicons name="hardware-chip-outline" size={22} color={C.primaryText} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: C.text }]}>USB drive</Text>
            <Text style={[s.sub, { color: C.textSoft }]}>Plug in the drive with the Past Questions .zip file, then choose the file on it.</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={pickFromDrive} disabled={usbBusy}
          style={[s.btn, { backgroundColor: C.primary, opacity: usbBusy ? 0.5 : 1 }]}>
          {usbBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.btnText}>Choose file</Text>}
        </Pressable>
        {usbMsg && <Text style={[s.sub, { color: toneColor(usbMsg.tone) }]} accessibilityLiveRegion="polite">{usbMsg.text}</Text>}
        {olderUri && !usbBusy && (
          <Pressable accessibilityRole="button" onPress={() => loadZip(olderUri, true)} style={s.link}>
            <Text style={[s.linkText, { color: C.primaryText }]}>Load it anyway</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const s = createThemedStyles({
  page:           { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 16 },
  lead:           { fontSize: 15, lineHeight: 22 },
  card:           { padding: 18, borderRadius: 16, borderWidth: 1, gap: 14 },
  head:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon:           { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:          { fontSize: 17, fontWeight: '700' },
  sub:            { fontSize: 14, lineHeight: 20, marginTop: 2 },
  row:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn:            { minHeight: 48, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnGrow:        { flexGrow: 1 },
  btnText:        { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  btnOutline:     { borderWidth: 1, backgroundColor: 'transparent' },
  btnOutlineText: { fontSize: 16, fontWeight: '600' },
  input:          { minHeight: 50, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 17 },
  link:           { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText:       { fontSize: 15, fontWeight: '600' },
});
