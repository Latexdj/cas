import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { storage } from '@/lib/storage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/colors';

export default function LoginScreen() {
  const { login, user } = useAuth();
  const [schoolId, setSchoolId] = useState('');
  const [name,     setName]     = useState('');
  const [pin,      setPin]      = useState('');
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (user) router.replace('/(tabs)');
  }, [user]);

  useEffect(() => {
    storage.getSchoolId().then((id) => { if (id) setSchoolId(id); });
  }, []);

  async function handleLogin() {
    if (!schoolId.trim() || !name.trim() || !pin.trim()) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      await login({ type: 'teacher', name: name.trim(), pin, schoolId: schoolId.trim() });
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Login failed. Check your details.';
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Top band */}
        <View style={styles.topBand}>
          <View style={styles.logoMark}>
            <Text style={styles.logoLetter}>C</Text>
          </View>
          <Text style={styles.appName}>CAS Teacher</Text>
          <Text style={styles.tagline}>Classroom Attendance System</Text>
        </View>

        {/* Form card */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Sign in</Text>
          <Input
            label="School ID"
            placeholder="Paste your school code"
            value={schoolId}
            onChangeText={setSchoolId}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Input
            label="Your Name"
            placeholder="e.g. Kwame Mensah"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <Input
            label="PIN"
            placeholder="4-digit PIN"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
          />
          <Button
            label="Sign In"
            onPress={handleLogin}
            loading={loading}
            size="lg"
            style={styles.loginBtn}
          />
        </View>

        <Text style={styles.hint}>No PIN? Contact your school administrator.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:        { flex: 1, backgroundColor: Colors.bg },
  container:   { flexGrow: 1, paddingBottom: 40 },

  topBand:     {
    backgroundColor: Colors.primary,
    paddingTop: 80,
    paddingBottom: 48,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    marginBottom: 32,
  },
  logoMark:    {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoLetter:  { fontSize: 30, fontWeight: '800', color: '#fff' },
  appName:     { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  tagline:     { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 5 },

  card:        {
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
  cardHeading: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 22, letterSpacing: -0.3 },
  loginBtn:    { marginTop: 4 },
  hint:        { textAlign: 'center', fontSize: 13, color: Colors.muted, marginTop: 24 },
});
