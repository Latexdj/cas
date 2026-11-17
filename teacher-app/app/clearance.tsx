import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, Loading, Notice, Picker, Row, Screen, Segmented, errText } from '@/components/ui/kit';

interface Office { id: string; name: string }
interface Pending { student_id: string; name: string; student_code: string; class_name: string; picture_url: string | null; item_id: string; office_id: string; office_name: string; status: string }
interface Item { item_id: string; office_name: string; status: string; notes: string | null; actioned_at: string | null }
interface Outstanding { loan_id: string; source: 'inventory' | 'library'; item_name: string; quantity: number; issued_at: string; due_date: string | null; tag_number: string | null; imei: string | null; is_overdue: boolean }
interface Lookup { student: { id: string; name: string; student_code: string; class_name: string; picture_url: string | null }; items: Item[]; outstanding_items?: Outstanding[] }
interface History { name: string; student_code: string; class_name: string; office_name: string; status: string; notes: string | null; actioned_at: string | null }

const LABEL: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' }> = {
  cleared: { label: 'Cleared', tone: 'ok' }, not_cleared: { label: 'Not cleared', tone: 'bad' }, pending: { label: 'Pending', tone: 'warn' },
};
const st = (s: string) => LABEL[s] ?? LABEL.pending;
const day = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function Person({ name, sub, url }: { name: string; sub: string; url: string | null }) {
  const C = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
      {url ? <Image source={{ uri: url }} style={{ width: 40, height: 40, borderRadius: 20 }} accessibilityLabel={`Photo of ${name}`} />
        : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.textSoft, fontWeight: '700' }}>{name[0]}</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{name}</Text>
        <Body small soft>{sub}</Body>
      </View>
    </View>
  );
}

// The decision form shown under a pending item.
function Decide({ itemId, office, onDone, onCancel }: { itemId: string; office: string; onDone: (status: 'cleared' | 'not_cleared', notes: string | null) => void; onCancel: () => void }) {
  const C = useTheme();
  const [status, setStatus] = useState<'cleared' | 'not_cleared'>('cleared');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    if (status === 'not_cleared' && !notes.trim()) { setErr('Give the reason the student is not cleared.'); return; }
    setBusy(true); setErr('');
    try { await api.post('/api/clearance/action', { item_id: itemId, status, notes: notes.trim() || null }); onDone(status, notes.trim() || null); }
    catch (e) { setErr(errText(e, 'Could not save your decision.')); }
    finally { setBusy(false); }
  }
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.bg }}>
      <Body small soft>For {office}</Body>
      <ChoiceChips value={status} onChange={setStatus} options={[{ key: 'cleared', label: 'Cleared' }, { key: 'not_cleared', label: 'Not cleared' }]} />
      <Field label={status === 'not_cleared' ? 'Reason' : 'Notes (optional)'} value={notes} onChangeText={t => { setNotes(t); setErr(''); }} multiline
        placeholder={status === 'not_cleared' ? 'What the student still has to do' : ''} />
      <Notice tone="bad" text={err || null} />
      <Row>
        <Button label={status === 'cleared' ? 'Mark cleared' : 'Mark not cleared'} kind={status === 'cleared' ? 'primary' : 'danger'} grow busy={busy} onPress={save} />
        <Button label="Cancel" kind="secondary" grow onPress={onCancel} />
      </Row>
    </View>
  );
}

