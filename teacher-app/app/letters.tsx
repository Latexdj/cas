import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { fmtDate, htmlToText } from '@/lib/text';
import { Body, Button, Card, Chip, Empty, Field, KV, Loading, Notice, Row, Screen, errText } from '@/components/ui/kit';

interface Letter {
  id: string; ref_number: string | null; subject: string; issued_date: string | null; issued_by_name: string; issued_by_title: string | null;
  classification: string; requires_acceptance: boolean; accepted_at: string | null; declined_at: string | null; decline_reason: string | null;
  pdf_url: string | null; created_at: string; body?: string;
}

export default function LettersScreen() {
  const C = useTheme();
  const [items, setItems] = useState<Letter[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await api.get<Letter[]>('/api/general-letters/mine'); setItems(data ?? []); setError(''); }
    catch (e) { setError(errText(e, 'Could not load your letters.')); setItems(prev => prev ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = (id: string, p: Partial<Letter>) => setItems(prev => prev?.map(x => (x.id === id ? { ...x, ...p } : x)) ?? prev);

  async function open(l: Letter) {
    setMsg(null); setDeclining(false); setReason('');
    if (openId === l.id) { setOpenId(null); return; }
    setOpenId(l.id);
    try { const { data } = await api.get<Letter>(`/api/general-letters/${l.id}`); patch(l.id, data); } catch { /* keep list view */ }
  }
  async function accept(l: Letter) {
    setActing(true); setMsg(null);
    try {
      const { data } = await api.post<{ accepted_at: string }>(`/api/general-letters/${l.id}/accept`, {});
      patch(l.id, { accepted_at: data.accepted_at }); setMsg({ text: 'You accepted this letter.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not accept this letter.'), tone: 'bad' }); }
    finally { setActing(false); }
  }
  async function decline(l: Letter) {
    if (!reason.trim()) { setMsg({ text: 'Give a reason for declining.', tone: 'bad' }); return; }
    setActing(true); setMsg(null);
    try {
      const { data } = await api.post<{ declined_at: string; decline_reason: string }>(`/api/general-letters/${l.id}/decline`, { reason: reason.trim() });
      patch(l.id, { declined_at: data.declined_at, decline_reason: data.decline_reason }); setDeclining(false);
      setMsg({ text: 'You declined this letter.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not decline this letter.'), tone: 'bad' }); }
    finally { setActing(false); }
  }

  const awaiting = (items ?? []).filter(l => l.requires_acceptance && !l.accepted_at && !l.declined_at).length;
  return (
    <Screen onRefresh={load}>
      <Body soft>{awaiting > 0 ? `${awaiting} waiting for your response` : 'All answered'}</Body>
      <Notice text={error} tone="bad" />
      {items === null ? <Loading /> : items.length === 0 ? (
        <Empty icon="document-text-outline" title="No letters yet" text="Letters addressed to you appear here." />
      ) : items.map(l => {
        const pending = l.requires_acceptance && !l.accepted_at && !l.declined_at;
        return (
          <Card key={l.id} accent={pending ? C.warning : undefined}>
            <Pressable onPress={() => open(l)} accessibilityRole="button" accessibilityState={{ expanded: openId === l.id }} style={{ gap: 6 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{l.subject}</Text>
              <Body small soft>{l.ref_number ? `${l.ref_number}, ` : ''}{fmtDate(l.issued_date)}, from {l.issued_by_name}{l.issued_by_title ? `, ${l.issued_by_title}` : ''}</Body>
              {l.requires_acceptance && (
                <Chip label={l.accepted_at ? 'Accepted' : l.declined_at ? 'Declined' : 'Waiting for your response'} tone={l.accepted_at ? 'ok' : l.declined_at ? 'bad' : 'warn'} />
              )}
            </Pressable>
            {openId === l.id && (
              <View style={{ gap: 10 }}>
                <KV k="Reference" v={l.ref_number ?? 'None'} />
                <KV k="From" v={`${l.issued_by_name}${l.issued_by_title ? `, ${l.issued_by_title}` : ''}`} />
                <KV k="Date" v={fmtDate(l.issued_date)} />
                {!!l.body && <View style={{ backgroundColor: C.bg, borderRadius: 10, padding: 12 }}><Body>{htmlToText(l.body)}</Body></View>}
                <Notice text={msg?.text} tone={msg?.tone} />
                {l.requires_acceptance && (
                  l.accepted_at ? <Body style={{ color: C.success, fontWeight: '700' }}>You accepted this letter on {fmtDate(l.accepted_at)}.</Body>
                  : l.declined_at ? (
                    <View style={{ gap: 4 }}>
                      <Body style={{ color: C.danger, fontWeight: '700' }}>You declined this letter on {fmtDate(l.declined_at)}.</Body>
                      {!!l.decline_reason && <Body soft small>Your reason: {l.decline_reason}</Body>}
                    </View>
                  ) : declining ? (
                    <View style={{ gap: 8 }}>
                      <Field label="Reason for declining" value={reason} onChangeText={setReason} multiline />
                      <Row>
                        <Button label="Decline the letter" kind="danger" grow busy={acting} disabled={!reason.trim()} onPress={() => decline(l)} />
                        <Button label="Cancel" kind="secondary" grow onPress={() => { setDeclining(false); setReason(''); }} />
                      </Row>
                    </View>
                  ) : (
                    <Row>
                      <Button label="Accept" grow busy={acting} onPress={() => accept(l)} />
                      <Button label="Decline" kind="danger" grow disabled={acting} onPress={() => setDeclining(true)} />
                    </Row>
                  )
                )}
                {!!l.pdf_url && <Button label="Open the PDF" kind="secondary" icon="document-outline" onPress={() => Linking.openURL(l.pdf_url!)} />}
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
