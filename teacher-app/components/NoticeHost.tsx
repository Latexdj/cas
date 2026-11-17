import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { dismissNotice, useAppNotice } from '@/lib/notify';

// Shows the latest notify() message as a banner across the top of the app.
export function NoticeHost() {
  const C = useTheme();
  const n = useAppNotice();
  const insets = useSafeAreaInsets();
  if (!n) return null;
  const fg = n.tone === 'ok' ? C.success : n.tone === 'bad' ? C.danger : C.text;
  const bg = n.tone === 'ok' ? C.successLight : n.tone === 'bad' ? C.dangerLight : C.surface;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 1000 }}>
      <View accessibilityLiveRegion="polite" accessibilityRole="alert"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 14, paddingRight: 6, borderRadius: 12,
          backgroundColor: bg, borderWidth: 1, borderColor: n.tone === 'info' ? C.border : fg, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
        <Ionicons name={n.tone === 'ok' ? 'checkmark-circle' : n.tone === 'bad' ? 'alert-circle' : 'information-circle'} size={20} color={fg} />
        <Text style={{ flex: 1, color: n.tone === 'info' ? C.text : fg, fontSize: 15, fontWeight: '600' }}>{n.text}</Text>
        <Pressable onPress={dismissNotice} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss message"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={18} color={C.muted} />
        </Pressable>
      </View>
    </View>
  );
}
