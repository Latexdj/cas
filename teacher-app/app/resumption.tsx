import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { downloadAndShare } from '@/lib/files';
import { Body, Button, Card, Chip, Empty, Field, InlineConfirm, Loading, Notice, Picker, Row, Screen, Segmented, Title, errText } from '@/components/ui/kit';

interface Config { resumption_date: string | null; max_days_home: number; is_open: boolean }
interface Arrival { id: string; arrival_date: string; student_name: string; student_code: string; class_name: string; house: string | null; recorded_by_name: string | null }
interface Missing { id: string; student_name: string; student_code: string; class_name: string; house: string | null }
interface Flag { id: string; flagged_at: string; resolved_at: string | null; resolution_note: string | null; student_name: string; student_code: string; class_name: string; house: string | null; flagged_by_name: string | null; subject: string | null; session_date: string | null }
interface Late { arrival_id: string; arrival_date: string; student_name: string; student_code: string; class_name: string; house: string | null; deadline: string; days_late: number }
interface Kitchen { total: number; by_class: { class_name: string; count: number }[] }
type Tab = 'arrivals' | 'missing' | 'late' | 'flags' | 'kitchen' | 'config';
type Msg = { text: string; tone: 'ok' | 'bad' } | null;

const day = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const sortNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function Filters({ classes, houses, cls, house, setCls, setHouse }: { classes: string[]; houses: string[]; cls: string; house: string; setCls: (v: string) => void; setHouse: (v: string) => void }) {
  return (
    <Card>
      <Picker label="Class" value={cls} options={[{ key: '', label: 'All classes' }, ...classes.map(c => ({ key: c, label: c }))]} onChange={setCls} searchable={classes.length > 8} />
      {houses.length > 0 && <Picker label="House" value={house} options={[{ key: '', label: 'All houses' }, ...houses.map(h => ({ key: h, label: h }))]} onChange={setHouse} />}
    </Card>
  );
}

export default function ResumptionScreen() {
  const [tab, setTab] = useState<Tab>('arrivals');
  const [boarders, setBoarders] = useState<{ class_name: string; house: string | null }[]>([]);
  const [counts, setCounts] = useState<{ missing?: number; late?: number; flags?: number }>({});
  useEffect(() => {
    api.get<{ class_name: string; house: string | null; residential_status: string }[]>('/api/students', { params: { status: 'Active' } })
      .then(r => setBoarders((r.data ?? []).filter(s => s.residential_status === 'Boarding'))).catch(() => {});
    api.get<{ students: Missing[] }>('/api/resumption/missing').then(r => setCounts(c => ({ ...c, missing: r.data.students?.length ?? 0 }))).catch(() => {});
    api.get<{ flags: Flag[] }>('/api/resumption/flags').then(r => setCounts(c => ({ ...c, flags: (r.data.flags ?? []).filter(f => !f.resolved_at).length }))).catch(() => {});
  }, []);
  const classes = useMemo(() => [...new Set(boarders.map(s => s.class_name))].sort(sortNum), [boarders]);
  const houses = useMemo(() => [...new Set(boarders.map(s => s.house).filter((h): h is string => !!h))].sort(), [boarders]);
  const f = { classes, houses };
  return (
    <Screen>
      <Segmented value={tab} onChange={setTab} options={[
        { key: 'arrivals', label: 'Arrived' }, { key: 'missing', label: 'Not back', badge: counts.missing || undefined }, { key: 'late', label: 'Late' },
        { key: 'flags', label: 'Flags', badge: counts.flags || undefined }, { key: 'kitchen', label: 'Kitchen count' }, { key: 'config', label: 'Settings' },
      ]} />
      <View key={tab} style={{ gap: 12 }}>
        {tab === 'arrivals' && <Arrivals {...f} />}
        {tab === 'missing' && <MissingList {...f} onRecorded={n => setCounts(c => ({ ...c, missing: Math.max(0, (c.missing ?? 0) - n) }))} />}
        {tab === 'late' && <LateList {...f} />}
        {tab === 'flags' && <Flags onResolved={() => setCounts(c => ({ ...c, flags: Math.max(0, (c.flags ?? 0) - 1) }))} />}
        {tab === 'kitchen' && <KitchenCount />}
        {tab === 'config' && <Settings />}
      </View>
    </Screen>
  );
}

