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
const RELIGIOUS_DENOMINATION_OPTIONS = ['Roman Catholic', 'Pentecostal', 'Ahmadiyya', 'Sunni', 'Baptist', 'Methodist', 'SDA', 'Other'];
const RANK_OPTIONS = ['Director I', 'Director II', 'Deputy Director', 'Assistant Director I', 'Assistant Director II', 'Principal Superintendent', 'Senior Superintendent I', 'Senior Superintendent II', 'Superintendent I', 'Superintendent II', 'Principal (Deputy Director)', 'Vice Principal Academic & Skills Delivery (Principal Manager)', 'Vice Principal Administration & General Services (Principal Manager)', 'Principal Tutor / Senior Manager (ASD)', 'Senior Tutor / Manager (ASD)', 'Tutor / Assistant Manager (ASD)', 'Senior Technical Instructor / Senior Assistant (ASD)', 'Technical Assistant I (ASD)', 'Technical Assistant II (ASD)', 'Technical Assistant III (ASD)', 'Technical Assistant', 'Other'];
const ACADEMIC_QUALIFICATION_OPTIONS = ['BECE', 'WASSCE / SSSCE', 'Advanced Certificate', 'Diploma', 'HND', 'BTech', 'BEng', 'BBA', 'BSc', 'BEd', 'MTech', 'MEd', 'MBA', 'MSc', 'MA', 'MPhil', 'PhD', 'Other'];
const PROFESSIONAL_QUALIFICATION_OPTIONS = ['Certificate \'A\'', 'DBE', 'BEd', 'MEd', 'MPhil', 'PhD', 'Other'];
const ASSOCIATION_OPTIONS = ['GNAT', 'NAGRAT', 'PRETAG', 'TEWU', 'Other'];

interface TeacherResponsibility {
  id: string;
  name: string;
  module_key?: string | null;
}

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
  responsibilities?: TeacherResponsibility[];
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

