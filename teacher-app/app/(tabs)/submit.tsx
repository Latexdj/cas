import React, { useCallback, useRef, useState } from 'react';
import {
  Alert, Image, Modal, FlatList, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

const IS_WEB = Platform.OS === 'web';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { offlineQueue } from '@/lib/offlineQueue';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/context/ThemeContext';
import { TimetableSlot, Location as LocationType, AttendanceRecord } from '@/types/api';

export default function SubmitScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ slotId?: string }>();
  const Colors = useTheme();

  const [slots,         setSlots]         = useState<TimetableSlot[]>([]);
  const [submitted,     setSubmitted]     = useState<AttendanceRecord[]>([]);
  const [locations,     setLocations]     = useState<LocationType[]>([]);
  const [selectedSlot,  setSelectedSlot]  = useState<TimetableSlot | null>(null);
  const [topic,         setTopic]         = useState('');
  const [locationName,  setLocationName]  = useState('');
  const [gps,           setGps]           = useState('');
  const [photoUri,      setPhotoUri]      = useState<string | null>(null);
  const [photoBase64,   setPhotoBase64]   = useState<string | null>(null);
  const [photoSizeKb,   setPhotoSizeKb]   = useState<number | null>(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [showLocPicker, setShowLocPicker] = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [gpsAcquiring,  setGpsAcquiring]  = useState(true);
  const [gpsError,      setGpsError]      = useState('');

  const [showCamera,    setShowCamera]    = useState(false);
  const [facing,        setFacing]        = useState<'back' | 'front'>('front');
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  useFocusEffect(useCallback(() => {
    loadData();
    grabGps();
  }, [user]));

  async function loadData() {
    if (!user) return;
    setLoading(true);
    try {
      const [ttRes, attRes, locRes] = await Promise.all([
        api.get<TimetableSlot[]>(`/api/timetable/today/${user.id}`),
        api.get<AttendanceRecord[]>(`/api/attendance/today/${user.id}`),
        api.get<LocationType[]>('/api/locations'),
      ]);
      setSlots(ttRes.data);
      setSubmitted(attRes.data);
      setLocations(locRes.data);

      // Auto-select slot if navigated from home with slotId
      if (params.slotId && ttRes.data.length > 0) {
        const match = ttRes.data.find(s => s.id === params.slotId);
        if (match) setSelectedSlot(match);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function grabGps() {
    setGpsAcquiring(true);
    setGpsError('');
    if (IS_WEB) {
      if (!navigator.geolocation) {
        setGpsError('GPS not available in this browser.');
        setGpsAcquiring(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`);
          setGpsAcquiring(false);
        },
        () => {
          setGpsError('GPS unavailable. Tap Refresh to retry.');
          setGpsAcquiring(false);
        },
        { timeout: 15000 }
      );
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('GPS permission denied. Enable location access in your device settings.');
        setGpsAcquiring(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGps(`${loc.coords.latitude.toFixed(6)},${loc.coords.longitude.toFixed(6)}`);
      setGpsAcquiring(false);
    } catch {
      setGpsError('GPS unavailable. Tap Refresh to retry.');
      setGpsAcquiring(false);
    }
  }

  function isSlotSubmitted(slot: TimetableSlot) {
    return submitted.some((a) => {
      const subjectMatch = a.subject.toLowerCase() === slot.subject.toLowerCase();
      const slotClasses  = slot.class_names.split(',').map(c => c.trim().toLowerCase());
      const attClasses   = a.class_names.split(',').map(c => c.trim().toLowerCase());
      return subjectMatch && slotClasses.some(sc => attClasses.includes(sc));
    });
  }

  async function openCamera() {
    if (IS_WEB) {
      setPhotoUri('web-placeholder');
      setPhotoBase64('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      setPhotoSizeKb(1);
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
      const photo = await cameraRef.current?.takePictureAsync({ base64: false, quality: 1 });
      if (!photo) return;

      let compressed = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 640 } }],
        { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (compressed.base64 && compressed.base64.length * 0.75 > 40 * 1024) {
        compressed = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 480 } }],
          { compress: 0.25, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
      }

      const sizeKb = Math.round((compressed.base64!.length * 0.75) / 1024);
      setPhotoUri(compressed.uri);
      setPhotoBase64(`data:image/jpeg;base64,${compressed.base64}`);
      setPhotoSizeKb(sizeKb);
      setShowCamera(false);
    } catch {
      Alert.alert('Error', 'Could not capture photo.');
    }
  }

  async function handleSubmit() {
    if (!selectedSlot) {
      Alert.alert('No slot selected', 'Please select a timetable slot first.');
      return;
    }
    if (!topic.trim()) {
      Alert.alert('Topic required', 'Please enter the lesson topic.');
      return;
    }
    if (!locationName) {
      Alert.alert('Location required', 'Please select your classroom location before submitting.');
      return;
    }
    if (gpsAcquiring) {
      Alert.alert('GPS acquiring', 'Your GPS location is still being determined. Please wait a moment.');
      return;
    }
    if (!gps) {
      Alert.alert('GPS required', gpsError || 'GPS coordinates are required. Tap Refresh to retry.');
      return;
    }
    if (!photoBase64) {
      Alert.alert('Photo required', 'Please take a classroom photo before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const netState = await NetInfo.fetch();
      const payload = {
        teacherId:      user!.id,
        subject:        selectedSlot.subject,
        classNames:     selectedSlot.class_names,
        periods:        selectedSlot.periods ?? 1,
        topic:          topic.trim(),
        gpsCoordinates: gps || undefined,
        locationName:   locationName || undefined,
        imageBase64:    photoBase64,
        photoSizeKb:    photoSizeKb ?? undefined,
      };

      if (!netState.isConnected) {
        await offlineQueue.enqueue(payload);
        Alert.alert('Saved Offline', 'No internet connection. Your submission has been saved and will sync when you reconnect.');
        resetForm();
        return;
      }

      await api.post('/api/attendance/submit', payload);
      Alert.alert('✅ Submitted', 'Attendance recorded successfully.');
      resetForm();
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSelectedSlot(null);
    setTopic('');
    setLocationName('');
    setPhotoUri(null);
    setPhotoBase64(null);
    setPhotoSizeKb(null);
  }

  // ── CAMERA VIEW ──────────────────────────────────────────────
  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} />
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCamera(false)}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
            <Text style={styles.flipBtnText}>⇄</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── NO SCHEDULE ──────────────────────────────────────────────
  if (!loading && slots.length === 0) {
    return (
      <View style={styles.emptyRoot}>
        <View style={[styles.emptyIconWrap, { backgroundColor: Colors.accentLight }]}>
          <Ionicons name="calendar-outline" size={48} color={Colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>No schedule today</Text>
        <Text style={styles.emptySub}>You have no timetable slots for today. If you taught a class that isn&apos;t scheduled, you can log a remedial lesson.</Text>
        <TouchableOpacity style={[styles.remedialBtn, { backgroundColor: Colors.primary }]}
          onPress={() => router.push('/(tabs)/absences')}>
          <Text style={styles.remedialBtnText}>Schedule a Remedial Lesson</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const allDone = slots.length > 0 && slots.every(s => isSlotSubmitted(s));

  // ── MAIN FORM ────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* Slot picker */}
      <Text style={styles.sectionTitle}>Select Lesson *</Text>
      {allDone && (
        <View style={styles.allDoneBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#2D7A4F" />
          <Text style={styles.allDoneText}>All lessons submitted for today!</Text>
        </View>
      )}
      {slots.map((slot) => {
        const done     = isSlotSubmitted(slot);
        const selected = selectedSlot?.id === slot.id;
        return (
          <TouchableOpacity
            key={slot.id}
            style={[styles.slotRow, selected && styles.slotRowSelected, done && styles.slotRowDone]}
            onPress={() => { if (!done) { setSelectedSlot(slot); setTopic(''); } }}
            activeOpacity={done ? 1 : 0.7}
          >
            <View style={styles.slotRowLeft}>
              <Text style={styles.slotTime}>{slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}</Text>
              <Text style={[styles.slotSubject, selected && { color: Colors.primary }]}>{slot.subject}</Text>
              <Text style={styles.slotClass}>{slot.class_names}</Text>
            </View>
            <View style={styles.slotRowRight}>
              {done
                ? <Ionicons name="checkmark-circle" size={22} color="#2D7A4F" />
                : selected
                  ? <Ionicons name="radio-button-on" size={22} color={Colors.primary} />
                  : <Ionicons name="radio-button-off" size={22} color="#C0B8AF" />
              }
            </View>
          </TouchableOpacity>
        );
      })}

      {selectedSlot && (
        <>
          {/* Locked info */}
          <Text style={styles.sectionTitle}>Lesson Details</Text>
          <View style={styles.lockedCard}>
            <View style={styles.lockedRow}>
              <Text style={styles.lockedLabel}>Subject</Text>
              <Text style={styles.lockedValue}>{selectedSlot.subject}</Text>
            </View>
            <View style={[styles.lockedRow, { borderTopWidth: 1, borderTopColor: '#E2D9CC' }]}>
              <Text style={styles.lockedLabel}>Class(es)</Text>
              <Text style={styles.lockedValue}>{selectedSlot.class_names}</Text>
            </View>
            <View style={[styles.lockedRow, { borderTopWidth: 1, borderTopColor: '#E2D9CC' }]}>
              <Text style={styles.lockedLabel}>Periods</Text>
              <Text style={styles.lockedValue}>{selectedSlot.periods ?? 1}</Text>
            </View>
          </View>

          {/* Topic — required */}
          <Input
            label="Topic *"
            value={topic}
            onChangeText={setTopic}
            placeholder="What was taught in this lesson?"
          />

          {/* Location picker */}
          <Text style={styles.fieldLabel}>Location *</Text>
          {locations.length === 0 ? (
            <View style={styles.gpsErrorBox}>
              <Text style={styles.gpsErrorText}>No classroom locations configured. Ask your administrator to add locations.</Text>
            </View>
          ) : (
            <TouchableOpacity style={[styles.picker, !locationName && styles.pickerRequired]} onPress={() => setShowLocPicker(true)}>
              <Text style={locationName ? styles.pickerValue : styles.pickerPlaceholder}>
                {locationName || 'Select classroom location'}
              </Text>
              <Text style={styles.pickerArrow}>▾</Text>
            </TouchableOpacity>
          )}

          {/* GPS */}
          <Text style={styles.fieldLabel}>GPS Coordinates *</Text>
          <View style={[styles.gpsRow, (!gps && !gpsAcquiring) && styles.gpsRowError]}>
            {gpsAcquiring ? (
              <Text style={styles.gpsMuted}>Acquiring your location…</Text>
            ) : gps ? (
              <Text style={styles.gpsValue}>{gps}</Text>
            ) : (
              <Text style={styles.gpsErrorText}>{gpsError || 'GPS unavailable'}</Text>
            )}
            <TouchableOpacity onPress={grabGps} disabled={gpsAcquiring}>
              <Text style={[styles.gpsRefresh, { color: gpsAcquiring ? '#C0B8AF' : Colors.primary }]}>↻ Refresh</Text>
            </TouchableOpacity>
          </View>

          {/* Photo */}
          <Text style={styles.sectionTitle}>Classroom Photo *</Text>
          {photoUri ? (
            <View style={styles.photoPreviewWrap}>
              {IS_WEB
                ? <View style={[styles.photoPreview, { backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 32 }}>✅</Text>
                    <Text style={{ color: '#2D7A4F', fontWeight: '600', marginTop: 8 }}>Photo placeholder set (web mode)</Text>
                  </View>
                : <Image source={{ uri: photoUri }} style={styles.photoPreview} />
              }
              {photoSizeKb && <Text style={styles.photoSize}>{photoSizeKb} KB</Text>}
              <TouchableOpacity style={styles.retakeBtn} onPress={openCamera}>
                <Text style={[styles.retakeBtnText, { color: Colors.primary }]}>{IS_WEB ? 'Reset' : 'Retake Photo'}</Text>
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
        </>
      )}

      {/* Location picker modal */}
      <Modal visible={showLocPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Location</Text>
            <FlatList
              data={locations}
              keyExtractor={(l) => l.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.locItem} onPress={() => {
                  setLocationName(item.name);
                  setShowLocPicker(false);
                }}>
                  <View style={styles.locItemRow}>
                    <Text style={styles.locItemText}>{item.name}</Text>
                    {item.has_coordinates && (
                      <Text style={styles.locItemGpsBadge}>GPS</Text>
                    )}
                  </View>
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
  container:             { flex: 1, backgroundColor: '#F4EFE6' },
  content:               { padding: 16, paddingBottom: 40 },
  sectionTitle:          { fontSize: 13, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  // Empty state
  emptyRoot:             { flex: 1, backgroundColor: '#F4EFE6', justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIconWrap:         { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle:            { fontSize: 22, fontWeight: '800', color: '#1C1208', marginBottom: 10, textAlign: 'center' },
  emptySub:              { fontSize: 14, color: '#8C7E6E', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  remedialBtn:           { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  remedialBtnText:       { fontSize: 15, fontWeight: '700', color: '#fff' },
  // All-done banner
  allDoneBanner:         { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E4F4EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  allDoneText:           { fontSize: 13, color: '#2D7A4F', fontWeight: '600' },
  // Slot rows
  slotRow:               { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 8, padding: 14, borderWidth: 1.5, borderColor: '#E2D9CC' },
  slotRowSelected:       { borderColor: '#2D7A4F', backgroundColor: '#F0FAF4' },
  slotRowDone:           { opacity: 0.55 },
  slotRowLeft:           { flex: 1 },
  slotRowRight:          { marginLeft: 12 },
  slotTime:              { fontSize: 11, color: '#8C7E6E', fontWeight: '600', marginBottom: 3 },
  slotSubject:           { fontSize: 15, fontWeight: '700', color: '#1C1208' },
  slotClass:             { fontSize: 12, color: '#4A3F32', marginTop: 2 },
  // Locked card
  lockedCard:            { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2D9CC', marginBottom: 16, overflow: 'hidden' },
  lockedRow:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  lockedLabel:           { fontSize: 12, color: '#8C7E6E', fontWeight: '600' },
  lockedValue:           { fontSize: 14, color: '#1C1208', fontWeight: '600', flex: 1, textAlign: 'right' },
  // Fields
  fieldLabel:            { fontSize: 13, fontWeight: '600', color: '#1C1208', marginBottom: 6 },
  picker:                { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2D9CC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  pickerRequired:        { borderColor: '#E8A020' },
  pickerValue:           { fontSize: 15, color: '#1C1208' },
  pickerPlaceholder:     { fontSize: 15, color: '#8C7E6E' },
  pickerArrow:           { color: '#8C7E6E', fontSize: 16 },
  gpsRow:                { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2D9CC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14 },
  gpsRowError:           { borderColor: '#E8A020', backgroundColor: '#FFFBF2' },
  gpsValue:              { fontSize: 13, color: '#1C1208', flex: 1 },
  gpsMuted:              { fontSize: 13, color: '#8C7E6E', flex: 1, fontStyle: 'italic' },
  gpsErrorText:          { fontSize: 13, color: '#B45309', flex: 1 },
  gpsErrorBox:           { backgroundColor: '#FFFBF2', borderWidth: 1, borderColor: '#E8A020', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14 },
  gpsRefresh:            { fontSize: 13, fontWeight: '600' },
  // Photo
  photoPreviewWrap:      { marginBottom: 20 },
  photoPreview:          { width: '100%', height: 200, borderRadius: 12 },
  photoSize:             { fontSize: 11, color: '#8C7E6E', textAlign: 'right', marginTop: 4 },
  retakeBtn:             { marginTop: 8, alignItems: 'center' },
  retakeBtnText:         { fontWeight: '600', fontSize: 14 },
  cameraPlaceholder:     { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#E2D9CC', borderStyle: 'dashed', borderRadius: 12, height: 160, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  cameraIcon:            { fontSize: 40 },
  cameraPlaceholderText: { fontSize: 15, color: '#8C7E6E', marginTop: 8 },
  webNote:               { fontSize: 12, color: '#8C7E6E', marginTop: 6, textAlign: 'center', paddingHorizontal: 16 },
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
  // Location modal
  modalOverlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:            { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', padding: 20 },
  modalTitle:            { fontSize: 17, fontWeight: '700', color: '#1C1208', marginBottom: 16 },
  locItem:               { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E2D9CC' },
  locItemRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  locItemText:           { fontSize: 15, color: '#1C1208', flex: 1 },
  locItemGpsBadge:       { fontSize: 11, fontWeight: '700', color: '#2D7A4F', backgroundColor: '#E4F4EB', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
});
