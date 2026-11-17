import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, InlineConfirm, Loading, Notice, Picker, Progress, Row, Screen, Segmented, Title, errText } from '@/components/ui/kit';

interface Room { id: string; room_name: string; capacity: number | null; notes: string | null; student_count: number }
interface HouseStats {
  house_name: string; total: number; male: number; female: number; boarding: number; day: number;
  by_class: { class_name: string; count: number }[]; room_stats: { total_rooms: number; total_capacity: number; assigned_students: number };
}
interface Student { id: string; student_code: string; name: string; class_name: string; gender: string; residential_status: string; house?: string; room_name?: string }
interface HouseStudent { id: string; student_code: string; name: string; class_name: string; house: string; guardian_mobile: string | null }
interface Exeat {
  id: string; exeat_type: 'internal' | 'external'; status: string; destination: string | null; reason: string | null; parent_contact: string | null;
  departure_date: string; departure_time: string; expected_return_date: string; expected_return_time: string;
  actual_return_date: string | null; actual_return_time: string | null; student_name: string; student_code: string; class_name: string; house: string; granted_by_name: string | null;
}
type Role = 'loading' | 'none' | 'housemaster' | 'senior_housemaster';
type Tab = 'overview' | 'rooms' | 'students' | 'exeats';
type Msg = { text: string; tone: 'ok' | 'bad' } | null;

const STATUS: Record<string, { label: string; tone: 'warn' | 'neutral' | 'bad' | 'ok' }> = {
  pending: { label: 'Waiting', tone: 'warn' }, active: { label: 'Out', tone: 'neutral' }, overdue: { label: 'Overdue', tone: 'bad' },
  returned: { label: 'Returned', tone: 'ok' }, rejected: { label: 'Refused', tone: 'neutral' },
};
const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (t?: string | null) => t?.slice(0, 5) ?? '';
const day = (d?: string | null) => { if (!d) return ''; const x = new Date(`${d.slice(0, 10)}T12:00:00`); return isNaN(x.getTime()) ? d : x.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const C = useTheme();
  return <TextInput value={value} onChangeText={onChange} placeholder={label} placeholderTextColor={C.placeholder} accessibilityLabel={label}
    style={{ minHeight: 48, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: C.text, backgroundColor: C.surface }} />;
}

