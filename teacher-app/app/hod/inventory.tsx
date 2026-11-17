import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { StudentSearch, type FoundStudent } from '@/components/StudentSearch';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, Loading, Notice, Picker, Row, Screen, Segmented, Title, errText } from '@/components/ui/kit';

interface Item { id: string; asset_tag: string | null; name: string; category_name: string | null; quantity_total: number; quantity_available: number; condition: string; location: string | null; is_returnable: boolean; track_units?: boolean }
interface Loan { id: string; quantity: number; issued_at: string; due_date: string | null; is_overdue: boolean; item_name: string; asset_tag: string | null; tag_number?: string | null; imei?: string | null }
interface Borrower { id: string; name: string; student_code?: string; teacher_code?: string; class_name?: string | null; department?: string | null; loans?: Loan[] }
interface Unit { id: string; tag_number: string; imei: string | null; serial_number: string | null; condition: string; status: 'in_store' | 'issued' | 'lost' | 'written_off'; borrower_name?: string | null; due_date?: string | null; is_overdue?: boolean | null }
type Tab = 'items' | 'issue' | 'return' | 'loans';
type Msg = { text: string; tone: 'ok' | 'bad' } | null;

const LEGACY = '__legacy__';
const UNIT_LABEL: Record<Unit['status'], string> = { in_store: 'In store', issued: 'On loan', lost: 'Lost', written_off: 'Written off' };
const day = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const condTone = (c: string) => (c === 'Good' ? 'ok' : c === 'Damaged' ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad';
const mapTeachers = (raw: { teacher_code: string; name: string; department: string | null }[]): FoundStudent[] =>
  raw.map(t => ({ id: t.teacher_code, name: t.name, student_code: t.teacher_code, class_name: t.department ?? '' }));

// Point the camera at a barcode or QR code on the device; returns the text.
function ScanCode({ onCode, onCancel }: { onCode: (v: string) => void; onCancel: () => void }) {
  const [perm, ask] = useCameraPermissions();
  const done = useRef(false);
  if (Platform.OS === 'web') return <Body soft>Scanning needs the phone app. Type the tag instead.</Body>;
  if (!perm?.granted) return (
    <Row>
      <Button label="Allow camera" grow onPress={ask} />
      <Button label="Cancel" kind="secondary" grow onPress={onCancel} />
    </Row>
  );
  return (
    <View style={{ gap: 8 }}>
      <View style={{ height: 220, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'datamatrix'] }}
          onBarcodeScanned={({ data }) => { if (done.current || !data) return; done.current = true; onCode(data.trim()); }} />
      </View>
      <Button label="Cancel scan" kind="secondary" onPress={onCancel} />
    </View>
  );
}

export default function InventoryScreen() {
  const C = useTheme();
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [dept, setDept] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [tab, setTab] = useState<Tab>('items');
  const [units, setUnits] = useState<Item | null>(null);
  const dq: Record<string, string> = dept && dept !== LEGACY ? { dept_id: dept } : {};

  useEffect(() => {
    api.get<{ depts: { id: string; name: string }[] }>('/api/hod/check').then(r => { const d = r.data.depts ?? []; setDepts(d); setDept(d[0]?.id ?? LEGACY); }).catch(() => setDept(LEGACY));
  }, []);
  const load = useCallback(() => {
    if (!dept) return;
    api.get<Item[]>('/api/inventory/items', { params: dq }).then(r => setItems(r.data ?? [])).catch(() => setItems([]));
  }, [dept]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setItems(null); load(); }, [load]);

  if (units) return <Units item={units} dq={dq} onBack={() => { setUnits(null); load(); }} />;
  return (
    <Screen onRefresh={load}>
      <Body soft>Items in your department's care.</Body>
      {depts.length > 1 && <Picker label="Department" value={dept} options={depts.map(d => ({ key: d.id, label: d.name }))} onChange={setDept} />}
      <Segmented value={tab} onChange={setTab} options={[{ key: 'items', label: 'Items' }, { key: 'issue', label: 'Issue' }, { key: 'return', label: 'Return' }, { key: 'loans', label: 'Loans' }]} />
      {items === null ? <Loading /> : (
        <View key={`${tab}-${dept}`} style={{ gap: 12 }}>
          {tab === 'items' && (items.length === 0 ? <Empty icon="cube-outline" title="No items yet" text="Ask the admin to assign items to your department." /> : items.map(i => (
            <Card key={i.id}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{i.name}</Text>
                  <Body small soft>{[i.asset_tag, i.category_name, i.location].filter(Boolean).join(', ')}</Body>
                </View>
                <Chip label={i.condition} tone={condTone(i.condition)} />
              </View>
              <Row>
                <Chip label={`${i.quantity_available} in store`} tone={i.quantity_available ? 'ok' : 'neutral'} />
                <Chip label={`${i.quantity_total - i.quantity_available} issued`} />
                <Chip label={`${i.quantity_total} in total`} />
                {i.is_returnable && <Chip label="Comes back" tone="brand" />}
              </Row>
              {i.track_units && <Button label="Units" kind="secondary" icon="barcode-outline" onPress={() => setUnits(i)} style={{ alignSelf: 'flex-start' }} />}
            </Card>
          )))}
          {tab === 'issue' && <Issue items={items} dq={dq} onDone={load} />}
          {tab === 'return' && <Return items={items} dq={dq} onDone={load} />}
          {tab === 'loans' && <Loans dq={dq} onDone={load} />}
        </View>
      )}
    </Screen>
  );
}

