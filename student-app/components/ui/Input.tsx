import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props extends TextInputProps { label?: string; error?: string; }

export function Input({ label, error, style, ...rest }: Props) {
  return (
    <View style={s.wrapper}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={Colors.placeholder} style={[s.input, error ? s.err : null, style]} {...rest} />
      {error ? <Text style={s.errText}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label:   { fontSize: 12, fontWeight: '700', color: Colors.textSoft, marginBottom: 7, letterSpacing: 0.4, textTransform: 'uppercase' },
  input:   { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: Colors.text },
  err:     { borderColor: Colors.danger },
  errText: { fontSize: 12, color: Colors.danger, marginTop: 5 },
});
