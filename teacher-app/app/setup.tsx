import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { storage } from '@/lib/storage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/colors';

export default function SetupScreen() {
  const [code,    setCode]    = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      Alert.alert('Enter school code', 'Please type the code given by your administrator.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/api/auth/school/${trimmed}`);
      // Ask user to confirm it's the right school
      Alert.alert(
        'Confirm School',
        `You are joining:\n\n${data.name}\n\nIs this correct?`,
        [
          { text: 'No, go back', style: 'cancel' },
          {
            text: 'Yes, continue',
            onPress: async () => {
              await storage.saveSchoolCode(trimmed);
              router.replace('/login');
            },
          },
        ]
      );
    } catch (err: any) {
      const msg = err?.response?.status === 404
        ? 'School code not found. Check with your administrator.'
        : 'Could not connect. Please check your internet.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBand}>
          <View style={styles.logoMark}>
            <Text style={styles.logoLetter}>C</Text>
          </View>
          <Text style={styles.appName}>CAS Teacher</Text>
          <Text style={styles.tagline}>Classroom Attendance System</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Set Up Your School</Text>
          <Text style={styles.cardSub}>
            Enter the school code given to you by your administrator. You only need to do this once.
          </Text>

          <Input
            label="School Code"
            placeholder="e.g. CAS001"
            value={code}
            onChangeText={t => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Button
            label="Confirm School"
            onPress={handleConfirm}
            loading={loading}
            size="lg"
            style={styles.btn}
          />
        </View>

        <Text style={styles.hint}>
          Don't have a school code? Contact your school administrator.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: Colors.bg },
  container: { flexGrow: 1, paddingBottom: 40 },

  topBand: {
    backgroundColor: Colors.primary,
    paddingTop: 80,
    paddingBottom: 48,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    marginBottom: 32,
  },
  logoMark:   { width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoLetter: { fontSize: 30, fontWeight: '800', color: '#fff' },
  appName:    { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  tagline:    { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 5 },

  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#1C1208',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeading: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 8, letterSpacing: -0.3 },
  cardSub:     { fontSize: 14, color: Colors.muted, lineHeight: 20, marginBottom: 20 },
  btn:         { marginTop: 4 },
  hint:        { textAlign: 'center', fontSize: 13, color: Colors.muted, marginTop: 24, paddingHorizontal: 32 },
});
