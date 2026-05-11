import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/colors';

const SCHOOL_ID = process.env.EXPO_PUBLIC_SCHOOL_ID ?? '';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      await login({ type: 'teacher', username: username.trim(), password, schoolId: SCHOOL_ID });
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

        <View style={styles.topBand}>
          <View style={styles.logoMark}>
            <Text style={styles.logoLetter}>C</Text>
          </View>
          <Text style={styles.appName}>CAS Teacher</Text>
          <Text style={styles.tagline}>Classroom Attendance System</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Sign in</Text>
          <Input
            label="Username"
            placeholder="Your registered name"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
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
  logoMark:    { width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
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
  hint:        { textAlign: 'center', fontSize: 13, color: Colors.muted, marginTop: 24, paddingHorizontal: 32 },
});
