'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Item {
  id: string; name: string; category: string; unit: string; quantity_on_hand: number;
  reorder_level: number; batch_number: string | null; expiry_date: string | null;
  notes: string | null; is_active: boolean; is_low_stock: boolean;
}

const emptyForm = { name: '', category: 'medication', unit: 'unit', reorder_level: '0', notes: '' };
const emptyRestock = { quantity: '', batch_number: '', expiry_date: '', notes: '' };
const emptyWriteOff = { quantity: '', notes: '' };

export default function ClinicInventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [restockTarget, setRestockTarget] = useState<Item | null>(null);
  const [restockForm, setRestockForm] = useState(emptyRestock);
  const [restocking, setRestocking] = useState(false);
  const [restockError, setRestockError] = useState('');

  const [writeOffTarget, setWriteOffTarget] = useState<Item | null>(null);
  const [writeOffForm, setWriteOffForm] = useState(emptyWriteOff);
  const [writingOff, setWritingOff] = useState(false);
  const [writeOffError, setWriteOffError] = useState('');

  function load() {
    setLoading(true);
    api.get<Item[]>('/api/clinic-inventory/items').then(r => setItems(r.data)).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function createItem() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/clinic-inventory/items', { ...form, reorder_level: Number(form.reorder_level) || 0 });
      setAddOpen(false); setForm(emptyForm);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not add item, try again');
    } finally {
      setSaving(false);
    }
  }

  async function submitRestock() {
    if (!restockTarget) return;
    const qty = Number(restockForm.quantity);
    if (!qty || qty <= 0) { setRestockError('Enter a valid quantity'); return; }
    setRestocking(true); setRestockError('');
    try {
      await api.post(`/api/clinic-inventory/items/${restockTarget.id}/restock`, {
        quantity: qty,
        batch_number: restockForm.batch_number || undefined,
        expiry_date: restockForm.expiry_date || undefined,
        notes: restockForm.notes || undefined,
      });
      setRestockTarget(null); setRestockForm(emptyRestock);
      load();
    } catch (e: any) {
      setRestockError(e?.response?.data?.error ?? 'Could not restock, try again');
    } finally {
      setRestocking(false);
    }
  }

  async function submitWriteOff() {
    if (!writeOffTarget) return;
    const qty = Number(writeOffForm.quantity);
    if (!qty || qty <= 0) { setWriteOffError('Enter a valid quantity'); return; }
    if (!writeOffForm.notes.trim()) { setWriteOffError('A reason is required'); return; }
    setWritingOff(true); setWriteOffError('');
    try {
      await api.post(`/api/clinic-inventory/items/${writeOffTarget.id}/write-off`, {
        quantity: qty, notes: writeOffForm.notes.trim(),
      });
      setWriteOffTarget(null); setWriteOffForm(emptyWriteOff);
      load();
    } catch (e: any) {
      setWriteOffError(e?.response?.data?.error ?? 'Could not write off stock, try again');
    } finally {
      setWritingOff(false);
    }
  }

  const expiringSoon = (d: string | null) => d && new Date(d).getTime() - Date.now() < 30 * 86400000;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Clinic inventory</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Drugs and consumables stocked at the clinic</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>Add item</Button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No items in the catalog yet. Add drugs and consumables to start tracking stock.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <th className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap">Item</th>
                <th className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap">Category</th>
                <th className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap">On hand</th>
                <th className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap">Batch / Expiry</th>
                <th className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {items.map(it => (
                <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{it.name}</p>
                    {!it.is_active && <p className="text-xs text-slate-400">Disabled</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 capitalize">{it.category}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{it.quantity_on_hand} {it.unit}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {it.batch_number ?? '—'}{it.expiry_date ? ` · exp. ${it.expiry_date}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {it.is_low_stock && <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Low stock</span>}
                      {expiringSoon(it.expiry_date) && <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">Expiring soon</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button className="text-xs text-[#145C44] dark:text-[#2ab289] font-medium" onClick={() => setRestockTarget(it)}>Restock</button>
                      <button className="text-xs text-red-600 dark:text-red-400 font-medium" onClick={() => setWriteOffTarget(it)}>Write off</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={addOpen} onClose={() => { setAddOpen(false); setForm(emptyForm); setError(''); }} title="Add inventory item" maxWidth="max-w-md">
        <div className="space-y-4">
          <Input label="Name *" placeholder="e.g. Paracetamol 500mg" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">Category</label>
              <select className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                <option value="medication">Medication</option>
                <option value="consumable">Consumable</option>
              </select>
            </div>
            <Input label="Unit" placeholder="tablet, ml, piece…" value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} />
          </div>
          <Input label="Reorder level" type="number" min={0} value={form.reorder_level} onChange={e => setForm(p => ({ ...p, reorder_level: e.target.value }))} />
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">Notes</label>
            <textarea className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" rows={2}
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setAddOpen(false); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={createItem} loading={saving}>Add item</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!restockTarget} onClose={() => { setRestockTarget(null); setRestockForm(emptyRestock); }} title={`Restock ${restockTarget?.name ?? ''}`} maxWidth="max-w-md">
        <div className="space-y-4">
          <Input label="Quantity received *" type="number" min={1} value={restockForm.quantity} onChange={e => setRestockForm(p => ({ ...p, quantity: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Batch number" value={restockForm.batch_number} onChange={e => setRestockForm(p => ({ ...p, batch_number: e.target.value }))} />
            <Input label="Expiry date" type="date" value={restockForm.expiry_date} onChange={e => setRestockForm(p => ({ ...p, expiry_date: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">Notes</label>
            <textarea className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" rows={2}
              value={restockForm.notes} onChange={e => setRestockForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          {restockError && <p className="text-xs text-red-500">{restockError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setRestockTarget(null); setRestockForm(emptyRestock); }}>Cancel</Button>
            <Button onClick={submitRestock} loading={restocking}>Restock</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!writeOffTarget} onClose={() => { setWriteOffTarget(null); setWriteOffForm(emptyWriteOff); }} title={`Write off ${writeOffTarget?.name ?? ''}`} maxWidth="max-w-md">
        <div className="space-y-4">
          <Input label="Quantity *" type="number" min={1} value={writeOffForm.quantity} onChange={e => setWriteOffForm(p => ({ ...p, quantity: e.target.value }))} />
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">Reason *</label>
            <textarea className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" rows={2}
              placeholder="e.g. expired, broken vial…"
              value={writeOffForm.notes} onChange={e => setWriteOffForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          {writeOffError && <p className="text-xs text-red-500">{writeOffError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setWriteOffTarget(null); setWriteOffForm(emptyWriteOff); }}>Cancel</Button>
            <Button variant="danger" onClick={submitWriteOff} loading={writingOff}>Write off</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
