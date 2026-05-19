import React, { useCallback, useRef, useState } from 'react';
import {
  Alert, Image, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

const IS_WEB = Platform.OS === 'web';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/context/ThemeContext';

interface PlcSession {
  id: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location_name: string;
  has_coordinates: boolean;
}

interface TodayResponse {
  session: PlcSession;
  submitted: { id: string; submitted_at: string } | null;
}

export default function PlcScreen() {
  const { user } = useAuth();
  const Colors   = useTheme();

  const [loading,      setLoading]      = useState(true);
  const [todayData,    setTodayData]    = useState<TodayResponse | null>(null);

  // Form fields
  const [agenda,       setAgenda]       = useState('');
  const [gps,          setGps]          = useState('');
  const [gpsAcquiring, setGpsAcquiring] = useState(true);
  const [gpsError,     setGpsError]     = useState('');
  const [photoUri,     setPhotoUri]     = useState<string | null>(null);
  const [photoBase64,  setPhotoBase64]  = useState<string | null>(null);
  const [photoSizeKb,  setPhotoSizeKb]  = useState<number | null>(null);
  const [submitting,   setSubmitting]   = useState(false);

  // Camera
  const [showCamera,  setShowCamera]  = useState(false);
  const [facing,      setFacing]      = useState<'back' | 'front'>('front');
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // QR Scanner
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrVerified,    setQrVerified]    = useState(false);
  const [qrLocation,    setQrLocation]    = useState('');
  const [qrError,       setQrError]       = useState('');
  const [qrVerifying,   setQrVerifying]   = useState(false);
  const qrScannedRef = useRef(false);

  useFocusEffect(useCallback(() => {
    loadToday();
    grabGps();
  }, [user]));

  async function loadToday() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.get<TodayResponse | null>('/api/plc/today');
      setTodayData(res.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function grabGps() {
    setGpsAcquiring(true);
    setGpsError('');
    if (IS_WEB) {
      if (!navigator.geolocation) { setGpsError('GPS not available.'); setGpsAcquiring(false); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => { setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`); setGpsAcquiring(false); },
        ()    => { setGpsError('GPS unavailable. Tap Refresh.'); setGpsAcquiring(false); },
        { timeout: 15000 }
      );
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGpsError('GPS permission denied.'); setGpsAcquiring(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGps(`${loc.coords.latitude.toFixed(6)},${loc.coords.longitude.toFixed(6)}`);
      setGpsAcquiring(false);
    } catch {
      setGpsError('GPS unavailable. Tap Refresh.');
      setGpsAcquiring(false);
    }
  }

  // ── QR ────────────────────────────────────────────────────────
  async function openQrScanner() {
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) { Alert.alert('Camera permission denied'); return; }
    }
    qrScannedRef.current = false;
    setQrError('');
    setShowQrScanner(true);
  }

  async function handleQrScanned({ data }: { data: string }) {
    if (qrScannedRef.current || qrVerifying || !todayData?.session) return;
    qrScannedRef.current = true;
    setQrVerifying(true);
    setQrError('');
    try {
      const res = await api.post<{ valid: boolean; locationName: string }>('/api/plc/verify-qr', {
        token: data,
        sessionId: todayData.session.id,
      });
      if (res.data.valid) {
        setQrVerified(true);
        setQrLocation(res.data.locationName);
        setShowQrScanner(false);
      } else {
        setQrError('Wrong venue. Scan the QR code posted at the PLC room.');
        qrScannedRef.current = false;
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Invalid QR code. Try again.';
      setQrError(msg);
      qrScannedRef.current = false;
    } finally {
      setQrVerifying(false);
    }
  }

  // ── Camera ────────────────────────────────────────────────────
  async function openCamera() {
    if (IS_WEB) {
      await new Promise<void>((resolve) => {
        const input = (document as any).createElement('input') as HTMLInputElement;
        input.type = 'file'; input.accept = 'image/*';
        (input as any).capture = 'environment';
        input.style.display = 'none';
        (document as any).body.appendChild(input);
        input.onchange = () => {
          const file = input.files?.[0];
          (document as any).body.removeChild(input);
          if (!file) { resolve(); return; }
          const img = (document as any).createElement('img') as HTMLImageElement;
          const url = URL.createObjectURL(file);
          img.onload = () => {
            const compress = (w: number, q: number) => {
              const c = (document as any).createElement('canvas') as HTMLCanvasElement;
              const scale = Math.min(1, w / img.width);
              c.width = Math.round(img.width * scale);
              c.height = Math.round(img.height * scale);
              c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
              return c.toDataURL('image/jpeg', q);
            };
            let dataUrl = compress(640, 0.4);
            const raw = dataUrl.split(',')[1] ?? '';
            if (raw.length * 0.75 > 40 * 1024) dataUrl = compress(480, 0.25);
            const b64 = dataUrl.split(',')[1] ?? '';
            setPhotoUri(dataUrl);
            setPhotoBase64(dataUrl);
            setPhotoSizeKb(Math.round((b64.length * 0.75) / 1024));
            URL.revokeObjectURL(url);
            resolve();
          };
          img.src = url;
        };
        input.click();
      });
      return;
    }
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) { Alert.alert('Camera permission denied'); return; }
    }
    setShowCamera(true);
  }

  async function takePicture() {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5, base64: false });
      if (!photo) return;
      let compressed = await ImageManipulator.manipulateAsync(
        photo.uri, [{ resize: { width: 640 } }],
        { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (compressed.base64 && compressed.base64.length * 0.75 > 40 * 1024) {
        compressed = await ImageManipulator.manipulateAsync(
          photo.uri, [{ resize: { width: 480 } }],
          { compress: 0.25, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
      }
      setPhotoUri(compressed.uri);
      setPhotoBase64(`data:image/jpeg;base64,${compressed.base64}`);
      setPhotoSizeKb(Math.round((compressed.base64!.length * 0.75) / 1024));
      setShowCamera(false);
    } catch {
      Alert.alert('Error', 'Could not capture photo.');
    }
  }

  function resetForm() {
    setAgenda('');
    setPhotoUri(null);
    setPhotoBase64(null);
    setPhotoSizeKb(null);
    setQrVerified(false);
    setQrLocation('');
    setQrError('');
  }

  // ── Submit ────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!todayData?.session) return;
    if (gpsAcquiring)  { Alert.alert('GPS acquiring', 'GPS is still being determined. Please wait.'); return; }
    if (!gps)          { Alert.alert('GPS required', gpsError || 'GPS coordinates are required. Tap Refresh.'); return; }
    if (!photoBase64)  { Alert.alert('Photo required', 'Please take a photo at the PLC venue.'); return; }
    if (!IS_WEB && !qrVerified) { Alert.alert('QR Required', 'Please scan the PLC venue QR code to verify your presence.'); return; }

    setSubmitting(true);
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert('No Internet', 'You are offline. Please connect and try again.');
        return;
      }
      await api.post('/api/plc/submit', {
        sessionId:      todayData.session.id,
        agenda:         agenda.trim() || undefined,
        gpsCoordinates: gps,
        imageBase64:    photoBase64,
        photoSizeKb:    photoSizeKb ?? undefined,
      });
      Alert.alert('PLC Attendance Recorded', 'Your attendance for today\'s PLC session has been submitted.');
      resetForm();
      await loadToday();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── QR Scanner full-screen view ───────────────────────────────
  if (showQrScanner) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={qrScannedRef.current ? undefined : handleQrScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.qrOverlay} pointerEvents="none">
          <View style={styles.qrFrame} />
        </View>
        <View style={styles.qrStatusStrip}>
          {qrVerifying
            ? <Text style={styles.qrStatusText}>Verifying…</Text>
            : qrError
              ? <>
                  <Text style={[styles.qrStatusText, { color: '#FCA5A5' }]}>{qrError}</Text>
                  <TouchableOpacity onPress={() => { qrScannedRef.current = false; setQrError(''); }}>
                    <Text style={styles.qrRetryText}>Tap to retry</Text>
                  </TouchableOpacity>
                </>
              : <Text style={styles.qrStatusText}>Align the PLC venue QR code with the frame</Text>
          }
        </View>
        <TouchableOpacity
          style={[styles.cancelBtn, { position: 'absolute', top: 56, left: 20 }]}
          onPress={() => { setShowQrScanner(false); qrScannedRef.current = false; setQrError(''); }}
        >
          <Text style={styles.cancelBtnText}>✕  Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Camera full-screen view ───────────────────────────────────
  if (showCamera && !IS_WEB) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} />
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCamera(false)}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureBtn} onPress={takePicture}>
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
            <Text style={styles.flipBtnText}>⇄</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.emptyRoot, { backgroundColor: '#F4EFE6' }]}>
        <Text style={{ color: '#8C7E6E', fontSize: 15 }}>Loading…</Text>
      </View>
    );
  }

  // ── No PLC today ──────────────────────────────────────────────
  if (!todayData) {
    return (
      <View style={styles.emptyRoot}>
        <View style={[styles.emptyIconWrap, { backgroundColor: Colors.accentLight }]}>
          <Ionicons name="people-outline" size={44} color={Colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>No PLC Today</Text>
        <Text style={styles.emptySub}>There is no PLC session scheduled for today. Check back on your scheduled PLC day.</Text>
      </View>
    );
  }

  const { session, submitted } = todayData;

  // ── Already submitted ─────────────────────────────────────────
  if (submitted) {
    const submittedAt = new Date(submitted.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Session card */}
        <View style={[styles.sessionCard, { borderColor: Colors.primary }]}>
          <View style={styles.sessionCardLeft}>
            <Text style={[styles.sessionTime, { color: Colors.primary }]}>{session.start_time?.slice(0, 5)} – {session.end_time?.slice(0, 5)}</Text>
            <Text style={styles.sessionTitle}>{session.title}</Text>
            <Text style={styles.sessionLocation}>{session.location_name}</Text>
          </View>
          <Ionicons name="people" size={28} color={Colors.primary} />
        </View>

        {/* Done banner */}
        <View style={styles.doneBanner}>
          <Ionicons name="checkmark-circle" size={28} color="#2D7A4F" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.doneTitle}>Attendance Submitted</Text>
            <Text style={styles.doneSub}>Submitted at {submittedAt}</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Submission form ───────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Session card */}
      <Text style={styles.sectionTitle}>Today's PLC Session</Text>
      <View style={[styles.sessionCard, { borderColor: Colors.primary }]}>
        <View style={styles.sessionCardLeft}>
          <Text style={[styles.sessionTime, { color: Colors.primary }]}>{session.start_time?.slice(0, 5)} – {session.end_time?.slice(0, 5)}</Text>
          <Text style={styles.sessionTitle}>{session.title}</Text>
          <Text style={styles.sessionLocation}>{session.location_name}</Text>
        </View>
        <Ionicons name="people" size={28} color={Colors.primary} />
      </View>

      {/* GPS */}
      <Text style={styles.sectionTitle}>GPS Location</Text>
      {gpsAcquiring ? (
        <View style={styles.gpsRow}>
          <Text style={styles.gpsMuted}>Acquiring GPS…</Text>
        </View>
      ) : gpsError ? (
        <View style={[styles.gpsRow, styles.gpsRowError]}>
          <Text style={styles.gpsErrorText}>{gpsError}</Text>
          <TouchableOpacity onPress={grabGps}><Text style={[styles.gpsRefresh, { color: Colors.primary }]}>Refresh</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={styles.gpsRow}>
          <Text style={styles.gpsValue}>{gps}</Text>
          <TouchableOpacity onPress={grabGps}><Text style={[styles.gpsRefresh, { color: Colors.primary }]}>Refresh</Text></TouchableOpacity>
        </View>
      )}

      {/* Agenda (optional) */}
      <Text style={styles.sectionTitle}>Discussion Agenda <Text style={styles.optionalTag}>(optional)</Text></Text>
      <Input
        placeholder="What was discussed today?"
        value={agenda}
        onChangeText={setAgenda}
        multiline
        numberOfLines={3}
        style={{ marginBottom: 4 }}
      />

      {/* Photo */}
      <Text style={styles.sectionTitle}>PLC Venue Photo *</Text>
      {photoUri ? (
        <View style={styles.photoPreviewWrap}>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
          {photoSizeKb != null && <Text style={styles.photoSize}>{photoSizeKb} KB</Text>}
          <TouchableOpacity style={styles.retakeBtn} onPress={openCamera}>
            <Text style={[styles.retakeBtnText, { color: Colors.primary }]}>Retake Photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.cameraPlaceholder} onPress={openCamera}>
          <Text style={styles.cameraIcon}>📷</Text>
          <Text style={styles.cameraPlaceholderText}>Tap to take a photo</Text>
        </TouchableOpacity>
      )}

      {/* QR Code (native only) */}
      {!IS_WEB && (
        <>
          <Text style={styles.sectionTitle}>Venue QR Code *</Text>
          {qrVerified ? (
            <View style={styles.qrVerifiedCard}>
              <Ionicons name="checkmark-circle" size={22} color="#2D7A4F" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.qrVerifiedTitle}>Venue Verified</Text>
                <Text style={styles.qrVerifiedSub}>{qrLocation}</Text>
              </View>
              <TouchableOpacity onPress={() => { setQrVerified(false); setQrLocation(''); }}>
                <Text style={[styles.qrRescanText, { color: Colors.primary }]}>Rescan</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.qrScanCard} onPress={openQrScanner}>
              <View style={[styles.qrScanIconWrap, { backgroundColor: Colors.accentLight }]}>
                <Ionicons name="qr-code-outline" size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.qrScanTitle, { color: Colors.primary }]}>Scan PLC Venue QR Code</Text>
                <Text style={styles.qrScanSub}>Scan the QR code posted at the PLC room</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#C0B8AF" />
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Submit */}
      <Button
        title={submitting ? 'Submitting…' : 'Submit PLC Attendance'}
        onPress={handleSubmit}
        disabled={submitting}
        style={styles.submitBtn}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: '#F4EFE6' },
  content:               { padding: 16, paddingBottom: 48 },
  sectionTitle:          { fontSize: 13, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  optionalTag:           { fontSize: 11, fontWeight: '500', color: '#B0A898', textTransform: 'none' },
  // Session card
  sessionCard:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, padding: 16, marginBottom: 4 },
  sessionCardLeft:       { flex: 1 },
  sessionTime:           { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  sessionTitle:          { fontSize: 17, fontWeight: '800', color: '#1C1208', marginBottom: 2 },
  sessionLocation:       { fontSize: 13, color: '#8C7E6E' },
  // Done banner
  doneBanner:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E4F4EB', borderRadius: 14, borderWidth: 1.5, borderColor: '#A7D7B8', padding: 16, marginTop: 16 },
  doneTitle:             { fontSize: 15, fontWeight: '700', color: '#1A4D2E' },
  doneSub:               { fontSize: 13, color: '#2D7A4F', marginTop: 2 },
  // Empty state
  emptyRoot:             { flex: 1, backgroundColor: '#F4EFE6', justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIconWrap:         { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle:            { fontSize: 22, fontWeight: '800', color: '#1C1208', marginBottom: 10, textAlign: 'center' },
  emptySub:              { fontSize: 14, color: '#8C7E6E', textAlign: 'center', lineHeight: 22 },
  // GPS
  gpsRow:                { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2D9CC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14 },
  gpsRowError:           { borderColor: '#E8A020', backgroundColor: '#FFFBF2' },
  gpsValue:              { fontSize: 13, color: '#1C1208', flex: 1 },
  gpsMuted:              { fontSize: 13, color: '#8C7E6E', flex: 1, fontStyle: 'italic' },
  gpsErrorText:          { fontSize: 13, color: '#B45309', flex: 1 },
  gpsRefresh:            { fontSize: 13, fontWeight: '600' },
  // Photo
  photoPreviewWrap:      { marginBottom: 20 },
  photoPreview:          { width: '100%', height: 200, borderRadius: 12 },
  photoSize:             { fontSize: 11, color: '#8C7E6E', textAlign: 'right', marginTop: 4 },
  retakeBtn:             { marginTop: 8, alignItems: 'center' },
  retakeBtnText:         { fontWeight: '600', fontSize: 14 },
  cameraPlaceholder:     { backgroundColor: '#fff', borderWidth: 2, borderColor: '#E2D9CC', borderStyle: 'dashed', borderRadius: 12, height: 160, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  cameraIcon:            { fontSize: 40 },
  cameraPlaceholderText: { fontSize: 15, color: '#8C7E6E', marginTop: 8 },
  submitBtn:             { marginTop: 8 },
  // Camera
  cameraContainer:       { flex: 1, backgroundColor: '#000' },
  camera:                { flex: 1 },
  cameraControls:        { position: 'absolute', bottom: 48, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  captureBtn:            { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureBtnInner:       { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  cancelBtn:             { width: 72, alignItems: 'center' },
  cancelBtnText:         { color: '#fff', fontSize: 15, fontWeight: '600' },
  flipBtn:               { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  flipBtnText:           { color: '#fff', fontSize: 28, fontWeight: '700' },
  // QR scanner overlay
  qrOverlay:             { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  qrFrame:               { width: 220, height: 220, borderWidth: 3, borderColor: '#fff', borderRadius: 16, backgroundColor: 'transparent' },
  qrStatusStrip:         { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.75)', paddingVertical: 24, paddingHorizontal: 24, alignItems: 'center', gap: 10 },
  qrStatusText:          { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  qrRetryText:           { color: '#FCD34D', fontSize: 13, fontWeight: '700', marginTop: 6 },
  // QR form card — unverified
  qrScanCard:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#E2D9CC', padding: 14, marginBottom: 16, gap: 12 },
  qrScanIconWrap:        { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  qrScanTitle:           { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  qrScanSub:             { fontSize: 12, color: '#8C7E6E' },
  // QR form card — verified
  qrVerifiedCard:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E4F4EB', borderRadius: 14, borderWidth: 1.5, borderColor: '#A7D7B8', padding: 14, marginBottom: 16 },
  qrVerifiedTitle:       { fontSize: 14, fontWeight: '700', color: '#1A4D2E' },
  qrVerifiedSub:         { fontSize: 12, color: '#2D7A4F', marginTop: 1 },
  qrRescanText:          { fontSize: 12, fontWeight: '700' },
});
