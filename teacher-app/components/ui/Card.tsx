import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props extends ViewProps {
  warm?: boolean;
}

export function Card({ children, style, warm, ...rest }: Props) {
  return (
    <View style={[styles.card, warm && styles.warm, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#1C1208',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  warm: {
    backgroundColor: Colors.surfaceWarm,
  },
});
