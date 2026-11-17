// Shared building blocks for teacher-app screens. Every colour comes from
// the theme, every touch target is at least 44pt, and messages show inline
// (no pop-up alerts).
import React, { useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

type IconName = keyof typeof Ionicons.glyphMap;

/** Scrolling page with pull-to-refresh and the standard side padding. */
export function Screen({ children, onRefresh, refreshing = false, padded = true, style }: {
  children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const C = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[{ gap: 14, paddingBottom: 48 }, padded && { paddingHorizontal: 16, paddingTop: 16 }, style]}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryText} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, accent }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; accent?: string }) {
  const C = useTheme();
  return (
    <View style={[{ backgroundColor: C.surface, borderColor: accent ?? C.border, borderWidth: accent ? 1.5 : 1, borderRadius: 14, padding: 16, gap: 10 }, style]}>
      {children}
    </View>
  );
}

export function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  const C = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }} accessibilityRole="header">{children}</Text>
      {sub ? <Text style={{ color: C.textSoft, fontSize: 14, lineHeight: 20 }}>{sub}</Text> : null}
    </View>
  );
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const C = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }} accessibilityRole="header">{children}</Text>
      {right}
    </View>
  );
}

export function Body({ children, soft, small, style }: { children: React.ReactNode; soft?: boolean; small?: boolean; style?: object }) {
  const C = useTheme();
  return <Text style={[{ color: soft ? C.textSoft : C.text, fontSize: small ? 13 : 15, lineHeight: small ? 18 : 21 }, style]}>{children}</Text>;
}

/** Tappable row: icon, title, subtitle, chevron (or a trailing element). */
export function ListRow({ icon, title, sub, onPress, trailing, danger, label }: {
  icon?: IconName; title: string; sub?: string; onPress?: () => void; trailing?: React.ReactNode; danger?: boolean; label?: string;
}) {
  const C = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label ?? (sub ? `${title}. ${sub}` : title)}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, opacity: pressed ? 0.7 : 1 }]}>
      {icon && (
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: danger ? C.dangerLight : C.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={20} color={danger ? C.danger : C.primaryText} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? C.danger : C.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        {!!sub && <Text style={{ color: C.textSoft, fontSize: 13, lineHeight: 18, marginTop: 1 }}>{sub}</Text>}
      </View>
      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={C.muted} /> : null)}
    </Pressable>
  );
}

export function Divider() {
  const C = useTheme();
  return <View style={{ height: 1, backgroundColor: C.border }} />;
}

export function Button({ label, onPress, kind = 'primary', busy, disabled, icon, style, grow }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'quiet'; busy?: boolean; disabled?: boolean;
  icon?: IconName; style?: StyleProp<ViewStyle>; grow?: boolean;
}) {
  const C = useTheme();
  const off = disabled || busy;
  const bg = kind === 'primary' ? C.primary : 'transparent';
  const fg = kind === 'primary' ? '#FFFFFF' : kind === 'danger' ? C.danger : kind === 'quiet' ? C.primaryText : C.text;
  const border = kind === 'secondary' ? C.border : kind === 'danger' ? C.danger : 'transparent';
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [{
        minHeight: 48, paddingHorizontal: 16, borderRadius: 10, backgroundColor: bg, borderWidth: kind === 'quiet' ? 0 : 1, borderColor: border,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: off ? 0.5 : pressed ? 0.85 : 1,
      }, grow && { flexGrow: 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={{ color: fg, fontSize: 15, fontWeight: '700' }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Row({ children, gap = 8, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap }, style]}>{children}</View>;
}

/** Inline message: replaces Alert.alert for results and errors. */
export function Notice({ text, tone = 'info', onClose }: { text?: string | null; tone?: 'ok' | 'info' | 'bad'; onClose?: () => void }) {
  const C = useTheme();
  if (!text) return null;
  const map = { ok: [C.successLight, C.success], info: [C.warningLight, C.text], bad: [C.dangerLight, C.danger] } as const;
  const [bg, fg] = map[tone];
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 14, lineHeight: 20, flex: 1 }}>{text}</Text>
      {onClose && (
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss message" hitSlop={12}>
          <Ionicons name="close" size={18} color={fg} />
        </Pressable>
      )}
    </View>
  );
}

