'use client';

import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';

const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';
const cardCls  = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden';

function fmtGHS(n: number | string) {
  return `GH₵ ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface FeeItem { id: string; name: string; description: string | null; is_active: boolean; }
interface Schedule {
  id: string; fee_item_id: string; fee_item_name: string; academic_year_id: string | null;
  academic_year_name: string | null; semester: number | null; class_name: string | null;
  student_ids: string[] | null; amount: string; due_date: string | null;
}
interface AcademicYear { id: string; name: string; is_current: boolean; }
interface Expense {
  id: string; category: string; description: string; amount: string; expense_date: string;
  payment_method: string; paid_to: string | null; reference: string | null; notes: string | null;
}
interface ArrearRow {
  student_id: string; student_name: string; student_code: string; class_name: string;
  total_billed: string; total_paid: string; outstanding: string;
}
interface MissingBillGroup {
  schedule_id: string; fee_item_name: string; class_name: string | null;
  amount: string; missing_count: number; missing_students: { id: string; name: string }[];
}
interface UnscheduledGroup {
  fee_item_id: string; fee_item_name: string; description: string; amount: string; due_date: string | null;
  student_count: number; paid_count: number; unpaid_count: number; unpaid_total: string;
}
interface NeedsReviewRow {
  bill_id: string; student_name: string; student_code: string; fee_item_name: string | null;
  billed_amount: string; billed_due_date: string | null; current_amount: string; current_due_date: string | null;
  amount_paid: string;
}

const EXPENSE_CATEGORIES = [
  'Salaries & Wages', 'Utilities', 'Stationery & Supplies',
  'Maintenance & Repairs', 'Transport & Fuel', 'Food & Catering',
  'Medical & Health', 'Printing & Copying', 'Sports & Activities',
  'Petty Cash', 'Other',
];

export function AccountsFullTabs({
  tab, api, primary,
}: {
  tab: 'fee-items' | 'schedules' | 'expenditure' | 'arrears' | 'maintenance';
  api: AxiosInstance; primary: string;
}) {
  if (tab === 'fee-items')  return <FeeItemsTab api={api} primary={primary} />;
  if (tab === 'schedules')  return <SchedulesTab api={api} primary={primary} />;
  if (tab === 'expenditure') return <ExpenditureTab api={api} primary={primary} />;
  if (tab === 'arrears')    return <ArrearsTab api={api} primary={primary} />;
  return <MaintenanceTab api={api} primary={primary} />;
}

// ── Fee Items ───────────────────────────────────────────────────────────────
function FeeItemsTab({ api, primary }: { api: AxiosInstance; primary: string }) {
  const [items, setItems] = useState<FeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', description: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api.get<FeeItem[]>('/api/fees/items').then(r => setItems(r.data)).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditingId('new'); setForm({ name: '', description: '', is_active: true }); setError(''); }
  function openEdit(i: FeeItem) { setEditingId(i.id); setForm({ name: i.name, description: i.description ?? '', is_active: i.is_active }); setError(''); }

  async function save() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (editingId === 'new') await api.post('/api/fees/items', form);
      else await api.put(`/api/fees/items/${editingId}`, form);
      setEditingId(null); load();
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to save.'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this fee item?')) return;
    try { await api.delete(`/api/fees/items/${id}`); load(); }
    catch (e: any) { alert(e?.response?.data?.error ?? 'Failed to delete.'); }
  }

  return (
    <div className="space-y-4">
      <button onClick={openNew} className="py-2.5 px-4 rounded-xl text-sm font-semibold text-white" style={{ background: primary }}>+ Add Fee Item</button>

      {editingId && (
        <div className={`${cardCls} p-4 space-y-3`}>
          <input className={inputCls} placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className={inputCls} placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          {editingId !== 'new' && (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Active
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setEditingId(null)} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      <div className={cardCls}>
        {loading ? <p className="p-5 text-center text-slate-400 text-sm">Loading…</p> : items.length === 0 ? (
          <p className="p-5 text-center text-slate-400 text-sm">No fee items yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {items.map(i => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{i.name}{!i.is_active && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}</p>
                  {i.description && <p className="text-xs text-slate-400">{i.description}</p>}
                </div>
                <button onClick={() => openEdit(i)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0">Edit</button>
                <button onClick={() => remove(i.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Schedules ───────────────────────────────────────────────────────────────
function SchedulesTab({ api, primary }: { api: AxiosInstance; primary: string }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [items, setItems] = useState<FeeItem[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fee_item_id: '', academic_year_id: '', semester: '', class_name: '', amount: '', due_date: '' });
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<any[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [genMsg, setGenMsg] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      api.get<Schedule[]>('/api/fees/schedules'),
      api.get<FeeItem[]>('/api/fees/items'),
      api.get<AcademicYear[]>('/api/academic-years'),
    ]).then(([s, i, y]) => { setSchedules(s.data); setItems(i.data); setYears(y.data); })
      .catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function submit(confirmDuplicate = false) {
    if (!form.fee_item_id) { setError('Select a fee item.'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter a valid amount.'); return; }
    setSaving(true); setError(''); setConflict(null);
    try {
      await api.post('/api/fees/schedules', {
        ...form, semester: form.semester ? Number(form.semester) : null,
        academic_year_id: form.academic_year_id || null,
        confirm_duplicate: confirmDuplicate,
      });
      setAdding(false); setForm({ fee_item_id: '', academic_year_id: '', semester: '', class_name: '', amount: '', due_date: '' });
      load();
    } catch (e: any) {
      if (e?.response?.status === 409) { setConflict(e.response.data.conflicting_schedules); setError(e.response.data.message); }
      else setError(e?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this schedule?')) return;
    try { await api.delete(`/api/fees/schedules/${id}`); load(); }
    catch (e: any) { alert(e?.response?.data?.error ?? 'Failed to delete.'); }
  }

  async function generate(id: string) {
    setGenerating(id);
    try {
      const r = await api.post(`/api/fees/schedules/${id}/generate`);
      setGenMsg(m => ({ ...m, [id]: (r.data as { message: string }).message }));
    } catch (e: any) { setGenMsg(m => ({ ...m, [id]: e?.response?.data?.error ?? 'Failed to generate.' })); }
    finally { setGenerating(null); }
  }

  return (
    <div className="space-y-4">
      <button onClick={() => { setAdding(true); setError(''); setConflict(null); }} className="py-2.5 px-4 rounded-xl text-sm font-semibold text-white" style={{ background: primary }}>+ New Schedule</button>

      {adding && (
        <div className={`${cardCls} p-4 space-y-3`}>
          <select className={inputCls} value={form.fee_item_id} onChange={e => setForm(f => ({ ...f, fee_item_id: e.target.value }))}>
            <option value="">— Select fee item —</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input className={inputCls} placeholder="Class name (blank = whole school)" value={form.class_name} onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={form.academic_year_id} onChange={e => setForm(f => ({ ...f, academic_year_id: e.target.value }))}>
              <option value="">Any Year</option>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
            <select className={inputCls} value={form.semester} onChange={e => setForm(f => ({ ...f, semester: e.target.value }))}>
              <option value="">Any Semester</option>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
          <input type="number" min="0" step="0.01" className={inputCls} placeholder="Amount (GH₵)" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          <input type="date" className={inputCls} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Cancel</button>
            {conflict ? (
              <button onClick={() => submit(true)} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 bg-amber-600">{saving ? 'Saving…' : 'Create Anyway'}</button>
            ) : (
              <button onClick={() => submit(false)} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>{saving ? 'Saving…' : 'Save'}</button>
            )}
          </div>
        </div>
      )}

      <div className={cardCls}>
        {loading ? <p className="p-5 text-center text-slate-400 text-sm">Loading…</p> : schedules.length === 0 ? (
          <p className="p-5 text-center text-slate-400 text-sm">No schedules yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {schedules.map(s => (
              <div key={s.id} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{s.fee_item_name}</p>
                    <p className="text-xs text-slate-400">
                      {s.student_ids?.length ? `${s.student_ids.length} hand-picked student(s)` : s.class_name ?? 'Whole school'}
                      {s.academic_year_name ? ` · ${s.academic_year_name}` : ''}{s.semester ? ` · Sem ${s.semester}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-slate-800 dark:text-white shrink-0">{fmtGHS(s.amount)}</span>
                  <button onClick={() => generate(s.id)} disabled={generating === s.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white shrink-0 disabled:opacity-50" style={{ background: primary }}>
                    {generating === s.id ? '…' : 'Generate Bills'}
                  </button>
                  <button onClick={() => remove(s.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0">Delete</button>
                </div>
                {genMsg[s.id] && <p className="text-xs text-slate-500 dark:text-slate-400">{genMsg[s.id]}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Expenditure ──────────────────────────────────────────────────────────────
function ExpenditureTab({ api, primary }: { api: AxiosInstance; primary: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const empty = { category: EXPENSE_CATEGORIES[0], description: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), payment_method: 'Cash', paid_to: '', reference: '', notes: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    api.get<Expense[]>('/api/fees/expenses').then(r => setExpenses(r.data)).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!form.description.trim()) { setError('Description is required.'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter a valid amount.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/fees/expenses', form);
      setAdding(false); setForm(empty); load();
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to save.'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this expense?')) return;
    try { await api.delete(`/api/fees/expenses/${id}`); load(); }
    catch { alert('Failed to delete.'); }
  }

  return (
    <div className="space-y-4">
      <button onClick={() => { setAdding(true); setError(''); }} className="py-2.5 px-4 rounded-xl text-sm font-semibold text-white" style={{ background: primary }}>+ Add Expense</button>

      {adding && (
        <div className={`${cardCls} p-4 space-y-3`}>
          <select className={inputCls} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className={inputCls} placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <input type="number" min="0" step="0.01" className={inputCls} placeholder="Amount (GH₵)" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          <input type="date" className={inputCls} value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
          <input className={inputCls} placeholder="Paid to (optional)" value={form.paid_to} onChange={e => setForm(f => ({ ...f, paid_to: e.target.value }))} />
          <input className={inputCls} placeholder="Reference (optional)" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Cancel</button>
            <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      <div className={cardCls}>
        {loading ? <p className="p-5 text-center text-slate-400 text-sm">Loading…</p> : expenses.length === 0 ? (
          <p className="p-5 text-center text-slate-400 text-sm">No expenses recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {expenses.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{e.description}</p>
                  <p className="text-xs text-slate-400">{e.category} · {e.expense_date?.slice(0, 10)}{e.paid_to ? ` · ${e.paid_to}` : ''}</p>
                </div>
                <span className="text-sm font-bold text-red-600 dark:text-red-400 shrink-0">{fmtGHS(e.amount)}</span>
                <button onClick={() => remove(e.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Arrears ─────────────────────────────────────────────────────────────────
function ArrearsTab({ api, primary }: { api: AxiosInstance; primary: string }) {
  const [rows, setRows] = useState<ArrearRow[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [semester, setSemester] = useState('');
  const [className, setClassName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get<AcademicYear[]>('/api/academic-years').then(r => setYears(r.data)).catch(() => {}); }, []);

  function load() {
    setLoading(true);
    api.get<ArrearRow[]>('/api/fees/reports/arrears', { params: { year_id: yearId || undefined, semester: semester || undefined, class_name: className || undefined } })
      .then(r => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [yearId, semester, className]);

  const total = rows.reduce((s, r) => s + Number(r.outstanding), 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <select className={`${inputCls} w-auto`} value={yearId} onChange={e => setYearId(e.target.value)}>
          <option value="">All Years</option>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select className={`${inputCls} w-auto`} value={semester} onChange={e => setSemester(e.target.value)}>
          <option value="">Any Semester</option>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>
        <input className={`${inputCls} w-auto`} placeholder="Class (optional)" value={className} onChange={e => setClassName(e.target.value)} />
      </div>

      <div className="bg-[#F5F0E8] dark:bg-slate-700/50 rounded-xl px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm text-slate-600 dark:text-slate-300">Total Outstanding</span>
        <span className="font-bold text-red-600 dark:text-red-400">{fmtGHS(total)}</span>
      </div>

      <div className={cardCls}>
        {loading ? <p className="p-5 text-center text-slate-400 text-sm">Loading…</p> : rows.length === 0 ? (
          <p className="p-5 text-center text-slate-400 text-sm">No outstanding balances.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.map(r => (
              <div key={r.student_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{r.student_name}</p>
                  <p className="text-xs text-slate-400">{r.student_code} · {r.class_name}</p>
                </div>
                <span className="text-sm font-bold text-red-600 dark:text-red-400 shrink-0">{fmtGHS(r.outstanding)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Maintenance (Missing Bills / Unscheduled Cleanup / Needs Review) ────────
function MaintenanceTab({ api, primary }: { api: AxiosInstance; primary: string }) {
  const [missing, setMissing] = useState<MissingBillGroup[]>([]);
  const [unscheduled, setUnscheduled] = useState<UnscheduledGroup[]>([]);
  const [needsReview, setNeedsReview] = useState<NeedsReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      api.get<MissingBillGroup[]>('/api/fees/schedules/missing-bills'),
      api.get<UnscheduledGroup[]>('/api/fees/bills/unscheduled-groups'),
      api.get<NeedsReviewRow[]>('/api/fees/bills/needs-review'),
    ]).then(([m, u, n]) => { setMissing(m.data); setUnscheduled(u.data); setNeedsReview(n.data); })
      .catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function generateMissing(scheduleId: string) {
    setBusy(scheduleId);
    try { await api.post(`/api/fees/schedules/${scheduleId}/generate`); load(); }
    catch (e: any) { alert(e?.response?.data?.error ?? 'Failed to generate.'); }
    finally { setBusy(null); }
  }

  async function cleanupGroup(g: UnscheduledGroup) {
    if (!confirm(`Delete ${g.unpaid_count} unpaid bill(s) for "${g.description}"?`)) return;
    setBusy(g.fee_item_id + g.description);
    try {
      await api.delete('/api/fees/bills/unscheduled-groups', { data: { fee_item_id: g.fee_item_id, description: g.description, amount: g.amount, due_date: g.due_date } });
      load();
    } catch (e: any) { alert(e?.response?.data?.error ?? 'Failed to clean up.'); }
    finally { setBusy(null); }
  }

  async function syncBill(billId: string) {
    setBusy(billId);
    try { await api.put(`/api/fees/bills/${billId}/sync-to-schedule`); load(); }
    catch (e: any) { alert(e?.response?.data?.error ?? 'Failed to sync.'); }
    finally { setBusy(null); }
  }

  if (loading) return <p className="text-sm text-slate-500 p-5 text-center">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Missing Bills</h3>
        <div className={cardCls}>
          {missing.length === 0 ? <p className="p-5 text-center text-slate-400 text-sm">Nothing missing.</p> : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {missing.map(m => (
                <div key={m.schedule_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{m.fee_item_name}{m.class_name ? ` · ${m.class_name}` : ''}</p>
                    <p className="text-xs text-amber-600">{m.missing_count} student(s) missing a bill</p>
                  </div>
                  <button onClick={() => generateMissing(m.schedule_id)} disabled={busy === m.schedule_id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white shrink-0 disabled:opacity-50" style={{ background: primary }}>
                    {busy === m.schedule_id ? '…' : 'Generate'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Unscheduled Bill Cleanup</h3>
        <div className={cardCls}>
          {unscheduled.length === 0 ? <p className="p-5 text-center text-slate-400 text-sm">Nothing to clean up.</p> : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {unscheduled.map(g => (
                <div key={g.fee_item_id + g.description} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{g.description}</p>
                    <p className="text-xs text-slate-400">{g.student_count} student(s) · {g.unpaid_count} unpaid ({fmtGHS(g.unpaid_total)})</p>
                  </div>
                  <button onClick={() => cleanupGroup(g)} disabled={busy === g.fee_item_id + g.description || g.unpaid_count === 0}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 shrink-0 disabled:opacity-50">
                    {busy === g.fee_item_id + g.description ? '…' : 'Delete Unpaid'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Needs Review</h3>
        <div className={cardCls}>
          {needsReview.length === 0 ? <p className="p-5 text-center text-slate-400 text-sm">Nothing needs review.</p> : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {needsReview.map(r => (
                <div key={r.bill_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{r.student_name} <span className="text-slate-400 font-normal">· {r.student_code}</span></p>
                    <p className="text-xs text-slate-400">Billed {fmtGHS(r.billed_amount)} · Schedule now {fmtGHS(r.current_amount)} · Paid {fmtGHS(r.amount_paid)}</p>
                  </div>
                  <button onClick={() => syncBill(r.bill_id)} disabled={busy === r.bill_id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white shrink-0 disabled:opacity-50" style={{ background: primary }}>
                    {busy === r.bill_id ? '…' : 'Sync to Schedule'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
