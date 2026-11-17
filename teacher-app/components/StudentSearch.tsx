// Type a name or student code, pick from the matches. Used by Clinic,
// Conduct, Library and other screens; each passes its own search endpoint.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

export interface FoundStudent { id: string; name: string; student_code: string; class_name: string; [k: string]: unknown }

export function StudentSearch({ endpoint, label = 'Find the student', selected, onSelect, params, map }: {
  endpoint: string; label?: string; selected: FoundStudent | null; onSelect: (s: FoundStudent | null) => void;
  params?: Record<string, string>; map?: (raw: any) => FoundStudent[];
}) {
  const C = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<FoundStudent[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selected || q.trim().length < 2) { setResults([]); return; }
    setBusy(true);
    const t = setTimeout(() => {
      api.get(endpoint, { params: { q: q.trim(), search: q.trim(), ...(params || {}) } })
        .then(r => setResults(map ? map(r.data) : Array.isArray(r.data) ? r.data : r.data?.students ?? []))
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, selected, endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, padding: 12, backgroundColor: C.surface }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{selected.name}</Text>
            <Text style={{ color: C.textSoft, fontSize: 13 }}>{selected.student_code}, {selected.class_name}</Text>
          </View>
          <Pressable onPress={() => { onSelect(null); setQ(''); }} accessibilityRole="button" accessibilityLabel="Choose a different student" hitSlop={10}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text style={{ color: C.primaryText, fontSize: 14, fontWeight: '700' }}>Change</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <View>
        <TextInput value={q} onChangeText={setQ} placeholder="Name or student code" placeholderTextColor={C.placeholder} accessibilityLabel={label}
          autoCorrect={false} style={{ minHeight: 48, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: C.text, backgroundColor: C.surface }} />
        {busy && <ActivityIndicator style={{ position: 'absolute', right: 12, top: 14 }} color={C.primaryText} />}
      </View>
      {results.length > 0 && (
        <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.surface, overflow: 'hidden' }}>
          {results.slice(0, 12).map((s, i) => (
            <Pressable key={s.id} onPress={() => { onSelect(s); setResults([]); }} accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: 52, padding: 10, borderTopWidth: i ? 1 : 0, borderColor: C.border, backgroundColor: pressed ? C.bg : 'transparent' })}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{s.name}</Text>
              <Text style={{ color: C.textSoft, fontSize: 13 }}>{s.student_code}, {s.class_name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {!busy && q.trim().length >= 2 && results.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>No student matches.</Text>}
    </View>
  );
}
