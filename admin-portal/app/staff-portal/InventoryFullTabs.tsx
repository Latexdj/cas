'use client';

import { useEffect, useRef, useState } from 'react';
import type { AxiosInstance } from 'axios';

const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';
const cardCls  = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden';

interface Category { id: string; name: string; description: string | null; item_count: number; }
interface Department { id: string; name: string; }
interface FullItem {
  id: string; name: string; item_type: string; category_id: string | null; category_name: string | null;
  description: string | null; serial_number: string | null; asset_tag: string | null;
  quantity_total: number; quantity_available: number; condition: string; location: string | null;
  acquired_date: string | null; notes: string | null; ownership_type: 'general' | 'departmental'; department_id: string | null;
  is_returnable: boolean;
}
interface Transaction {
  id: string; type: string; quantity: number; item_name: string; item_type: string; ownership_type: string;
  issued_to_name: string | null; notes: string | null; performed_by_name: string | null; created_at: string;
}
interface ReportSummaryRow {
  ownership_type: string; department_name: string | null; item_count: number; total_units: number;
  available_units: number; units_issued: number; good_count: number; damaged_count: number; written_off_count: number;
}

export function InventoryFullTabs({
  tab, api, primary, onItemsChanged,
}: {
  tab: 'manage-items' | 'categories' | 'log' | 'report';
  api: AxiosInstance; primary: string; onItemsChanged: () => void;
}) {
  if (tab === 'manage-items') return <ManageItemsTab api={api} primary={primary} onItemsChanged={onItemsChanged} />;
  if (tab === 'categories')   return <CategoriesTab api={api} primary={primary} />;
  if (tab === 'log')          return <TransactionLogTab api={api} />;
  return <ReportTab api={api} />;
}

const ITEM_TYPES = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'book',      label: 'Book' },
  { value: 'asset',     label: 'Asset' },
];

// ownership_value is 'general' or a department id — one select, so an item
// can never be saved as departmental without a department.
const emptyItem = {
  name: '', item_type: 'equipment', category_id: '', description: '', serial_number: '',
  asset_tag: '', quantity: '1', condition: 'Good', location: '', acquired_date: '', notes: '',
  ownership_value: 'general', is_returnable: false,
};

const labelCls = 'text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1';

