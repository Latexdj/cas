import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Body, Button, Card, Chip, Empty, Field, InlineConfirm, Loading, Notice, Picker, Row, Screen, Title, errText } from '@/components/ui/kit';

type Status = 'Present' | 'Absent' | 'Break Bounds';
interface RollCall { id: string; date: string; title: string | null; location: string | null; total_entries: number; present_count: number; absent_count: number; break_bounds_count: number }
interface Entry { student_id: string; status: Status; notes: string | null; student_name: string; student_code: string; class_name: string; house: string | null }
interface Student { id: string; class_name: string; residential_status: string }

const STATUSES: Status[] = ['Present', 'Absent', 'Break Bounds'];
const LABEL: Record<Status, string> = { Present: 'Present', Absent: 'Absent', 'Break Bounds': 'Broke bounds' };
const localYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const day = (d: string, long = false) => new Date(d).toLocaleDateString(undefined, long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });

export default function RollCallScreen() {
  const C = useTheme();
  const [list, setList] = useState<RollCall[] | null>(null);
  const [boarders, setBoarders] = useState<Student[]>([]);
  const [open, setOpen] = useState<RollCall | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ date: localYmd(), title: '', location: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get<{ roll_calls: RollCall[] }>('/api/roll-call'); setList(r.data.roll_calls ?? []); }
    catch (e) { setList([]); setMsg({ text: errText(e, 'Could not load roll calls.'), tone: 'bad' }); }
  }, []);
  useEffect(() => {
    load();
    api.get<Student[]>('/api/students', { params: { status: 'Active' } }).then(r => setBoarders((r.data ?? []).filter(s => s.residential_status === 'Boarding'))).catch(() => {});
  }, [load]);

  async function create() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { setMsg({ text: 'Write the date like 2026-11-17.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ roll_call: RollCall }>('/api/roll-call', { ...form, notes: '' });
      const rc = { ...r.data.roll_call, total_entries: 0, present_count: 0, absent_count: 0, break_bounds_count: 0 };
      setList(p => [rc, ...(p ?? [])]); setCreating(false); setForm({ date: localYmd(), title: '', location: '' }); setOpen(rc);
    } catch (e) { setMsg({ text: errText(e, 'Could not start the roll call.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api.delete(`/api/roll-call/${id}`); setList(p => p?.filter(r => r.id !== id) ?? p); setMsg({ text: 'Roll call deleted.', tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not delete the roll call.'), tone: 'bad' }); }
    setConfirm(null);
  }

  if (open) return <Detail rc={open} boarders={boarders} onBack={() => { setOpen(null); load(); }} />;

  return (
    <Screen onRefresh={load}>
      <Body soft>Check boarding students and find anyone who has broken bounds or is missing.</Body>
      {creating ? (
        <Card>
          <Title>New roll call</Title>
          <Field label="Date" value={form.date} onChangeText={v => setForm(p => ({ ...p, date: v }))} placeholder="2026-11-17" />
          <Field label="Title (optional)" value={form.title} onChangeText={v => setForm(p => ({ ...p, title: v }))} placeholder="For example, evening roll call" />
          <Field label="Place (optional)" value={form.location} onChangeText={v => setForm(p => ({ ...p, location: v }))} placeholder="For example, the assembly hall" />
          <Row>
            <Button label="Start" grow busy={busy} onPress={create} />
            <Button label="Cancel" kind="secondary" grow onPress={() => setCreating(false)} />
          </Row>
        </Card>
      ) : <Button label="Start a roll call" icon="add" onPress={() => { setCreating(true); setMsg(null); }} />}
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {list === null ? <Loading /> : list.length === 0 ? <Empty icon="list-outline" title="No roll calls this semester" /> : list.map(rc => (
        <Card key={rc.id}>
          <Pressable onPress={() => setOpen(rc)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{rc.title || 'Roll call'}</Text>
              <Body small soft>{day(rc.date)}{rc.location ? `, ${rc.location}` : ''}</Body>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </Pressable>
          {rc.total_entries > 0 && (
            <Row>
              <Chip label={`${rc.present_count} present`} tone="ok" />
              <Chip label={`${rc.absent_count} absent`} tone={rc.absent_count ? 'bad' : 'neutral'} />
              {rc.break_bounds_count > 0 && <Chip label={`${rc.break_bounds_count} broke bounds`} tone="warn" />}
            </Row>
          )}
          {confirm === rc.id
            ? <InlineConfirm question="Delete this roll call and everything recorded in it?" confirmLabel="Delete" onConfirm={() => remove(rc.id)} onCancel={() => setConfirm(null)} />
            : <Button label="Delete" kind="quiet" onPress={() => setConfirm(rc.id)} style={{ alignSelf: 'flex-start' }} />}
        </Card>
      ))}
    </Screen>
  );
}

function Detail({ rc, boarders, onBack }: { rc: RollCall; boarders: Student[]; onBack: () => void }) {
  const C = useTheme();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [local, setLocal] = useState<Record<string, Status>>({});
  const [cls, setCls] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<'add' | 'save' | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ entries: Entry[] }>(`/api/roll-call/${rc.id}`);
      const e = r.data.entries ?? [];
      setEntries(e); setLocal(Object.fromEntries(e.map(x => [x.student_id, x.status]))); setDirty(false);
    } catch (err) { setEntries([]); setMsg({ text: errText(err, 'Could not open the roll call.'), tone: 'bad' }); }
  }, [rc.id]);
  useEffect(() => { load(); }, [load]);

  const classes = useMemo(() => [...new Set(boarders.map(s => s.class_name))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [boarders]);
  async function add() {
    const have = new Set((entries ?? []).map(e => e.student_id));
    const toAdd = boarders.filter(s => !have.has(s.id) && (!cls || s.class_name === cls)).map(s => ({ student_id: s.id, status: 'Present' as const }));
    if (!toAdd.length) { setMsg({ text: 'Every boarding student is already on this roll call.', tone: 'ok' }); return; }
    setBusy('add'); setMsg(null);
    try { await api.put(`/api/roll-call/${rc.id}/entries`, { entries: toAdd }); await load(); setMsg({ text: `Added ${toAdd.length} boarding students. Everyone starts as present.`, tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not add the students.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function save() {
    setBusy('save'); setMsg(null);
    try {
      await api.put(`/api/roll-call/${rc.id}/entries`, { entries: Object.entries(local).map(([student_id, status]) => ({ student_id, status, notes: '' })) });
      setDirty(false); setMsg({ text: 'Roll call saved.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not save the roll call.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }

  const s = q.trim().toLowerCase();
  const sorted = [...(entries ?? [])]
    .filter(e => (!cls || e.class_name === cls) && (!s || e.student_name.toLowerCase().includes(s) || e.student_code.toLowerCase().includes(s)))
    .sort((a, b) => a.class_name.localeCompare(b.class_name, undefined, { numeric: true }) || a.student_name.localeCompare(b.student_name));
  const count = (st: Status) => Object.values(local).filter(x => x === st).length;

  return (
    <Screen>
      <Button label="Back to roll calls" kind="quiet" icon="chevron-back" onPress={onBack} style={{ alignSelf: 'flex-start' }} />
      <Title sub={`${day(rc.date, true)}${rc.location ? `, ${rc.location}` : ''}`}>{rc.title || 'Roll call'}</Title>
      <Card>
        <Picker label="Class" value={cls} options={[{ key: '', label: 'All classes' }, ...classes.map(c => ({ key: c, label: c }))]} onChange={setCls} searchable={classes.length > 8} />
        <Button label={cls ? `Add boarders from ${cls}` : 'Add all boarding students'} kind="secondary" icon="person-add-outline" busy={busy === 'add'} onPress={add} />
      </Card>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {entries === null ? <Loading /> : entries.length === 0 ? <Empty icon="people-outline" title="No students yet" text="Add the boarding students to start marking." /> : (
        <>
          <Row>
            <Chip label={`${count('Present')} present`} tone="ok" />
            <Chip label={`${count('Absent')} absent`} tone={count('Absent') ? 'bad' : 'neutral'} />
            <Chip label={`${count('Break Bounds')} broke bounds`} tone={count('Break Bounds') ? 'warn' : 'neutral'} />
          </Row>
          <TextInput value={q} onChangeText={setQ} placeholder="Find a student" placeholderTextColor={C.placeholder} accessibilityLabel="Find a student"
            style={{ minHeight: 48, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: C.text, backgroundColor: C.surface }} />
          {sorted.map(e => {
            const st = local[e.student_id] ?? e.status;
            return (
              <View key={e.student_id} style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border,
                backgroundColor: st === 'Absent' ? C.dangerLight : st === 'Break Bounds' ? C.warningLight : C.surface }}>
                <View>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{e.student_name}</Text>
                  <Body small soft>{e.student_code}, {e.class_name}{e.house ? `, ${e.house}` : ''}</Body>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {STATUSES.map(x => {
                    const on = st === x; const col = x === 'Present' ? C.success : x === 'Absent' ? C.danger : C.warning;
                    return (
                      <Pressable key={x} onPress={() => { setLocal(p => ({ ...p, [e.student_id]: x })); setDirty(true); }}
                        accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${e.student_name}: ${LABEL[x]}`}
                        style={{ flex: 1, minHeight: 44, borderRadius: 10, borderWidth: on ? 2 : 1, borderColor: on ? col : C.border, backgroundColor: on ? C.surface : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: on ? col : C.textSoft, fontSize: 13, fontWeight: on ? '800' : '600' }}>{LABEL[x]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Button label={dirty ? 'Save roll call' : 'Saved'} busy={busy === 'save'} disabled={!dirty} onPress={save} />
        </>
      )}
    </Screen>
  );
}
