import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export function Spinner({ message }: { message?: string }) {
  const Colors = useTheme();
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.accent} />
      {message ? <Text style={styles.msg}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4EFE6' },
  msg:       { marginTop: 14, color: '#8C7E6E', fontSize: 14, fontWeight: '500' },
});
