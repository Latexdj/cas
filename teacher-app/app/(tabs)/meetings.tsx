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

interface Meeting {
  id: string;
  title: string;
  meeting_type: string;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string;
  has_coordinates: boolean;
  submitted: { id: string; submitted_at: string } | null;
}

const TYPE_COLORS: Record<string, string> = {
  'PLC':              '#15803D',
  'Morning Briefing': '#1D4ED8',
  'Staff Meeting':    '#7E22CE',
  'PTA':              '#B45309',
  'Other':            '#475569',
};

export default function MeetingsScreen() {
  const { user } = useAuth();
  const Colors   = useTheme();

  const [loading,      setLoading]      = useState(true);
  const [meetings,     setMeetings]     = useState<Meeting[]>([]);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);

  // Form fields
  const [notes,        setNotes]        = useState('');
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
    loadMeetings();
    grabGps();
  }, [user]));

  async function loadMeetings() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.get<Meeting[]>('/api/meetings/today');
      setMeetings(Array.isArray(res.data) ? res.data : []);
    } catch {
      setMeetings([]);
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

  function openForm(meeting: Meeting) {
    setActiveMeeting(meeting);
    setNotes('');
    setPhotoUri(null);
    setPhotoBase64(null);
    setPhotoSizeKb(null);
    setQrVerified(false);
    setQrLocation('');
    setQrError('');
  }

  function closeForm() {
    setActiveMeeting(null);
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
    if (qrScannedRef.current || qrVerifying || !activeMeeting) return;
    qrScannedRef.current = true;
    setQrVerifying(true);
    setQrError('');
    try {
      const res = await api.post<{ valid: boolean; locationName: string }>('/api/meetings/verify-qr', {
        token: data,
        meetingId: activeMeeting.id,
      });
      if (res.data.valid) {
        setQrVerified(true);
        setQrLocation(res.data.locationName);
        setShowQrScanner(false);
      } else {
        setQrError('Wrong venue. Scan the QR code posted at the meeting room.');
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
    setNotes('');
    setPhotoUri(null);
    setPhotoBase64(null);
    setPhotoSizeKb(null);
    setQrVerified(false);
    setQrLocation('');
    setQrError('');
  }

  // ── Submit ────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!activeMeeting) return;
    if (gpsAcquiring)  { Alert.alert('GPS acquiring', 'GPS is still being determined. Please wait.'); return; }
    if (!gps)          { Alert.alert('GPS required', gpsError || 'GPS coordinates are required. Tap Refresh.'); return; }
    if (!photoBase64)  { Alert.alert('Photo required', 'Please take a photo at the meeting venue.'); return; }
    if (!IS_WEB && !qrVerified) { Alert.alert('QR Required', 'Please scan the venue QR code to verify your presence.'); return; }

    setSubmitting(true);
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert('No Internet', 'You are offline. Please connect and try again.');
        return;
      }
      await api.post('/api/meetings/submit', {
        meetingId:      activeMeeting.id,
        notes:          notes.trim() || undefined,
        gpsCoordinates: gps,
        imageBase64:    photoBase64,
        photoSizeKb:    photoSizeKb ?? undefined,
      });
      Alert.alert('Attendance Recorded', `Your attendance for "${activeMeeting.title}" has been submitted.`);
      resetForm();
      closeForm();
      await loadMeetings();
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
              : <Text style={styles.qrStatusText}>Align the meeting venue QR code with the frame</Text>
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

  // ── No meetings today ─────────────────────────────────────────
  if (meetings.length === 0) {
    return (
      <View style={styles.emptyRoot}>
        <View style={[styles.emptyIconWrap, { backgroundColor: Colors.accentLight }]}>
          <Ionicons name="people-outline" size={44} color={Colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>No Meetings Today</Text>
        <Text style={styles.emptySub}>There are no meetings scheduled for today. Check back later.</Text>
      </View>
    );
  }

  // ── Submission form for selected meeting ──────────────────────
  if (activeMeeting) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Meeting card */}
        <TouchableOpacity onPress={closeForm} style={styles.backRow}>
          <Ionicons name="arrow-back" size={18} color="#8C7E6E" />
          <Text style={styles.backText}>Back to meetings</Text>
        </TouchableOpacity>

        <View style={[styles.sessionCard, { borderColor: Colors.primary }]}>
          <View style={styles.sessionCardLeft}>
            <Text style={[styles.typeBadge, { color: TYPE_COLORS[activeMeeting.meeting_type] ?? '#475569' }]}>
              {activeMeeting.meeting_type}
            </Text>
            <Text style={[styles.sessionTime, { color: Colors.primary }]}>
              {activeMeeting.start_time?.slice(0, 5)} – {activeMeeting.end_time?.slice(0, 5)}
            </Text>
            <Text style={styles.sessionTitle}>{activeMeeting.title}</Text>
            <Text style={styles.sessionLocation}>{activeMeeting.location_name}</Text>
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

        {/* Notes (optional) */}
        <Text style={styles.sectionTitle}>Notes <Text style={styles.optionalTag}>(optional)</Text></Text>
        <Input
          placeholder="Any notes about the meeting?"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          style={{ marginBottom: 4 }}
        />

        {/* Photo */}
        <Text style={styles.sectionTitle}>Meeting Venue Photo *</Text>
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
                  <Text style={[styles.qrScanTitle, { color: Colors.primary }]}>Scan Meeting Venue QR Code</Text>
                  <Text style={styles.qrScanSub}>Scan the QR code posted at {activeMeeting.location_name}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C0B8AF" />
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Submit */}
        <Button
          title={submitting ? 'Submitting…' : 'Submit Attendance'}
          onPress={handleSubmit}
          disabled={submitting}
          style={styles.submitBtn}
        />
      </ScrollView>
    );
  }

  // ── Meeting list ──────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Today's Meetings</Text>
      <Text style={styles.pageSub}>
        {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>

      {meetings.map(meeting => {
        const typeColor = TYPE_COLORS[meeting.meeting_type] ?? '#475569';
        return (
          <View key={meeting.id} style={[styles.meetingCard, { borderLeftColor: typeColor }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.typeBadge, { color: typeColor }]}>{meeting.meeting_type}</Text>
              <Text style={styles.meetingTitle}>{meeting.title}</Text>
              <Text style={styles.meetingMeta}>
                {meeting.start_time?.slice(0, 5)} – {meeting.end_time?.slice(0, 5)} · {meeting.location_name}
              </Text>
            </View>

            {meeting.submitted ? (
              <View style={styles.submittedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#2D7A4F" />
                <Text style={styles.submittedText}>Done</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.submitMeetingBtn, { backgroundColor: Colors.primary }]}
                onPress={() => openForm(meeting)}
              >
                <Text style={styles.submitMeetingBtnText}>Submit</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: '#F4EFE6' },
  content:               { padding: 16, paddingBottom: 48 },
  pageTitle:             { fontSize: 22, fontWeight: '800', color: '#1C1208', marginBottom: 4 },
  pageSub:               { fontSize: 13, color: '#8C7E6E', marginBottom: 16 },
  sectionTitle:          { fontSize: 13, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  optionalTag:           { fontSize: 11, fontWeight: '500', color: '#B0A898', textTransform: 'none' },
  // Meeting list card
  meetingCard:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: '#E2D9CC', borderLeftWidth: 4, padding: 14, marginBottom: 12, gap: 12 },
  typeBadge:             { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  meetingTitle:          { fontSize: 16, fontWeight: '800', color: '#1C1208', marginBottom: 3 },
  meetingMeta:           { fontSize: 13, color: '#8C7E6E' },
  submittedBadge:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E4F4EB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  submittedText:         { fontSize: 12, fontWeight: '700', color: '#2D7A4F' },
  submitMeetingBtn:      { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  submitMeetingBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
  // Session card (form view)
  backRow:               { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText:              { fontSize: 14, color: '#8C7E6E', fontWeight: '600' },
  sessionCard:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, padding: 16, marginBottom: 4 },
  sessionCardLeft:       { flex: 1 },
  sessionTime:           { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  sessionTitle:          { fontSize: 17, fontWeight: '800', color: '#1C1208', marginBottom: 2 },
  sessionLocation:       { fontSize: 13, color: '#8C7E6E' },
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