/** "Are you sure?" shown in place, instead of a pop-up. */
export function InlineConfirm({ question, confirmLabel, onConfirm, onCancel, danger = true, busy }: {
  question: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean; busy?: boolean;
}) {
  const C = useTheme();
  return (
    <View style={{ gap: 8, backgroundColor: C.bg, borderRadius: 10, padding: 12 }}>
      <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{question}</Text>
      <Row>
        <Button label={confirmLabel} kind={danger ? 'danger' : 'primary'} onPress={onConfirm} busy={busy} grow />
        <Button label="Cancel" kind="secondary" onPress={onCancel} grow />
      </Row>
    </View>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'brand' }) {
  const C = useTheme();
  const map = {
    neutral: [C.bg, C.textSoft], ok: [C.successLight, C.success], warn: [C.warningLight, C.warning],
    bad: [C.dangerLight, C.danger], brand: [C.primaryLight, C.primaryText],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Scrolling row of tabs. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string; badge?: number }[]; onChange: (v: T) => void }) {
  const C = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist">
      {options.map(o => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: on ? C.primaryText : C.border,
              backgroundColor: on ? C.primaryLight : C.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: on ? C.primaryText : C.textSoft, fontSize: 14, fontWeight: '600' }}>{o.label}</Text>
            {!!o.badge && (
              <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>{o.badge}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const C = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput placeholderTextColor={C.placeholder} accessibilityLabel={label} {...input}
        style={[{ minHeight: input.multiline ? 96 : 48, borderWidth: 1, borderColor: error ? C.danger : C.borderStrong, borderRadius: 10,
          paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.text, backgroundColor: C.surface,
          textAlignVertical: input.multiline ? 'top' : 'center' }, input.style]} />
      {!!error && <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>}
      {!!hint && !error && <Text style={{ color: C.muted, fontSize: 13 }}>{hint}</Text>}
    </View>
  );
}

/** Choose one of a few options shown as chips. */
export function ChoiceChips<T extends string | number>({ label, value, options, onChange }: {
  label?: string; value: T | null; options: { key: T; label: string }[]; onChange: (v: T) => void;
}) {
  const C = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '600' }}>{label}</Text>}
      <Row>
        {options.map(o => {
          const on = o.key === value;
          return (
            <Pressable key={String(o.key)} onPress={() => onChange(o.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: on ? C.primaryText : C.border,
                backgroundColor: on ? C.primaryLight : C.surface, justifyContent: 'center' }}>
              <Text style={{ color: on ? C.primaryText : C.textSoft, fontSize: 14, fontWeight: '600' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </Row>
    </View>
  );
}

/** A list to pick from, opened in place (for long lists such as classes or students). */
export function Picker<T extends string>({ label, value, options, onChange, placeholder = 'Choose…', searchable }: {
  label: string; value: T | null; options: { key: T; label: string; sub?: string }[]; onChange: (v: T) => void; placeholder?: string; searchable?: boolean;
}) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find(o => o.key === value);
  const shown = q.trim() ? options.filter(o => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) : options;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? 'not chosen'}`}
        style={{ minHeight: 48, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface }}>
        <Text style={{ flex: 1, color: current ? C.text : C.placeholder, fontSize: 16 }}>{current?.label ?? placeholder}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </Pressable>
      {open && (
        <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.surface, maxHeight: 320 }}>
          {(searchable || options.length > 12) && (
            <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={C.placeholder} accessibilityLabel={`Search ${label}`}
              style={{ minHeight: 44, borderBottomWidth: 1, borderColor: C.border, paddingHorizontal: 12, color: C.text, fontSize: 15 }} />
          )}
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {shown.length === 0 && <Text style={{ padding: 12, color: C.muted }}>Nothing matches.</Text>}
            {shown.map(o => (
              <Pressable key={o.key} onPress={() => { onChange(o.key); setOpen(false); setQ(''); }} accessibilityRole="button"
                style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center', backgroundColor: o.key === value ? C.primaryLight : pressed ? C.bg : 'transparent' })}>
                <Text style={{ color: C.text, fontSize: 15 }}>{o.label}</Text>
                {!!o.sub && <Text style={{ color: C.textSoft, fontSize: 13 }}>{o.sub}</Text>}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export function Empty({ title, text, icon = 'file-tray-outline', action }: { title: string; text?: string; icon?: IconName; action?: React.ReactNode }) {
  const C = useTheme();
  return (
    <Card style={{ alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={28} color={C.muted} />
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      {!!text && <Text style={{ color: C.textSoft, fontSize: 14, lineHeight: 20 }}>{text}</Text>}
      {action}
    </Card>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const C = useTheme();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={C.primaryText} />
      <Text style={{ color: C.muted, fontSize: 14 }}>{label}</Text>
    </View>
  );
}

export function Progress({ value }: { value: number }) {
  const C = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={{ height: 6, width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: C.primaryText }} />
    </View>
  );
}

/** Small key-value line, e.g. "Class  2 Arts A". */
export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  const C = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 4 }}>
      <Text style={{ color: C.muted, fontSize: 14, width: 120 }}>{k}</Text>
      <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{v}</Text>
    </View>
  );
}

/** Error text from an axios error. */
export function errText(e: unknown, fallback = 'Something went wrong. Check your connection and try again.') {
  const ax = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return ax?.response?.data?.error ?? ax?.response?.data?.message ?? fallback;
}
