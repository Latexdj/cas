import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { downloadAndShare } from '@/lib/files';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, InlineConfirm, Loading, Notice, Picker, Row, Screen, Title, errText } from '@/components/ui/kit';

type Track = 'academic' | 'administration';
interface Budget {
  id: string; department_name: string; track: Track; academic_year_id: string; academic_year_name: string; status: string;
  submitted_at: string | null; reviewed_by_name: string | null; reviewed_at: string | null; review_note: string | null;
  total_amount: number | string; requested_total?: number | string; item_count: number; updated_at: string;
}
interface Item {
  id: string; category: string; description: string | null; quantity: number | string; unit_price: number | string | null; amount: number | string | null;
  requested_quantity: number | string | null; requested_unit_price: number | string | null; added_stage?: string | null; removed_at?: string | null; removed_stage?: string | null;
}
interface Detail extends Budget {
  items: Item[]; events?: { id: string; action: string; note: string | null; actor_label: string | null; created_at: string }[];
  permissions?: { editStage: 'owner' | 'reviewer' | 'accountant' | null; canSubmit: boolean; canWithdraw: boolean; canReview: boolean; canReopen: boolean; canDelete: boolean };
  compilation_status?: string | null; school_budget_status?: string | null;
}
interface Me { reviewer_tracks: Track[]; is_accountant: boolean; view_all: boolean; can_create_custom: boolean; is_admin: boolean }
interface Owner { id: string; name: string; kind?: 'department' | 'unit' }
interface Year { id: string; name: string; is_current: boolean }
type Row_ = { key: string; id: string | null; category: string; description: string; quantity: string; unitPrice: string; requestedQuantity: number | null; requestedUnitPrice: number | null; addedStage: string };
type Msg = { text: string; tone: 'ok' | 'bad' } | null;

