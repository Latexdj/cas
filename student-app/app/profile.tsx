import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme, useToggleDark, useIsDark } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import type { StudentProfile } from '@/types/api';

export default function ProfileScreen() {
  const C = useTheme();
  const isDark    = useIsDark();
  const toggleDark= useToggleDark();
  const { user, logout } = useAuth();

  const [profile,  setProfile]  = useState<StudentProfile | null>(null);
  const [loading,  setLoading]  = useState(true);

  const [current,  setCurrent]  = useState('');
  const [next_,    setNext_]    = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdOk,    setPwdOk]    = useState(false);

  useEffect(() => {
    api.get<StudentProfile>('/api/student/profile')
      .then(r => setProfile(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleChangePwd() {
    if (!current || !next_ || !confirm) { setPwdError('All fields required.'); return; }
    if (next_.length < 4)               { setPwdError('New password must be at least 4 characters.'); return; }
    if (next_ !== confirm)              { setPwdError('Passwords do not match.'); return; }
    setPwdError(''); setSaving(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next_ });
      setPwdOk(true);
      setCurrent(''); setNext_(''); setConfirm('');
      setTimeout(() => setPwdOk(false), 3000);
    } catch (err: any) {
      setPwdError(err?.response?.data?.error ?? 'Incorrect current password.');
    } finally { setSaving(false); }
  }

  if (loading) return <Spinner message="Loading profile…" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={[s.flex, { backgroundColor: C.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>

        {/* Avatar + name */}
        <View style={[s.heroCard, { backgroundColor: C.primary }]}>
          <View style={[s.avatar, { backgroundColor: C.accent }]}>
            <Text style={s.avatarText}>{(profile?.name ?? user?.name ?? 'S')[0].toUpperCase()}</Text>
          </View>
          <Text style={s.heroName}>{profile?.name ?? user?.name}</Text>
          <Text style={s.heroSub}>{profile?.student_code} · {profile?.class_name}</Text>
          {profile?.program && <Text style={s.heroProgram}>{profile.program}</Text>}
        </View>

        {/* Info */}
        <Card style={s.infoCard}>
          <Text style={[s.sectionTitle, { color: C.muted }]}>Student Information</Text>
          {[
            { label: 'Gender',          value: profile?.gender },
            { label: 'Date of Birth',   value: profile?.date_of_birth ? formatDate(profile.date_of_birth) : null },
            { label: 'House',           value: profile?.house },
            { label: 'Form Teacher',    value: profile?.form_teacher ? (typeof profile.form_teacher === 'string' ? profile.form_teacher : profile.form_teacher.teacher_name) : null },
            { label: 'Guardian',        value: profile?.guardian_name },
            { label: 'Guardian Phone',  value: profile?.guardian_phone },
          ].filter(row => row.value).map(row => (
            <View key={row.label} style={[s.infoRow, { borderBottomColor: C.border }]}>
              <Text style={[s.infoLabel, { color: C.muted }]}>{row.label}</Text>
              <Text style={[s.infoValue, { color: C.text }]}>{row.value}</Text>
            </View>
          ))}
        </Card>

        {/* Change password */}
        <Card style={s.pwdCard}>
          <Text style={[s.sectionTitle, { color: C.muted }]}>Change Password</Text>
          <Input label="Current Password" value={current} onChangeText={t => { setCurrent(t); setPwdError(''); setPwdOk(false); }} secureTextEntry placeholder="Current password" />
          <Input label="New Password"     value={next_}   onChangeText={t => { setNext_(t);  setPwdError(''); setPwdOk(false); }} secureTextEntry placeholder="At least 4 characters" />
          <Input label="Confirm"          value={confirm} onChangeText={t => { setConfirm(t);setPwdError(''); setPwdOk(false); }} secureTextEntry placeholder="Repeat new password" returnKeyType="done" onSubmitEditing={handleChangePwd} />
          {pwdError ? <Text style={[s.pwdErr, { color: C.danger }]}>{pwdError}</Text> : null}
          {pwdOk    ? <Text style={[s.pwdOk,  { color: C.success }]}>✓ Password changed successfully</Text> : null}
          <Button label="Save New Password" onPress={handleChangePwd} loading={saving} />
        </Card>

        {/* Settings */}
        <Card style={s.settingsCard}>
          <Text style={[s.sectionTitle, { color: C.muted }]}>Settings</Text>
          <TouchableOpacity style={s.settingRow} onPress={toggleDark}>
            <Text style={[s.settingLabel, { color: C.text }]}>Dark Mode</Text>
            <View style={[s.toggle, { backgroundColor: isDark ? C.primary : C.border }]}>
              <View style={[s.toggleThumb, isDark && s.toggleThumbOn]} />
            </View>
          </TouchableOpacity>
        </Card>

        {/* Sign out */}
        <Button label="Sign Out" variant="danger" onPress={logout} style={s.signOutBtn} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const s = StyleSheet.create({
  flex:         { flex: 1 },
  heroCard:     { borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  avatar:       { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  avatarText:   { fontSize: 32, fontWeight: '800', color: '#fff' },
  heroName:     { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroSub:      { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  heroProgram:  { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  infoCard:     { marginBottom: 16 },
  sectionTitle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  infoRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  infoLabel:    { fontSize: 13, fontWeight: '600' },
  infoValue:    { fontSize: 13, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 12 },
  pwdCard:      { marginBottom: 16 },
  pwdErr:       { fontSize: 13, fontWeight: '600', marginTop: -4, marginBottom: 10 },
  pwdOk:        { fontSize: 13, fontWeight: '600', marginTop: -4, marginBottom: 10 },
  settingsCard: { marginBottom: 16 },
  settingRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  settingLabel: { fontSize: 15, fontWeight: '600' },
  toggle:       { width: 44, height: 24, borderRadius: 12, justifyContent: 'center', padding: 2 },
  toggleThumb:  { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleThumbOn:{ alignSelf: 'flex-end' },
  signOutBtn:   { marginTop: 4 },
});
