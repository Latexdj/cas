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
import { TimetableSlot, Location as LocationType, AttendanceRecord, Student } from '@/types/api';

type Step = 'teacher' | 'students';
type StudentStatus = 'Present' | 'Absent';

export default function SubmitScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ slotId?: string }>();
  const Colors = useTheme();

  // ── Data ─────────────────────────────────────────────────────
  const [slots,        setSlots]        = useState<TimetableSlot[]>([]);
  const [submitted,    setSubmitted]    = useState<AttendanceRecord[]>([]);
  const [locations,    setLocations]    = useState<LocationType[]>([]);
  const [loading,      setLoading]      = useState(true);

  // ── Step 1: teacher attendance ────────────────────────────────
  const [step,         setStep]         = useState<Step>('teacher');
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);
  const [topic,        setTopic]        = useState('');
  const [locationName, setLocationName] = useState('');
  const [gps,          setGps]          = useState('');
  const [gpsAcquiring, setGpsAcquiring] = useState(true);
  const [gpsError,     setGpsError]     = useState('');
  const [photoUri,     setPhotoUri]     = useState<string | null>(null);
  const [photoBase64,  setPhotoBase64]  = useState<string | null>(null);
  const [photoSizeKb,  setPhotoSizeKb]  = useState<number | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [showLocPicker,setShowLocPicker]= useState(false);

  // ── Step 2: student attendance ────────────────────────────────
  const [attendanceId,    setAttendanceId]    = useState<string | null>(null);
  const [students,        setStudents]        = useState<Student[]>([]);
  const [statuses,        setStatuses]        = useState<Record<string, StudentStatus>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submittingStud,  setSubmittingStud]  = useState(false);

  // ── Camera ───────────────────────────────────────────────────
  const [showCamera,  setShowCamera]  = useState(false);
  const [facing,      setFacing]      = useState<'back' | 'front'>('front');
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
        (pos) => { setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`); setGpsAcquiring(false); },
        ()    => { setGpsError('GPS unavailable. Tap Refresh to retry.'); setGpsAcquiring(false); },
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
      // Use browser file input with camera capture — works on iOS Safari and Android Chrome
      await new Promise<void>((resolve) => {
        const input = (document as any).createElement('input') as HTMLInputElement;
        input.type   = 'file';
        input.accept = 'image/*';
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
            // Compress to ≤ 40 KB via Canvas — mirror native ImageManipulator logic
            const compress = (w: number, q: number) => {
              const c = (document as any).createElement('canvas') as HTMLCanvasElement;
              const scale = Math.min(1, w / img.width);
              c.width  = Math.round(img.width  * scale);
              c.height = Math.round(img.height * scale);
              c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
              return c.toDataURL('image/jpeg', q);
            };
            URL.revokeObjectURL(url);
            let dataUrl = compress(640, 0.4);
            if (dataUrl.length * 0.75 > 40 * 1024) dataUrl = compress(480, 0.25);
            const sizeKb = Math.round(dataUrl.length * 0.75 / 1024);
            setPhotoUri(dataUrl);
            setPhotoBase64(dataUrl);
            setPhotoSizeKb(sizeKb);
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

  async function takePhoto() {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ base64: false, quality: 1 });
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

  // ── Step 1 submit ────────────────────────────────────────────
  async function handleSubmitTeacher() {
    if (!selectedSlot) { Alert.alert('No slot selected', 'Please select a timetable slot first.'); return; }
    if (!topic.trim()) { Alert.alert('Topic required', 'Please enter the lesson topic.'); return; }
    if (!locationName) { Alert.alert('Location required', 'Please select your classroom location.'); return; }
    if (gpsAcquiring)  { Alert.alert('GPS acquiring', 'GPS is still being determined. Please wait.'); return; }
    if (!gps)          { Alert.alert('GPS required', gpsError || 'GPS coordinates are required. Tap Refresh.'); return; }
    if (!photoBase64)  { Alert.alert('Photo required', 'Please take a classroom photo before submitting.'); return; }

    setSubmitting(true);
    try {
      const netState = await NetInfo.fetch();
      const payload = {
        teacherId:      user!.id,
        subject:        selectedSlot.subject,
        classNames:     selectedSlot.class_names,
        periods:        selectedSlot.periods ?? 1,
        topic:          topic.trim(),
        gpsCoordinates: gps,
        locationName,
        imageBase64:    photoBase64,
        photoSizeKb:    photoSizeKb ?? undefined,
      };

      if (!netState.isConnected) {
        await offlineQueue.enqueue(payload);
        Alert.alert('Saved Offline', 'No internet. Your submission has been saved and will sync when you reconnect.');
        resetTeacherForm();
        return;
      }

      const res = await api.post<{ record: { id: string } }>('/api/attendance/submit', payload);
      const newAttendanceId = res.data.record?.id || null;

      // Transition to step 2 — load students for this class
      await loadStudentsForClass(selectedSlot.class_names, newAttendanceId, selectedSlot.end_time);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function loadStudentsForClass(classNames: string, attId: string | null, endTime: string) {
    setLoadingStudents(true);
    try {
      // Use the first class name for lookup (teacher attends one class at a time)
      const primaryClass = classNames.split(',')[0].trim();
      const res = await api.get<Student[]>(`/api/students?class_name=${encodeURIComponent(primaryClass)}&status=Active`);
      const list = res.data;
      if (!list.length) {
        Alert.alert(
          'No students found',
          `No active students are registered for ${primaryClass}. Please ask your administrator to add students.`,
          [{ text: 'OK', onPress: () => { resetTeacherForm(); loadData(); } }]
        );
        return;
      }
      const initialStatuses: Record<string, StudentStatus> = {};
      list.forEach(s => { initialStatuses[s.id] = 'Present'; });
      setStudents(list);
      setStatuses(initialStatuses);
      setAttendanceId(attId);
      setStep('students');
    } catch {
      Alert.alert('Error', 'Could not load students. Teacher attendance was saved.');
      resetTeacherForm();
      await loadData();
    } finally {
      setLoadingStudents(false);
    }
  }

  function toggleStatus(studentId: string) {
    setStatuses(prev => ({
      ...prev,
      [studentId]: prev[studentId] === 'Present' ? 'Absent' : 'Present',
    }));
  }

  // ── Step 2 submit ────────────────────────────────────────────
  async function handleSubmitStudents() {
    if (!selectedSlot) return;
    setSubmittingStud(true);
    try {
      const primaryClass = selectedSlot.class_names.split(',')[0].trim();
      const records = students.map(s => ({ studentId: s.id, status: statuses[s.id] || 'Present' }));
      await api.post('/api/student-attendance/submit', {
        attendanceId,
        teacherId:      user!.id,
        subject:        selectedSlot.subject,
        className:      primaryClass,
        lessonEndTime:  selectedSlot.end_time,
        records,
      });
      const present = records.filter(r => r.status === 'Present').length;
      const absent  = records.filter(r => r.status === 'Absent').length;
      Alert.alert('✅ Complete', `Attendance submitted.\n${present} present · ${absent} absent`);
      resetAll();
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Student attendance submission failed.');
    } finally {
      setSubmittingStud(false);
    }
  }

  function resetTeacherForm() {
    setSelectedSlot(null); setTopic(''); setLocationName('');
    setPhotoUri(null); setPhotoBase64(null); setPhotoSizeKb(null);
  }

  function resetAll() {
    resetTeacherForm();
    setStep('teacher'); setStudents([]); setStatuses({}); setAttendanceId(null);
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
  if (!loading && slots.length === 0 && step === 'teacher') {
    return (
      <View style={styles.emptyRoot}>
        <View style={[styles.emptyIconWrap, { backgroundColor: Colors.accentLight }]}>
          <Ionicons name="calendar-outline" size={48} color={Colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>No schedule today</Text>
        <Text style={styles.emptySub}>You have no timetable slots for today. If you taught a class that isn't scheduled, you can log a remedial lesson.</Text>
        <TouchableOpacity style={[styles.remedialBtn, { backgroundColor: Colors.primary }]}
          onPress={() => router.push('/(tabs)/absences')}>
          <Text style={styles.remedialBtnText}>Schedule a Remedial Lesson</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const presentCount = Object.values(statuses).filter(s => s === 'Present').length;
  const absentCount  = Object.values(statuses).filter(s => s === 'Absent').length;
  const allDone = slots.length > 0 && slots.every(s => isSlotSubmitted(s));

  // ── STEP 2: STUDENT CHECKLIST ────────────────────────────────
  if (step === 'students') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Step indicator */}
        <View style={styles.stepBar}>
          <View style={[styles.stepItem, styles.stepDone]}>
            <Ionicons name="checkmark-circle" size={16} color="#2D7A4F" />
            <Text style={styles.stepDoneText}>Teacher Attendance</Text>
          </View>
          <View style={styles.stepSep} />
          <View style={[styles.stepItem, { borderColor: Colors.primary }]}>
            <View style={[styles.stepDot, { backgroundColor: Colors.primary }]} />
            <Text style={[styles.stepActiveText, { color: Colors.primary }]}>Student Attendance</Text>
          </View>
        </View>

        {/* Lesson summary */}
        <View style={styles.lockedCard}>
          <View style={styles.lockedRow}>
            <Text style={styles.lockedLabel}>Subject</Text>
            <Text style={styles.lockedValue}>{selectedSlot?.subject}</Text>
          </View>
          <View style={[styles.lockedRow, { borderTopWidth: 1, borderTopColor: '#E2D9CC' }]}>
            <Text style={styles.lockedLabel}>Class</Text>
            <Text style={styles.lockedValue}>{selectedSlot?.class_names.split(',')[0].trim()}</Text>
          </View>
        </View>

        {/* Count badge */}
        <View style={styles.countRow}>
          <View style={[styles.countBadge, { backgroundColor: '#E4F4EB' }]}>
            <Text style={[styles.countNum, { color: '#2D7A4F' }]}>{presentCount}</Text>
            <Text style={[styles.countLabel, { color: '#2D7A4F' }]}>Present</Text>
          </View>
          <View style={[styles.countBadge, { backgroundColor: '#FEF2F2' }]}>
            <Text style={[styles.countNum, { color: '#DC2626' }]}>{absentCount}</Text>
            <Text style={[styles.countLabel, { color: '#DC2626' }]}>Absent</Text>
          </View>
          <View style={[styles.countBadge, { backgroundColor: '#F8FAFC' }]}>
            <Text style={[styles.countNum, { color: '#64748B' }]}>{students.length}</Text>
            <Text style={[styles.countLabel, { color: '#64748B' }]}>Total</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Mark Attendance — tap a student to toggle absent</Text>

        {loadingStudents ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Text style={{ color: '#8C7E6E' }}>Loading students…</Text>
          </View>
        ) : (
          students.map(student => {
            const isPresent = (statuses[student.id] || 'Present') === 'Present';
            return (
              <TouchableOpacity
                key={student.id}
                style={[styles.studentRow, isPresent ? styles.studentPresent : styles.studentAbsent]}
                onPress={() => toggleStatus(student.id)}
                activeOpacity={0.7}
              >
                <View style={styles.studentLeft}>
                  <Text style={styles.studentCode}>{student.student_code}</Text>
                  <Text style={[styles.studentName, !isPresent && styles.studentNameAbsent]}>{student.name}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: isPresent ? '#E4F4EB' : '#FEF2F2' }]}>
                  <Text style={[styles.statusPillText, { color: isPresent ? '#2D7A4F' : '#DC2626' }]}>
                    {isPresent ? 'Present' : 'Absent'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <Button
          label="Submit Student Attendance"
          onPress={handleSubmitStudents}
          loading={submittingStud}
          style={styles.submitBtn}
        />
      </ScrollView>
    );
  }

  // ── STEP 1: TEACHER ATTENDANCE ───────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* Step indicator */}
      <View style={styles.stepBar}>
        <View style={[styles.stepItem, { borderColor: Colors.primary }]}>
          <View style={[styles.stepDot, { backgroundColor: Colors.primary }]} />
          <Text style={[styles.stepActiveText, { color: Colors.primary }]}>Teacher Attendance</Text>
        </View>
        <View style={styles.stepSep} />
        <View style={[styles.stepItem, styles.stepPending]}>
          <View style={styles.stepDotPending} />
          <Text style={styles.stepPendingText}>Student Attendance</Text>
        </View>
      </View>

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

          <Input label="Topic *" value={topic} onChangeText={setTopic} placeholder="What was taught in this lesson?" />

          {/* Location */}
          <Text style={styles.fieldLabel}>Location *</Text>
          {locations.length === 0 ? (
            <View style={styles.gpsErrorBox}>
              <Text style={styles.gpsErrorText}>No classroom locations configured. Contact your administrator.</Text>
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
            {gpsAcquiring
              ? <Text style={styles.gpsMuted}>Acquiring your location…</Text>
              : gps
                ? <Text style={styles.gpsValue}>{gps}</Text>
                : <Text style={styles.gpsErrorText}>{gpsError || 'GPS unavailable'}</Text>
            }
            <TouchableOpacity onPress={grabGps} disabled={gpsAcquiring}>
              <Text style={[styles.gpsRefresh, { color: gpsAcquiring ? '#C0B8AF' : Colors.primary }]}>↻ Refresh</Text>
            </TouchableOpacity>
          </View>

          {/* Photo */}
          <Text style={styles.sectionTitle}>Classroom Photo *</Text>
          {photoUri ? (
            <View style={styles.photoPreviewWrap}>
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
              {photoSizeKb && <Text style={styles.photoSize}>{photoSizeKb} KB</Text>}
              <TouchableOpacity style={styles.retakeBtn} onPress={openCamera}>
                <Text style={[styles.retakeBtnText, { color: Colors.primary }]}>{IS_WEB ? 'Reset' : 'Retake Photo'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.cameraPlaceholder} onPress={openCamera}>
              <Text style={styles.cameraIcon}>{IS_WEB ? '🖥️' : '📷'}</Text>
              <Text style={styles.cameraPlaceholderText}>Tap to take photo</Text>
            </TouchableOpacity>
          )}

          <Button label="Next: Student Attendance →" onPress={handleSubmitTeacher} loading={submitting || loadingStudents} style={styles.submitBtn} />
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
                <TouchableOpacity style={styles.locItem} onPress={() => { setLocationName(item.name); setShowLocPicker(false); }}>
                  <View style={styles.locItemRow}>
                    <Text style={styles.locItemText}>{item.name}</Text>
                    {item.has_coordinates && <Text style={styles.locItemGpsBadge}>GPS</Text>}
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
  // Step indicator
  stepBar:               { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 4, borderWidth: 1, borderColor: '#E2D9CC' },
  stepItem:              { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  stepDone:              { borderColor: '#2D7A4F' },
  stepPending:           { borderColor: 'transparent' },
  stepDot:               { width: 8, height: 8, borderRadius: 4 },
  stepDotPending:        { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C0B8AF' },
  stepSep:               { width: 20, height: 1, backgroundColor: '#E2D9CC', marginHorizontal: 4 },
  stepDoneText:          { fontSize: 12, fontWeight: '600', color: '#2D7A4F' },
  stepActiveText:        { fontSize: 12, fontWeight: '700' },
  stepPendingText:       { fontSize: 12, fontWeight: '500', color: '#C0B8AF' },
  // Empty state
  emptyRoot:             { flex: 1, backgroundColor: '#F4EFE6', justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIconWrap:         { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle:            { fontSize: 22, fontWeight: '800', color: '#1C1208', marginBottom: 10, textAlign: 'center' },
  emptySub:              { fontSize: 14, color: '#8C7E6E', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  remedialBtn:           { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  remedialBtnText:       { fontSize: 15, fontWeight: '700', color: '#fff' },
  // All-done
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
  // Student checklist
  countRow:              { flexDirection: 'row', gap: 10, marginBottom: 4 },
  countBadge:            { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  countNum:              { fontSize: 24, fontWeight: '800' },
  countLabel:            { fontSize: 11, fontWeight: '600', marginTop: 2 },
  studentRow:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 6, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1.5, borderColor: '#E2D9CC' },
  studentPresent:        { borderColor: '#E2D9CC' },
  studentAbsent:         { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  studentLeft:           { flex: 1 },
  studentCode:           { fontSize: 11, color: '#8C7E6E', fontWeight: '600', marginBottom: 2 },
  studentName:           { fontSize: 15, fontWeight: '600', color: '#1C1208' },
  studentNameAbsent:     { color: '#DC2626' },
  statusPill:            { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusPillText:        { fontSize: 12, fontWeight: '700' },
});
