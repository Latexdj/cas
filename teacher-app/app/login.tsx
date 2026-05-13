import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { storage } from '@/lib/storage';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginScreen() {
  const Colors = useTheme();
  const { login } = useAuth();
  const [username,   setUsername]   = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [schoolCode, setSchoolCode] = useState('');

  useEffect(() => {
    storage.getSchoolCode().then(c => setSchoolCode(c ?? ''));
  }, []);

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login({ type: 'teacher', username: username.trim(), password, schoolCode });
      if (Platform.OS === 'web') {
        (window as any).location.href = '/';
        return;
      }
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Login failed. Check your details.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={[styles.topBand, { backgroundColor: Colors.primary }]}>
          <View style={[styles.logoMark, { backgroundColor: Colors.accent }]}>
            <Text style={styles.logoLetter}>C</Text>
          </View>
          <Text style={styles.appName}>CAS Teacher</Text>
          <Text style={styles.tagline}>Classroom Attendance System</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Sign in</Text>
          <Input
            label="Teacher ID"
            placeholder="e.g. T001"
            value={username}
            onChangeText={t => setUsername(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button
            label="Sign In"
            onPress={handleLogin}
            loading={loading}
            size="lg"
            style={styles.loginBtn}
          />
        </View>

        <Text style={styles.hint}>Forgot your password? Contact your school administrator.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:        { flex: 1, backgroundColor: '#F4EFE6' },
  container:   { flexGrow: 1, paddingBottom: 40 },
  topBand:     { paddingTop: 80, paddingBottom: 48, alignItems: 'center', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, marginBottom: 32 },
  logoMark:    { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoLetter:  { fontSize: 30, fontWeight: '800', color: '#fff' },
  appName:     { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  tagline:     { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 5 },
  card:        { backgroundColor: '#FFFFFF', marginHorizontal: 20, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#E2D9CC', shadowColor: '#1C1208', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  cardHeading: { fontSize: 20, fontWeight: '800', color: '#1C1208', marginBottom: 22, letterSpacing: -0.3 },
  loginBtn:    { marginTop: 4 },
  errorText:   { fontSize: 13, color: '#B83232', marginBottom: 10, fontWeight: '600' },
  hint:        { textAlign: 'center', fontSize: 13, color: '#8C7E6E', marginTop: 24, paddingHorizontal: 32 },
});
