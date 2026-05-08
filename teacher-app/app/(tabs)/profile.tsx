import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin,     setNewPin]     = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [changing,   setChanging]   = useState(false);

  async function handleChangePin() {
    if (!currentPin || !newPin || !confirmPin) {
      Alert.alert('Fill in all PIN fields'); return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('PINs do not match'); return;
    }
    if (newPin.length < 4) {
      Alert.alert('PIN must be at least 4 digits'); return;
    }
    setChanging(true);
    try {
      await api.post('/api/auth/change-pin', { currentPin, newPin });
      Alert.alert('✅ PIN Changed', 'Your PIN has been updated.');
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not change PIN.');
    } finally {
      setChanging(false);
    }
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile header */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.role}>{user?.role === 'admin' ? 'School Admin' : 'Teacher'}</Text>

      {/* Account info */}
      <Card style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Role</Text>
          <Text style={styles.infoValue}>{user?.role === 'admin' ? 'Admin' : 'Teacher'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>School ID</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{user?.schoolId}</Text>
        </View>
      </Card>

      {/* Change PIN */}
      <Text style={styles.sectionTitle}>Change PIN</Text>
      <Card>
        <Input
          label="Current PIN"
          value={currentPin}
          onChangeText={setCurrentPin}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={8}
          placeholder="Your current PIN"
        />
        <Input
          label="New PIN"
          value={newPin}
          onChangeText={setNewPin}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={8}
          placeholder="New PIN (min 4 digits)"
        />
        <Input
          label="Confirm New PIN"
          value={confirmPin}
          onChangeText={setConfirmPin}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={8}
          placeholder="Repeat new PIN"
        />
        <Button label="Update PIN" onPress={handleChangePin} loading={changing} />
      </Card>

      <Button label="Log Out" variant="danger" onPress={handleLogout} style={styles.logoutBtn} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.bg },
  content:     { padding: 20, paddingBottom: 40, alignItems: 'stretch' },
  avatar:      { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 12 },
  avatarText:  { fontSize: 32, fontWeight: '700', color: '#fff' },
  name:        { fontSize: 22, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  role:        { fontSize: 14, color: Colors.muted, textAlign: 'center', marginBottom: 24, marginTop: 4 },
  infoCard:    { marginBottom: 24 },
  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel:   { fontSize: 14, color: Colors.muted },
  infoValue:   { fontSize: 14, fontWeight: '600', color: Colors.text, maxWidth: '60%' },
  sectionTitle:{ fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  logoutBtn:   { marginTop: 16 },
});
