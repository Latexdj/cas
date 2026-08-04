import React, { useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

export interface DropdownOption { label: string; value: string; }

interface Props {
  label?: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  style?: any;
  placeholder?: string;
}

export function Dropdown({ label, options, value, onChange, style, placeholder = 'Select…' }: Props) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <View style={[s.wrapper, style]}>
      {label ? <Text style={[s.label, { color: C.muted }]}>{label}</Text> : null}
      <TouchableOpacity
        style={[s.trigger, { backgroundColor: C.surface, borderColor: open ? C.primary : C.border }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={[s.triggerText, { color: selected ? C.text : C.muted }]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={s.overlay}>
            <TouchableWithoutFeedback>
              <View style={[s.sheet, { backgroundColor: C.surface }]}>
                {label ? <Text style={[s.sheetTitle, { color: C.muted, borderBottomColor: C.border }]}>{label}</Text> : null}
                <FlatList
                  data={options}
                  keyExtractor={o => o.value}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[s.option, item.value === value && { backgroundColor: C.primaryLight }]}
                      onPress={() => { onChange(item.value); setOpen(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.optionText, { color: item.value === value ? C.primary : C.text }]}>
                        {item.label}
                      </Text>
                      {item.value === value && <Ionicons name="checkmark" size={18} color={C.primary} />}
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper:    {},
  label:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  trigger:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  triggerText:{ fontSize: 14, fontWeight: '600', flex: 1 },
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:      { width: '100%', maxWidth: 420, borderRadius: 18, overflow: 'hidden', maxHeight: 380 },
  sheetTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  option:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 15 },
  optionText: { fontSize: 15, fontWeight: '600' },
});
