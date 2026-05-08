import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { Colors } from '@/constants/colors';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
type Size    = 'sm' | 'md' | 'lg';

interface Props extends TouchableOpacityProps {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const bg: Record<Variant, string> = {
  primary:   Colors.primaryMid,
  secondary: Colors.surface,
  danger:    Colors.danger,
  ghost:     'transparent',
  accent:    Colors.accent,
};
const textColor: Record<Variant, string> = {
  primary:   '#FFFFFF',
  secondary: Colors.text,
  danger:    '#FFFFFF',
  ghost:     Colors.primary,
  accent:    '#FFFFFF',
};
const border: Record<Variant, string | undefined> = {
  primary:   undefined,
  secondary: Colors.border,
  danger:    undefined,
  ghost:     undefined,
  accent:    undefined,
};
const pad: Record<Size, { py: number; px: number; fontSize: number }> = {
  sm: { py: 9,  px: 16, fontSize: 13 },
  md: { py: 14, px: 22, fontSize: 15 },
  lg: { py: 17, px: 26, fontSize: 16 },
};

export function Button({ label, variant = 'primary', size = 'md', loading, disabled, style, ...rest }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.72}
      disabled={disabled || loading}
      style={[
        styles.base,
        {
          backgroundColor: bg[variant],
          paddingVertical: pad[size].py,
          paddingHorizontal: pad[size].px,
          borderWidth: border[variant] ? 1.5 : 0,
          borderColor: border[variant],
        },
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
  base:     { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  label:    { fontWeight: '700', letterSpacing: 0.2 },
});
