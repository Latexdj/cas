import React, { useState } from 'react';
import {
  Modal, StyleSheet, Text, TouchableOpacity,
  TouchableWithoutFeedback, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface DropdownOption { label: string; value: string }

interface Colors {
  bg: string; border: string; text: string; muted: string; primary: string; surface: string;
}

interface Props {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  colors: Colors;
  style?: object;
}

export function DropdownSelect({ value, options, onChange, placeholder, colors, style }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setOpen(true)}
        style={[styles.trigger, { backgroundColor: colors.bg, borderColor: colors.border }, style]}
      >
        <Text style={[styles.triggerText, { color: selected ? colors.text : colors.muted }]} numberOfLines={1}>
          {selected?.label ?? placeholder ?? 'Select…'}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.muted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
                {options.map((opt, i) => {
                  const active = opt.value === value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.option,
                        i < options.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                        active && { backgroundColor: `${colors.primary}15` },
                      ]}
                      onPress={() => { onChange(opt.value); setOpen(false); }}
                    >
                      <Text style={[styles.optionText, { color: active ? colors.primary : colors.text }]}>
                        {opt.label}
                      </Text>
                      {active && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  triggerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet:       { borderRadius: 16, overflow: 'hidden', width: '100%', maxWidth: 320 },
  option:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  optionText:  { flex: 1, fontSize: 14, fontWeight: '600' },
});
