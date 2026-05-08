import React, { useEffect, useState } from 'react';
import {
  Alert, FlatList, Modal, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/colors';
import { Location } from '@/types/api';

export default function ScheduleRemedialScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ absenceId: string; subject: string; className: string; date: string }>();

  const [locations,    setLocations]    = useState<Location[]>([]);
  const [remedialDate, setRemedialDate] = useState('');
  const [remedialTime, setRemedialTime] = useState('');
  const [duration,     setDuration]     = useState('');
  const [topic,        setTopic]        = useState('');
  const [locationName, setLocationName] = useState('');
  const [notes,        setNotes]        = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [showLocPicker, setShowLocPicker] = useState(false);

  useEffect(() => {
    api.get('/api/locations').then((r) => setLocations(r.data)).catch(() => {});
  }, []);

  async function handleSchedule() {
    if (!remedialDate || !remedialTime) {
      Alert.alert('Required', 'Date and time are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/remedial', {
        teacherId:            user!.id,
        absenceId:            params.absenceId,
        originalAbsenceDate:  params.date,
        subject:              params.subject,
        className:            params.className,
        remedialDate,
        remedialTime,
        durationPeriods:      duration ? parseInt(duration, 10) : undefined,
        topic:                topic || undefined,
        locationName:         locationName || undefined,
        notes:                notes || undefined,
      });
      Alert.alert('✅ Scheduled', 'Remedial lesson has been scheduled.');
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not schedule remedial.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.absenceInfo}>
        <Text style={styles.absenceLabel}>Making up absence for:</Text>
        <Text style={styles.absenceSubject}>{params.subject} · {params.className}</Text>
        <Text style={styles.absenceDate}>{new Date(params.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      </View>

      <Input
        label="Remedial Date *"
        placeholder="YYYY-MM-DD"
        value={remedialDate}
        onChangeText={setRemedialDate}
        keyboardType="numbers-and-punctuation"
      />
      <Input
        label="Remedial Time *"
        placeholder="HH:MM (e.g. 14:00)"
        value={remedialTime}
        onChangeText={setRemedialTime}
        keyboardType="numbers-and-punctuation"
      />
      <Input
        label="Duration (periods)"
        placeholder="e.g. 2"
        value={duration}
        onChangeText={setDuration}
        keyboardType="number-pad"
        maxLength={2}
      />
      <Input
        label="Topic"
        placeholder="Optional topic"
        value={topic}
        onChangeText={setTopic}
      />

      <Text style={styles.fieldLabel}>Location</Text>
      <TouchableOpacity style={styles.picker} onPress={() => setShowLocPicker(true)}>
        <Text style={locationName ? styles.pickerVal : styles.pickerPlaceholder}>
          {locationName || 'Select classroom'}
        </Text>
        <Text style={styles.arrow}>▾</Text>
      </TouchableOpacity>

      <Input
        label="Notes"
        placeholder="Any additional notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />

      <Button label="Schedule Remedial Lesson" onPress={handleSchedule} loading={submitting} />

      <Modal visible={showLocPicker} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select Location</Text>
            <FlatList
              data={[{ id: '', name: 'Not specified', type: '', has_coordinates: false }, ...locations]}
              keyExtractor={(l) => l.id || 'none'}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.locItem} onPress={() => { setLocationName(item.name === 'Not specified' ? '' : item.name); setShowLocPicker(false); }}>
                  <Text style={styles.locText}>{item.name}</Text>
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
  container:        { flex: 1, backgroundColor: Colors.bg },
  content:          { padding: 16, paddingBottom: 40 },
  absenceInfo:      { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 16, marginBottom: 20 },
  absenceLabel:     { fontSize: 12, color: '#92400E', fontWeight: '600', marginBottom: 4 },
  absenceSubject:   { fontSize: 16, fontWeight: '700', color: Colors.text },
  absenceDate:      { fontSize: 13, color: Colors.muted, marginTop: 2 },
  fieldLabel:       { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  picker:           { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  pickerVal:        { fontSize: 15, color: Colors.text },
  pickerPlaceholder:{ fontSize: 15, color: Colors.muted },
  arrow:            { color: Colors.muted, fontSize: 16 },
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:            { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', padding: 20 },
  sheetTitle:       { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  locItem:          { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  locText:          { fontSize: 15, color: Colors.text },
});
