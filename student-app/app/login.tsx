import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { storage } from '@/lib/storage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginScreen() {
  const C = useTheme();
  const { login } = useAuth();
  const [username,   setUsername]   = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([storage.getSchoolCode(), storage.getSchoolLogo()]).then(([code, logo]) => {
      if (code) setSchoolCode(code);
      if (logo) setSchoolLogo(logo);
    });
  }, []);

  async function handleLogin() {
    if (!username.trim() || !password.trim()) { setError('Enter your student ID and password.'); return; }
    setError(''); setLoading(true);
    try {
      await login(username.trim().toUpperCase(), password, schoolCode);
    } catch (err: any) {
      const status = err?.response?.status;
      setError(status === 401 || status === 400
        ? 'Incorrect student ID or password.'
        : status === 403
          ? 'Your account is inactive. Contact your school.'
          : 'Could not connect. Please check your internet connection.');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">

        <View style={[s.header, { backgroundColor: C.primary }]}>
          {schoolLogo
            ? <Image source={{ uri: schoolLogo }} style={s.schoolLogo} resizeMode="contain" />
            : <View style={[s.logoMark, { backgroundColor: C.accent }]}><Text style={s.logoLetter}>S</Text></View>}
          <Text style={s.appName}>CAS Student</Text>
          {schoolCode ? <Text style={s.schoolCode}>{schoolCode}</Text> : null}
        </View>

        <View style={s.card}>
          <Text style={s.heading}>Welcome back</Text>
          <Text style={s.sub}>Sign in with your student ID and password.</Text>

          <Input
            label="Student ID"
            placeholder="e.g. S001"
            value={username}
            onChangeText={t => { setUsername(t.toUpperCase()); setError(''); }}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
          />
          <Input
            label="Password / PIN"
            placeholder="Enter your password"
            value={password}
            onChangeText={t => { setPassword(t); setError(''); }}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          {error ? <Text style={s.err}>{error}</Text> : null}

          <Button label="Sign In" onPress={handleLogin} loading={loading} size="lg" style={s.btn} />

          <TouchableOpacity onPress={() => router.replace('/setup')} style={s.changeSchool}>
            <Text style={s.changeSchoolText}>Change school</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:             { flex: 1, backgroundColor: '#F4EFE6' },
  container:        { flexGrow: 1, paddingBottom: 40 },
  header:           { paddingTop: 72, paddingBottom: 44, alignItems: 'center', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, marginBottom: 32 },
  schoolLogo:       { width: 80, height: 80, borderRadius: 16, marginBottom: 12, backgroundColor: '#fff' },
  logoMark:         { width: 72, height: 72, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  logoLetter:       { fontSize: 34, fontWeight: '800', color: '#fff' },
  appName:          { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  schoolCode:       { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, letterSpacing: 1 },
  card:             { backgroundColor: '#fff', marginHorizontal: 20, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#E2D9CC', shadowColor: '#1C1208', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  heading:          { fontSize: 22, fontWeight: '800', color: '#1C1208', marginBottom: 6, letterSpacing: -0.3 },
  sub:              { fontSize: 14, color: '#8C7E6E', marginBottom: 24 },
  err:              { fontSize: 13, color: '#B83232', fontWeight: '600', marginTop: -6, marginBottom: 10 },
  btn:              { marginTop: 4 },
  changeSchool:     { alignItems: 'center', marginTop: 20, paddingVertical: 6 },
  changeSchoolText: { fontSize: 13, color: '#8C7E6E', fontWeight: '600' },
});
