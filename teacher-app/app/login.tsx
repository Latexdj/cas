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
        <View style={styles.header}>
          <Text style={styles.logo}>🏫</Text>
          <Text style={styles.title}>CAS Teacher</Text>
          <Text style={styles.subtitle}>Classroom Attendance System</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="School ID"
            placeholder="Paste your school UUID"
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
            placeholder="Enter your 4-digit PIN"
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
            style={styles.loginBtn}
          />
        </View>

        <Text style={styles.hint}>
          Don't have a PIN? Ask your school administrator.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: Colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header:    { alignItems: 'center', marginBottom: 40 },
  logo:      { fontSize: 56, marginBottom: 12 },
  title:     { fontSize: 28, fontWeight: '700', color: Colors.text },
  subtitle:  { fontSize: 15, color: Colors.muted, marginTop: 4 },
  form:      { backgroundColor: Colors.white, borderRadius: 16, padding: 20, marginBottom: 24,
               shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07,
               shadowRadius: 8, elevation: 3 },
  loginBtn:  { marginTop: 8 },
  hint:      { textAlign: 'center', fontSize: 13, color: Colors.muted },
});
