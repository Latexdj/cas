import React, { useCallback, useRef, useState } from 'react';
import {
  Alert, Image, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ProfileScreen() {
  const Colors = useTheme();
  const { user, logout } = useAuth();

  const [photoUrl,   setPhotoUrl]   = useState<string | null>(null);
  const [teacherCode, setTeacherCode] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [facing,     setFacing]     = useState<'back' | 'front'>('front');
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [currentPassword,  setCurrentPassword]  = useState('');
  const [newPassword,      setNewPassword]      = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');
  const [changing,         setChanging]         = useState(false);

  useFocusEffect(useCallback(() => {
    api.get('/api/teachers/me').then(r => {
      setPhotoUrl(r.data.photo_url ?? null);
      setTeacherCode(r.data.teacher_code ?? '');
    }).catch(() => {});
  }, []));

  async function openCamera() {
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) { Alert.alert('Permission required', 'Camera permission is needed to take a photo.'); return; }
    }
    setShowCamera(true);
  }

  async function takePhoto() {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ base64: false, quality: 1 });
      if (!photo) return;
      setShowCamera(false);
      setUploading(true);
      const compressed = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 400 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const dataUrl = `data:image/jpeg;base64,${compressed.base64}`;
      const res = await api.patch('/api/teachers/me/photo', { imageBase64: dataUrl });
      setPhotoUrl(res.data.photo_url);
    } catch {
      Alert.alert('Error', 'Could not upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) { Alert.alert('Fill in all fields'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Passwords do not match'); return; }
    if (newPassword.length < 4) { Alert.alert('Password must be at least 4 characters'); return; }
    setChanging(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });
      Alert.alert('Password Changed', 'Your password has been updated successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not change password.');
    } finally { setChanging(false); }
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  }

  const initial = user?.name?.charAt(0).toUpperCase() ?? '?';

  // ── Full-screen camera ──────────────────────────────────────
  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} />
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCamera(false)}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
            <Text style={styles.cancelBtnText}>Flip</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: Colors.primary }]}>
        <TouchableOpacity style={styles.avatarWrap} onPress={openCamera} disabled={uploading}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: Colors.accent }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          {/* Camera badge */}
          <View style={[styles.cameraBadge, { backgroundColor: Colors.accent }]}>
            {uploading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.cameraBadgeIcon}>📷</Text>}
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{user?.name}</Text>
        {teacherCode ? <Text style={styles.teacherCode}>{teacherCode}</Text> : null}
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>{user?.role === 'admin' ? 'School Admin' : 'Teacher'}</Text>
        </View>
      </View>

      {/* Account */}
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

      {/* Change Password */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Change Password</Text>
        <View style={styles.infoCard}>
          <Input label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="Current password" />
          <Input label="New Password"     value={newPassword}     onChangeText={setNewPassword}     secureTextEntry placeholder="Min 4 characters" />
          <Input label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Repeat new password" />
          <Button label="Update Password" onPress={handleChangePassword} loading={changing} />
        </View>
      </View>

      <Button label="Log Out" variant="danger" onPress={handleLogout} style={styles.logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1, backgroundColor: '#F4EFE6' },
  content:         { paddingBottom: 48 },
  hero:            { alignItems: 'center', paddingTop: 36, paddingBottom: 40, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, marginBottom: 24 },
  avatarWrap:      { position: 'relative', marginBottom: 14 },
  avatar:          { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatarImg:       { width: 80, height: 80, borderRadius: 40 },
  avatarText:      { fontSize: 34, fontWeight: '800', color: '#fff' },
  cameraBadge:     { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  cameraBadgeIcon: { fontSize: 12 },
  name:            { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3, marginBottom: 4 },
  teacherCode:     { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 8 },
  rolePill:        { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  roleText:        { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  section:         { paddingHorizontal: 16, marginBottom: 20 },
  sectionLabel:    { fontSize: 11, fontWeight: '700', color: '#8C7E6E', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  infoCard:        { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', overflow: 'hidden', padding: 16 },
  row:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2D9CC' },
  rowLast:         { borderBottomWidth: 0, paddingBottom: 0 },
  rowLabel:        { fontSize: 14, color: '#8C7E6E' },
  rowValue:        { fontSize: 14, fontWeight: '600', color: '#1C1208', maxWidth: '55%', textAlign: 'right' },
  logout:          { marginHorizontal: 16, marginTop: 8 },
  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera:          { flex: 1 },
  cameraControls:  { position: 'absolute', bottom: 48, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  captureBtn:      { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  cancelBtn:       { paddingHorizontal: 20, paddingVertical: 12 },
  cancelBtnText:   { color: '#fff', fontSize: 15, fontWeight: '600' },
  flipBtn:         { paddingHorizontal: 20, paddingVertical: 12 },
});