const TRACK: Record<Track, string> = { academic: 'Academics', administration: 'Administration' };
const STATUS_TONE: Record<string, 'neutral' | 'warn' | 'ok' | 'bad'> = { Draft: 'neutral', Submitted: 'warn', Accepted: 'ok', Approved: 'ok', 'Changes Requested': 'warn', Rejected: 'bad' };
const EVENTS: Record<string, string> = {
  created: 'Created', submitted: 'Submitted for review', withdrawn: 'Withdrawn by the owner', accepted: 'Accepted into the compiled budget',
  changes_requested: 'Sent back for changes', rejected: 'Rejected', reopened: 'Reopened for review', edited_by_reviewer: 'Lines changed by the reviewer',
  edited_by_accountant: 'Prices changed by the Accountant', approved: 'Approved by the Head', returned: 'Returned by the Head', line_added: 'School-wide line added',
};
const STAGE: Record<string, string> = { reviewer: 'reviewer', accountant: 'Accountant', owner: 'owner' };
const num = (v: unknown) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
const money = (n: unknown) => (n == null || n === '' ? '-' : `GH₵ ${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const day = (d: string | null, t = false) => (d ? new Date(d).toLocaleString(undefined, t ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const rowAmount = (r: { quantity: string; unitPrice: string }) => { const q = parseFloat(r.quantity), p = parseFloat(r.unitPrice); return !r.unitPrice.trim() || isNaN(p) || isNaN(q) ? null : Math.round(q * p * 100) / 100; };
function requestedNote(r: { requestedQuantity: number | null; requestedUnitPrice: number | null; addedStage: string }, q: number, p: number | null) {
  if (r.addedStage !== 'owner') return `Added by the ${STAGE[r.addedStage] ?? r.addedStage}`;
  if (r.requestedQuantity == null) return null;
  if (r.requestedQuantity === q && (r.requestedUnitPrice ?? null) === (p ?? null)) return null;
  return `You asked for ${r.requestedQuantity}${r.requestedUnitPrice != null ? ` at ${money(r.requestedUnitPrice)}` : ''}`;
}

export default function BudgetsScreen() {
  const C = useTheme();
  const [list, setList] = useState<Budget[] | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [year, setYear] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [tasks, setTasks] = useState<{ key: string; label: string; count: number }[]>([]);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    try {
      const [b, o, y, m] = await Promise.all([
        api.get<Budget[]>('/api/department-budgets'), api.get<Owner[]>('/api/department-budgets/departments-mine'),
        api.get<Year[]>('/api/academic-years'), api.get<Me>('/api/department-budgets/me'),
      ]);
      setList(b.data ?? []); setOwners(o.data ?? []); setYears(y.data ?? []); setMe(m.data);
      const cur = y.data.find(x => x.is_current) ?? y.data[0];
      if (cur) setYear(v => v || cur.id);
    } catch (e) { setList([]); setMsg({ text: errText(e, 'Could not load budgets.'), tone: 'bad' }); }
    api.get<{ key: string; label: string; count: number }[]>('/api/department-budgets/my-tasks').then(r => setTasks(r.data ?? [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (open) return <BudgetDetail id={open} onBack={() => { setOpen(null); load(); }} />;
  if (creating && me) return <NewBudget owners={owners} years={years} me={me} onCancel={() => setCreating(false)} onCreated={id => { setCreating(false); setOpen(id); }} />;

  const seesOthers = !!me && (me.reviewer_tracks.length > 0 || me.view_all || me.is_accountant);
  const canCreate = owners.length > 0 || !!me?.can_create_custom;
  const shown = (list ?? []).filter(b => !year || b.academic_year_id === year);
  return (
    <Screen onRefresh={load}>
      <Body soft>{me?.reviewer_tracks.length ? 'Review submitted budgets, and draft your own.' : 'Draft your budget for the year and submit it for review.'}</Body>
      {tasks.length > 0 && (
        <Card>
          {tasks.map(t => <Row key={t.key} style={{ justifyContent: 'space-between' }}><Body>{t.label}</Body><Text style={{ color: C.warning, fontWeight: '800', fontSize: 15 }}>{t.count}</Text></Row>)}
        </Card>
      )}
      {canCreate && <Button label="Create budget" icon="add" onPress={() => { setCreating(true); setMsg(null); }} />}
      {years.length > 1 && <Picker label="Academic year" value={year} options={[{ key: '', label: 'All years' }, ...years.slice(0, 3).map(y => ({ key: y.id, label: y.name }))]} onChange={setYear} />}
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {list === null ? <Loading /> : shown.length === 0 ? (
        <Empty icon="wallet-outline" title={seesOthers ? 'No budgets yet' : 'No budget for this year yet'} text={canCreate ? 'Use Create budget to start one.' : 'Budgets appear here once departments submit them.'} />
      ) : shown.map(b => {
        const toReview = b.status === 'Submitted' && me?.reviewer_tracks.includes(b.track);
        return (
          <Pressable key={b.id} onPress={() => setOpen(b.id)} accessibilityRole="button"
            style={({ pressed }) => ({ padding: 14, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: toReview ? C.warning : C.border, backgroundColor: pressed ? C.bg : C.surface })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{b.department_name}</Text>
              <Chip label={toReview ? 'To review' : b.status} tone={toReview ? 'warn' : STATUS_TONE[b.status] ?? 'neutral'} />
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </View>
            <Body small soft>{b.academic_year_name}, {TRACK[b.track]}. {b.item_count} lines, {money(b.total_amount)}{b.submitted_at ? `. Submitted ${day(b.submitted_at)}` : ''}</Body>
          </Pressable>
        );
      })}
    </Screen>
  );
}

function NewBudget({ owners, years, me, onCancel, onCreated }: { owners: Owner[]; years: Year[]; me: Me; onCancel: () => void; onCreated: (id: string) => void }) {
  const OTHER = '__other__';
  const [owner, setOwner] = useState(owners.length === 1 ? `${owners[0].kind ?? 'department'}:${owners[0].id}` : '');
  const [year, setYear] = useState((years.find(y => y.is_current) ?? years[0])?.id ?? '');
  const [name, setName] = useState('');
  const tracks: Track[] = me.is_admin ? ['academic', 'administration'] : me.reviewer_tracks;
  const [track, setTrack] = useState<Track>(tracks[0] ?? 'academic');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function create() {
    if (!year) { setErr('Choose an academic year.'); return; }
    let body: Record<string, string> = { academic_year_id: year };
    if (owner === OTHER) { if (!name.trim()) { setErr('Type the office name.'); return; } body = { ...body, custom_department_name: name.trim(), track }; }
    else { const [kind, id] = owner.split(':'); if (!id) { setErr('Choose a department or unit.'); return; } body = { ...body, [kind === 'unit' ? 'budget_unit_id' : 'department_id']: id }; }
    setBusy(true); setErr('');
    try { const { data } = await api.post<{ id: string }>('/api/department-budgets', body); onCreated(data.id); }
    catch (e) { setErr(errText(e, 'Could not create the budget.')); setBusy(false); }
  }
  return (
    <Screen>
      <Card>
        <Title>Create budget</Title>
        <Picker label="Department or unit" value={owner || null} onChange={setOwner} options={[
          ...owners.map(o => ({ key: `${o.kind ?? 'department'}:${o.id}`, label: o.name, sub: o.kind === 'unit' ? 'Unit' : 'Department' })),
          ...(me.can_create_custom ? [{ key: OTHER, label: 'Another office (type its name)' }] : []),
        ]} />
        <Picker label="Academic year" value={year || null} options={years.slice(0, 3).map(y => ({ key: y.id, label: y.name }))} onChange={setYear} />
        {owner === OTHER && <>
          <Field label="Office name" value={name} onChangeText={setName} placeholder="For example, the exam office" />
          {tracks.length > 1 && <ChoiceChips label="Goes to" value={track} onChange={setTrack} options={tracks.map(t => ({ key: t, label: TRACK[t] }))} />}
        </>}
        <Notice tone="bad" text={err || null} />
        <Row>
          <Button label="Create draft" grow busy={busy} onPress={create} />
          <Button label="Cancel" kind="secondary" grow onPress={onCancel} />
        </Row>
      </Card>
    </Screen>
  );
}

function BudgetDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const C = useTheme();
  const [b, setB] = useState<Detail | null>(null);
  const [rows, setRows] = useState<Row_[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [action, setAction] = useState<'accept' | 'changes' | 'reject' | 'reopen' | 'withdraw' | null>(null);
  const [note, setNote] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [calcFor, setCalcFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Detail>(`/api/department-budgets/${id}`);
      setB(data); setDirty(false);
      setRows(data.items.filter(i => !i.removed_at).map(i => ({
        key: i.id, id: i.id, category: i.category, description: i.description ?? '', quantity: String(Number(i.quantity)), unitPrice: i.unit_price != null ? String(Number(i.unit_price)) : '',
        requestedQuantity: num(i.requested_quantity), requestedUnitPrice: num(i.requested_unit_price), addedStage: i.added_stage ?? 'owner',
      })));
    } catch (e) { setMsg({ text: errText(e, 'Could not open this budget.'), tone: 'bad' }); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const stage = b?.permissions?.editStage ?? null;
  const editable = !!stage; const accountant = stage === 'accountant';
  const total = useMemo(() => rows.reduce((s, r) => s + (rowAmount(r) ?? 0), 0), [rows]);
  const upd = (key: string, p: Partial<Row_>) => { setRows(rs => rs.map(r => (r.key === key ? { ...r, ...p } : r))); setDirty(true); };
  const addRow = (category = '', qty = '1') => { setRows(rs => [...rs, { key: `new-${Date.now()}`, id: null, category, description: '', quantity: qty, unitPrice: '', requestedQuantity: null, requestedUnitPrice: null, addedStage: stage ?? 'owner' }]); setDirty(true); };

  async function save(): Promise<boolean> {
    if (!b) return false;
    setBusy('save'); setMsg(null);
    try {
      await api.put(`/api/department-budgets/${id}`, {
        items: rows.filter(r => r.category.trim()).map(r => ({ id: r.id ?? undefined, category: r.category.trim(), description: r.description.trim() || undefined,
          quantity: parseFloat(r.quantity) || 0, unit_price: r.unitPrice.trim() ? parseFloat(r.unitPrice) : undefined })),
        updated_at: b.updated_at,
      });
      await load(); setMsg({ text: 'Changes saved.', tone: 'ok' }); return true;
    } catch (e) { setMsg({ text: errText(e, 'Could not save.'), tone: 'bad' }); return false; }
    finally { setBusy(null); }
  }
  async function submit() {
    if (dirty && !(await save())) return;
    setBusy('submit');
    try { await api.post(`/api/department-budgets/${id}/submit`); await load(); setMsg({ text: 'Budget submitted for review.', tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not submit.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function runAction() {
    if (!action) return;
    if ((action === 'changes' || action === 'reject') && !note.trim()) { setMsg({ text: action === 'changes' ? 'Say what needs to change.' : 'Give the reason.', tone: 'bad' }); return; }
    if (dirty && action === 'accept' && !(await save())) return;
    const ep = { accept: 'accept', changes: 'request-changes', reject: 'reject', reopen: 'reopen', withdraw: 'withdraw' }[action];
    setBusy('action');
    try { await api.post(`/api/department-budgets/${id}/${ep}`, { note: note.trim() || undefined }); setAction(null); setNote(''); await load(); }
    catch (e) { setMsg({ text: errText(e, 'That did not work.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function del() {
    setBusy('delete');
    try { await api.delete(`/api/department-budgets/${id}`); onBack(); } catch (e) { setMsg({ text: errText(e, 'Could not delete this draft.'), tone: 'bad' }); setBusy(null); }
  }
  async function pdf() {
    setBusy('pdf');
    const e = await downloadAndShare(`/api/department-budgets/${id}/pdf`, `Budget_${(b?.department_name ?? 'budget').replace(/[^\w]+/g, '_')}.pdf`, 'application/pdf');
    if (e) setMsg({ text: e, tone: 'bad' });
    setBusy(null);
  }

  if (!b) return <Screen><Button label="All budgets" kind="quiet" icon="chevron-back" onPress={onBack} style={{ alignSelf: 'flex-start' }} />{msg ? <Notice tone="bad" text={msg.text} /> : <Loading />}</Screen>;
  const p = b.permissions;
  const removed = b.items.filter(i => i.removed_at);
  const reqTotal = Number(b.requested_total ?? 0);
  const calcRow = rows.find(r => r.key === calcFor);
  if (calcRow) return <Calculator itemName={calcRow.category} onClose={() => setCalcFor(null)} onApply={q => { upd(calcRow.key, { quantity: String(q) }); setCalcFor(null); }} />;

  return (
    <Screen>
      <Button label="All budgets" kind="quiet" icon="chevron-back" onPress={onBack} style={{ alignSelf: 'flex-start' }} />
      <View style={{ gap: 4 }}>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{b.department_name}</Text>
        <Body small soft>{b.academic_year_name} budget, {TRACK[b.track]}</Body>
        <Row><Chip label={b.status} tone={STATUS_TONE[b.status] ?? 'neutral'} /></Row>
      </View>
      <Row>
        <Button label="Share PDF" kind="secondary" icon="share-outline" busy={busy === 'pdf'} onPress={pdf} />
        {p?.canDelete && !confirmDel && <Button label="Delete draft" kind="quiet" onPress={() => setConfirmDel(true)} />}
      </Row>
      {confirmDel && <InlineConfirm question="Delete this draft budget?" confirmLabel="Delete" busy={busy === 'delete'} onConfirm={del} onCancel={() => setConfirmDel(false)} />}
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {!!b.review_note && (b.status === 'Changes Requested' || b.status === 'Rejected') && (
        <Card accent={b.status === 'Rejected' ? C.danger : C.warning}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{b.status === 'Rejected' ? 'Reason for rejecting' : 'Changes asked for'}</Text>
          <Body>{b.review_note}</Body>
          {!!b.reviewed_by_name && <Body small soft>{b.reviewed_by_name}, {day(b.reviewed_at, true)}</Body>}
        </Card>
      )}
      {(b.status === 'Accepted' || b.status === 'Approved') && <Notice tone="ok" text={`Accepted into the ${TRACK[b.track]} budget${b.reviewed_by_name ? ` by ${b.reviewed_by_name}` : ''}${b.reviewed_at ? ` on ${day(b.reviewed_at)}` : ''}.`} />}
      {b.school_budget_status === 'Final' && <Body small soft>The school budget for this year is final, so this budget is locked.</Body>}
      {stage === 'reviewer' && <Body small soft>You are reviewing this budget. The department sees your changes against what they asked for.</Body>}
      {accountant && <Body small soft>You can change quantities and prices or remove lines.</Body>}

      <Card>
        <Title>Lines</Title>
        {editable ? (
          <>
            {rows.length === 0 && <Body soft>No lines yet. Add what this budget needs.</Body>}
            {rows.map(r => {
              const n = requestedNote(r, parseFloat(r.quantity) || 0, r.unitPrice.trim() ? parseFloat(r.unitPrice) : null);
              return (
                <View key={r.key} style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
                  <Field label="Item" value={r.category} editable={!accountant} onChangeText={v => upd(r.key, { category: v })} placeholder="For example, answer booklets" />
                  <Field label="Description (optional)" value={r.description} editable={!accountant} onChangeText={v => upd(r.key, { description: v })} />
                  <Row>
                    <View style={{ flex: 1, minWidth: 100 }}><Field label="Quantity" value={r.quantity} keyboardType="decimal-pad" onChangeText={v => upd(r.key, { quantity: v })} /></View>
                    <View style={{ flex: 1, minWidth: 100 }}><Field label="Unit price (GH₵)" value={r.unitPrice} keyboardType="decimal-pad" onChangeText={v => upd(r.key, { unitPrice: v })} /></View>
                  </Row>
                  <Row style={{ alignItems: 'center' }}>
                    <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{money(rowAmount(r))}</Text>
                    {!accountant && <Button label="Calculate" kind="quiet" icon="calculator-outline" onPress={() => setCalcFor(r.key)} />}
                    <Button label="Remove" kind="quiet" onPress={() => { setRows(rs => rs.filter(x => x.key !== r.key)); setDirty(true); }} />
                  </Row>
                  {!!n && <Body small style={{ color: C.warning }}>{n}</Body>}
                </View>
              );
            })}
            {!accountant && <Button label="Add a line" kind="secondary" icon="add" onPress={() => addRow()} />}
            {!accountant && <Body small soft>To work out a whole exam's booklets at once, use Calculate whole exam on the web.</Body>}
          </>
        ) : (
          b.items.filter(i => !i.removed_at).length === 0 ? <Body soft>This budget has no lines.</Body> : b.items.filter(i => !i.removed_at).map(i => {
            const n = requestedNote({ requestedQuantity: num(i.requested_quantity), requestedUnitPrice: num(i.requested_unit_price), addedStage: i.added_stage ?? 'owner' }, Number(i.quantity), num(i.unit_price));
            return (
              <View key={i.id} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderColor: C.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{i.category}</Text>
                  {!!i.description && <Body small soft>{i.description}</Body>}
                  <Body small soft>{Number(i.quantity)}{i.unit_price != null ? ` at ${money(i.unit_price)}` : ''}</Body>
                  {!!n && <Body small style={{ color: C.warning }}>{n}</Body>}
                </View>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{money(i.amount)}</Text>
              </View>
            );
          })
        )}
        <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: C.border, paddingTop: 8 }}>
          <Text style={{ color: C.textSoft, fontSize: 15, fontWeight: '700' }}>Total</Text>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>{money(editable ? total : b.total_amount)}</Text>
        </Row>
        {reqTotal > 0 && Math.abs(reqTotal - Number(b.total_amount)) > 0.005 && <Body small soft>First asked for: {money(reqTotal)}</Body>}
      </Card>

      {removed.length > 0 && (
        <Card>
          <Title>Removed at review</Title>
          {removed.map(i => (
            <Row key={i.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}><Text style={{ color: C.muted, fontSize: 14, textDecorationLine: 'line-through' }}>{i.category}</Text><Body small soft>Removed by the {STAGE[i.removed_stage ?? ''] ?? 'reviewer'}</Body></View>
              <Text style={{ color: C.muted, fontSize: 14, textDecorationLine: 'line-through' }}>{money(i.amount)}</Text>
            </Row>
          ))}
        </Card>
      )}

      {action ? (
        <Card>
          <Title>{{ accept: `Accept into the ${TRACK[b.track]} budget`, changes: 'Send back for changes', reject: 'Reject budget', reopen: 'Reopen for review', withdraw: 'Withdraw submission' }[action]}</Title>
          {action === 'accept' && <Body small soft>It is added to the {TRACK[b.track]} budget as it stands{dirty ? ', with your unsaved changes' : ''}. You can reopen it until that budget goes to the Head.</Body>}
          <Field label={action === 'changes' ? 'What needs to change' : action === 'reject' ? 'Reason for rejecting' : 'Note (optional)'} value={note} onChangeText={setNote} multiline />
          <Row>
            <Button label="Confirm" kind={action === 'reject' ? 'danger' : 'primary'} grow busy={busy === 'action'} onPress={runAction} />
            <Button label="Cancel" kind="secondary" grow onPress={() => setAction(null)} />
          </Row>
        </Card>
      ) : (editable || p?.canSubmit || p?.canWithdraw || p?.canReview || p?.canReopen) && (
        <View style={{ gap: 8 }}>
          {editable && <Button label={dirty ? 'Save changes' : 'Saved'} kind="secondary" busy={busy === 'save'} disabled={!dirty} onPress={save} />}
          {p?.canSubmit && <Button label="Submit for review" busy={busy === 'submit'} disabled={rows.filter(r => r.category.trim()).length === 0} onPress={submit} />}
          {p?.canWithdraw && <Button label="Withdraw submission" kind="secondary" onPress={() => { setAction('withdraw'); setNote(''); }} />}
          {p?.canReopen && <Button label="Reopen for review" kind="secondary" onPress={() => { setAction('reopen'); setNote(''); }} />}
          {p?.canReview && (
            <Row>
              <Button label="Accept" grow onPress={() => { setAction('accept'); setNote(''); }} />
              <Button label="Send back" kind="secondary" grow onPress={() => { setAction('changes'); setNote(''); }} />
              <Button label="Reject" kind="danger" grow onPress={() => { setAction('reject'); setNote(''); }} />
            </Row>
          )}
        </View>
      )}

      {!!b.events?.length && (
        <Card>
          <Title>History</Title>
          {b.events.map(ev => (
            <View key={ev.id} style={{ gap: 2, paddingVertical: 4 }}>
              <Body>{EVENTS[ev.action] ?? ev.action}</Body>
              <Body small soft>By {ev.actor_label || 'someone'}, {day(ev.created_at, true)}</Body>
              {!!ev.note && <Body small>{ev.note}</Body>}
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

// Works out a quantity from how many students, teachers or subjects there are.
type Basis = 'all_students' | 'class_level' | 'all_teachers' | 'department' | 'subjects_school' | 'subjects_class' | 'subjects_class_level';
const BASES: { key: Basis; label: string }[] = [
  { key: 'all_students', label: 'All students' }, { key: 'class_level', label: 'Students in a class level' },
  { key: 'all_teachers', label: 'All teachers' }, { key: 'department', label: 'Teachers in a department' },
  { key: 'subjects_school', label: 'Subjects in the school' }, { key: 'subjects_class', label: 'Subjects in a class' },
  { key: 'subjects_class_level', label: 'Subjects in a class level' },
];
function Calculator({ itemName, onApply, onClose }: { itemName: string; onApply: (q: number) => void; onClose: () => void }) {
  const C = useTheme();
  const [levels, setLevels] = useState<{ id: string; name: string }[]>([]);
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [basis, setBasis] = useState<Basis>('all_students');
  const [level, setLevel] = useState(''); const [dept, setDept] = useState(''); const [cls, setCls] = useState('');
  const [mode, setMode] = useState<'ratio' | 'print_job'>('ratio');
  const [ratio, setRatio] = useState('1'); const [buffer, setBuffer] = useState('0');
  const [pages, setPages] = useState(''); const [both, setBoth] = useState(true); const [ream, setReam] = useState('500');
  const [pop, setPop] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    api.get('/api/class-levels').then(r => setLevels(r.data ?? [])).catch(() => {});
    api.get('/api/department-budgets/departments-all').then(r => setDepts(r.data ?? [])).catch(() => {});
    api.get('/api/classes').then(r => setClasses(r.data ?? [])).catch(() => {});
    if (itemName.trim()) api.get('/api/department-budgets/formulas', { params: { item_name: itemName.trim() } }).then(r => {
      const f = r.data; if (!f || !BASES.some(b => b.key === f.population_basis)) return;
      setBasis(f.population_basis); setLevel(f.class_level_id || ''); setDept(f.department_id || ''); setCls(f.class_id || '');
      setRatio(String(f.ratio)); setBuffer(String(f.buffer_pct)); setMode(f.calc_mode === 'print_job' ? 'print_job' : 'ratio');
      setPages(f.pages_per_paper != null ? String(f.pages_per_paper) : ''); setBoth(f.double_sided ?? true); if (f.sheets_per_unit != null) setReam(String(f.sheets_per_unit));
    }).catch(() => {});
  }, [itemName]);
  useEffect(() => {
    const needLevel = basis === 'class_level' || basis === 'subjects_class_level';
    if ((needLevel && !level) || (basis === 'department' && !dept) || (basis === 'subjects_class' && !cls)) { setPop(null); return; }
    setLoading(true);
    api.get<{ count: number }>('/api/department-budgets/population', { params: { basis, ...(needLevel ? { class_level_id: level } : {}), ...(basis === 'department' ? { department_id: dept } : {}), ...(basis === 'subjects_class' ? { class_id: cls } : {}) } })
      .then(r => setPop(r.data.count)).catch(() => setPop(null)).finally(() => setLoading(false));
  }, [basis, level, dept, cls]);
  const perPerson = mode === 'print_job' ? Math.ceil((parseFloat(pages) || 0) / (both ? 2 : 1)) : parseFloat(ratio) || 0;
  const raw = pop != null && perPerson > 0 ? perPerson * pop * (1 + (parseFloat(buffer) || 0) / 100) : null;
  const qty = raw == null ? null : mode === 'print_job' ? ((parseFloat(ream) || 0) > 0 ? Math.ceil(raw / parseFloat(ream)) : null) : Math.ceil(raw);
  return (
    <Screen>
      <Button label="Back to the budget" kind="quiet" icon="chevron-back" onPress={onClose} style={{ alignSelf: 'flex-start' }} />
      <Title sub={itemName || undefined}>Work out the quantity</Title>
      <Card>
        <Picker label="Based on" value={basis} options={BASES} onChange={setBasis} />
        {(basis === 'class_level' || basis === 'subjects_class_level') && <Picker label="Class level" value={level || null} options={levels.map(l => ({ key: l.id, label: l.name }))} onChange={setLevel} />}
        {basis === 'department' && <Picker label="Department" value={dept || null} options={depts.map(d => ({ key: d.id, label: d.name }))} onChange={setDept} />}
        {basis === 'subjects_class' && <Picker label="Class" value={cls || null} searchable options={classes.map(c => ({ key: c.id, label: c.name }))} onChange={setCls} />}
        <Body>{loading ? 'Counting…' : pop == null ? 'Choose the group to count.' : `${pop} counted.`}</Body>
      </Card>
      <Card>
        <ChoiceChips label="How" value={mode} onChange={setMode} options={[{ key: 'ratio', label: 'So many each' }, { key: 'print_job', label: 'Printing paper' }]} />
        {mode === 'ratio' ? <Field label="How many each" value={ratio} keyboardType="decimal-pad" onChangeText={setRatio} /> : <>
          <Field label="Pages per paper" value={pages} keyboardType="number-pad" onChangeText={setPages} />
          <ChoiceChips value={both ? 'both' : 'one'} onChange={v => setBoth(v === 'both')} options={[{ key: 'both', label: 'Both sides' }, { key: 'one', label: 'One side' }]} />
          <Field label="Sheets in a ream or pack" value={ream} keyboardType="number-pad" onChangeText={setReam} />
        </>}
        <Field label="Extra for spoilage (%)" value={buffer} keyboardType="decimal-pad" onChangeText={setBuffer} />
      </Card>
      <Card>
        <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '700' }}>Quantity</Text>
        <Text style={{ color: C.text, fontSize: 32, fontWeight: '800' }}>{qty ?? '-'}</Text>
        {mode === 'print_job' && qty != null && <Body small soft>Reams or packs</Body>}
        <Button label="Use this quantity" disabled={qty == null} onPress={() => qty != null && onApply(qty)} />
      </Card>
    </Screen>
  );
}
