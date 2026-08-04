import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { storage } from '@/lib/storage';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => { storage.getSchoolLogo().then(setLogo); }, []);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* Branding */}
      <View style={s.brand}>
        {logo
          ? <Image source={{ uri: logo }} style={s.logo} resizeMode="contain" />
          : <View style={s.logoMark}><Text style={s.logoLetter}>S</Text></View>
        }
        <Text style={s.title}>CAS Student</Text>
        <Text style={s.subtitle}>School Management System</Text>
      </View>

      {/* Action cards */}
      <View style={s.cards}>

        {/* Materials — primary action */}
        <TouchableOpacity
          style={s.materialCard}
          onPress={() => router.push('/materials')}
          activeOpacity={0.82}
        >
          <View style={s.materialIconWrap}>
            <Ionicons name="folder-open" size={38} color="#fff" />
          </View>
          <View style={s.materialText}>
            <Text style={s.materialTitle}>Learning Materials</Text>
            <Text style={s.materialSub}>Browse offline study resources — no login needed</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        {/* Login — secondary action */}
        <TouchableOpacity
          style={s.loginCard}
          onPress={() => router.push('/login')}
          activeOpacity={0.82}
        >
          <View style={[s.loginIconWrap]}>
            <Ionicons name="person-circle-outline" size={34} color="#1C1208" />
          </View>
          <View style={s.loginText}>
            <Text style={s.loginTitle}>Student Login</Text>
            <Text style={s.loginSub}>Access results, attendance, fees and more</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#8C7E6E" />
        </TouchableOpacity>

      </View>

      <Text style={s.hint}>Learning materials are stored on this device and work without internet.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#F4EFE6', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  brand:          { alignItems: 'center', marginBottom: 48 },
  logo:           { width: 88, height: 88, borderRadius: 20, marginBottom: 16, backgroundColor: '#E2D9CC' },
  logoMark:       { width: 88, height: 88, borderRadius: 26, backgroundColor: '#0B3D2E', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoLetter:     { fontSize: 40, fontWeight: '900', color: '#fff' },
  title:          { fontSize: 28, fontWeight: '900', color: '#1C1208', letterSpacing: -0.5 },
  subtitle:       { fontSize: 14, color: '#8C7E6E', marginTop: 4 },
  cards:          { width: '100%', gap: 12, marginBottom: 32 },

  materialCard:   { backgroundColor: '#0B3D2E', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, shadowColor: '#0B3D2E', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 },
  materialIconWrap:{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  materialText:   { flex: 1 },
  materialTitle:  { fontSize: 17, fontWeight: '800', color: '#fff', marginBottom: 3 },
  materialSub:    { fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 17 },

  loginCard:      { backgroundColor: '#fff', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, borderColor: '#E2D9CC', shadowColor: '#1C1208', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  loginIconWrap:  { width: 56, height: 56, borderRadius: 16, backgroundColor: '#F4EFE6', justifyContent: 'center', alignItems: 'center' },
  loginText:      { flex: 1 },
  loginTitle:     { fontSize: 17, fontWeight: '800', color: '#1C1208', marginBottom: 3 },
  loginSub:       { fontSize: 12, color: '#8C7E6E', lineHeight: 17 },

  hint:           { fontSize: 12, color: '#A09080', textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 },
});