function Issue({ items, dq, onDone }: { items: Item[]; dq: Record<string, string>; onDone: () => void }) {
  const C = useTheme();
  const [itemId, setItemId] = useState<string | null>(null);
  const [to, setTo] = useState<'student' | 'teacher' | 'staff' | 'department'>('staff');
  const [student, setStudent] = useState<Borrower | null>(null);
  const [teacher, setTeacher] = useState<Borrower | null>(null);
  const [name, setName] = useState(''); const [role, setRole] = useState('');
  const [due, setDue] = useState(''); const [qty, setQty] = useState('1'); const [notes, setNotes] = useState('');
  const [unitQ, setUnitQ] = useState(''); const [unitHits, setUnitHits] = useState<Unit[]>([]); const [unit, setUnit] = useState<Unit | null>(null); const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const item = items.find(i => i.id === itemId);
  const issuable = items.filter(i => i.condition !== 'Written Off' && i.quantity_available > 0);

  useEffect(() => {
    if (!item?.track_units || unit) return;
    const t = setTimeout(() => {
      api.get<Unit[]>(`/api/inventory/items/${item.id}/units`, { params: { ...dq, available: 'true', search: unitQ.trim() || undefined } }).then(r => setUnitHits(r.data ?? [])).catch(() => setUnitHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [item?.id, unitQ, unit]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickPerson(kind: 'students' | 'teachers', code: string) {
    try {
      const { data } = await api.get<Borrower>(`/api/inventory/${kind}/${encodeURIComponent(code.toUpperCase())}`);
      if (kind === 'students') setStudent(data); else setTeacher(data);
    } catch { setMsg({ text: kind === 'students' ? 'Student not found.' : 'Teacher not found.', tone: 'bad' }); }
  }
  async function issue() {
    if (!item) { setMsg({ text: 'Choose the item.', tone: 'bad' }); return; }
    const recipient = to === 'student' ? student?.name : to === 'teacher' ? teacher?.name : name.trim();
    if (!recipient) { setMsg({ text: 'Say who is receiving it.', tone: 'bad' }); return; }
    if (item.track_units && !unit) { setMsg({ text: 'Choose the tag number of the unit you are handing over.', tone: 'bad' }); return; }
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) { setMsg({ text: 'Write the due date like 2026-12-15.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post(`/api/inventory/items/${item.id}/issue`, {
        issued_to_name: recipient, issued_to_type: to,
        issued_to_role: to === 'teacher' ? (teacher?.department || undefined) : (role.trim() || undefined),
        student_id: to === 'student' ? student?.id : undefined, teacher_id: to === 'teacher' ? teacher?.id : undefined,
        due_date: item.is_returnable ? (due || undefined) : undefined, quantity: parseInt(qty, 10) || 1,
        unit_id: item.track_units ? unit?.id : undefined, notes: notes.trim() || undefined, ...dq,
      });
      setMsg({ text: `${item.name} issued to ${recipient}.`, tone: 'ok' });
      setItemId(null); setStudent(null); setTeacher(null); setName(''); setRole(''); setDue(''); setQty('1'); setNotes(''); setUnit(null); setUnitQ('');
      onDone();
    } catch (e) { setMsg({ text: errText(e, 'Could not issue the item.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      <Card>
        {issuable.length === 0 ? <Body soft>Nothing is in store to issue.</Body> : (
          <Picker label="Item" value={itemId} onChange={v => { setItemId(v); setUnit(null); setUnitQ(''); }} searchable={issuable.length > 8}
            options={issuable.map(i => ({ key: i.id, label: i.name, sub: `${i.quantity_available} in store${i.asset_tag ? `, ${i.asset_tag}` : ''}` }))} />
        )}
        <ChoiceChips label="Issue to" value={to} onChange={setTo} options={[{ key: 'staff', label: 'Staff' }, { key: 'student', label: 'Student' }, { key: 'teacher', label: 'Teacher' }, { key: 'department', label: 'Department' }]} />
        {to === 'student' && (student
          ? <Row style={{ alignItems: 'center' }}><Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{student.name}, {student.class_name}</Text><Button label="Change" kind="quiet" onPress={() => setStudent(null)} /></Row>
          : <StudentSearch endpoint="/api/inventory/students/search" label="Student name or ID" selected={null} onSelect={s => s && pickPerson('students', s.student_code)} />)}
        {to === 'teacher' && (teacher
          ? <Row style={{ alignItems: 'center' }}><Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{teacher.name}{teacher.department ? `, ${teacher.department}` : ''}</Text><Button label="Change" kind="quiet" onPress={() => setTeacher(null)} /></Row>
          : <StudentSearch endpoint="/api/inventory/teachers/search" label="Teacher name or ID" selected={null} map={mapTeachers} onSelect={s => s && pickPerson('teachers', s.student_code)} />)}
        {to === 'department' && <Field label="Department or section" value={name} onChangeText={setName} placeholder="For example, the science lab" />}
        {to === 'staff' && <>
          <Field label="Staff name" value={name} onChangeText={setName} />
          <Field label="Role (optional)" value={role} onChangeText={setRole} placeholder="For example, lab technician" />
        </>}
        {item?.track_units && (
          <View style={{ gap: 6 }}>
            <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '600' }}>Unit being handed over</Text>
            {unit ? (
              <Row style={{ alignItems: 'center' }}>
                <View style={{ flex: 1 }}><Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Tag {unit.tag_number}</Text>{!!unit.imei && <Body small soft>IMEI {unit.imei}</Body>}</View>
                <Button label="Change" kind="quiet" onPress={() => setUnit(null)} />
              </Row>
            ) : scan ? <ScanCode onCode={v => { setUnitQ(v); setScan(false); }} onCancel={() => setScan(false)} /> : (
              <>
                <Row>
                  <TextInput value={unitQ} onChangeText={setUnitQ} placeholder="Tag number or IMEI" placeholderTextColor={C.placeholder} accessibilityLabel="Tag number or IMEI"
                    style={{ flex: 1, minHeight: 48, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: C.text, backgroundColor: C.surface }} />
                  {Platform.OS !== 'web' && <Button label="Scan" kind="secondary" icon="barcode-outline" onPress={() => setScan(true)} />}
                </Row>
                {unitHits.slice(0, 8).map(u => (
                  <Pressable key={u.id} onPress={() => setUnit(u)} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, padding: 10, borderRadius: 10, backgroundColor: pressed ? C.bg : 'transparent', borderTopWidth: 1, borderColor: C.border })}>
                    <Text style={{ color: C.text, fontSize: 15 }}>Tag {u.tag_number}</Text>
                    {!!(u.imei || u.serial_number) && <Body small soft>{[u.imei && `IMEI ${u.imei}`, u.serial_number && `Serial ${u.serial_number}`].filter(Boolean).join(', ')}</Body>}
                  </Pressable>
                ))}
                {unitHits.length === 0 && <Body small soft>No unit in store matches.</Body>}
              </>
            )}
          </View>
        )}
        {item?.is_returnable && <Field label="Due back (optional)" value={due} onChangeText={setDue} placeholder="2026-12-15" />}
        {!item?.track_units && <Field label="Quantity" value={qty} onChangeText={setQty} keyboardType="number-pad" />}
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="What it is for" />
        <Button label="Issue item" busy={busy} disabled={!item} onPress={issue} />
      </Card>
    </>
  );
}

function Return({ items, dq, onDone }: { items: Item[]; dq: Record<string, string>; onDone: () => void }) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState('1'); const [cond, setCond] = useState('Good'); const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const list = items.filter(i => !i.is_returnable && i.quantity_available < i.quantity_total);
  async function submit() {
    if (!itemId) { setMsg({ text: 'Choose the item.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post(`/api/inventory/items/${itemId}/return`, { quantity: parseInt(qty, 10) || 1, condition: cond, notes: notes.trim() || undefined, ...dq });
      setMsg({ text: 'Return recorded.', tone: 'ok' }); setItemId(null); setQty('1'); setCond('Good'); setNotes(''); onDone();
    } catch (e) { setMsg({ text: errText(e, 'Could not record the return.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Body small soft>For items given out by quantity. Items that are lent to a person are returned from Loans.</Body>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      <Card>
        {list.length === 0 ? <Body soft>Nothing is out at the moment.</Body> : (
          <Picker label="Item coming back" value={itemId} onChange={setItemId}
            options={list.map(i => ({ key: i.id, label: i.name, sub: `${i.quantity_total - i.quantity_available} out` }))} />
        )}
        <Field label="How many" value={qty} onChangeText={setQty} keyboardType="number-pad" />
        <ChoiceChips label="Condition" value={cond} onChange={setCond} options={['Good', 'Damaged', 'Lost'].map(x => ({ key: x, label: x }))} />
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
        <Button label="Record return" busy={busy} disabled={!itemId} onPress={submit} />
      </Card>
    </>
  );
}

function Loans({ dq, onDone }: { dq: Record<string, string>; onDone: () => void }) {
  const C = useTheme();
  const [kind, setKind] = useState<'students' | 'teachers'>('students');
  const [who, setWho] = useState<Borrower | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [cond, setCond] = useState(''); const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function pick(code: string) {
    setMsg(null);
    try { const { data } = await api.get<Borrower>(`/api/inventory/${kind}/${encodeURIComponent(code.toUpperCase())}`); setWho(data); }
    catch { setMsg({ text: kind === 'students' ? 'Student not found.' : 'Teacher not found.', tone: 'bad' }); }
  }
  async function close(id: string) {
    if (cond === 'Lost' && !notes.trim()) { setMsg({ text: 'Say how it was lost and any charge agreed.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post(`/api/inventory/loans/${id}/return`, { condition_on_return: cond || undefined, notes: notes.trim() || undefined, ...dq });
      setWho(p => p ? { ...p, loans: (p.loans ?? []).filter(l => l.id !== id) } : p); setClosing(null); setMsg({ text: 'Return recorded.', tone: 'ok' }); onDone();
    } catch (e) { setMsg({ text: errText(e, 'Could not record the return.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Card>
        <ChoiceChips label="Borrower" value={kind} onChange={k => { setKind(k); setWho(null); }} options={[{ key: 'students', label: 'Student' }, { key: 'teachers', label: 'Teacher' }]} />
        {who ? (
          <Row style={{ alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{who.name}</Text>
              <Body small soft>{who.student_code ?? who.teacher_code}{who.class_name ? `, ${who.class_name}` : who.department ? `, ${who.department}` : ''}</Body>
            </View>
            <Button label="Change" kind="quiet" onPress={() => setWho(null)} />
          </Row>
        ) : (
          <StudentSearch key={kind} endpoint={`/api/inventory/${kind}/search`} label={kind === 'students' ? 'Student name or ID' : 'Teacher name or ID'} selected={null}
            map={kind === 'teachers' ? mapTeachers : undefined} onSelect={s => s && pick(s.student_code)} />
        )}
      </Card>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {who && ((who.loans ?? []).length === 0 ? <Empty icon="checkmark-circle-outline" title="Nothing on loan" text="This person has none of your department's items." /> : (who.loans ?? []).map(l => (
        <Card key={l.id} accent={l.is_overdue ? C.danger : undefined}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{l.item_name}{l.quantity > 1 ? `, ${l.quantity} of them` : ''}</Text>
          <Body small soft>{[l.tag_number ? `Tag ${l.tag_number}` : l.asset_tag, l.imei ? `IMEI ${l.imei}` : null].filter(Boolean).join(', ')}</Body>
          <Body small style={{ color: l.is_overdue ? C.danger : C.textSoft }}>Since {day(l.issued_at)}{l.due_date ? `. Due ${day(l.due_date)}` : ''}{l.is_overdue ? '. Overdue' : ''}</Body>
          {closing === l.id ? (
            <View style={{ gap: 8 }}>
              <ChoiceChips label="Condition" value={cond} onChange={setCond} options={[{ key: 'Good', label: 'Good' }, { key: 'Damaged', label: 'Damaged' }, { key: 'Lost', label: 'Lost' }]} />
              <Field label={cond === 'Lost' ? 'How it was lost, any charge agreed' : 'Notes (optional)'} value={notes} onChangeText={setNotes} />
              <Row><Button label="Record return" grow busy={busy} onPress={() => close(l.id)} /><Button label="Cancel" kind="secondary" grow onPress={() => setClosing(null)} /></Row>
            </View>
          ) : <Button label="Returned" kind="secondary" onPress={() => { setClosing(l.id); setCond('Good'); setNotes(''); }} style={{ alignSelf: 'flex-start' }} />}
        </Card>
      )))}
    </>
  );
}

function Units({ item, dq, onBack }: { item: Item; dq: Record<string, string>; onBack: () => void }) {
  const C = useTheme();
  const [list, setList] = useState<Unit[] | null>(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ tag: '', imei: '', serial: '' });
  const [scan, setScan] = useState<null | 'tag' | 'imei'>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => {
    api.get<Unit[]>(`/api/inventory/items/${item.id}/units`, { params: { ...dq, search: q.trim() || undefined } }).then(r => setList(r.data ?? [])).catch(() => setList([]));
  }, [item.id, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  async function add() {
    if (!form.tag.trim()) { setMsg({ text: 'Enter the tag number.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post<{ ok: boolean; errors?: { error: string }[] }>(`/api/inventory/items/${item.id}/units`,
        { units: [{ tag_number: form.tag.trim(), imei: form.imei.trim(), serial_number: form.serial.trim() }], dry_run: false }, { params: dq });
      if (data.ok) { setMsg({ text: `Unit ${form.tag.trim()} added.`, tone: 'ok' }); setForm({ tag: '', imei: '', serial: '' }); load(); }
      else setMsg({ text: data.errors?.[0]?.error ?? 'Could not add the unit.', tone: 'bad' });
    } catch (e) {
      const err = e as { response?: { data?: { errors?: { error: string }[] } } };
      setMsg({ text: err.response?.data?.errors?.[0]?.error ?? errText(e, 'Could not add the unit.'), tone: 'bad' });
    } finally { setBusy(false); }
  }
  return (
    <Screen>
      <Button label="Back to items" kind="quiet" icon="chevron-back" onPress={onBack} style={{ alignSelf: 'flex-start' }} />
      <Title sub="Each unit has its own tag number, IMEI and serial.">{item.name}</Title>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      <Card>
        <Title>Add a unit</Title>
        {scan ? <ScanCode onCode={v => { setForm(p => ({ ...p, [scan]: v })); setScan(null); }} onCancel={() => setScan(null)} /> : (
          <>
            <Row style={{ alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}><Field label="Tag number" value={form.tag} onChangeText={v => setForm(p => ({ ...p, tag: v }))} /></View>
              {Platform.OS !== 'web' && <Button label="Scan" kind="secondary" icon="barcode-outline" onPress={() => setScan('tag')} />}
            </Row>
            <Row style={{ alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}><Field label="IMEI (optional)" value={form.imei} keyboardType="number-pad" onChangeText={v => setForm(p => ({ ...p, imei: v }))} /></View>
              {Platform.OS !== 'web' && <Button label="Scan" kind="secondary" icon="barcode-outline" onPress={() => setScan('imei')} />}
            </Row>
            <Field label="Serial (optional)" value={form.serial} onChangeText={v => setForm(p => ({ ...p, serial: v }))} />
            <Button label="Add unit" busy={busy} onPress={add} />
            <Body small soft>To add many at once, use the spreadsheet upload on the web.</Body>
          </>
        )}
      </Card>
      <TextInput value={q} onChangeText={setQ} placeholder="Find a tag, IMEI or serial" placeholderTextColor={C.placeholder} accessibilityLabel="Find a unit"
        style={{ minHeight: 48, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: C.text, backgroundColor: C.surface }} />
      {list === null ? <Loading /> : list.length === 0 ? <Empty icon="barcode-outline" title="No units" /> : (
        <Card>
          {list.map((u, i) => (
            <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: C.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Tag {u.tag_number}</Text>
                <Body small soft>{[u.imei && `IMEI ${u.imei}`, u.serial_number && `Serial ${u.serial_number}`, u.borrower_name && `With ${u.borrower_name}`].filter(Boolean).join(', ') || u.condition}</Body>
              </View>
              <Chip label={UNIT_LABEL[u.status]} tone={u.status === 'in_store' ? 'ok' : u.status === 'issued' ? (u.is_overdue ? 'bad' : 'warn') : 'neutral'} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