function formatResponsibilities(profile: TeacherProfile | null) {
  const names = profile?.responsibilities?.map((item) => item.name).filter(Boolean) ?? [];
  if (names.length) return names.join(', ');
  return profile?.additional_responsibility || null;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

function getFieldAppearance(value: string | null | undefined, validator?: (v: string) => string | null, touched = false, required = true) {
  const text = (value ?? '').trim();
  if (!text) {
    return touched && required
      ? { borderColor: '#FCA5A5', hint: 'This field is required.' }
      : { borderColor: '#E2D9CC', hint: '' };
  }
  if (validator) {
    const err = validator(text);
    return err
      ? { borderColor: '#FCA5A5', hint: err }
      : { borderColor: '#86EFAC', hint: '' };
  }
  return { borderColor: '#86EFAC', hint: '' };
}

function OptionPicker({
  label,
  value,
  options,
  placeholder,
  onSelect,
  otherValue,
  onOtherChange,
  touched,
  onBlur,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onSelect: (value: string) => void;
  otherValue?: string;
  onOtherChange?: (value: string) => void;
  touched?: boolean;
  onBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.fieldInput} onPress={() => setOpen(true)}>
        <Text style={[styles.selectText, !value && styles.placeholderText]}>{value || placeholder}</Text>
      </TouchableOpacity>
      {value === 'Other' && onOtherChange ? (
        <>
          <TextInput
            style={[styles.fieldInput, { marginTop: 8, borderColor: getFieldAppearance(otherValue ?? '', undefined, touched ?? false, true).borderColor }]}
            value={otherValue ?? ''}
            onChangeText={(v) => { onOtherChange(v); onBlur?.(); }}
            onBlur={onBlur}
            placeholder={`Specify ${label.toLowerCase()}`}
            placeholderTextColor="#B5A898"
          />
          {getFieldAppearance(otherValue ?? '', undefined, touched ?? false, true).hint ? (
            <Text style={styles.fieldErrorText}>{getFieldAppearance(otherValue ?? '', undefined, touched ?? false, true).hint}</Text>
          ) : null}
        </>
      ) : null}
      <Modal visible={open} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.optionSheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.optionRow}
                onPress={() => {
                  onSelect(option);
                  setOpen(false);
                }}
              >
                <Text style={styles.optionText}>{option}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.cancelButton, { marginTop: 12 }]} onPress={() => setOpen(false)}>
              <Text style={styles.cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
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
  const [touchedFields, setTouchedFields]    = useState<Record<string, boolean>>({});
  const [uploadTouched, setUploadTouched]    = useState(false);
  const [editSaving,    setEditSaving]      = useState(false);
  const [editErr,       setEditErr]         = useState('');

  const [currentPassword,  setCurrentPassword]  = useState('');
  const [newPassword,      setNewPassword]      = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');
  const [changing,         setChanging]         = useState(false);

  const [certUploading, setCertUploading] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const [showOfficialModal, setShowOfficialModal] = useState(false);
  const [officialForm, setOfficialForm] = useState<Record<string, string>>({});
  const [officialSaving, setOfficialSaving] = useState(false);
  const [officialDocumentName, setOfficialDocumentName] = useState('');
  const [officialDocumentBase64, setOfficialDocumentBase64] = useState('');

  useFocusEffect(useCallback(() => {
    const loadProfile = async () => {
      try {
        const profileRes = await api.get<TeacherProfile>('/api/teachers/me');
        setProfile(profileRes.data);

        const requestsRes = await api.get<any[]>('/api/teachers/me/profile-requests');
        const nextPending = [...requestsRes.data].find((request) => request.status === 'Pending') ?? null;
        setPendingRequest(nextPending);
      } catch {
        setPendingRequest(null);
      }
    };

    loadProfile();
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
      religion:                profile.religion ?? '',
      religion_other:          profile.religion && !RELIGIONS.includes(profile.religion) ? profile.religion : '',
      religious_denomination:  profile.religious_denomination ?? '',
      religious_denomination_other: profile.religious_denomination && !RELIGIOUS_DENOMINATION_OPTIONS.includes(profile.religious_denomination) ? profile.religious_denomination : '',
      hometown:                profile.hometown ?? '',
      residential_address:     profile.residential_address ?? '',
      emergency_contact_name:  profile.emergency_contact_name ?? '',
      emergency_contact_phone: profile.emergency_contact_phone ?? '',
    });
    setEditErr('');
    setShowEditModal(true);
  }

  function openOfficialRequestModal() {
    if (!profile) return;
    setOfficialForm({
      name: profile.name ?? '',
      department: profile.department ?? '',
      gov_staff_id: profile.gov_staff_id ?? '',
      rank: profile.rank ?? '',
      rank_other: profile.rank && !RANK_OPTIONS.includes(profile.rank) ? profile.rank : '',
      date_of_birth: profile.date_of_birth?.slice(0, 10) ?? '',
      registered_number: profile.registered_number ?? '',
      ntc_number: profile.ntc_number ?? '',
      ssf_number: profile.ssf_number ?? '',
      academic_qualification: profile.academic_qualification ?? '',
      academic_qualification_other: profile.academic_qualification && !ACADEMIC_QUALIFICATION_OPTIONS.includes(profile.academic_qualification) ? profile.academic_qualification : '',
      professional_qualification: profile.professional_qualification ?? '',
      professional_qualification_other: profile.professional_qualification && !PROFESSIONAL_QUALIFICATION_OPTIONS.includes(profile.professional_qualification) ? profile.professional_qualification : '',
      bank: profile.bank ?? '',
      bank_branch: profile.bank_branch ?? '',
      account_number: profile.account_number ?? '',
      association: profile.association ?? '',
      association_other: profile.association && !ASSOCIATION_OPTIONS.includes(profile.association) ? profile.association : '',
      ghana_card_number: profile.ghana_card_number ?? '',
    });
    setOfficialDocumentName('');
    setOfficialDocumentBase64('');
    setShowOfficialModal(true);
  }

  async function saveProfile() {
    const PHONE_RE = /^0\d{9}$/;
    if (editForm.phone && !PHONE_RE.test(editForm.phone)) {
      setEditErr('Phone must be 10 digits starting with 0 (e.g. 0207440175)'); return;
    }
    if (editForm.emergency_contact_phone && !PHONE_RE.test(editForm.emergency_contact_phone)) {
      setEditErr('Emergency contact phone must be 10 digits starting with 0'); return;
    }
    const payload = { ...editForm };
    if (payload.religion === 'Other') {
      payload.religion = payload.religion_other?.trim() || 'Other';
    }
    if (payload.religious_denomination === 'Other') {
      payload.religious_denomination = payload.religious_denomination_other?.trim() || 'Other';
    }
    delete payload.religion_other;
    delete payload.religious_denomination_other;
    setEditSaving(true); setEditErr('');
    try {
      const { data } = await api.patch<TeacherProfile>('/api/teachers/me/profile', payload);
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

  async function pickOfficialDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        const ext = asset.name.slice(asset.name.lastIndexOf('.')).toLowerCase();
        const mime = ext === '.pdf' ? 'application/pdf' : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/msword';
        setOfficialDocumentName(asset.name);
        setOfficialDocumentBase64(`data:${mime};base64,${base64}`);
      }
    } catch {
      Alert.alert('Error', 'Could not attach the supporting document.');
    }
  }

  async function submitOfficialRequest() {
    if (!profile) return;
    const payload = { ...officialForm };
    ['rank', 'academic_qualification', 'professional_qualification', 'association'].forEach((field) => {
      if (payload[field] === 'Other' && (payload[`${field}_other`] ?? '').trim()) {
        payload[field] = payload[`${field}_other`].trim();
      }
    });
    Object.keys(payload).forEach((key) => {
      if (payload[key] === '') payload[key] = null as any;
    });

    try {
      setOfficialSaving(true);
      const res = await api.post('/api/teachers/me/profile-requests', {
        ...payload,
        documentBase64: officialDocumentBase64 || undefined,
        documentFilename: officialDocumentName || undefined,
      });
      setPendingRequest(res.data);
      setShowOfficialModal(false);
      Alert.alert('Request Submitted', 'Your official profile change has been sent for administrative review.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not submit profile change request.');
    } finally {
      setOfficialSaving(false);
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
          {pendingRequest ? (
            <View style={[styles.rolePill, styles.pendingPill, { marginTop: 10 }]}>
              <Text style={styles.roleText}>Pending approval</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Official Profile</Text>
            {!pendingRequest ? (
              <TouchableOpacity onPress={openOfficialRequestModal} style={[styles.editBtn, { borderColor: Colors.primary }]}>
                <Text style={[styles.editBtnText, { color: Colors.primary }]}>Request Update</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.editBtn, { borderColor: '#D5B14A' }]}>
                <Text style={[styles.editBtnText, { color: '#D5B14A' }]}>Under Review</Text>
              </View>
            )}
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
            <InfoRow label="Responsibility"      value={formatResponsibilities(profile)} />
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

      <Modal visible={showOfficialModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Request Official Profile Change</Text>
              <Text style={styles.sheetSub}>These fields require admin review before they go live.</Text>

              <Text style={styles.fieldLabel}>Full Name</Text>
              <TextInput style={styles.fieldInput} value={officialForm.name ?? ''} onChangeText={v => setOfficialForm(f => ({ ...f, name: v }))} placeholder="Teacher name" />

              <Text style={styles.fieldLabel}>Department</Text>
              <TextInput style={styles.fieldInput} value={officialForm.department ?? ''} onChangeText={v => setOfficialForm(f => ({ ...f, department: v }))} placeholder="Department" />

              <Text style={styles.fieldLabel}>Gov Staff ID</Text>
              <TextInput style={styles.fieldInput} value={officialForm.gov_staff_id ?? ''} onChangeText={v => setOfficialForm(f => ({ ...f, gov_staff_id: v }))} placeholder="Gov Staff ID" />

              <OptionPicker label="GES/TVET Rank" value={officialForm.rank ?? ''} options={RANK_OPTIONS} placeholder="Select rank" onSelect={v => setOfficialForm(f => ({ ...f, rank: v, rank_other: v === 'Other' ? f.rank_other ?? '' : '' }))} otherValue={officialForm.rank_other ?? ''} onOtherChange={v => setOfficialForm(f => ({ ...f, rank_other: v }))} touched={touchedFields.rank_other ?? false} onBlur={() => setTouchedFields(prev => ({ ...prev, rank_other: true }))} />

              <Text style={styles.fieldLabel}>Date of Birth (YYYY-MM-DD)</Text>
              <TextInput style={styles.fieldInput} value={officialForm.date_of_birth ?? ''} onChangeText={v => setOfficialForm(f => ({ ...f, date_of_birth: v }))} placeholder="1990-01-15" maxLength={10} keyboardType="numbers-and-punctuation" />

              <Text style={styles.fieldLabel}>Registered Number</Text>
              <TextInput style={styles.fieldInput} value={officialForm.registered_number ?? ''} onChangeText={v => setOfficialForm(f => ({ ...f, registered_number: v }))} placeholder="Registered number" />

              <Text style={styles.fieldLabel}>NTC Number</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: getFieldAppearance(officialForm.ntc_number ?? '', (v) => /^PT\/\d{6}\/\d{4}$/.test(v) ? null : 'Format: PT/000000/0000', touchedFields.ntc_number ?? false, true).borderColor }]}
                value={officialForm.ntc_number ?? ''}
                onChangeText={v => { setOfficialForm(f => ({ ...f, ntc_number: v })); setTouchedFields(prev => ({ ...prev, ntc_number: true })); }}
                onBlur={() => setTouchedFields(prev => ({ ...prev, ntc_number: true }))}
                placeholder="PT/000000/0000"
              />
              {getFieldAppearance(officialForm.ntc_number ?? '', (v) => /^PT\/\d{6}\/\d{4}$/.test(v) ? null : 'Format: PT/000000/0000', touchedFields.ntc_number ?? false, true).hint ? (
                <Text style={styles.fieldErrorText}>{getFieldAppearance(officialForm.ntc_number ?? '', (v) => /^PT\/\d{6}\/\d{4}$/.test(v) ? null : 'Format: PT/000000/0000', touchedFields.ntc_number ?? false, true).hint}</Text>
              ) : <Text style={styles.fieldHint}>Format: PT/000000/0000</Text>}

              <Text style={styles.fieldLabel}>SSF Number</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: getFieldAppearance(officialForm.ssf_number ?? '', (v) => /^[A-Za-z]{2}\d{11}$/.test(v) ? null : 'Format: 2 letters + 11 digits', touchedFields.ssf_number ?? false, true).borderColor }]}
                value={officialForm.ssf_number ?? ''}
                onChangeText={v => { setOfficialForm(f => ({ ...f, ssf_number: v })); setTouchedFields(prev => ({ ...prev, ssf_number: true })); }}
                onBlur={() => setTouchedFields(prev => ({ ...prev, ssf_number: true }))}
                placeholder="K000000000000"
              />
              {getFieldAppearance(officialForm.ssf_number ?? '', (v) => /^[A-Za-z]{2}\d{11}$/.test(v) ? null : 'Format: 2 letters + 11 digits', touchedFields.ssf_number ?? false, true).hint ? (
                <Text style={styles.fieldErrorText}>{getFieldAppearance(officialForm.ssf_number ?? '', (v) => /^[A-Za-z]{2}\d{11}$/.test(v) ? null : 'Format: 2 letters + 11 digits', touchedFields.ssf_number ?? false, true).hint}</Text>
              ) : <Text style={styles.fieldHint}>Format: 2 letters + 11 digits</Text>}

              <OptionPicker label="Academic Qualification" value={officialForm.academic_qualification ?? ''} options={ACADEMIC_QUALIFICATION_OPTIONS} placeholder="Select academic qualification" onSelect={v => setOfficialForm(f => ({ ...f, academic_qualification: v, academic_qualification_other: v === 'Other' ? f.academic_qualification_other ?? '' : '' }))} otherValue={officialForm.academic_qualification_other ?? ''} onOtherChange={v => setOfficialForm(f => ({ ...f, academic_qualification_other: v }))} touched={touchedFields.academic_qualification_other ?? false} onBlur={() => setTouchedFields(prev => ({ ...prev, academic_qualification_other: true }))} />

              <OptionPicker label="Professional Qualification" value={officialForm.professional_qualification ?? ''} options={PROFESSIONAL_QUALIFICATION_OPTIONS} placeholder="Select professional qualification" onSelect={v => setOfficialForm(f => ({ ...f, professional_qualification: v, professional_qualification_other: v === 'Other' ? f.professional_qualification_other ?? '' : '' }))} otherValue={officialForm.professional_qualification_other ?? ''} onOtherChange={v => setOfficialForm(f => ({ ...f, professional_qualification_other: v }))} touched={touchedFields.professional_qualification_other ?? false} onBlur={() => setTouchedFields(prev => ({ ...prev, professional_qualification_other: true }))} />

              <Text style={styles.fieldLabel}>Bank</Text>
              <TextInput style={styles.fieldInput} value={officialForm.bank ?? ''} onChangeText={v => setOfficialForm(f => ({ ...f, bank: v }))} placeholder="Bank name" />

              <Text style={styles.fieldLabel}>Bank Branch</Text>
              <TextInput style={styles.fieldInput} value={officialForm.bank_branch ?? ''} onChangeText={v => setOfficialForm(f => ({ ...f, bank_branch: v }))} placeholder="Branch" />

              <Text style={styles.fieldLabel}>Account Number</Text>
              <TextInput style={styles.fieldInput} value={officialForm.account_number ?? ''} onChangeText={v => setOfficialForm(f => ({ ...f, account_number: v }))} placeholder="Account number" keyboardType="numeric" />

              <OptionPicker label="Association" value={officialForm.association ?? ''} options={ASSOCIATION_OPTIONS} placeholder="Select association" onSelect={v => setOfficialForm(f => ({ ...f, association: v, association_other: v === 'Other' ? f.association_other ?? '' : '' }))} otherValue={officialForm.association_other ?? ''} onOtherChange={v => setOfficialForm(f => ({ ...f, association_other: v }))} touched={touchedFields.association_other ?? false} onBlur={() => setTouchedFields(prev => ({ ...prev, association_other: true }))} />

              <Text style={styles.fieldLabel}>Ghana Card Number</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: getFieldAppearance(officialForm.ghana_card_number ?? '', (v) => /^GHA-\d{9}-\d$/.test(v) ? null : 'Format: GHA-000000000-0', touchedFields.ghana_card_number ?? false, true).borderColor }]}
                value={officialForm.ghana_card_number ?? ''}
                onChangeText={v => { setOfficialForm(f => ({ ...f, ghana_card_number: v })); setTouchedFields(prev => ({ ...prev, ghana_card_number: true })); }}
                onBlur={() => setTouchedFields(prev => ({ ...prev, ghana_card_number: true }))}
                placeholder="GHA-000000000-0"
              />
              {getFieldAppearance(officialForm.ghana_card_number ?? '', (v) => /^GHA-\d{9}-\d$/.test(v) ? null : 'Format: GHA-000000000-0', touchedFields.ghana_card_number ?? false, true).hint ? (
                <Text style={styles.fieldErrorText}>{getFieldAppearance(officialForm.ghana_card_number ?? '', (v) => /^GHA-\d{9}-\d$/.test(v) ? null : 'Format: GHA-000000000-0', touchedFields.ghana_card_number ?? false, true).hint}</Text>
              ) : <Text style={styles.fieldHint}>Format: GHA-000000000-0</Text>}

              <TouchableOpacity onPress={pickOfficialDocument} onBlur={() => setUploadTouched(true)} style={[styles.uploadDocBtn, { borderColor: officialDocumentName ? '#86EFAC' : uploadTouched ? '#FCA5A5' : '#E2D9CC', marginBottom: 12 }]}>
                <Text style={[styles.uploadDocBtnText, { color: officialDocumentName ? '#145C44' : uploadTouched ? '#B83232' : Colors.primary }]}>{officialDocumentName ? `Attached: ${officialDocumentName}` : 'Attach supporting document'}</Text>
              </TouchableOpacity>
              {uploadTouched && !officialDocumentName ? <Text style={styles.fieldErrorText}>Supporting document is required.</Text> : null}

              <View style={styles.row2}>
                <Button label="Cancel" variant="secondary" onPress={() => setShowOfficialModal(false)} style={styles.flex1} />
                <Button label="Submit" onPress={submitOfficialRequest} loading={officialSaving} style={styles.flex1} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Edit My Profile</Text>
              <Text style={styles.sheetSub}>You can update personal and contact information</Text>

              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: getFieldAppearance(editForm.phone ?? '', (v) => /^0\d{9}$/.test(v) ? null : 'Phone must be 10 digits starting with 0', touchedFields.phone ?? false, true).borderColor }]}
                value={editForm.phone ?? ''}
                onChangeText={v => { setEditForm(f => ({ ...f, phone: v })); setTouchedFields(prev => ({ ...prev, phone: true })); }}
                onBlur={() => setTouchedFields(prev => ({ ...prev, phone: true }))}
                placeholder="+233..." placeholderTextColor="#B5A898" keyboardType="phone-pad"
              />
              {getFieldAppearance(editForm.phone ?? '', (v) => /^0\d{9}$/.test(v) ? null : 'Phone must be 10 digits starting with 0', touchedFields.phone ?? false, true).hint ? (
                <Text style={styles.fieldErrorText}>{getFieldAppearance(editForm.phone ?? '', (v) => /^0\d{9}$/.test(v) ? null : 'Phone must be 10 digits starting with 0', touchedFields.phone ?? false, true).hint}</Text>
              ) : null}

              <OptionPicker label="Gender" value={editForm.gender ?? ''} options={GENDERS} placeholder="Select gender" onSelect={v => setEditForm(f => ({ ...f, gender: v }))} />

              <Text style={styles.fieldLabel}>Hometown</Text>
              <TextInput style={styles.fieldInput} value={editForm.hometown ?? ''} onChangeText={v => setEditForm(f => ({ ...f, hometown: v }))} placeholder="Hometown" placeholderTextColor="#B5A898" />

              <Text style={styles.fieldLabel}>Residential Address</Text>
              <TextInput style={[styles.fieldInput, { minHeight: 60, textAlignVertical: 'top' }]} value={editForm.residential_address ?? ''} onChangeText={v => setEditForm(f => ({ ...f, residential_address: v }))} placeholder="Your home address" placeholderTextColor="#B5A898" multiline />

              <OptionPicker label="Religion" value={editForm.religion ?? ''} options={RELIGIONS} placeholder="Select religion" onSelect={v => setEditForm(f => ({ ...f, religion: v, religion_other: v === 'Other' ? f.religion_other ?? '' : '' }))} otherValue={editForm.religion_other ?? ''} onOtherChange={v => setEditForm(f => ({ ...f, religion_other: v }))} touched={touchedFields.religion_other ?? false} onBlur={() => setTouchedFields(prev => ({ ...prev, religion_other: true }))} />

              <OptionPicker label="Religious Denomination" value={editForm.religious_denomination ?? ''} options={RELIGIOUS_DENOMINATION_OPTIONS} placeholder="Select denomination" onSelect={v => setEditForm(f => ({ ...f, religious_denomination: v, religious_denomination_other: v === 'Other' ? f.religious_denomination_other ?? '' : '' }))} otherValue={editForm.religious_denomination_other ?? ''} onOtherChange={v => setEditForm(f => ({ ...f, religious_denomination_other: v }))} touched={touchedFields.religious_denomination_other ?? false} onBlur={() => setTouchedFields(prev => ({ ...prev, religious_denomination_other: true }))} />

              <Text style={styles.fieldLabel}>Emergency Contact Name</Text>
              <TextInput style={styles.fieldInput} value={editForm.emergency_contact_name ?? ''} onChangeText={v => setEditForm(f => ({ ...f, emergency_contact_name: v }))} placeholder="Full name" placeholderTextColor="#B5A898" />

              <Text style={styles.fieldLabel}>Emergency Contact Phone</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: getFieldAppearance(editForm.emergency_contact_phone ?? '', (v) => /^0\d{9}$/.test(v) ? null : 'Emergency contact phone must be 10 digits starting with 0', touchedFields.emergency_contact_phone ?? false, true).borderColor }]}
                value={editForm.emergency_contact_phone ?? ''}
                onChangeText={v => { setEditForm(f => ({ ...f, emergency_contact_phone: v })); setTouchedFields(prev => ({ ...prev, emergency_contact_phone: true })); }}
                onBlur={() => setTouchedFields(prev => ({ ...prev, emergency_contact_phone: true }))}
                placeholder="+233..." placeholderTextColor="#B5A898" keyboardType="phone-pad"
              />
              {getFieldAppearance(editForm.emergency_contact_phone ?? '', (v) => /^0\d{9}$/.test(v) ? null : 'Emergency contact phone must be 10 digits starting with 0', touchedFields.emergency_contact_phone ?? false, true).hint ? (
                <Text style={styles.fieldErrorText}>{getFieldAppearance(editForm.emergency_contact_phone ?? '', (v) => /^0\d{9}$/.test(v) ? null : 'Emergency contact phone must be 10 digits starting with 0', touchedFields.emergency_contact_phone ?? false, true).hint}</Text>
              ) : null}

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
  pendingPill:     { backgroundColor: 'rgba(255,214,102,0.2)', borderWidth: 1, borderColor: 'rgba(255,214,102,0.7)' },
  roleText:        { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  section:         { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel:    { fontSize: 11, fontWeight: '700', color: '#8C7E6E', letterSpacing: 0.6, textTransform: 'uppercase' },
  editBtn:         { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  editBtnText:     { fontSize: 12, fontWeight: '700' },
  infoCard:        { backgroundColor: '#FAFAF8', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', overflow: 'hidden' },
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
  sheet:           { backgroundColor: '#FAFAF8', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
  sheetTitle:      { fontSize: 18, fontWeight: '700', color: '#1C1208', marginBottom: 4 },
  sheetSub:        { fontSize: 13, color: '#8C7E6E', marginBottom: 18 },
  fieldLabel:      { fontSize: 11, fontWeight: '700', color: '#8C7E6E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 2 },
  fieldInput:      { backgroundColor: '#F4EFE6', borderRadius: 10, padding: 12, fontSize: 15, color: '#1C1208', borderWidth: 1, borderColor: '#E2D9CC', marginBottom: 14 },
  fieldHint:       { fontSize: 11, color: '#8C7E6E', marginTop: -10, marginBottom: 12 },
  fieldErrorText:  { fontSize: 11, color: '#B83232', marginTop: -10, marginBottom: 12 },
  placeholderText: { color: '#B5A898' },
  selectText:      { fontSize: 15, color: '#1C1208' },
  optionSheet:     { backgroundColor: '#FAFAF8', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 },
  optionRow:       { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F4EFE6' },
  optionText:      { fontSize: 15, color: '#1C1208' },
  cancelButton:    { alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: '#F4EFE6' },
  cancelButtonText:{ color: '#1C1208', fontWeight: '700' },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E2D9CC', backgroundColor: '#FDFAF5' },
  chipText:        { fontSize: 13, fontWeight: '600', color: '#4A3F32' },
  errText:         { fontSize: 12, color: '#B83232', backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 14 },
  row2:            { flexDirection: 'row', gap: 10 },
});
