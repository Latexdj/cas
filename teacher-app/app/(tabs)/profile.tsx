import React, { useCallback, useRef, useState } from 'react';
import {
  Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const GENDERS   = ['Male', 'Female'];
const RELIGIONS = ['Christianity', 'Islam', 'Traditional', 'Other'];

interface TeacherProfile {
  id: string;
  teacher_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  rank: string | null;
  gov_staff_id: string | null;
  gender: string | null;
  date_of_birth: string | null;
  registered_number: string | null;
  ntc_number: string | null;
  ssf_number: string | null;
  academic_qualification: string | null;
  professional_qualification: string | null;
  additional_responsibility: string | null;
  bank: string | null;
  bank_branch: string | null;
  account_number: string | null;
  religion: string | null;
  religious_denomination: string | null;
  hometown: string | null;
  residential_address: string | null;
  association: string | null;
  ghana_card_number: string | null;
  certificate_url: string | null;
  certificate_filename: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_url: string | null;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const Colors = useTheme();
  const { user, logout } = useAuth();

  const [profile,    setProfile]    = useState<TeacherProfile | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [facing,     setFacing]     = useState<'back' | 'front'>('front');
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [showEditModal, setShowEditModal]   = useState(false);
  const [editForm,      setEditForm]        = useState<Record<string, string>>({});
  const [editSaving,    setEditSaving]      = useState(false);
  const [editErr,       setEditErr]         = useState('');

  const [currentPassword,  setCurrentPassword]  = useState('');
  const [newPassword,      setNewPassword]      = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');
  const [changing,         setChanging]         = useState(false);

  const [certUploading, setCertUploading] = useState(false);

  useFocusEffect(useCallback(() => {
    api.get<TeacherProfile>('/api/teachers/me').then(r => {
      setProfile(r.data);
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
      setProfile(p => p ? { ...p, photo_url: res.data.photo_url } : p);
    } catch {
      Alert.alert('Error', 'Could not upload photo. Please try again.');
    } finally { setUploading(false); }
  }

  function openEditModal() {
    if (!profile) return;
    setEditForm({
      phone:                   profile.phone ?? '',
      gender:                  profile.gender ?? '',
      date_of_birth:           profile.date_of_birth?.slice(0, 10) ?? '',
      religion:                profile.religion ?? '',
      religious_denomination:  profile.religious_denomination ?? '',
      hometown:                profile.hometown ?? '',
      residential_address:     profile.residential_address ?? '',
      emergency_contact_name:  profile.emergency_contact_name ?? '',
      emergency_contact_phone: profile.emergency_contact_phone ?? '',
    });
    setEditErr('');
    setShowEditModal(true);
  }

  async function saveProfile() {
    const PHONE_RE = /^0\d{9}$/;
    if (editForm.phone && !PHONE_RE.test(editForm.phone)) {
      setEditErr('Phone must be 10 digits starting with 0 (e.g. 0207440175)'); return;
    }
    if (editForm.emergency_contact_phone && !PHONE_RE.test(editForm.emergency_contact_phone)) {
      setEditErr('Emergency contact phone must be 10 digits starting with 0'); return;
    }
    setEditSaving(true); setEditErr('');
    try {
      const { data } = await api.patch<TeacherProfile>('/api/teachers/me/profile', editForm);
      setProfile(p => p ? { ...p, ...data } : p);
      setShowEditModal(false);
    } catch (err: any) {
      setEditErr(err?.response?.data?.error ?? 'Could not save profile.');
    } finally { setEditSaving(false); }
  }

  async function pickCertificate() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setCertUploading(true);
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        const ext  = asset.name.slice(asset.name.lastIndexOf('.')).toLowerCase();
        const mime = ext === '.pdf'  ? 'application/pdf'
                   : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                   :                   'application/msword';
        const documentBase64 = `data:${mime};base64,${base64}`;
        const res = await api.patch('/api/teachers/me/certificate', { documentBase64, documentFilename: asset.name });
        setProfile(p => p ? { ...p, certificate_url: res.data.certificate_url, certificate_filename: res.data.certificate_filename } : p);
        Alert.alert('Uploaded', 'Certificate uploaded successfully.');
      }
    } catch {
      Alert.alert('Error', 'Could not upload certificate.');
    } finally { setCertUploading(false); }
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
    <>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: Colors.primary }]}>
          <TouchableOpacity style={styles.avatarWrap} onPress={openCamera} disabled={uploading}>
            {profile?.photo_url ? (
              <Image source={{ uri: profile.photo_url }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: Colors.accent }]}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: Colors.accent }]}>
              {uploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.cameraBadgeIcon}>📷</Text>}
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{user?.name}</Text>
          {profile?.teacher_code ? <Text style={styles.teacherCode}>{profile.teacher_code}</Text> : null}
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{profile?.rank ?? (user?.role === 'admin' ? 'School Admin' : 'Teacher')}</Text>
          </View>
        </View>

        {/* Personal Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Personal Information</Text>
            <TouchableOpacity onPress={openEditModal} style={[styles.editBtn, { borderColor: Colors.primary }]}>
              <Text style={[styles.editBtnText, { color: Colors.primary }]}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.infoCard}>
            <InfoRow label="Email"       value={profile?.email} />
            <InfoRow label="Phone"       value={profile?.phone} />
            <InfoRow label="Gender"      value={profile?.gender} />
            <InfoRow label="Date of Birth" value={profile?.date_of_birth?.slice(0, 10)} />
            <InfoRow label="Hometown"    value={profile?.hometown} />
            <InfoRow label="Address"     value={profile?.residential_address} />
            <InfoRow label="Religion"    value={profile?.religion} />
            <InfoRow label="Denomination" value={profile?.religious_denomination} />
            <InfoRow label="Ghana Card"  value={profile?.ghana_card_number} />
          </View>
        </View>

        {/* Professional Info (read-only) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Professional Information</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Department"          value={profile?.department} />
            <InfoRow label="GES Rank"            value={profile?.rank} />
            <InfoRow label="Gov Staff ID"        value={profile?.gov_staff_id} />
            <InfoRow label="Registered No."      value={profile?.registered_number} />
            <InfoRow label="NTC Number"          value={profile?.ntc_number} />
            <InfoRow label="SSF Number"          value={profile?.ssf_number} />
            <InfoRow label="Academic Qual."      value={profile?.academic_qualification} />
            <InfoRow label="Professional Qual."  value={profile?.professional_qualification} />
            <InfoRow label="Responsibility"      value={profile?.additional_responsibility} />
            <InfoRow label="Association"         value={profile?.association} />
          </View>
        </View>

        {/* Banking (read-only) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Banking</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Bank"           value={profile?.bank} />
            <InfoRow label="Branch"         value={profile?.bank_branch} />
            <InfoRow label="Account No."    value={profile?.account_number} />
          </View>
        </View>

        {/* Emergency Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Emergency Contact</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Name"  value={profile?.emergency_contact_name} />
            <InfoRow label="Phone" value={profile?.emergency_contact_phone} />
          </View>
        </View>

        {/* Documents */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Documents</Text>
          <View style={styles.infoCard}>
            <View style={styles.docRow}>
              <View style={styles.flex1}>
                <Text style={styles.docLabel}>Academic Certificate</Text>
                {profile?.certificate_filename
                  ? <Text style={[styles.docFile, { color: Colors.primary }]} numberOfLines={1}>📄 {profile.certificate_filename}</Text>
                  : <Text style={styles.docNone}>No certificate uploaded</Text>
                }
              </View>
              <TouchableOpacity
                style={[styles.uploadDocBtn, { borderColor: Colors.primary }]}
                onPress={pickCertificate}
                disabled={certUploading}
              >
                {certUploading
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={[styles.uploadDocBtnText, { color: Colors.primary }]}>
                      {profile?.certificate_url ? 'Replace' : 'Upload'}
                    </Text>
                }
              </TouchableOpacity>
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

        <View style={styles.credit}>
          <View style={styles.creditDivider} />
          <Text style={styles.creditLabel}>Designed by</Text>
          <Text style={styles.creditBrand}>LatexTech</Text>
          <Text style={styles.creditPhone}>+233 24 8234 649</Text>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Edit My Profile</Text>
              <Text style={styles.sheetSub}>You can update personal and contact information</Text>

              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput style={styles.fieldInput} value={editForm.phone ?? ''} onChangeText={v => setEditForm(f => ({ ...f, phone: v }))} placeholder="+233..." placeholderTextColor="#B5A898" keyboardType="phone-pad" />

              <Text style={styles.fieldLabel}>Gender</Text>
              <View style={styles.chipRow}>
                {GENDERS.map(g => (
                  <TouchableOpacity key={g} style={[styles.chip, editForm.gender === g && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                    onPress={() => setEditForm(f => ({ ...f, gender: g }))}>
                    <Text style={[styles.chipText, editForm.gender === g && { color: '#fff' }]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Date of Birth (YYYY-MM-DD)</Text>
              <TextInput style={styles.fieldInput} value={editForm.date_of_birth ?? ''} onChangeText={v => setEditForm(f => ({ ...f, date_of_birth: v }))} placeholder="1990-01-15" placeholderTextColor="#B5A898" maxLength={10} keyboardType="numbers-and-punctuation" />

              <Text style={styles.fieldLabel}>Hometown</Text>
              <TextInput style={styles.fieldInput} value={editForm.hometown ?? ''} onChangeText={v => setEditForm(f => ({ ...f, hometown: v }))} placeholder="Hometown" placeholderTextColor="#B5A898" />

              <Text style={styles.fieldLabel}>Residential Address</Text>
              <TextInput style={[styles.fieldInput, { minHeight: 60, textAlignVertical: 'top' }]} value={editForm.residential_address ?? ''} onChangeText={v => setEditForm(f => ({ ...f, residential_address: v }))} placeholder="Your home address" placeholderTextColor="#B5A898" multiline />

              <Text style={styles.fieldLabel}>Religion</Text>
              <View style={styles.chipRow}>
                {RELIGIONS.map(r => (
                  <TouchableOpacity key={r} style={[styles.chip, editForm.religion === r && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                    onPress={() => setEditForm(f => ({ ...f, religion: r }))}>
                    <Text style={[styles.chipText, editForm.religion === r && { color: '#fff' }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Religious Denomination</Text>
              <TextInput style={styles.fieldInput} value={editForm.religious_denomination ?? ''} onChangeText={v => setEditForm(f => ({ ...f, religious_denomination: v }))} placeholder="e.g. Catholic, Methodist" placeholderTextColor="#B5A898" />

              <Text style={styles.fieldLabel}>Emergency Contact Name</Text>
              <TextInput style={styles.fieldInput} value={editForm.emergency_contact_name ?? ''} onChangeText={v => setEditForm(f => ({ ...f, emergency_contact_name: v }))} placeholder="Full name" placeholderTextColor="#B5A898" />

              <Text style={styles.fieldLabel}>Emergency Contact Phone</Text>
              <TextInput style={styles.fieldInput} value={editForm.emergency_contact_phone ?? ''} onChangeText={v => setEditForm(f => ({ ...f, emergency_contact_phone: v }))} placeholder="+233..." placeholderTextColor="#B5A898" keyboardType="phone-pad" />

              {editErr ? <Text style={styles.errText}>{editErr}</Text> : null}

              <View style={styles.row2}>
                <Button label="Cancel" variant="secondary" onPress={() => setShowEditModal(false)} style={styles.flex1} />
                <Button label="Save" onPress={saveProfile} loading={editSaving} style={styles.flex1} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
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
  sectionHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel:    { fontSize: 11, fontWeight: '700', color: '#8C7E6E', letterSpacing: 0.6, textTransform: 'uppercase' },
  editBtn:         { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  editBtnText:     { fontSize: 12, fontWeight: '700' },
  infoCard:        { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', overflow: 'hidden' },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F4EFE6' },
  infoLabel:       { fontSize: 13, color: '#8C7E6E', flex: 1 },
  infoValue:       { fontSize: 13, fontWeight: '600', color: '#1C1208', flex: 1.5, textAlign: 'right' },
  docRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  flex1:           { flex: 1 },
  docLabel:        { fontSize: 13, color: '#8C7E6E', marginBottom: 2 },
  docFile:         { fontSize: 12, fontWeight: '600' },
  docNone:         { fontSize: 12, color: '#C0B5A5', fontStyle: 'italic' },
  uploadDocBtn:    { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 12 },
  uploadDocBtnText:{ fontSize: 12, fontWeight: '700' },
  logout:          { marginHorizontal: 16, marginTop: 8 },
  credit:          { alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 32 },
  creditDivider:   { width: 48, height: 1, backgroundColor: '#E2D9CC', marginBottom: 16 },
  creditLabel:     { fontSize: 10, color: '#A09282', fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  creditBrand:     { fontSize: 14, fontWeight: '800', color: '#1C1208', marginTop: 4, letterSpacing: -0.3 },
  creditPhone:     { fontSize: 11, color: '#A09282', marginTop: 3, fontWeight: '500' },
  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera:          { flex: 1 },
  cameraControls:  { position: 'absolute', bottom: 48, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  captureBtn:      { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  cancelBtn:       { paddingHorizontal: 20, paddingVertical: 12 },
  cancelBtnText:   { color: '#fff', fontSize: 15, fontWeight: '600' },
  flipBtn:         { paddingHorizontal: 20, paddingVertical: 12 },
  // Edit modal
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetScroll:     { flexGrow: 1, justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
  sheetTitle:      { fontSize: 18, fontWeight: '700', color: '#1C1208', marginBottom: 4 },
  sheetSub:        { fontSize: 13, color: '#8C7E6E', marginBottom: 18 },
  fieldLabel:      { fontSize: 11, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 2 },
  fieldInput:      { backgroundColor: '#F4EFE6', borderRadius: 10, padding: 12, fontSize: 15, color: '#1C1208', borderWidth: 1, borderColor: '#E2D9CC', marginBottom: 14 },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E2D9CC', backgroundColor: '#FDFAF5' },
  chipText:        { fontSize: 13, fontWeight: '600', color: '#4A3F32' },
  errText:         { fontSize: 12, color: '#DC2626', backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 14 },
  row2:            { flexDirection: 'row', gap: 10 },
});
