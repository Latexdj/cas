import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
type Size    = 'sm' | 'md' | 'lg';

interface Props extends TouchableOpacityProps {
  label:     string;
  variant?:  Variant;
  size?:     Size;
  loading?:  boolean;
}

const pad: Record<Size, { py: number; px: number; fontSize: number }> = {
  sm: { py: 9,  px: 16, fontSize: 13 },
  md: { py: 14, px: 22, fontSize: 15 },
  lg: { py: 17, px: 26, fontSize: 16 },
};

export function Button({ label, variant = 'primary', size = 'md', loading, disabled, style, ...rest }: Props) {
  const C = useTheme();
  const bg:   Record<Variant, string> = { primary: C.primaryMid, secondary: C.surface, danger: C.danger, ghost: 'transparent', accent: C.accent };
  const text: Record<Variant, string> = { primary: '#FFF', secondary: C.text, danger: '#FFF', ghost: C.primary, accent: '#FFF' };
  const bdr:  Record<Variant, string | undefined> = { primary: undefined, secondary: C.border, danger: undefined, ghost: undefined, accent: undefined };

  return (
    <TouchableOpacity
      activeOpacity={0.72}
      disabled={disabled || loading}
      style={[
        s.base,
        { backgroundColor: bg[variant], paddingVertical: pad[size].py, paddingHorizontal: pad[size].px, borderWidth: bdr[variant] ? 1.5 : 0, borderColor: bdr[variant] },
        (disabled || loading) && s.disabled,
        style,
      ]}
      {...rest}
    >
      {loading
        ? <ActivityIndicator color={text[variant]} size="small" />
        : <Text style={[s.label, { color: text[variant], fontSize: pad[size].fontSize }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  base:    { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  disabled:{ opacity: 0.45 },
  label:   { fontWeight: '700', letterSpacing: 0.2 },
});
