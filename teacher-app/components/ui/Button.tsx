import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { Colors } from '@/constants/colors';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size    = 'sm' | 'md' | 'lg';

interface Props extends TouchableOpacityProps {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ label, variant = 'primary', size = 'md', loading, disabled, style, ...rest }: Props) {
  const bg: Record<Variant, string> = {
    primary:   Colors.primary,
    secondary: Colors.border,
    danger:    Colors.danger,
    ghost:     'transparent',
  };
  const textColor: Record<Variant, string> = {
    primary:   '#fff',
    secondary: Colors.text,
    danger:    '#fff',
    ghost:     Colors.primary,
  };
  const pad: Record<Size, { py: number; px: number; fontSize: number }> = {
    sm: { py: 8,  px: 14, fontSize: 13 },
    md: { py: 13, px: 20, fontSize: 15 },
    lg: { py: 16, px: 24, fontSize: 17 },
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: bg[variant], paddingVertical: pad[size].py, paddingHorizontal: pad[size].px },
        (disabled || loading) && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading
        ? <ActivityIndicator color={textColor[variant]} size="small" />
        : <Text style={[styles.label, { color: textColor[variant], fontSize: pad[size].fontSize }]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base:     { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  label:    { fontWeight: '600' },
});
