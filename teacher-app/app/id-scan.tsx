import React, { useRef, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { StudentSearch } from '@/components/StudentSearch';
import { Body, Button, Card, Loading, Notice, Row, Screen } from '@/components/ui/kit';

interface Verify {
  valid: boolean; status?: string; card_status?: 'active' | 'revoked' | 'expired' | null; message?: string; exeat_approved?: boolean;
  student?: { name: string; class_name: string; index_number: string | null; student_code: string; photo_url: string | null };
}
type Result = { kind: 'valid' | 'invalid'; data: Verify; manual?: boolean } | { kind: 'error'; message: string } | null;

export default function IdScanScreen() {
  const C = useTheme();
  const [perm, requestPerm] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const handled = useRef(false);

  async function verify(token: string, byStudentId = false) {
    setBusy(true); setResult(null);
    try {
      const path = byStudentId ? `/api/verify/student/${encodeURIComponent(token)}` : `/api/verify/${encodeURIComponent(token)}`;
      const { data } = await api.get<Verify>(path);
      setResult({ kind: data.valid ? 'valid' : 'invalid', data, manual: byStudentId });
    } catch (e) {
      const ax = e as { response?: { status?: number; data?: Verify } };
      if (ax.response?.status === 404) setResult({ kind: 'invalid', data: ax.response.data ?? { valid: false, message: byStudentId ? 'No student with that ID in this school.' : 'QR code not recognised.' } });
      else setResult({ kind: 'error', message: 'Could not reach the server. Check your connection and try again.' });
    } finally { setBusy(false); }
  }

  async function startScan() {
    setResult(null);
    if (!perm?.granted) {
      const p = await requestPerm();
      if (!p.granted) { setResult({ kind: 'error', message: 'Camera access is off for CAS Teacher. Allow it in phone settings, or check by student ID below.' }); return; }
    }
    handled.current = false; setScanning(true);
  }

  const colour = result?.kind === 'valid' ? (result.data.exeat_approved ? C.warning : C.success)
    : result?.kind === 'invalid' && result.data.status === 'expired' ? C.warning : C.danger;

  return (
    <Screen>
      <Body soft>Check a student's ID card and whether they have an approved exeat.</Body>
      {!result && (
        <>
          {scanning && Platform.OS !== 'web' ? (
            <View style={{ gap: 10 }}>
              <View style={{ aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
                <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => { if (handled.current || !data) return; handled.current = true; setScanning(false); verify(data); }} />
                <View pointerEvents="none" style={{ position: 'absolute', top: '20%', left: '20%', right: '20%', bottom: '20%', borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 14, opacity: 0.7 }} />
              </View>
              <Button label="Cancel" kind="secondary" onPress={() => setScanning(false)} />
            </View>
          ) : (
            <Button label="Scan an ID card" icon="qr-code-outline" onPress={startScan} disabled={Platform.OS === 'web'} />
          )}
          <Card>
            <StudentSearch endpoint="/api/verify/students/search" label="Or check by student name or ID" selected={null}
              onSelect={s => s && verify(s.student_code, true)} />
          </Card>
          {busy && <Loading label="Checking…" />}
        </>
      )}

      {result && (
        <Card accent={colour}>
          {result.kind === 'error' ? <Text style={{ color: colour, fontWeight: '700', fontSize: 15 }}>{result.message}</Text>
            : result.kind === 'valid' ? (
              <>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  {result.data.student?.photo_url
                    ? <Image source={{ uri: result.data.student.photo_url }} style={{ width: 64, height: 64, borderRadius: 12 }} accessibilityLabel={`Photo of ${result.data.student.name}`} />
                    : <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-outline" size={28} color={C.muted} /></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{result.data.student?.name ?? 'Valid CAS student'}</Text>
                    {result.data.student && <Body small soft>{result.data.student.student_code}, {result.data.student.class_name}</Body>}
                  </View>
                </View>
                <Text style={{ color: colour, fontSize: 15, fontWeight: '700' }}>
                  {result.data.exeat_approved ? 'Exeat approved: allowed off campus' : 'No active exeat: should be on campus'}
                </Text>
                {!!result.data.message && <Body small soft>{result.data.message}</Body>}
                {result.manual && (
                  <Body small soft>Checked by student ID. {result.data.card_status === 'active' ? 'Their ID card is active.'
                    : result.data.card_status === 'revoked' ? 'Their ID card has been cancelled.'
                    : result.data.card_status === 'expired' ? 'Their ID card has expired.' : 'No ID card has been issued to them.'}</Body>
                )}
              </>
            ) : <Text style={{ color: colour, fontSize: 15, fontWeight: '700' }}>{result.data.message ?? 'QR code not recognised.'}</Text>}
          <Row>
            <Button label="Scan another" grow onPress={startScan} disabled={Platform.OS === 'web'} />
            <Button label="Check another ID" kind="secondary" grow onPress={() => setResult(null)} />
          </Row>
        </Card>
      )}
      <Notice tone="info" text={Platform.OS === 'web' ? 'Scanning needs the phone app; check by student ID here.' : null} />
    </Screen>
  );
}
