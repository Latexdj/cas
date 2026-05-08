import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/colors';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin,     setNewPin]     = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [changing,   setChanging]   = useState(false);

  async function handleChangePin() {
    if (!currentPin || !newPin || !confirmPin) { Alert.alert('Fill in all PIN fields'); return; }
    if (newPin !== confirmPin) { Alert.alert('PINs do not match'); return; }
    if (newPin.length < 4)    { Alert.alert('PIN must be at least 4 digits'); return; }
    setChanging(true);
    try {
      await api.post('/api/auth/change-pin', { currentPin, newPin });
      Alert.alert('PIN Changed', 'Your PIN has been updated successfully.');
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not change PIN.');
    } finally { setChanging(false); }
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  }

  const initial = user?.name?.charAt(0).toUpperCase() ?? '?';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Avatar hero */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>{user?.role === 'admin' ? 'School Admin' : 'Teacher'}</Text>
        </View>
      </View>

      {/* Info rows */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.infoCard}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Role</Text>
            <Text style={styles.rowValue}>{user?.role === 'admin' ? 'Admin' : 'Teacher'}</Text>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowLabel}>School ID</Text>
            <Text style={styles.rowValue} numberOfLines={1} ellipsizeMode="middle">{user?.schoolId}</Text>
          </View>
        </View>
      </View>

      {/* Change PIN */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Change PIN</Text>
        <View style={styles.infoCard}>
          <Input label="Current PIN" value={currentPin} onChangeText={setCurrentPin} secureTextEntry keyboardType="number-pad" maxLength={8} placeholder="••••" />
          <Input label="New PIN"     value={newPin}     onChangeText={setNewPin}     secureTextEntry keyboardType="number-pad" maxLength={8} placeholder="Min 4 digits" />
          <Input label="Confirm PIN" value={confirmPin} onChangeText={setConfirmPin} secureTextEntry keyboardType="number-pad" maxLength={8} placeholder="Repeat new PIN" />
          <Button label="Update PIN" onPress={handleChangePin} loading={changing} />
        </View>
      </View>

      <Button label="Log Out" variant="danger" onPress={handleLogout} style={styles.logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: Colors.bg },
  content:      { paddingBottom: 48 },

  hero:         { backgroundColor: Colors.primary, alignItems: 'center', paddingTop: 36, paddingBottom: 40, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, marginBottom: 24 },
  avatar:       { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  avatarText:   { fontSize: 34, fontWeight: '800', color: '#fff' },
  name:         { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3, marginBottom: 8 },
  rolePill:     { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  roleText:     { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },

  section:      { paddingHorizontal: 16, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  infoCard:     { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', padding: 16 },

  row:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLast:      { borderBottomWidth: 0, paddingBottom: 0 },
  rowLabel:     { fontSize: 14, color: Colors.muted },
  rowValue:     { fontSize: 14, fontWeight: '600', color: Colors.text, maxWidth: '55%', textAlign: 'right' },

  logout:       { marginHorizontal: 16, marginTop: 8 },
});
