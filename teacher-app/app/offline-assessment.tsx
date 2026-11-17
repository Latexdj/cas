// Offline Assessment: tests, exercises, quizzes and exams students take on
// the school Wi-Fi with no internet. The work happens on the CAS School
// Server's teacher page; this screen finds the server and opens it.
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { findSchoolServer, tryAddress, type SchoolServer } from '@/lib/schoolServer';
import { Body, Button, Card, Field, Loading, Notice, Row, Screen, Title } from '@/components/ui/kit';

export default function OfflineAssessmentScreen() {
  const C = useTheme();
  const [server, setServer] = useState<SchoolServer | null | undefined>(undefined);
  const [typing, setTyping] = useState(false);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  const search = useCallback(async (fresh = false) => {
    setServer(undefined); setMsg(null);
    try { setServer(await findSchoolServer({ fresh })); } catch { setServer(null); }
  }, []);
  useEffect(() => { search(); }, [search]);

  async function useAddress() {
    setBusy(true); setMsg(null);
    const s = await tryAddress(address).catch(() => null);
    setBusy(false);
    if (s) { setServer(s); setTyping(false); }
    else setMsg({ text: 'No school server answered at that address. Check it, and that you are on the school Wi-Fi.', tone: 'bad' });
  }
  function open() {
    if (!server) return;
    Linking.openURL(`${server.base}/teacher`).catch(() => setMsg({ text: 'Could not open the page. Try again.', tone: 'bad' }));
  }

  return (
    <Screen onRefresh={() => search(true)}>
      <Body soft>
        Give tests, exercises, quizzes and exams that students take on the school tablets over the school Wi-Fi, with no internet.
        Results reach CAS LMS when the school server is next online.
      </Body>

      {server === undefined ? <Loading label="Looking for the school server…" /> : server ? (
        <Card accent={C.success}>
          <Title sub={`${server.info.school_name ? `${server.info.school_name}, ` : ''}at ${server.address}`}>School server found</Title>
          <Button label="Open Offline Assessment" icon="open-outline" onPress={open} />
          <Body small soft>It opens in your browser. Sign in with your CAS teacher code and password.</Body>
        </Card>
      ) : (
        <Card accent={C.warning}>
          <Title sub={Platform.OS === 'web' ? 'Searching needs the phone app.' : 'Make sure this phone is on the school Wi-Fi, not mobile data.'}>No school server found</Title>
          <Row>
            <Button label="Search again" kind="secondary" grow onPress={() => search(true)} />
            <Button label="Enter address" kind="secondary" grow onPress={() => setTyping(true)} />
          </Row>
        </Card>
      )}

      {typing && (
        <Card>
          <Field label="School server address" value={address} onChangeText={setAddress} autoCapitalize="none" keyboardType="url"
            placeholder="For example 192.168.88.10" hint="Your admin can see it on the school server page." />
          <Row>
            <Button label="Connect" grow busy={busy} disabled={!address.trim()} onPress={useAddress} />
            <Button label="Cancel" kind="secondary" grow onPress={() => setTyping(false)} />
          </Row>
        </Card>
      )}
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />

      <Card>
        <Title>How it works</Title>
        {[
          'Open Offline Assessment and tap New test. Choose the class and subject, and set a time limit if you want one.',
          'Add objective questions with the right answer, and written answers that you mark. You can pick questions from Past Questions.',
          'Save and open it. Students see it under Offline Assessment in the CAS Student app and sign in with their own ID.',
          'Watch who has submitted, mark written answers, and close it when time is up.',
          'When the school server has internet, results go to CAS LMS, where you can use Sync to CA.',
        ].map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={{ color: C.primaryText, fontWeight: '800', fontSize: 15, width: 18 }}>{i + 1}</Text>
            <Body style={{ flex: 1 }}>{t}</Body>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
