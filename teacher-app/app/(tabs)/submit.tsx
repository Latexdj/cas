import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, Modal, FlatList, Image,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';

const IS_WEB = Platform.OS === 'web';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/colors';
import { TimetableSlot, Location as LocationType } from '@/types/api';

export default function SubmitScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ slotId?: string; subject?: string; className?: string; periods?: string }>();

  // Form state
  const [slots,       setSlots]       = useState<TimetableSlot[]>([]);
  const [locations,   setLocations]   = useState<LocationType[]>([]);
  const [subject,     setSubject]     = useState('');
  const [classNames,  setClassNames]  = useState('');
  const [periods,     setPeriods]     = useState('');
  const [topic,       setTopic]       = useState('');
  const [locationName, setLocationName] = useState('');
  const [gps,         setGps]         = useState('');
  const [photoUri,    setPhotoUri]    = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [showLocPicker, setShowLocPicker] = useState(false);

  // Camera state
  const [showCamera, setShowCamera] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // Pre-fill from timetable tap on home screen
  useEffect(() => {
    if (params.subject)   setSubject(params.subject);
    if (params.className) setClassNames(params.className);
    if (params.periods)   setPeriods(params.periods);
  }, [params.subject, params.className, params.periods]);

  useFocusEffect(useCallback(() => {
    loadData();
    grabGps();
  }, []));

  async function loadData() {
    if (!user) return;
    try {
      const [ttRes, locRes] = await Promise.all([
        api.get(`/api/timetable/today/${user.id}`),
        api.get('/api/locations'),
      ]);
      setSlots(ttRes.data);
      setLocations(locRes.data);
    } catch {}
  }

  async function grabGps() {
    if (IS_WEB) {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`),
        () => {}
      );
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGps(`${loc.coords.latitude.toFixed(6)},${loc.coords.longitude.toFixed(6)}`);
    } catch {}
  }

  async function openCamera() {
    if (IS_WEB) {
      Alert.alert('Camera not available', 'On web, please enter a placeholder photo. Use the real mobile app to capture classroom photos.');
      setPhotoUri('web-placeholder');
      setPhotoBase64('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      return;
    }
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) { Alert.alert('Camera permission denied'); return; }
    }
    setShowCamera(true);
  }

  async function takePhoto() {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.6 });
      if (photo) {
        setPhotoUri(photo.uri);
        setPhotoBase64(`data:image/jpeg;base64,${photo.base64}`);
        setShowCamera(false);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not capture photo.');
    }
  }

  async function handleSubmit() {
    if (!subject.trim() || !classNames.trim() || !periods || !photoBase64) {
      Alert.alert('Missing fields', 'Subject, class names, periods and a photo are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/attendance/submit', {
        teacherId:    user!.id,
        subject:      subject.trim(),
        classNames:   classNames.trim(),
        periods:      parseInt(periods, 10),
        topic:        topic.trim() || undefined,
        gpsCoordinates: gps || undefined,
        locationName: locationName || undefined,
        imageBase64:  photoBase64,
      });
      Alert.alert('✅ Submitted', 'Attendance recorded successfully.');
      resetForm();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSubject(''); setClassNames(''); setPeriods('');
    setTopic(''); setLocationName(''); setPhotoUri(null); setPhotoBase64(null);
  }

  function fillFromSlot(slot: TimetableSlot) {
    setSubject(slot.subject);
    setClassNames(slot.class_name);
    if (slot.periods) setPeriods(String(slot.periods));
  }

  // ── CAMERA VIEW ──────────────────────────────────────────────
  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCamera(false)}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
          <View style={{ width: 72 }} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>Quick Fill from Timetable</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slotScroll}>
        {slots.map((s) => (
          <TouchableOpacity key={s.id} style={styles.slotChip} onPress={() => fillFromSlot(s)}>
            <Text style={styles.slotChipText}>{s.subject}</Text>
            <Text style={styles.slotChipSub}>{s.class_name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>Attendance Details</Text>
      <Input label="Subject *" value={subject} onChangeText={setSubject} placeholder="e.g. Mathematics" />
      <Input label="Class Name(s) *" value={classNames} onChangeText={setClassNames} placeholder="e.g. Form 1A, Form 1B" />
      <Input label="Periods *" value={periods} onChangeText={setPeriods} keyboardType="number-pad" placeholder="e.g. 2" maxLength={2} />
      <Input label="Topic" value={topic} onChangeText={setTopic} placeholder="Optional lesson topic" />

      {/* Location picker */}
      <Text style={styles.fieldLabel}>Location</Text>
      <TouchableOpacity style={styles.picker} onPress={() => setShowLocPicker(true)}>
        <Text style={locationName ? styles.pickerValue : styles.pickerPlaceholder}>
          {locationName || 'Select classroom location'}
        </Text>
        <Text style={styles.pickerArrow}>▾</Text>
      </TouchableOpacity>

      {/* GPS */}
      <Text style={styles.fieldLabel}>GPS</Text>
      <View style={styles.gpsRow}>
        <Text style={gps ? styles.gpsValue : styles.gpsMuted}>{gps || 'Acquiring location…'}</Text>
        <TouchableOpacity onPress={grabGps}><Text style={styles.gpsRefresh}>↻ Refresh</Text></TouchableOpacity>
      </View>

      {/* Photo */}
      <Text style={styles.sectionTitle}>Classroom Photo *</Text>
      {photoUri ? (
        <View style={styles.photoPreviewWrap}>
          {IS_WEB
            ? <View style={[styles.photoPreview, { backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontSize: 32 }}>✅</Text>
                <Text style={{ color: Colors.success, fontWeight: '600', marginTop: 8 }}>Photo placeholder set (web mode)</Text>
              </View>
            : <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          }
          <TouchableOpacity style={styles.retakeBtn} onPress={openCamera}>
            <Text style={styles.retakeBtnText}>{IS_WEB ? 'Reset' : 'Retake Photo'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.cameraPlaceholder} onPress={openCamera}>
          <Text style={styles.cameraIcon}>{IS_WEB ? '🖥️' : '📷'}</Text>
          <Text style={styles.cameraPlaceholderText}>{IS_WEB ? 'Tap to set photo (web mode)' : 'Tap to take photo'}</Text>
          {IS_WEB && <Text style={styles.webNote}>Camera works on mobile — this sets a placeholder for testing</Text>}
        </TouchableOpacity>
      )}

      <Button label="Submit Attendance" onPress={handleSubmit} loading={submitting} style={styles.submitBtn} />

      {/* Location picker modal */}
      <Modal visible={showLocPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Location</Text>
            <FlatList
              data={[{ id: '', name: 'Not specified', type: '', has_coordinates: false }, ...locations]}
              keyExtractor={(l) => l.id || 'none'}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.locItem} onPress={() => { setLocationName(item.name === 'Not specified' ? '' : item.name); setShowLocPicker(false); }}>
                  <Text style={styles.locItemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: Colors.bg },
  content:            { padding: 16, paddingBottom: 40 },
  sectionTitle:       { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 12 },
  slotScroll:         { marginBottom: 16 },
  slotChip:           { backgroundColor: Colors.white, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, borderWidth: 1, borderColor: Colors.border, minWidth: 100 },
  slotChipText:       { fontSize: 13, fontWeight: '600', color: Colors.text },
  slotChipSub:        { fontSize: 11, color: Colors.muted, marginTop: 2 },
  fieldLabel:         { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  picker:             { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  pickerValue:        { fontSize: 15, color: Colors.text },
  pickerPlaceholder:  { fontSize: 15, color: Colors.muted },
  pickerArrow:        { color: Colors.muted, fontSize: 16 },
  gpsRow:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14 },
  gpsValue:           { fontSize: 13, color: Colors.text, flex: 1 },
  gpsMuted:           { fontSize: 13, color: Colors.muted, flex: 1, fontStyle: 'italic' },
  gpsRefresh:         { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  cameraPlaceholder:  { backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: 12, height: 160, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  cameraIcon:         { fontSize: 40 },
  cameraPlaceholderText: { fontSize: 15, color: Colors.muted, marginTop: 8 },
  webNote:               { fontSize: 12, color: Colors.muted, marginTop: 6, textAlign: 'center', paddingHorizontal: 16 },
  photoPreviewWrap:   { marginBottom: 20 },
  photoPreview:       { width: '100%', height: 200, borderRadius: 12 },
  retakeBtn:          { marginTop: 8, alignItems: 'center' },
  retakeBtnText:      { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  submitBtn:          { marginTop: 8 },
  // Camera fullscreen
  cameraContainer:    { flex: 1, backgroundColor: '#000' },
  camera:             { flex: 1 },
  cameraControls:     { position: 'absolute', bottom: 48, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  captureBtn:         { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureBtnInner:    { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  cancelBtn:          { width: 72, alignItems: 'center' },
  cancelBtnText:      { color: '#fff', fontSize: 15, fontWeight: '600' },
  // Location modal
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:         { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', padding: 20 },
  modalTitle:         { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  locItem:            { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  locItemText:        { fontSize: 15, color: Colors.text },
});
