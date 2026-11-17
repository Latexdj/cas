import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { fmtDate, htmlToText } from '@/lib/text';
import { Body, Button, Card, Empty, KV, Loading, Notice, Screen, errText } from '@/components/ui/kit';

interface Memo {
  id: string; ref_number: string | null; subject: string; audience_label: string; issued_date: string | null;
  issued_by_name: string; issued_by_title: string | null; pdf_url: string | null; created_at: string; read_at: string | null; body?: string;
}


export default function MemosScreen() {
  const C = useTheme();
  const [items, setItems] = useState<Memo[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await api.get<Memo[]>('/api/memos/mine'); setItems(data ?? []); setError(''); }
    catch (e) { setError(errText(e, 'Could not load your memos.')); setItems(items ?? []); }
  }, [items]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function open(m: Memo) {
    if (openId === m.id) { setOpenId(null); return; }
    setOpenId(m.id);
    if (!m.read_at) {
      try {
        const { data } = await api.patch<{ read_at: string }>(`/api/memos/${m.id}/read`, {});
        setItems(prev => prev?.map(x => (x.id === m.id ? { ...x, read_at: data.read_at } : x)) ?? prev);
      } catch { /* reading still works without the receipt */ }
    }
    try {
      const { data } = await api.get<Memo>(`/api/memos/${m.id}`);
      setItems(prev => prev?.map(x => (x.id === m.id ? { ...x, ...data } : x)) ?? prev);
    } catch { /* keep the list view */ }
  }

  const unread = (items ?? []).filter(m => !m.read_at).length;
  return (
    <Screen onRefresh={load}>
      <Body soft>{unread > 0 ? `${unread} unread` : 'All read'}</Body>
      <Notice text={error} tone="bad" />
      {items === null ? <Loading /> : items.length === 0 ? (
        <Empty icon="mail-outline" title="No memos yet" text="Circulars addressed to you appear here." />
      ) : items.map(m => (
        <Card key={m.id} accent={m.read_at ? undefined : C.accent}>
          <Pressable onPress={() => open(m)} accessibilityRole="button" accessibilityState={{ expanded: openId === m.id }}
            accessibilityLabel={`${m.read_at ? '' : 'Unread. '}${m.subject}`} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!m.read_at && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} />}
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', flex: 1 }}>{m.subject}</Text>
            </View>
            <Body small soft>To {m.audience_label}. {m.ref_number ? `${m.ref_number}, ` : ''}{fmtDate(m.issued_date)}, from {m.issued_by_name}{m.issued_by_title ? `, ${m.issued_by_title}` : ''}</Body>
          </Pressable>
          {openId === m.id && (
            <View style={{ gap: 10, marginTop: 4 }}>
              <KV k="Reference" v={m.ref_number ?? 'None'} />
              <KV k="To" v={m.audience_label} />
              <KV k="From" v={`${m.issued_by_name}${m.issued_by_title ? `, ${m.issued_by_title}` : ''}`} />
              <KV k="Date" v={fmtDate(m.issued_date)} />
              {!!m.body && <View style={{ backgroundColor: C.bg, borderRadius: 10, padding: 12 }}><Body>{htmlToText(m.body)}</Body></View>}
              {!!m.pdf_url && <Button label="Open the PDF" kind="secondary" icon="document-outline" onPress={() => Linking.openURL(m.pdf_url!)} />}
            </View>
          )}
        </Card>
      ))}
    </Screen>
  );
}
