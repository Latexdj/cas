import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppearance, useTheme, type Appearance } from '@/context/ThemeContext';

const OPTIONS: { mode: Appearance; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'system', label: 'Device', icon: 'phone-portrait-outline' },
  { mode: 'light',  label: 'Light',  icon: 'sunny-outline' },
  { mode: 'dark',   label: 'Dark',   icon: 'moon-outline' },
];

/** Appearance setting: follow the phone (default), or always light or dark. */
export function AppearancePicker() {
  const C = useTheme();
  const [mode, setMode] = useAppearance();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: 'row', backgroundColor: C.bg, borderRadius: 10, padding: 3, gap: 3 }}
    >
      {OPTIONS.map(o => {
        const on = mode === o.mode;
        return (
          <TouchableOpacity
            key={o.mode}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${o.label} appearance`}
            onPress={() => setMode(o.mode)}
            style={{
              flex: 1, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: 6,
              backgroundColor: on ? C.surface : 'transparent',
              borderWidth: on ? 1 : 0, borderColor: C.border,
            }}
          >
            <Ionicons name={o.icon} size={16} color={on ? C.primaryText : C.muted} />
            <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? C.text : C.muted }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
