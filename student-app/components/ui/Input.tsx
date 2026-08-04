import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props extends TextInputProps { label?: string; error?: string; rightElement?: React.ReactNode; }

export function Input({ label, error, style, rightElement, ...rest }: Props) {
  return (
    <View style={s.wrapper}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={[s.inputWrap, error ? s.errBorder : null]}>
        <TextInput
          placeholderTextColor={Colors.placeholder}
          style={[s.input, rightElement ? { paddingRight: 44 } : null, style]}
          {...rest}
        />
        {rightElement ? <View style={s.right}>{rightElement}</View> : null}
      </View>
      {error ? <Text style={s.errText}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper:   { marginBottom: 16 },
  label:     { fontSize: 12, fontWeight: '700', color: Colors.textSoft, marginBottom: 7, letterSpacing: 0.4, textTransform: 'uppercase' },
  inputWrap: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  input:     { flex: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: Colors.text },
  right:     { position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 8 },
  errBorder: { borderColor: Colors.danger },
  errText:   { fontSize: 12, color: Colors.danger, marginTop: 5 },
});
