import React, { useEffect, useState } from 'react';
import {
  Dimensions, Image, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

// Lazy-require native modules — graceful fallback if not linked
let Pdf: any   = null;
let Video: any = null;
let ResizeMode: any = null;

try { Pdf = require('react-native-pdf').default; } catch { /* not installed */ }
try {
  const av = require('expo-av');
  Video      = av.Video;
  ResizeMode = av.ResizeMode;
} catch { /* not installed */ }

const { width: SW, height: SH } = Dimensions.get('window');

export default function ViewerScreen() {
  const C   = useTheme();
  const nav = useNavigation();
  const { path, type, name } = useLocalSearchParams<{ path: string; type: string; name: string }>();

  const [pdfPages, setPdfPages] = useState(0);
  const [pdfPage,  setPdfPage]  = useState(1);

  useEffect(() => {
    if (name) nav.setOptions({ title: name });
  }, [name, nav]);

  // expo-router already URL-decodes search params — use path directly
  const filePath = path ?? '';
  const fileUri  = filePath ? `file://${filePath}` : '';
  const fileType = type as 'pdf' | 'video' | 'image' | 'audio' | 'unknown';

  // ── PDF ──────────────────────────────────────────────────────────────────────
  if (fileType === 'pdf') {
    if (!Pdf) return <UnsupportedMsg text="PDF viewer not available. Please reinstall the app." C={C} />;
    return (
      <View style={[s.flex, { backgroundColor: '#1a1a1a' }]}>
        <Pdf
          source={{ uri: fileUri, cache: true }}
          style={s.pdf}
          onLoadComplete={(count: number) => setPdfPages(count)}
          onPageChanged={(page: number) => setPdfPage(page)}
          onError={(err: any) => console.log('PDF error:', err)}
          enablePaging
          trustAllCerts={false}
        />
        {pdfPages > 0 && (
          <View style={s.pdfPageBadge}>
            <Text style={s.pdfPageText}>{pdfPage} / {pdfPages}</Text>
          </View>
        )}
      </View>
    );
  }

  // ── Video ─────────────────────────────────────────────────────────────────────
  if (fileType === 'video') {
    if (!Video) return <UnsupportedMsg text="Video player not available. Please reinstall the app." C={C} />;
    return (
      <View style={[s.flex, { backgroundColor: '#000' }]}>
        <Video
          source={{ uri: fileUri }}
          useNativeControls
          resizeMode={ResizeMode?.CONTAIN ?? 'contain'}
          shouldPlay={false}
          style={s.video}
          onError={(e: any) => console.log('Video error:', e)}
        />
      </View>
    );
  }

  // ── Image ─────────────────────────────────────────────────────────────────────
  if (fileType === 'image') {
    return (
      <View style={[s.flex, { backgroundColor: '#000' }]}>
        <ScrollView
          maximumZoomScale={4}
          minimumZoomScale={1}
          contentContainerStyle={s.imageContainer}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Image source={{ uri: fileUri }} style={s.image} resizeMode="contain" />
        </ScrollView>
      </View>
    );
  }

  // ── Audio ─────────────────────────────────────────────────────────────────────
  if (fileType === 'audio') {
    if (!Video) return <UnsupportedMsg text="Audio player not available. Please reinstall the app." C={C} />;
    return (
      <View style={[s.flex, { backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Text style={{ fontSize: 64, marginBottom: 20 }}>🎵</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 28 }}>
          {name}
        </Text>
        <Video
          source={{ uri: fileUri }}
          useNativeControls
          style={{ width: SW - 64, height: 60 }}
          onError={(e: any) => console.log('Audio error:', e)}
        />
      </View>
    );
  }

  return <UnsupportedMsg text="This file type cannot be opened in the app." C={C} />;
}

function UnsupportedMsg({ text, C }: { text: string; C: any }) {
  return (
    <View style={[s.flex, s.center, { backgroundColor: C.bg }]}>
      <Text style={{ fontSize: 48, marginBottom: 16 }}>📄</Text>
      <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 }}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex:          { flex: 1 },
  center:        { justifyContent: 'center', alignItems: 'center' },
  pdf:           { flex: 1, width: SW },
  pdfPageBadge:  { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  pdfPageText:   { color: '#fff', fontSize: 13, fontWeight: '700' },
  video:         { width: SW, flex: 1 },
  imageContainer:{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  image:         { width: SW, height: SH },
});
