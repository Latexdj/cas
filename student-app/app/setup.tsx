import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { storage } from '@/lib/storage';
import { useTheme, useUpdateTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function SetupScreen() {
  const C = useTheme();
  const updateTheme = useUpdateTheme();
  const [code,       setCode]       = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [schoolData, setSchoolData] = useState<{ name: string; primary_color?: string; accent_color?: string; logo_url?: string | null } | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError('Enter the school code given by your administrator.'); return; }
    setError(''); setLoading(true);
    try {
      const { data } = await api.get(`/api/auth/school/${trimmed}`);
      setSchoolData(data); setConfirming(true);
    } catch (err: any) {
      setError(err?.response?.status === 404
        ? 'School code not found. Check with your school administrator.'
        : 'Could not connect. Please check your internet connection.');
    } finally { setLoading(false); }
  }

  async function handleAccept() {
    if (!schoolData) return;
    setLoading(true);
    try {
      await storage.saveSchoolCode(code.trim().toUpperCase());
      if (schoolData.primary_color && schoolData.accent_color) {
        await updateTheme(schoolData.primary_color, schoolData.accent_color);
      }
      await storage.saveTheme(schoolData.primary_color ?? '', schoolData.accent_color ?? '', schoolData.logo_url ?? null);
      router.replace('/login');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">

        <View style={[s.topBand, { backgroundColor: C.primary }]}>
          <View style={[s.logoMark, { backgroundColor: C.accent }]}>
            <Text style={s.logoLetter}>S</Text>
          </View>
          <Text style={s.appName}>CAS Student</Text>
          <Text style={s.tagline}>School Management System</Text>
        </View>

        <View style={s.card}>
          {confirming && schoolData ? (
            <>
              <Text style={s.heading}>Confirm Your School</Text>
              <Text style={s.sub}>You are about to connect to:</Text>
              <View style={[s.schoolBox, { borderColor: C.primary }]}>
                {schoolData.logo_url
                  ? <Image source={{ uri: schoolData.logo_url }} style={s.logo} resizeMode="contain" />
                  : null}
                <Text style={[s.schoolName, { color: C.primary }]}>{schoolData.name}</Text>
              </View>
              <Text style={s.sub}>Is this your school?</Text>
              <Button label="Yes, this is my school" onPress={handleAccept} loading={loading} size="lg" style={s.btn} />
              <TouchableOpacity onPress={() => { setConfirming(false); setSchoolData(null); }} style={s.back}>
                <Text style={s.backText}>No, go back</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.heading}>Set Up Your School</Text>
              <Text style={s.sub}>Enter the school code given by your administrator. You only need to do this once.</Text>
              <Input
                label="School Code"
                placeholder="e.g. CAS001"
                value={code}
                onChangeText={t => { setCode(t.toUpperCase()); setError(''); }}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {error ? <Text style={s.errText}>{error}</Text> : null}
              <Button label="Find My School" onPress={handleConfirm} loading={loading} size="lg" style={s.btn} />
            </>
          )}
        </View>

        <Text style={s.hint}>Don't have a school code? Contact your school administrator.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: '#F4EFE6' },
  container: { flexGrow: 1, paddingBottom: 40 },
  topBand:   { paddingTop: 80, paddingBottom: 48, alignItems: 'center', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, marginBottom: 32 },
  logoMark:  { width: 72, height: 72, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoLetter:{ fontSize: 34, fontWeight: '800', color: '#fff' },
  appName:   { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  tagline:   { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 5 },
  card:      { backgroundColor: '#fff', marginHorizontal: 20, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#E2D9CC', shadowColor: '#1C1208', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  heading:   { fontSize: 20, fontWeight: '800', color: '#1C1208', marginBottom: 8, letterSpacing: -0.3 },
  sub:       { fontSize: 14, color: '#8C7E6E', lineHeight: 20, marginBottom: 20 },
  schoolBox: { borderWidth: 2, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  logo:      { width: 72, height: 72, borderRadius: 10, marginBottom: 10 },
  schoolName:{ fontSize: 18, fontWeight: '800', textAlign: 'center' },
  btn:       { marginTop: 4 },
  back:      { alignItems: 'center', marginTop: 16, paddingVertical: 8 },
  backText:  { fontSize: 14, color: '#8C7E6E', fontWeight: '600' },
  errText:   { fontSize: 13, color: '#B83232', marginTop: 4, marginBottom: 8, fontWeight: '600' },
  hint:      { textAlign: 'center', fontSize: 13, color: '#8C7E6E', marginTop: 24, paddingHorizontal: 32 },
});