function Arrivals({ classes, houses }: { classes: string[]; houses: string[] }) {
  const C = useTheme();
  const [cls, setCls] = useState(''); const [house, setHouse] = useState(''); const [q, setQ] = useState('');
  const [rows, setRows] = useState<Arrival[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const load = useCallback(() => {
    setRows(null);
    api.get<{ arrivals: Arrival[] }>('/api/resumption/arrivals', { params: { ...(cls ? { class_name: cls } : {}), ...(house ? { house } : {}), ...(q.trim() ? { search: q.trim() } : {}) } })
      .then(r => setRows(r.data.arrivals ?? [])).catch(e => { setRows([]); setMsg({ text: errText(e, 'Could not load arrivals.'), tone: 'bad' }); });
  }, [cls, house]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  async function remove(id: string) {
    try { await api.delete(`/api/resumption/arrivals/${id}`); setRows(p => p?.filter(a => a.id !== id) ?? p); setMsg({ text: 'Arrival removed.', tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not remove the arrival.'), tone: 'bad' }); }
    setConfirm(null);
  }
  return (
    <>
      <Filters classes={classes} houses={houses} cls={cls} house={house} setCls={setCls} setHouse={setHouse} />
      <TextInput value={q} onChangeText={setQ} onSubmitEditing={load} returnKeyType="search" placeholder="Search name or ID" placeholderTextColor={C.placeholder} accessibilityLabel="Search arrivals"
        style={{ minHeight: 48, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: C.text, backgroundColor: C.surface }} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty icon="log-in-outline" title="No arrivals recorded" text="Record students as they report from the Not back tab." /> : (
        <>
          <Body small soft>{rows.length} {rows.length === 1 ? 'student has' : 'students have'} reported.</Body>
          {rows.map(a => (
            <Card key={a.id}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{a.student_name}</Text>
                  <Body small soft>{a.student_code}, {a.class_name}{a.house ? `, ${a.house}` : ''}</Body>
                  <Body small soft>Arrived {day(a.arrival_date)}{a.recorded_by_name ? `, recorded by ${a.recorded_by_name}` : ''}</Body>
                </View>
              </View>
              {confirm === a.id
                ? <InlineConfirm question={`Remove ${a.student_name}'s arrival?`} confirmLabel="Remove" onConfirm={() => remove(a.id)} onCancel={() => setConfirm(null)} />
                : <Button label="Remove" kind="quiet" onPress={() => setConfirm(a.id)} style={{ alignSelf: 'flex-start' }} />}
            </Card>
          ))}
        </>
      )}
    </>
  );
}

function MissingList({ classes, houses, onRecorded }: { classes: string[]; houses: string[]; onRecorded: (n: number) => void }) {
  const C = useTheme();
  const [cls, setCls] = useState(''); const [house, setHouse] = useState('');
  const [rows, setRows] = useState<Missing[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => {
    setRows(null); setSel(new Set());
    api.get<{ students: Missing[] }>('/api/resumption/missing', { params: { ...(cls ? { class_name: cls } : {}), ...(house ? { house } : {}) } })
      .then(r => setRows(r.data.students ?? [])).catch(e => { setRows([]); setMsg({ text: errText(e, 'Could not load the list.'), tone: 'bad' }); });
  }, [cls, house]);
  useEffect(() => { load(); }, [load]);
  const toggle = (id: string) => setSel(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function record() {
    setBusy(true); setMsg(null);
    try {
      await api.post('/api/resumption/arrivals', { student_ids: [...sel] });
      const n = sel.size;
      setRows(p => p?.filter(s => !sel.has(s.id)) ?? p); setSel(new Set()); onRecorded(n);
      setMsg({ text: `Recorded ${n} ${n === 1 ? 'arrival' : 'arrivals'}.`, tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not record the arrivals.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Filters classes={classes} houses={houses} cls={cls} house={house} setCls={setCls} setHouse={setHouse} />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty icon="happy-outline" title="Every boarding student has reported" /> : (
        <>
          <Row style={{ alignItems: 'center' }}>
            <Body small soft style={{ flex: 1 }}>Tap students as they arrive, then record them together.</Body>
            <Button label={sel.size === rows.length ? 'Clear' : 'Select all'} kind="quiet" onPress={() => setSel(sel.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))} />
          </Row>
          {rows.map(s => {
            const on = sel.has(s.id);
            return (
              <Pressable key={s.id} onPress={() => toggle(s.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${s.student_name}, ${s.class_name}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? C.success : C.border, backgroundColor: on ? C.successLight : C.surface }}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? C.success : C.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{s.student_name}</Text>
                  <Body small soft>{s.student_code}, {s.class_name}{s.house ? `, ${s.house}` : ''}</Body>
                </View>
              </Pressable>
            );
          })}
          <Button label={sel.size ? `Record ${sel.size} ${sel.size === 1 ? 'arrival' : 'arrivals'}` : 'Choose who has arrived'} busy={busy} disabled={!sel.size} onPress={record} />
        </>
      )}
    </>
  );
}

function LateList({ classes, houses }: { classes: string[]; houses: string[] }) {
  const C = useTheme();
  const [cls, setCls] = useState(''); const [house, setHouse] = useState('');
  const [rows, setRows] = useState<Late[] | null>(null);
  const [cfg, setCfg] = useState<{ resumption_date: string | null; max_days_home: number } | null>(null);
  const [err, setErr] = useState('');
  const [dl, setDl] = useState(false);
  const params = { ...(cls ? { class_name: cls } : {}), ...(house ? { house } : {}) };
  useEffect(() => {
    setRows(null); setErr('');
    api.get<{ students: Late[]; config: typeof cfg }>('/api/resumption/late', { params }).then(r => {
      setRows(r.data.students ?? []); setCfg(r.data.config ?? null);
      if (!r.data.config?.resumption_date) setErr('Set the resumption date under Settings first.');
    }).catch(e => { setRows([]); setErr(errText(e, 'Could not load the late list.')); });
  }, [cls, house]); // eslint-disable-line react-hooks/exhaustive-deps
  async function excel() {
    setDl(true);
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    const e = await downloadAndShare(`/api/resumption/late/excel${qs ? `?${qs}` : ''}`, 'Late_Resumption_Report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (e) setErr(e);
    setDl(false);
  }
  return (
    <>
      <Filters classes={classes} houses={houses} cls={cls} house={house} setCls={setCls} setHouse={setHouse} />
      {cfg?.resumption_date && <Body small soft>Deadline: resumption on {day(cfg.resumption_date)}, plus {cfg.max_days_home} {cfg.max_days_home === 1 ? 'day' : 'days'}.</Body>}
      <Notice tone="bad" text={err || null} />
      {rows === null ? <Loading /> : rows.length === 0 ? (!err && <Empty icon="happy-outline" title="No one came back late" text="Everyone reported before the deadline." />) : (
        <>
          <Button label="Share as Excel" kind="secondary" icon="share-outline" busy={dl} onPress={excel} />
          {rows.map(s => (
            <Card key={s.arrival_id}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{s.student_name}</Text>
                  <Body small soft>{s.student_code}, {s.class_name}{s.house ? `, ${s.house}` : ''}. Arrived {day(s.arrival_date)}</Body>
                </View>
                <Chip label={`${s.days_late} ${s.days_late === 1 ? 'day' : 'days'} late`} tone="bad" />
              </View>
            </Card>
          ))}
        </>
      )}
    </>
  );
}

function Flags({ onResolved }: { onResolved: () => void }) {
  const C = useTheme();
  const [rows, setRows] = useState<Flag[] | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { api.get<{ flags: Flag[] }>('/api/resumption/flags').then(r => setRows(r.data.flags ?? [])).catch(() => setRows([])); }, []);
  async function resolve(id: string) {
    setBusy(true);
    try {
      await api.post(`/api/resumption/flags/${id}/resolve`, { resolution_note: note.trim() || null });
      setRows(p => p?.map(f => (f.id === id ? { ...f, resolved_at: new Date().toISOString(), resolution_note: note.trim() || null } : f)) ?? p);
      setResolving(null); setNote(''); onResolved(); setMsg({ text: 'Flag resolved.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not resolve the flag.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  if (rows === null) return <Loading />;
  return (
    <>
      <Body small soft>Students a teacher marked present in class who had not reported back.</Body>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {rows.length === 0 ? <Empty icon="flag-outline" title="No flags" /> : rows.map(f => (
        <Card key={f.id} accent={f.resolved_at ? undefined : C.warning}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{f.student_name}</Text>
            <Chip label={f.resolved_at ? 'Resolved' : 'Open'} tone={f.resolved_at ? 'ok' : 'warn'} />
          </View>
          <Body small soft>{f.student_code}, {f.class_name}{f.house ? `, ${f.house}` : ''}</Body>
          <Body small soft>Flagged {day(f.flagged_at)}{f.flagged_by_name ? ` by ${f.flagged_by_name}` : ''}{f.subject ? `, in ${f.subject}` : ''}</Body>
          {!!f.resolution_note && <Body small>{f.resolution_note}</Body>}
          {!f.resolved_at && (resolving === f.id ? (
            <View style={{ gap: 8 }}>
              <Field label="Note (optional)" value={note} onChangeText={setNote} />
              <Row>
                <Button label="Resolve" grow busy={busy} onPress={() => resolve(f.id)} />
                <Button label="Cancel" kind="secondary" grow onPress={() => { setResolving(null); setNote(''); }} />
              </Row>
            </View>
          ) : <Button label="Resolve" kind="secondary" onPress={() => { setResolving(f.id); setNote(''); }} style={{ alignSelf: 'flex-start' }} />)}
        </Card>
      ))}
    </>
  );
}

function KitchenCount() {
  const C = useTheme();
  const [k, setK] = useState<Kitchen | null | undefined>(undefined);
  const load = () => { setK(undefined); api.get<Kitchen>('/api/resumption/kitchen-count').then(r => setK(r.data)).catch(() => setK(null)); };
  useEffect(load, []);
  if (k === undefined) return <Loading />;
  if (k === null) return <Empty icon="restaurant-outline" title="No count available" />;
  return (
    <>
      <Card>
        <Text style={{ color: C.success, fontSize: 14, fontWeight: '700' }}>Boarders on campus</Text>
        <Text style={{ color: C.text, fontSize: 40, fontWeight: '800' }}>{k.total}</Text>
        <Body small soft>For the kitchen: how many boarders to cook for.</Body>
      </Card>
      {k.by_class.length > 0 && (
        <Card>
          {k.by_class.map((r, i) => (
            <View key={r.class_name} style={{ flexDirection: 'row', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: C.border }}>
              <Text style={{ flex: 1, color: C.text, fontSize: 15 }}>{r.class_name}</Text>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>{r.count}</Text>
            </View>
          ))}
        </Card>
      )}
      <Button label="Refresh" kind="secondary" icon="refresh" onPress={load} />
    </>
  );
}

function Settings() {
  const C = useTheme();
  const [form, setForm] = useState<{ resumption_date: string; max_days_home: string; is_open: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    api.get<{ config: Config | null }>('/api/resumption/config').then(r => {
      const c = r.data.config;
      setForm({ resumption_date: c?.resumption_date?.slice(0, 10) ?? '', max_days_home: String(c?.max_days_home ?? 7), is_open: c?.is_open ?? false });
    }).catch(() => setForm({ resumption_date: '', max_days_home: '7', is_open: false }));
  }, []);
  async function save() {
    if (!form) return;
    if (form.resumption_date && !/^\d{4}-\d{2}-\d{2}$/.test(form.resumption_date)) { setMsg({ text: 'Write the date like 2027-01-08.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post('/api/resumption/config', { resumption_date: form.resumption_date || null, max_days_home: Math.min(60, Math.max(0, parseInt(form.max_days_home, 10) || 0)), is_open: form.is_open });
      setMsg({ text: 'Settings saved.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not save the settings.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  if (!form) return <Loading />;
  return (
    <Card>
      <Title>This semester</Title>
      <Field label="Resumption date" value={form.resumption_date} onChangeText={v => setForm(p => p && { ...p, resumption_date: v })} placeholder="2027-01-08" />
      <Field label="Days a boarder may stay home after resumption" value={form.max_days_home} keyboardType="number-pad" onChangeText={v => setForm(p => p && { ...p, max_days_home: v })} />
      <Pressable onPress={() => setForm(p => p && { ...p, is_open: !p.is_open })} accessibilityRole="switch" accessibilityState={{ checked: form.is_open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
        <Text style={{ flex: 1, color: C.text, fontSize: 15 }}>Arrival register is open, so teachers can record arrivals</Text>
        <Switch value={form.is_open} onValueChange={v => setForm(p => p && { ...p, is_open: v })} importantForAccessibility="no" trackColor={{ true: C.primaryText, false: C.border }} />
      </Pressable>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      <Button label="Save settings" busy={busy} onPress={save} />
    </Card>
  );
}
