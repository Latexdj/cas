import React, { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { fmtDate, htmlToText } from '@/lib/text';
import { isPickError, pickFile, type PickedFile } from '@/lib/files';
import { Body, Button, Card, Chip, Empty, Field, Loading, Notice, Row, Screen, errText } from '@/components/ui/kit';

interface Query {
  id: string; category: string; category_other?: string; subject: string; body: string; issued_date: string; response_deadline?: string;
  status: string; issued_by_name: string; teacher_response_text?: string; teacher_response_file_url?: string; teacher_response_file_name?: string;
  response_submitted_at?: string; resolution_notes?: string; resolved_by_name?: string; resolved_at?: string; ref_number?: string | null;
  issued_by_signature_url?: string | null; teacher_name?: string; department?: string | null; pdf_url?: string | null;
}
const CATS: Record<string, string> = {
  absenteeism: 'Absenteeism', misconduct: 'Misconduct', insubordination: 'Insubordination',
  negligence: 'Negligence of duty', poor_performance: 'Poor performance', other: 'Other',
};

export default function ConductScreen() {
  const C = useTheme();
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [items, setItems] = useState<Query[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(open ?? null);
  const [responding, setResponding] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get<Query[]>('/api/discipline/queries'); setItems(data ?? []); }
    catch (e) { setItems(prev => prev ?? []); setMsg({ text: errText(e, 'Could not load your queries.'), tone: 'bad' }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const patch = (id: string, p: Partial<Query>) => setItems(prev => prev?.map(x => (x.id === id ? { ...x, ...p } : x)) ?? prev);

  function badge(q: Query): { label: string; tone: 'ok' | 'warn' | 'bad' | 'brand' | 'neutral' } {
    const overdue = q.response_deadline && new Date(q.response_deadline) < new Date() && !['responded', 'resolved', 'escalated'].includes(q.status);
    if (overdue) return { label: 'Overdue', tone: 'bad' };
    return ({ issued: { label: 'Issued', tone: 'warn' }, acknowledged: { label: 'Acknowledged', tone: 'brand' }, responded: { label: 'Responded', tone: 'brand' },
      resolved: { label: 'Resolved', tone: 'ok' }, escalated: { label: 'Escalated', tone: 'bad' } } as const)[q.status as 'issued'] ?? { label: q.status, tone: 'neutral' };
  }

  async function acknowledge(id: string) {
    setBusy(true); setMsg(null);
    try { const { data } = await api.post<Query>(`/api/discipline/queries/${id}/acknowledge`, {}); patch(id, data); setMsg({ text: 'Receipt acknowledged.', tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not acknowledge the query.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  async function attach() {
    const f = await pickFile(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
    if (isPickError(f)) setMsg({ text: f.error, tone: 'bad' }); else if (f) setFile(f);
  }
  async function respond(q: Query) {
    if (!text.trim() && !file) { setMsg({ text: 'Write a response or attach a document.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (text.trim()) body.response_text = text.trim();
      if (file) { body.file_data = file.data; body.file_name = file.name; }
      const { data } = await api.post<Query>(`/api/discipline/queries/${q.id}/respond`, body);
      patch(q.id, data); setResponding(null); setText(''); setFile(null);
      setMsg({ text: 'Your response has been sent.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not send your response.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }

  const list = items ?? [];
  const awaiting = list.filter(q => ['issued', 'acknowledged'].includes(q.status)).length;
  return (
    <Screen onRefresh={load}>
      <Body soft>Queries issued to you by management, and your responses.</Body>
      <Row>
        <Chip label={`${list.length} in total`} />
        <Chip label={`${awaiting} awaiting your response`} tone={awaiting ? 'warn' : 'neutral'} />
        <Chip label={`${list.filter(q => q.status === 'resolved').length} resolved`} tone="ok" />
      </Row>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {items === null ? <Loading /> : list.length === 0 ? (
        <Empty icon="shield-checkmark-outline" title="No queries on record" text="You have no queries from management." />
      ) : list.map(q => {
        const b = badge(q); const isOpen = expanded === q.id; const closed = ['resolved', 'escalated'].includes(q.status);
        return (
          <Card key={q.id} accent={['issued', 'acknowledged'].includes(q.status) ? C.warning : undefined}>
            <Pressable onPress={() => setExpanded(isOpen ? null : q.id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} style={{ gap: 6 }}>
              <Row><Chip label={CATS[q.category] ?? q.category_other ?? q.category} tone="brand" /><Chip label={b.label} tone={b.tone} /></Row>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{q.subject}</Text>
              <Body small soft>From {q.issued_by_name}, {fmtDate(q.issued_date)}{q.response_deadline ? `. Reply by ${fmtDate(q.response_deadline)}` : ''}</Body>
            </Pressable>
            {isOpen && (
              <View style={{ gap: 12 }}>
                <View style={{ backgroundColor: C.surfaceWarm, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16, gap: 10 }}>
                  <Row style={{ justifyContent: 'space-between' }}><Body small soft>Ref: {q.ref_number ?? 'None'}</Body><Body small soft>Date: {fmtDate(q.issued_date)}</Body></Row>
                  <Body>To: <Text style={{ fontWeight: '700' }}>{q.teacher_name ?? ''}</Text>{q.department ? `, ${q.department}` : ''}</Body>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', textDecorationLine: 'underline', textAlign: 'center' }}>{q.subject.toUpperCase()}</Text>
                  <Body>Dear {q.teacher_name ? q.teacher_name.split(' ')[0] : 'Sir/Madam'},</Body>
                  <Body>{htmlToText(q.body)}</Body>
                  <Body>Yours faithfully,</Body>
                  {!!q.issued_by_signature_url && <Image source={{ uri: q.issued_by_signature_url }} style={{ width: 150, height: 50 }} resizeMode="contain" accessibilityLabel="Signature" />}
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{q.issued_by_name}</Text>
                </View>
                {!!q.pdf_url && <Button label="Open the PDF" kind="secondary" icon="document-outline" onPress={() => Linking.openURL(q.pdf_url!)} />}
                {(q.teacher_response_text || q.teacher_response_file_url) && (
                  <View style={{ backgroundColor: C.successLight, borderRadius: 12, padding: 12, gap: 6 }}>
                    <Text style={{ color: C.success, fontSize: 13, fontWeight: '700' }}>Your response</Text>
                    {!!q.teacher_response_text && <Body>{q.teacher_response_text}</Body>}
                    {!!q.teacher_response_file_url && (
                      <Pressable onPress={() => Linking.openURL(q.teacher_response_file_url!)} accessibilityRole="link">
                        <Text style={{ color: C.primaryText, fontWeight: '700' }}>{q.teacher_response_file_name ?? 'Attachment'}</Text>
                      </Pressable>
                    )}
                    {!!q.response_submitted_at && <Body small soft>Sent {fmtDate(q.response_submitted_at)}</Body>}
                  </View>
                )}
                {!!q.resolution_notes && (
                  <View style={{ backgroundColor: q.status === 'escalated' ? C.dangerLight : C.successLight, borderRadius: 12, padding: 12, gap: 4 }}>
                    <Text style={{ color: q.status === 'escalated' ? C.danger : C.success, fontSize: 13, fontWeight: '700' }}>{q.status === 'escalated' ? 'Escalation notes' : 'Resolution notes'}</Text>
                    <Body>{q.resolution_notes}</Body>
                    {!!q.resolved_by_name && <Body small soft>By {q.resolved_by_name}, {fmtDate(q.resolved_at)}</Body>}
                  </View>
                )}
                {!closed && responding !== q.id && (
                  <Row>
                    {q.status === 'issued' && <Button label="Acknowledge receipt" kind="secondary" busy={busy} grow onPress={() => acknowledge(q.id)} />}
                    {['issued', 'acknowledged'].includes(q.status) && !q.teacher_response_text && (
                      <Button label="Write a response" grow onPress={() => { setResponding(q.id); setText(''); setFile(null); setMsg(null); }} />
                    )}
                  </Row>
                )}
                {responding === q.id && !closed && (
                  <View style={{ gap: 10 }}>
                    <Field label="Your response" value={text} onChangeText={setText} multiline placeholder="Write your response here" style={{ minHeight: 140 }} />
                    <Row>
                      <Button label={file ? file.name : 'Attach a document (optional)'} kind="secondary" icon="attach-outline" onPress={attach} grow />
                      {file && <Button label="Remove" kind="quiet" onPress={() => setFile(null)} />}
                    </Row>
                    <Row>
                      <Button label="Send response" busy={busy} grow onPress={() => respond(q)} />
                      <Button label="Cancel" kind="secondary" grow onPress={() => setResponding(null)} />
                    </Row>
                  </View>
                )}
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
