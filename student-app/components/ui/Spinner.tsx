import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export function Spinner({ message }: { message?: string }) {
  const C = useTheme();
  return (
    <View style={s.container}>
      <ActivityIndicator size="large" color={C.accent} />
      {message ? <Text style={s.msg}>{message}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4EFE6' },
  msg:       { marginTop: 14, color: '#8C7E6E', fontSize: 14, fontWeight: '500' },
});