// ── Manage Items (full CRUD) ─────────────────────────────────────────────────
function ManageItemsTab({ api, primary, onItemsChanged }: { api: AxiosInstance; primary: string; onItemsChanged: () => void }) {
  const [items, setItems] = useState<FullItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<FullItem | null>(null);
  const [form, setForm] = useState(emptyItem);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  function load() {
    setLoading(true);
    Promise.all([
      api.get<FullItem[]>('/api/inventory/items'),
      api.get<Category[]>('/api/inventory/categories'),
      api.get<Department[]>('/api/inventory/departments'),
    ]).then(([i, c, d]) => { setItems(i.data); setCategories(c.data); setDepartments(d.data); })
      .catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  function scrollToForm() {
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function openNew() {
    setEditingId('new'); setEditingOriginal(null); setForm(emptyItem); setError('');
    scrollToForm();
  }
  function openEdit(i: FullItem) {
    setEditingId(i.id); setEditingOriginal(i);
    setForm({
      name: i.name, item_type: i.item_type, category_id: i.category_id ?? '', description: i.description ?? '',
      serial_number: i.serial_number ?? '', asset_tag: i.asset_tag ?? '', quantity: String(i.quantity_total),
      condition: i.condition, location: i.location ?? '',
      acquired_date: i.acquired_date ? i.acquired_date.slice(0, 10) : '', notes: i.notes ?? '',
      ownership_value: i.ownership_type === 'departmental' && i.department_id ? i.department_id : 'general',
      is_returnable: i.is_returnable,
    });
    setError('');
    scrollToForm();
  }

  async function save() {
    if (!form.name.trim()) { setError('Item name is required.'); return; }
    const qty = parseInt(form.quantity);
    if (editingId === 'new' && (!qty || qty < 1)) { setError('Quantity must be at least 1.'); return; }
    const conditionChanged = editingOriginal && form.condition !== editingOriginal.condition;
    if (conditionChanged && form.condition === 'Written Off'
      && !confirm('Writing off this item sets its available quantity to 0. Continue?')) return;

    setSaving(true); setError('');
    const isGeneral = form.ownership_value === 'general';
    const payload = {
      name: form.name, item_type: form.item_type, category_id: form.category_id || null,
      description: form.description, serial_number: form.serial_number, asset_tag: form.asset_tag,
      location: form.location, acquired_date: form.acquired_date || null, notes: form.notes,
      ownership_type: isGeneral ? 'general' : 'departmental',
      department_id: isGeneral ? null : form.ownership_value,
      is_returnable: form.is_returnable,
    };
    try {
      if (editingId === 'new') {
        await api.post('/api/inventory/items', { ...payload, quantity: qty, condition: form.condition });
      } else {
        await api.put(`/api/inventory/items/${editingId}`, payload);
        // The edit route doesn't touch condition — it has its own route
        // because Written Off also zeroes availability and logs a transaction.
        if (conditionChanged) {
          await api.post(`/api/inventory/items/${editingId}/condition`, { condition: form.condition });
        }
      }
      setEditingId(null); setEditingOriginal(null); load(); onItemsChanged();
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to save.'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this item? This cannot be undone.')) return;
    try { await api.delete(`/api/inventory/items/${id}`); load(); onItemsChanged(); }
    catch (e: any) { alert(e?.response?.data?.error ?? 'Failed to delete.'); }
  }

  return (
    <div className="space-y-4">
      <button onClick={openNew} className="py-2.5 px-4 rounded-xl text-sm font-semibold text-white" style={{ background: primary }}>+ Add Item</button>

      {editingId && (
        <div ref={formRef} className={`${cardCls} p-4 space-y-3 scroll-mt-4`}>
          <p className="text-sm font-bold text-slate-800 dark:text-white">
            {editingId === 'new' ? 'Add Item' : `Edit ${editingOriginal?.name ?? 'Item'}`}
          </p>

          <div>
            <label className={labelCls}>Name *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value }))}>
                {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                {!ITEM_TYPES.some(t => t.value === form.item_type) && (
                  <option value={form.item_type}>{form.item_type}</option>
                )}
              </select>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.is_returnable}
              onChange={e => setForm(f => ({ ...f, is_returnable: e.target.checked }))}
              className="w-4 h-4 mt-0.5 accent-[#145C44] rounded shrink-0" />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Returnable <span className="text-slate-400">— must come back (test books, tablets, drawing boards). Leave unticked for consumables like pens or A4 sheets.</span>
            </span>
          </label>

          <div>
            <label className={labelCls}>Ownership</label>
            <select className={inputCls} value={form.ownership_value} onChange={e => setForm(f => ({ ...f, ownership_value: e.target.value }))}>
              <option value="general">General (Stores)</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name} Department</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {editingId === 'new' ? (
              <div>
                <label className={labelCls}>Quantity *</label>
                <input type="number" min="1" className={inputCls} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
            ) : (
              <div>
                <label className={labelCls}>Quantity</label>
                <p className="text-sm text-slate-700 dark:text-slate-300 py-2">
                  {editingOriginal?.quantity_available} available of {editingOriginal?.quantity_total}
                </p>
              </div>
            )}
            <div>
              <label className={labelCls}>Condition</label>
              <select className={inputCls} value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                <option value="Good">Good</option>
                <option value="Damaged">Damaged</option>
                {editingId !== 'new' && <option value="Written Off">Written Off</option>}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Serial Number</label>
              <input className={inputCls} value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Asset Tag <span className="font-normal text-slate-400">(auto if blank)</span></label>
              <input className={inputCls} placeholder="AST-0001" value={form.asset_tag} onChange={e => setForm(f => ({ ...f, asset_tag: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Location</label>
              <input className={inputCls} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Acquired Date</label>
              <input type="date" className={inputCls} value={form.acquired_date} onChange={e => setForm(f => ({ ...f, acquired_date: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea rows={2} className={`${inputCls} resize-none`} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={2} className={`${inputCls} resize-none`} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setEditingId(null); setEditingOriginal(null); }} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
              {saving ? 'Saving…' : editingId === 'new' ? 'Add Item' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      <div className={cardCls}>
        {loading ? <p className="p-5 text-center text-slate-400 text-sm">Loading…</p> : items.length === 0 ? (
          <p className="p-5 text-center text-slate-400 text-sm">No items yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {items.map(i => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{i.name}</p>
                  <p className="text-xs text-slate-400">
                    {i.category_name ?? (ITEM_TYPES.find(t => t.value === i.item_type)?.label ?? i.item_type)}
                    {' · '}{i.ownership_type === 'departmental' ? (departments.find(d => d.id === i.department_id)?.name ?? 'Departmental') : 'General'}
                    {i.asset_tag ? ` · ${i.asset_tag}` : ''}
                  </p>
                  <div className="flex gap-1 mt-1">
                    {i.is_returnable && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Returnable</span>
                    )}
                    {i.condition !== 'Good' && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${i.condition === 'Damaged' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{i.condition}</span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white shrink-0">{i.quantity_available}/{i.quantity_total}</p>
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

// ── Categories ──────────────────────────────────────────────────────────────
function CategoriesTab({ api, primary }: { api: AxiosInstance; primary: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    api.get<Category[]>('/api/inventory/categories').then(r => setCategories(r.data)).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditingId('new'); setForm({ name: '', description: '' }); setError(''); }
  function openEdit(c: Category) { setEditingId(c.id); setForm({ name: c.name, description: c.description ?? '' }); setError(''); }

  async function save() {
    if (!form.name.trim()) { setError('Category name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (editingId === 'new') await api.post('/api/inventory/categories', form);
      else await api.put(`/api/inventory/categories/${editingId}`, form);
      setEditingId(null); load();
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to save.'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this category?')) return;
    try { await api.delete(`/api/inventory/categories/${id}`); load(); }
    catch (e: any) { alert(e?.response?.data?.error ?? 'Failed to delete.'); }
  }

  return (
    <div className="space-y-4">
      <button onClick={openNew} className="py-2.5 px-4 rounded-xl text-sm font-semibold text-white" style={{ background: primary }}>+ Add Category</button>

      {editingId && (
        <div className={`${cardCls} p-4 space-y-3`}>
          <input className={inputCls} placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className={inputCls} placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setEditingId(null)} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      <div className={cardCls}>
        {loading ? <p className="p-5 text-center text-slate-400 text-sm">Loading…</p> : categories.length === 0 ? (
          <p className="p-5 text-center text-slate-400 text-sm">No categories yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{c.name}</p>
                  {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
                </div>
                <span className="text-xs text-slate-400 shrink-0">{c.item_count} item(s)</span>
                <button onClick={() => openEdit(c)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0">Edit</button>
                <button onClick={() => remove(c.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Transaction Log ──────────────────────────────────────────────────────────
function TransactionLogTab({ api }: { api: AxiosInstance }) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Transaction[]>('/api/inventory/transactions', { params: { limit: 100 } })
      .then(r => setRows(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className={cardCls}>
      {loading ? <p className="p-5 text-center text-slate-400 text-sm">Loading…</p> : rows.length === 0 ? (
        <p className="p-5 text-center text-slate-400 text-sm">No transactions yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {rows.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{t.item_name}</p>
                <p className="text-xs text-slate-400">
                  {t.type} · qty {t.quantity}{t.issued_to_name ? ` · to ${t.issued_to_name}` : ''}
                  {t.performed_by_name ? ` · by ${t.performed_by_name}` : ''}
                </p>
              </div>
              <span className="text-xs text-slate-400 shrink-0">{new Date(t.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Asset Report ────────────────────────────────────────────────────────────
function ReportTab({ api }: { api: AxiosInstance }) {
  const [data, setData] = useState<{ summary: ReportSummaryRow[]; totals: ReportSummaryRow & { total_items: number } } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/inventory/report').then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-5 text-center text-slate-400 text-sm">Loading…</p>;
  if (!data) return <p className="p-5 text-center text-slate-400 text-sm">Could not load report.</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Items', value: data.totals.total_items },
          { label: 'Total Units', value: data.totals.total_units },
          { label: 'Available', value: data.totals.available_units },
          { label: 'Written Off', value: data.totals.written_off_count },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm">
            <p className="text-xs font-semibold text-slate-400">{label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className={cardCls}>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {data.summary.map((s, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">
                  {s.ownership_type === 'departmental' ? (s.department_name ?? 'Departmental') : 'General'}
                </p>
                <p className="text-xs text-slate-400">{s.item_count} item(s) · {s.units_issued} issued · {s.damaged_count} damaged · {s.written_off_count} written off</p>
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-white shrink-0">{s.available_units}/{s.total_units}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
