import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ChangePasswordScreen() {
  const C = useTheme();
  const { clearMustChange } = useAuth();
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  async function handleSubmit() {
    if (!current || !next || !confirm) { setError('All fields are required.'); return; }
    if (next.length < 4)               { setError('New password must be at least 4 characters.'); return; }
    if (next !== confirm)              { setError('New passwords do not match.'); return; }
    setError(''); setLoading(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next });
      setSuccess(true);
      setTimeout(() => clearMustChange(), 1200);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to change password. Check your current password.');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={[s.flex, { backgroundColor: C.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">

        <View style={[s.topBand, { backgroundColor: C.primary }]}>
          <Text style={s.title}>Set Your Password</Text>
          <Text style={s.subtitle}>Your administrator has set a temporary password. Please choose a new one to continue.</Text>
        </View>

        <View style={s.card}>
          {success ? (
            <View style={s.successBox}>
              <Text style={s.successIcon}>✓</Text>
              <Text style={s.successText}>Password changed successfully!</Text>
              <Text style={s.successSub}>Taking you to your dashboard…</Text>
            </View>
          ) : (
            <>
              <Input
                label="Current / Temporary Password"
                placeholder="Enter temporary password"
                value={current}
                onChangeText={t => { setCurrent(t); setError(''); }}
                secureTextEntry
              />
              <Input
                label="New Password"
                placeholder="At least 4 characters"
                value={next}
                onChangeText={t => { setNext(t); setError(''); }}
                secureTextEntry
              />
              <Input
                label="Confirm New Password"
                placeholder="Repeat new password"
                value={confirm}
                onChangeText={t => { setConfirm(t); setError(''); }}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              {error ? <Text style={s.err}>{error}</Text> : null}
              <Button label="Save New Password" onPress={handleSubmit} loading={loading} size="lg" style={s.btn} />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:        { flex: 1 },
  container:   { flexGrow: 1, paddingBottom: 40 },
  topBand:     { paddingTop: 72, paddingBottom: 40, paddingHorizontal: 28, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, marginBottom: 28 },
  title:       { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 10, letterSpacing: -0.4 },
  subtitle:    { fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 20 },
  card:        { backgroundColor: '#fff', marginHorizontal: 20, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#E2D9CC', shadowColor: '#1C1208', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  err:         { fontSize: 13, color: '#B83232', fontWeight: '600', marginTop: -6, marginBottom: 10 },
  btn:         { marginTop: 4 },
  successBox:  { alignItems: 'center', paddingVertical: 24 },
  successIcon: { fontSize: 48, color: '#2D7A4F', marginBottom: 12 },
  successText: { fontSize: 18, fontWeight: '800', color: '#1C1208', marginBottom: 6 },
  successSub:  { fontSize: 14, color: '#8C7E6E' },
});
