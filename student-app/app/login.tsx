import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme, useUpdateTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { storage } from '@/lib/storage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginScreen() {
  const C           = useTheme();
  const updateTheme = useUpdateTheme();
  const { login }   = useAuth();

  const [schoolCode, setSchoolCode] = useState('');
  const [username,   setUsername]   = useState('');
  const [password,   setPassword]   = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // School preview (fetched after school code is entered)
  const [schoolInfo,      setSchoolInfo]      = useState<{ name: string; logo_url?: string | null; primary_color?: string; accent_color?: string } | null>(null);
  const [schoolLoading,   setSchoolLoading]   = useState(false);
  const [schoolError,     setSchoolError]     = useState('');
  const lastFetchedCode = useRef('');

  // Pre-fill school code from storage (if user has logged in before)
  useEffect(() => {
    storage.getSchoolCode().then(code => {
      if (code) {
        setSchoolCode(code);
        fetchSchool(code);
      }
    });
  }, []);

  async function fetchSchool(code: string) {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length < 3 || trimmed === lastFetchedCode.current) return;
    lastFetchedCode.current = trimmed;
    setSchoolInfo(null);
    setSchoolError('');
    setSchoolLoading(true);
    try {
      const { data } = await api.get(`/api/auth/school/${trimmed}`);
      setSchoolInfo(data);
      // Apply branding preview
      if (data.primary_color && data.accent_color) {
        await updateTheme(data.primary_color, data.accent_color);
      }
    } catch (err: any) {
      if (err?.response?.status === 404) setSchoolError('School not found.');
    } finally {
      setSchoolLoading(false);
    }
  }

  async function handleLogin() {
    if (!schoolCode.trim()) { setError('Enter your school code.'); return; }
    if (!username.trim())   { setError('Enter your student ID.'); return; }
    if (!password.trim())   { setError('Enter your password.'); return; }
    setError(''); setLoading(true);
    try {
      const code = schoolCode.trim().toUpperCase();
      await login(username.trim().toUpperCase(), password, code);
      await storage.saveSchoolCode(code);
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status === 401 || status === 400 ? 'Incorrect student ID or password.' :
        status === 403                   ? 'Your account is inactive. Contact your school.' :
        status === 404                   ? 'School code not found.' :
                                          'Could not connect. Check your internet connection.'
      );
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={[s.header, { backgroundColor: C.primary }]}>
          {schoolInfo?.logo_url
            ? <Image source={{ uri: schoolInfo.logo_url }} style={s.schoolLogo} resizeMode="contain" />
            : <View style={[s.logoMark, { backgroundColor: C.accent }]}><Text style={s.logoLetter}>S</Text></View>
          }
          <Text style={s.appName}>{schoolInfo?.name ?? 'CAS Student'}</Text>
          <Text style={s.tagline}>School Management System</Text>
        </View>

        {/* Form card */}
        <View style={s.card}>
          <Text style={s.heading}>Sign In</Text>
          <Text style={s.sub}>Enter your school code and student credentials.</Text>

          {/* School code */}
          <Input
            label="School Code"
            placeholder="e.g. CAS001"
            value={schoolCode}
            onChangeText={t => { setSchoolCode(t.toUpperCase()); setError(''); setSchoolError(''); lastFetchedCode.current = ''; setSchoolInfo(null); }}
            onBlur={() => fetchSchool(schoolCode)}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
            rightElement={
              schoolLoading
                ? <ActivityIndicator size="small" color={C.primary} />
                : schoolInfo
                  ? <Ionicons name="checkmark-circle" size={20} color={C.success as string} />
                  : null
            }
          />
          {schoolError ? <Text style={s.fieldErr}>{schoolError}</Text> : null}
          {schoolInfo && (
            <View style={[s.schoolPreview, { backgroundColor: C.primaryLight, borderColor: C.primary }]}>
              <Ionicons name="business-outline" size={14} color={C.primary as string} />
              <Text style={[s.schoolPreviewText, { color: C.primary }]} numberOfLines={1}>{schoolInfo.name}</Text>
            </View>
          )}

          {/* Student ID */}
          <Input
            label="Student ID"
            placeholder="e.g. S001"
            value={username}
            onChangeText={t => { setUsername(t.toUpperCase()); setError(''); }}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
          />

          {/* Password */}
          <Input
            label="Password / PIN"
            placeholder="Enter your password"
            value={password}
            onChangeText={t => { setPassword(t); setError(''); }}
            secureTextEntry={!showPwd}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            rightElement={
              <TouchableOpacity onPress={() => setShowPwd(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color="#8C7E6E" />
              </TouchableOpacity>
            }
          />

          {error ? <Text style={s.err}>{error}</Text> : null}

          <Button label="Sign In" onPress={handleLogin} loading={loading} size="lg" style={s.btn} />
        </View>

        <Text style={s.hint}>Don't have a school code? Contact your school administrator.</Text>
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
  appName:          { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  tagline:          { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  card:             { backgroundColor: '#fff', marginHorizontal: 20, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#E2D9CC', shadowColor: '#1C1208', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  heading:          { fontSize: 22, fontWeight: '800', color: '#1C1208', marginBottom: 6, letterSpacing: -0.3 },
  sub:              { fontSize: 14, color: '#8C7E6E', marginBottom: 24, lineHeight: 20 },
  fieldErr:         { fontSize: 12, color: '#B83232', fontWeight: '600', marginTop: -10, marginBottom: 12 },
  schoolPreview:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: -8, marginBottom: 16 },
  schoolPreviewText:{ fontSize: 13, fontWeight: '700', flex: 1 },
  err:              { fontSize: 13, color: '#B83232', fontWeight: '600', marginTop: -4, marginBottom: 10 },
  btn:              { marginTop: 4 },
  hint:             { textAlign: 'center', fontSize: 13, color: '#8C7E6E', marginTop: 24, paddingHorizontal: 32 },
});