export default function ClearanceScreen() {
  const C = useTheme();
  const [offices, setOffices] = useState<Office[] | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [tab, setTab] = useState<'pending' | 'lookup' | 'history'>('pending');
  const [office, setOffice] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookErr, setLookErr] = useState('');
  const [looking, setLooking] = useState(false);

  async function refresh() {
    const [p, h] = await Promise.all([api.get<Pending[]>('/api/clearance/pending'), api.get<History[]>('/api/clearance/history')]);
    setPending(p.data ?? []); setHistory(h.data ?? []);
  }
  useEffect(() => {
    Promise.all([api.get<Office[]>('/api/clearance/my-offices'), refresh()])
      .then(([o]) => setOffices(o.data ?? [])).catch(e => { setOffices([]); setMsg({ text: errText(e, 'Could not load clearance.'), tone: 'bad' }); });
  }, []);

  async function find() {
    if (!code.trim()) return;
    setLooking(true); setLookErr(''); setLookup(null); setActing(null);
    try { const { data } = await api.get<Lookup>(`/api/clearance/student/${encodeURIComponent(code.trim().toUpperCase())}`); setLookup(data); }
    catch { setLookErr('No student with that ID. Check it and try again.'); }
    finally { setLooking(false); }
  }
  function done(itemId: string, name: string, status: 'cleared' | 'not_cleared', notes: string | null) {
    setActing(null);
    setMsg({ text: `${name} marked ${status === 'cleared' ? 'cleared' : 'not cleared'}.`, tone: 'ok' });
    setLookup(p => p ? { ...p, items: p.items.map(i => (i.item_id === itemId ? { ...i, status, notes, actioned_at: new Date().toISOString() } : i)) } : p);
    refresh().catch(() => {});
  }

  if (offices === null) return <Screen><Loading /></Screen>;
  if (offices.length === 0) return <Screen><Empty icon="checkmark-done-outline" title="You are not on a clearance office" text="Ask your administrator to add you to a clearance office." /></Screen>;

  const shown = office ? pending.filter(p => p.office_id === office) : pending;
  return (
    <Screen onRefresh={() => refresh().catch(() => {})}>
      <Row>{offices.map(o => <Chip key={o.id} label={o.name} tone="brand" />)}</Row>
      <Segmented value={tab} onChange={t => { setTab(t); setActing(null); }} options={[
        { key: 'pending', label: 'Waiting', badge: pending.length || undefined }, { key: 'lookup', label: 'Find a student' }, { key: 'history', label: 'History' },
      ]} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />

      {tab === 'pending' && (
        <>
          {offices.length > 1 && <Picker label="Office" value={office} options={[{ key: '', label: 'All my offices' }, ...offices.map(o => ({ key: o.id, label: o.name }))]} onChange={setOffice} />}
          {shown.length === 0 ? <Empty icon="happy-outline" title="No one is waiting" text="Students waiting for your office appear here." /> : shown.map(s => (
            <Card key={s.item_id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Person name={s.name} sub={`${s.student_code}, ${s.class_name}${offices.length > 1 ? `. ${s.office_name}` : ''}`} url={s.picture_url} />
                <Chip label={st(s.status).label} tone={st(s.status).tone} />
              </View>
              {acting === s.item_id
                ? <Decide itemId={s.item_id} office={s.office_name} onDone={(x, n) => done(s.item_id, s.name, x, n)} onCancel={() => setActing(null)} />
                : <Button label="Decide" kind="secondary" onPress={() => { setActing(s.item_id); setMsg(null); }} />}
            </Card>
          ))}
        </>
      )}

      {tab === 'lookup' && (
        <>
          <Card>
            <Field label="Student ID" value={code} onChangeText={t => { setCode(t.toUpperCase()); setLookErr(''); }} autoCapitalize="characters" maxLength={20}
              placeholder="For example AHS26042" onSubmitEditing={find} returnKeyType="search" />
            <Button label="Find student" icon="search" busy={looking} disabled={!code.trim()} onPress={find} />
          </Card>
          <Notice tone="bad" text={lookErr || null} />
          {lookup && (
            <>
              <Card><Person name={lookup.student.name} sub={`${lookup.student.student_code}, ${lookup.student.class_name}`} url={lookup.student.picture_url} /></Card>
              {!!lookup.outstanding_items?.length && (
                <Card accent={C.danger}>
                  <Text style={{ color: C.danger, fontSize: 15, fontWeight: '800' }}>{lookup.outstanding_items.length} {lookup.outstanding_items.length === 1 ? 'item' : 'items'} not returned</Text>
                  <Body small soft>This student cannot be cleared until these are returned, or recorded as lost by the store or library.</Body>
                  {lookup.outstanding_items.map(i => (
                    <View key={`${i.source}-${i.loan_id}`} style={{ paddingVertical: 6, borderTopWidth: 1, borderColor: C.border }}>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>
                        {i.item_name}{i.tag_number ? (i.source === 'library' ? `, copy ${i.tag_number}` : `, tag ${i.tag_number}`) : ''}{i.quantity > 1 ? `, ${i.quantity} of them` : ''}
                      </Text>
                      <Body small soft>
                        {i.source === 'library' ? 'Library book' : 'From stores'}, since {day(i.issued_at)}{i.imei ? `, IMEI ${i.imei}` : ''}{i.due_date ? `, due ${day(i.due_date)}` : ''}
                        {i.is_overdue ? '. Overdue' : ''}
                      </Body>
                    </View>
                  ))}
                </Card>
              )}
              {lookup.items.length === 0 ? <Empty icon="document-outline" title="Nothing for your office" text="Clearance has not started for this student, or your office has no item for them." /> : lookup.items.map(i => (
                <Card key={i.item_id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{i.office_name}</Text>
                    <Chip label={st(i.status).label} tone={st(i.status).tone} />
                  </View>
                  {!!i.notes && <Body small>{i.notes}</Body>}
                  {!!i.actioned_at && <Body small soft>{new Date(i.actioned_at).toLocaleString()}</Body>}
                  {acting === i.item_id
                    ? <Decide itemId={i.item_id} office={i.office_name} onDone={(x, n) => done(i.item_id, lookup.student.name, x, n)} onCancel={() => setActing(null)} />
                    : <Button label={i.status === 'pending' ? 'Decide' : 'Change decision'} kind="secondary" onPress={() => { setActing(i.item_id); setMsg(null); }} />}
                </Card>
              ))}
            </>
          )}
        </>
      )}

      {tab === 'history' && (history.length === 0 ? <Empty icon="time-outline" title="No decisions yet" /> : (
        <Card>
          {history.map((h, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: C.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{h.name}</Text>
                <Body small soft>{h.student_code}, {h.class_name}{h.actioned_at ? `. ${day(h.actioned_at)}` : ''}</Body>
                {!!h.notes && <Body small>{h.notes}</Body>}
              </View>
              <Chip label={st(h.status).label} tone={st(h.status).tone} />
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