export default function HouseScreen() {
  const C = useTheme();
  const [role, setRole] = useState<Role>('loading');
  const [mine, setMine] = useState<HouseStats | null>(null);
  const [all, setAll] = useState<HouseStats[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [house, setHouse] = useState('');

  const load = useCallback(() => {
    api.get<HouseStats>('/api/houses/my-dashboard').then(r => { setMine(r.data); setRole('housemaster'); }).catch(e => {
      if (e?.response?.status === 404) {
        api.get<HouseStats[]>('/api/houses/all-dashboard').then(r => { setAll(r.data); setRole('senior_housemaster'); setHouse(h => h || r.data[0]?.house_name || ''); }).catch(() => setRole('none'));
      } else setRole('none');
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (role === 'loading') return <Screen><Loading /></Screen>;
  if (role === 'none') return <Screen><Empty icon="home-outline" title="You do not look after a house" text="Ask your administrator to make you a housemaster." /></Screen>;
  const senior = role === 'senior_housemaster';
  const houses = all.map(h => h.house_name);
  const houseName = senior ? house : mine?.house_name ?? '';

  return (
    <Screen onRefresh={load}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>{senior ? 'All houses' : mine?.house_name}</Text>
        <Body small soft>{senior ? 'Senior housemaster' : 'Housemaster'}</Body>
      </View>
      <Segmented value={tab} onChange={setTab} options={[{ key: 'overview', label: 'Overview' }, { key: 'rooms', label: 'Rooms' }, { key: 'students', label: 'Students' }, { key: 'exeats', label: 'Exeats' }]} />
      {senior && tab === 'rooms' && <Picker label="House" value={house} options={houses.map(h => ({ key: h, label: h }))} onChange={setHouse} />}
      <View key={`${tab}-${houseName}`} style={{ gap: 12 }}>
        {tab === 'overview' && (senior ? all.map(h => <HouseCard key={h.house_name} h={h} />) : mine && <HouseCard h={mine} />)}
        {tab === 'rooms' && !!houseName && <Rooms houseName={houseName} senior={senior} onChanged={load} />}
        {tab === 'students' && <Students senior={senior} houses={houses} stats={senior ? all : mine ? [mine] : []} />}
        {tab === 'exeats' && <Exeats role={role} />}
      </View>
    </Screen>
  );
}

function HouseCard({ h }: { h: HouseStats }) {
  const C = useTheme();
  const rs = h.room_stats;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ flex: 1, color: C.text, fontSize: 17, fontWeight: '800' }}>{h.house_name}</Text>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>{h.total}</Text>
        <Body small soft>students</Body>
      </View>
      <Row>
        <Chip label={`${h.male} male`} /><Chip label={`${h.female} female`} />
        <Chip label={`${h.boarding} boarding`} tone="brand" /><Chip label={`${h.day} day`} />
      </Row>
      {rs.total_rooms > 0 && (
        <View style={{ gap: 4 }}>
          <Body small soft>{rs.total_rooms} rooms. {rs.assigned_students} of {rs.total_capacity || rs.assigned_students} beds used.</Body>
          {rs.total_capacity > 0 && <Progress value={rs.assigned_students / rs.total_capacity} />}
        </View>
      )}
      {h.by_class.length > 0 && <Body small soft>{h.by_class.map(c => `${c.class_name} ${c.count}`).join(', ')}</Body>}
    </Card>
  );
}

// ── Rooms ──
function Rooms({ houseName, senior, onChanged }: { houseName: string; senior: boolean; onChanged: () => void }) {
  const C = useTheme();
  const hp = senior ? { house: houseName } : {};
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [form, setForm] = useState<{ id?: string; name: string; cap: string; notes: string } | null>(null);
  const [open, setOpen] = useState<Room | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => {
    api.get<{ rooms: Room[] }>('/api/houses/my-rooms', { params: hp }).then(r => setRooms(r.data.rooms ?? [])).catch(() => setRooms([]));
  }, [houseName]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form) return;
    if (!form.name.trim()) { setMsg({ text: 'Give the room a name.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    const body = { room_name: form.name.trim(), capacity: form.cap ? parseInt(form.cap, 10) : null, notes: form.notes.trim() || null, house_name: senior ? houseName : undefined };
    try {
      if (form.id) await api.put(`/api/houses/my-rooms/${form.id}`, body); else await api.post('/api/houses/my-rooms', body);
      setForm(null); load(); onChanged(); setMsg({ text: 'Room saved.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not save the room.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  async function remove(r: Room) {
    try { await api.delete(`/api/houses/my-rooms/${r.id}`, { params: hp }); setRooms(p => p?.filter(x => x.id !== r.id) ?? p); onChanged(); setMsg({ text: `${r.room_name} deleted.`, tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not delete the room.'), tone: 'bad' }); }
    setConfirm(null);
  }

  if (open) return <RoomDetail room={open} houseName={houseName} senior={senior} onBack={() => { setOpen(null); load(); }} />;
  if (form) return (
    <Card>
      <Title>{form.id ? 'Edit room' : 'New room'}</Title>
      <Field label="Room name" value={form.name} onChangeText={v => setForm(p => p && { ...p, name: v })} placeholder="For example, Dorm A" />
      <Field label="Beds (optional)" value={form.cap} keyboardType="number-pad" onChangeText={v => setForm(p => p && { ...p, cap: v })} />
      <Field label="Notes (optional)" value={form.notes} onChangeText={v => setForm(p => p && { ...p, notes: v })} />
      <Notice text={msg?.tone === 'bad' ? msg.text : null} tone="bad" />
      <Row>
        <Button label="Save room" grow busy={busy} onPress={save} />
        <Button label="Cancel" kind="secondary" grow onPress={() => setForm(null)} />
      </Row>
    </Card>
  );
  return (
    <>
      <Button label="Add a room" icon="add" onPress={() => { setForm({ name: '', cap: '', notes: '' }); setMsg(null); }} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {rooms === null ? <Loading /> : rooms.length === 0 ? <Empty icon="bed-outline" title="No rooms yet" text="Add the dormitories in this house, then put students in them." /> : rooms.map(r => {
        const full = r.capacity != null && r.student_count >= r.capacity;
        return (
          <Card key={r.id}>
            <Pressable onPress={() => setOpen(r)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{r.room_name}</Text>
                <Body small soft>{r.student_count}{r.capacity ? ` of ${r.capacity}` : ''} students{r.notes ? `. ${r.notes}` : ''}</Body>
              </View>
              {full && <Chip label="Full" tone="warn" />}
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
            {r.capacity ? <Progress value={r.student_count / r.capacity} /> : null}
            {confirm === r.id
              ? <InlineConfirm question={`Delete ${r.room_name}? Its students lose their room.`} confirmLabel="Delete" onConfirm={() => remove(r)} onCancel={() => setConfirm(null)} />
              : <Row><Button label="Edit" kind="quiet" onPress={() => setForm({ id: r.id, name: r.room_name, cap: r.capacity ? String(r.capacity) : '', notes: r.notes ?? '' })} /><Button label="Delete" kind="quiet" onPress={() => setConfirm(r.id)} /></Row>}
          </Card>
        );
      })}
    </>
  );
}

function RoomDetail({ room, houseName, senior, onBack }: { room: Room; houseName: string; senior: boolean; onBack: () => void }) {
  const C = useTheme();
  const hp = senior ? { house: houseName } : {};
  const [students, setStudents] = useState<Student[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [pool, setPool] = useState<Student[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => {
    api.get<Student[]>(`/api/houses/my-rooms/${room.id}/students`, { params: hp }).then(r => setStudents(r.data ?? [])).catch(() => setStudents([]));
  }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  function startAdd() {
    setAdding(true); setSel(new Set()); setQ(''); setPool(null);
    api.get<Student[]>(`/api/houses/my-rooms/${room.id}/unassigned`, { params: hp }).then(r => setPool(r.data ?? [])).catch(() => setPool([]));
  }
  async function assign() {
    setBusy(true); setMsg(null);
    try {
      await api.post(`/api/houses/my-rooms/${room.id}/assign`, { student_ids: [...sel], house_name: senior ? houseName : undefined });
      setMsg({ text: `Added ${sel.size} to ${room.room_name}.`, tone: 'ok' }); setAdding(false); load();
    } catch (e) { setMsg({ text: errText(e, 'Could not add the students.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  async function removeOne(s: Student) {
    try { await api.delete(`/api/houses/my-rooms/${room.id}/students/${s.id}`, { params: hp }); setStudents(p => p?.filter(x => x.id !== s.id) ?? p); }
    catch (e) { setMsg({ text: errText(e, 'Could not remove the student.'), tone: 'bad' }); }
  }
  const shown = (pool ?? []).filter(s => !q.trim() || `${s.name} ${s.student_code}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <Button label="Back to rooms" kind="quiet" icon="chevron-back" onPress={adding ? () => setAdding(false) : onBack} style={{ alignSelf: 'flex-start' }} />
      <Title sub={`${students?.length ?? room.student_count}${room.capacity ? ` of ${room.capacity}` : ''} students`}>{room.room_name}</Title>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {adding ? (
        <>
          <SearchBox value={q} onChange={setQ} label="Find a student" />
          {pool === null ? <Loading /> : shown.length === 0 ? <Body soft>Every student in this house has a room.</Body> : shown.map(s => {
            const on = sel.has(s.id);
            return (
              <Pressable key={s.id} onPress={() => setSel(p => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: on ? C.success : C.border, backgroundColor: on ? C.successLight : C.surface }}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? C.success : C.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{s.name}</Text>
                  <Body small soft>{s.student_code}, {s.class_name}</Body>
                </View>
              </Pressable>
            );
          })}
          <Button label={sel.size ? `Add ${sel.size} to ${room.room_name}` : 'Choose students'} busy={busy} disabled={!sel.size} onPress={assign} />
        </>
      ) : (
        <>
          <Button label="Add students" icon="person-add-outline" onPress={startAdd} />
          {students === null ? <Loading /> : students.length === 0 ? <Empty icon="bed-outline" title="No one in this room yet" /> : (
            <Card>
              {students.map((s, i) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderColor: C.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 15 }}>{s.name}</Text>
                    <Body small soft>{s.student_code}, {s.class_name}</Body>
                  </View>
                  <Button label="Remove" kind="quiet" onPress={() => removeOne(s)} />
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  );
}

// ── Students ──
function Students({ senior, houses, stats }: { senior: boolean; houses: string[]; stats: HouseStats[] }) {
  const C = useTheme();
  const [house, setHouse] = useState('');
  const [cls, setCls] = useState('');
  const [res, setRes] = useState('');
  const [gender, setGender] = useState('');
  const [rows, setRows] = useState<Student[] | null>(null);
  const [q, setQ] = useState('');
  const classes = useMemo(() => {
    const src = house ? stats.find(h => h.house_name === house)?.by_class ?? [] : stats.flatMap(h => h.by_class);
    return [...new Set(src.map(c => c.class_name))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [stats, house]);
  useEffect(() => {
    setRows(null);
    const params = { ...(senior && house ? { house } : {}), ...(cls ? { class_name: cls } : {}), ...(res ? { residential_status: res } : {}), ...(gender ? { gender } : {}) };
    api.get<Student[]>(senior ? '/api/houses/all-students' : '/api/houses/my-students', { params }).then(r => setRows(r.data ?? [])).catch(() => setRows([]));
  }, [senior, house, cls, res, gender]);
  const shown = (rows ?? []).filter(s => !q.trim() || `${s.name} ${s.student_code}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <Card>
        {senior && <Picker label="House" value={house} options={[{ key: '', label: 'All houses' }, ...houses.map(h => ({ key: h, label: h }))]} onChange={v => { setHouse(v); setCls(''); }} />}
        <Picker label="Class" value={cls} options={[{ key: '', label: 'All classes' }, ...classes.map(c => ({ key: c, label: c }))]} onChange={setCls} searchable={classes.length > 8} />
        <ChoiceChips label="Residence" value={res} onChange={setRes} options={[{ key: '', label: 'All' }, { key: 'Boarding', label: 'Boarding' }, { key: 'Day', label: 'Day' }]} />
        <ChoiceChips label="Gender" value={gender} onChange={setGender} options={[{ key: '', label: 'All' }, { key: 'Male', label: 'Male' }, { key: 'Female', label: 'Female' }]} />
      </Card>
      <SearchBox value={q} onChange={setQ} label="Find a student" />
      {rows === null ? <Loading /> : shown.length === 0 ? <Empty icon="people-outline" title="No students match" /> : (
        <Card>
          <Body small soft>{shown.length} students</Body>
          {shown.map(s => (
            <View key={s.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: C.border }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{s.name}</Text>
              <Body small soft>{[s.student_code, s.class_name, s.gender, s.residential_status, senior ? s.house : null, s.room_name ? `Room ${s.room_name}` : null].filter(Boolean).join(', ')}</Body>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

// ── Exeats ──
function Exeats({ role }: { role: 'housemaster' | 'senior_housemaster' }) {
  const C = useTheme();
  const [sub, setSub] = useState<'pending' | 'out' | 'history'>('out');
  const [list, setList] = useState<Exeat[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<{ id: string; kind: 'reject' | 'return' } | null>(null);
  const [note, setNote] = useState('');
  const [retDate, setRetDate] = useState(ymd());
  const [retTime, setRetTime] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [q, setQ] = useState('');
  const load = useCallback(() => { api.get<{ exeats: Exeat[] }>('/api/exeat/my-house').then(r => setList(r.data.exeats ?? [])).catch(() => setList([])); }, []);
  useEffect(() => { load(); }, [load]);
  const swap = (e: Exeat) => setList(p => p?.map(x => (x.id === e.id ? e : x)) ?? p);

  async function approve(id: string) {
    setBusy(id); setMsg(null);
    try { const r = await api.post<Exeat>(`/api/exeat/${id}/approve`, {}); swap(r.data); setMsg({ text: `Exeat approved for ${r.data.student_name}.`, tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not approve the exeat.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function reject(id: string) {
    setBusy(id); setMsg(null);
    try { const r = await api.post<Exeat>(`/api/exeat/${id}/reject`, { notes: note }); swap(r.data); setActing(null); setNote(''); setMsg({ text: 'Exeat refused.', tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not refuse the exeat.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function returned(id: string) {
    if (!DATE.test(retDate) || !TIME.test(retTime)) { setMsg({ text: 'Write the date like 2026-11-17 and the time like 18:30.', tone: 'bad' }); return; }
    setBusy(id); setMsg(null);
    try { const r = await api.post<Exeat>(`/api/exeat/${id}/return`, { actual_return_date: retDate, actual_return_time: `${retTime}:00` }); swap(r.data); setActing(null); setMsg({ text: `${r.data.student_name} is back.`, tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not mark the return.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }

  if (creating) return <NewExeat role={role} onCancel={() => setCreating(false)} onCreated={e => { setList(p => [e, ...(p ?? [])]); setCreating(false); setSub(e.status === 'active' ? 'out' : 'pending'); setMsg({ text: `Exeat created for ${e.student_name}.`, tone: 'ok' }); }} />;
  const all = list ?? [];
  const pending = all.filter(e => e.status === 'pending');
  const out = all.filter(e => e.status === 'active' || e.status === 'overdue');
  const history = all.filter(e => e.status === 'returned' || e.status === 'rejected').filter(e => !q.trim() || `${e.student_name} ${e.student_code} ${e.destination ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const shown = sub === 'pending' ? pending : sub === 'out' ? out : history;

  return (
    <>
      <Button label={role === 'senior_housemaster' ? 'New exeat (off campus)' : 'New exeat (within town)'} icon="add" onPress={() => { setCreating(true); setMsg(null); }} />
      <ChoiceChips value={sub} onChange={setSub} options={[
        { key: 'pending', label: `Waiting ${pending.length}` }, { key: 'out', label: `Out now ${out.length}` }, { key: 'history', label: 'History' },
      ]} />
      {sub === 'out' && out.some(e => e.status === 'overdue') && <Notice tone="bad" text={`${out.filter(e => e.status === 'overdue').length} students are late back.`} />}
      {sub === 'history' && <SearchBox value={q} onChange={setQ} label="Search history" />}
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {list === null ? <Loading /> : shown.length === 0 ? <Empty icon="walk-outline" title={sub === 'pending' ? 'No exeats waiting' : sub === 'out' ? 'No one is out' : 'No past exeats'} /> : shown.map(e => {
        const st = STATUS[e.status] ?? STATUS.pending;
        return (
          <Card key={e.id} accent={e.status === 'overdue' ? C.danger : undefined}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{e.student_name}</Text>
                <Body small soft>{e.student_code}, {e.class_name}, {e.house}</Body>
              </View>
              <Chip label={st.label} tone={st.tone} />
            </View>
            <Body small>{e.exeat_type === 'external' ? 'Off campus' : 'Within town'}{e.destination ? ` to ${e.destination}` : ''}{e.reason ? `. ${e.reason}` : ''}</Body>
            <Body small soft>Left {day(e.departure_date)} {hm(e.departure_time)}. Due back {day(e.expected_return_date)} {hm(e.expected_return_time)}</Body>
            {!!e.actual_return_date && <Body small style={{ color: C.success }}>Returned {day(e.actual_return_date)} {hm(e.actual_return_time)}</Body>}
            {!!e.granted_by_name && <Body small soft>Granted by {e.granted_by_name}</Body>}
            {!!e.parent_contact && <Button label={`Call parent, ${e.parent_contact}`} kind="quiet" icon="call-outline" onPress={() => Linking.openURL(`tel:${e.parent_contact!.replace(/\s+/g, '')}`).catch(() => {})} style={{ alignSelf: 'flex-start' }} />}
            {acting?.id === e.id && acting.kind === 'reject' ? (
              <View style={{ gap: 8 }}>
                <Field label="Reason (optional)" value={note} onChangeText={setNote} />
                <Row><Button label="Refuse exeat" kind="danger" grow busy={busy === e.id} onPress={() => reject(e.id)} /><Button label="Cancel" kind="secondary" grow onPress={() => setActing(null)} /></Row>
              </View>
            ) : acting?.id === e.id && acting.kind === 'return' ? (
              <View style={{ gap: 8 }}>
                <Row>
                  <View style={{ flex: 1, minWidth: 140 }}><Field label="Date back" value={retDate} onChangeText={setRetDate} /></View>
                  <View style={{ flex: 1, minWidth: 100 }}><Field label="Time back" value={retTime} onChangeText={setRetTime} placeholder="18:30" /></View>
                </Row>
                <Row><Button label="Confirm return" grow busy={busy === e.id} onPress={() => returned(e.id)} /><Button label="Cancel" kind="secondary" grow onPress={() => setActing(null)} /></Row>
              </View>
            ) : e.status === 'pending' ? (
              <Row><Button label="Approve" grow busy={busy === e.id} onPress={() => approve(e.id)} /><Button label="Refuse" kind="secondary" grow onPress={() => { setActing({ id: e.id, kind: 'reject' }); setNote(''); }} /></Row>
            ) : (e.status === 'active' || e.status === 'overdue') ? (
              <Button label="Mark returned" onPress={() => { const n = new Date(); setRetDate(ymd(n)); setRetTime(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`); setActing({ id: e.id, kind: 'return' }); }} />
            ) : null}
          </Card>
        );
      })}
    </>
  );
}

function NewExeat({ role, onCancel, onCreated }: { role: 'housemaster' | 'senior_housemaster'; onCancel: () => void; onCreated: (e: Exeat) => void }) {
  const C = useTheme();
  const [students, setStudents] = useState<HouseStudent[] | null>(null);
  const [q, setQ] = useState('');
  const [stu, setStu] = useState<HouseStudent | null>(null);
  const [f, setF] = useState({ destination: '', reason: '', contact: '', depDate: ymd(), depTime: '08:00', retDate: '', retTime: '18:00' });
  const [grantNow, setGrantNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api.get<HouseStudent[]>('/api/exeat/house-students').then(r => setStudents(r.data ?? [])).catch(() => setStudents([])); }, []);
  const set = (k: keyof typeof f) => (v: string) => setF(p => ({ ...p, [k]: v }));
  async function submit() {
    if (!stu) { setErr('Choose the student.'); return; }
    if (!f.destination.trim() || !f.reason.trim()) { setErr('Write where they are going and why.'); return; }
    if (!DATE.test(f.depDate) || !DATE.test(f.retDate) || !TIME.test(f.depTime) || !TIME.test(f.retTime)) { setErr('Write dates like 2026-11-17 and times like 18:00.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.post<Exeat>('/api/exeat', {
        student_id: stu.id, exeat_type: role === 'senior_housemaster' ? 'external' : 'internal', destination: f.destination.trim(), reason: f.reason.trim(),
        parent_contact: f.contact.trim() || null, departure_date: f.depDate, departure_time: f.depTime, expected_return_date: f.retDate, expected_return_time: f.retTime, grant_immediately: grantNow,
      });
      onCreated(r.data);
    } catch (e) { setErr(errText(e, 'Could not create the exeat.')); setBusy(false); }
  }
  const matches = (students ?? []).filter(s => q.trim().length >= 1 && `${s.name} ${s.student_code}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  return (
    <Card>
      <Title sub={role === 'senior_housemaster' ? 'An exeat to leave campus.' : 'An exeat to go into town and come back the same day.'}>New exeat</Title>
      {stu ? (
        <Row style={{ alignItems: 'center' }}>
          <View style={{ flex: 1 }}><Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{stu.name}</Text><Body small soft>{stu.student_code}, {stu.class_name}, {stu.house}</Body></View>
          <Button label="Change" kind="quiet" onPress={() => setStu(null)} />
        </Row>
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} label="Find the student" />
          {students === null ? <Loading /> : matches.map(s => (
            <Pressable key={s.id} onPress={() => { setStu(s); setF(p => ({ ...p, contact: s.guardian_mobile ?? '' })); setQ(''); }} accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: 44, padding: 10, borderRadius: 10, backgroundColor: pressed ? C.bg : 'transparent', borderTopWidth: 1, borderColor: C.border })}>
              <Text style={{ color: C.text, fontSize: 15 }}>{s.name}</Text>
              <Body small soft>{s.student_code}, {s.class_name}</Body>
            </Pressable>
          ))}
        </>
      )}
      <Field label="Going to" value={f.destination} onChangeText={set('destination')} />
      <Field label="Reason" value={f.reason} onChangeText={set('reason')} multiline />
      <Field label="Parent's phone" value={f.contact} onChangeText={set('contact')} keyboardType="phone-pad" />
      <Row>
        <View style={{ flex: 1, minWidth: 140 }}><Field label="Leaving on" value={f.depDate} onChangeText={set('depDate')} /></View>
        <View style={{ flex: 1, minWidth: 100 }}><Field label="At" value={f.depTime} onChangeText={set('depTime')} /></View>
      </Row>
      <Row>
        <View style={{ flex: 1, minWidth: 140 }}><Field label="Back on" value={f.retDate} onChangeText={set('retDate')} placeholder={ymd()} /></View>
        <View style={{ flex: 1, minWidth: 100 }}><Field label="By" value={f.retTime} onChangeText={set('retTime')} /></View>
      </Row>
      <ChoiceChips value={grantNow ? 'now' : 'later'} onChange={v => setGrantNow(v === 'now')} options={[{ key: 'now', label: 'Grant now' }, { key: 'later', label: 'Save for approval' }]} />
      <Notice tone="bad" text={err || null} />
      <Row>
        <Button label="Create exeat" grow busy={busy} onPress={submit} />
        <Button label="Cancel" kind="secondary" grow onPress={onCancel} />
      </Row>
    </Card>
  );
}
