import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface Props extends ViewProps { padded?: boolean; }

export function Card({ children, padded = true, style, ...rest }: Props) {
  const C = useTheme();
  return (
    <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }, padded && s.padded, style]} {...rest}>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card:   { borderRadius: 16, borderWidth: 1, shadowColor: '#1C1208', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  padded: { padding: 16 },
});
