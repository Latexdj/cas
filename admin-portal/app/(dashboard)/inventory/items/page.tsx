'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface Category { id: string; name: string; }
interface Item {
  id: string; name: string; item_type: string; category_id: string | null;
  category_name: string | null; description: string | null; serial_number: string | null;
  asset_tag: string | null; quantity_total: number; quantity_available: number;
  condition: string; location: string | null; acquired_date: string | null; notes: string | null;
}

const TYPE_LABELS: Record<string, string> = { equipment: 'Equipment', book: 'Book', asset: 'Asset' };
const CONDITION_COLORS: Record<string, string> = {
  'Good':       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'Damaged':    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'Written Off':'bg-red-100   text-red-700   dark:bg-red-900/30   dark:text-red-400',
};

const EMPTY_FORM = {
  name: '', item_type: 'equipment', category_id: '', description: '', serial_number: '',
  asset_tag: '', quantity: '1', condition: 'Good', location: '', acquired_date: '', notes: '',
};

export default function InventoryItemsPage() {
  const [items,       setItems]       = useState<Item[]>([]);
  const [categories,  setCategories]  = useState<Category[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filterCat,   setFilterCat]   = useState('');
  const [filterCond,  setFilterCond]  = useState('');
  const [filterType,  setFilterType]  = useState('');

  // Add/Edit modal
  const [showForm,    setShowForm]    = useState(false);
  const [editItem,    setEditItem]    = useState<Item | null>(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');

  // Issue modal
  const [issueItem,   setIssueItem]   = useState<Item | null>(null);
  const [issueTo,     setIssueTo]     = useState('');
  const [issueRole,   setIssueRole]   = useState('');
  const [issueQty,    setIssueQty]    = useState('1');
  const [issueNotes,  setIssueNotes]  = useState('');
  const [issueSaving, setIssueSaving] = useState('');
  const [issueError,  setIssueError]  = useState('');

  // Return modal
  const [returnItem,    setReturnItem]    = useState<Item | null>(null);
  const [returnQty,     setReturnQty]     = useState('1');
  const [returnCond,    setReturnCond]    = useState('Good');
  const [returnNotes,   setReturnNotes]   = useState('');
  const [returnSaving,  setReturnSaving]  = useState(false);
  const [returnError,   setReturnError]   = useState('');

  // Condition modal
  const [condItem,    setCondItem]    = useState<Item | null>(null);
  const [newCond,     setNewCond]     = useState('Good');
  const [condNotes,   setCondNotes]   = useState('');
  const [condSaving,  setCondSaving]  = useState(false);
  const [condError,   setCondError]   = useState('');

  // Delete
  const [deletingId,  setDeletingId]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search)     params.search      = search;
      if (filterCat)  params.category_id = filterCat;
      if (filterCond) params.condition   = filterCond;
      if (filterType) params.item_type   = filterType;
      const [itemsRes, catsRes] = await Promise.all([
        api.get<Item[]>('/api/inventory/items', { params }),
        api.get<Category[]>('/api/inventory/categories'),
      ]);
      setItems(itemsRes.data);
      setCategories(catsRes.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [search, filterCat, filterCond, filterType]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  }
  function openEdit(item: Item) {
    setEditItem(item);
    setForm({
      name: item.name, item_type: item.item_type,
      category_id: item.category_id ?? '',
      description: item.description ?? '', serial_number: item.serial_number ?? '',
      asset_tag: item.asset_tag ?? '', quantity: String(item.quantity_total),
      condition: item.condition, location: item.location ?? '',
      acquired_date: item.acquired_date ? item.acquired_date.slice(0, 10) : '',
      notes: item.notes ?? '',
    });
    setFormError('');
    setShowForm(true);
  }

  async function saveItem() {
    setSaving(true); setFormError('');
    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        quantity: parseInt(form.quantity) || 1,
        acquired_date: form.acquired_date || null,
      };
      if (editItem) {
        await api.put(`/api/inventory/items/${editItem.id}`, payload);
      } else {
        await api.post('/api/inventory/items', payload);
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(msg ?? 'Failed to save item');
    } finally { setSaving(false); }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item and all its transaction history?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/inventory/items/${id}`);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Failed to delete item');
    } finally { setDeletingId(''); }
  }

  async function submitIssue() {
    setIssueSaving('saving'); setIssueError('');
    try {
      await api.post(`/api/inventory/items/${issueItem!.id}/issue`, {
        issued_to_name: issueTo, issued_to_role: issueRole,
        quantity: parseInt(issueQty) || 1, notes: issueNotes,
      });
      setIssueItem(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setIssueError(msg ?? 'Failed to issue item');
    } finally { setIssueSaving(''); }
  }

  async function submitReturn() {
    setReturnSaving(true); setReturnError('');
    try {
      await api.post(`/api/inventory/items/${returnItem!.id}/return`, {
        quantity: parseInt(returnQty) || 1, condition: returnCond, notes: returnNotes,
      });
      setReturnItem(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setReturnError(msg ?? 'Failed to process return');
    } finally { setReturnSaving(false); }
  }

  async function submitCondition() {
    setCondSaving(true); setCondError('');
    try {
      await api.post(`/api/inventory/items/${condItem!.id}/condition`, {
        condition: newCond, notes: condNotes,
      });
      setCondItem(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCondError(msg ?? 'Failed to update condition');
    } finally { setCondSaving(false); }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Inventory Items</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{loading ? '…' : `${items.length} item${items.length !== 1 ? 's' : ''}`}</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          + Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, serial, tag…"
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white w-52"
        />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
          <option value="">All Types</option>
          <option value="equipment">Equipment</option>
          <option value="book">Book</option>
          <option value="asset">Asset</option>
        </select>
        <select value={filterCond} onChange={e => setFilterCond(e.target.value)}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
          <option value="">All Conditions</option>
          <option value="Good">Good</option>
          <option value="Damaged">Damaged</option>
          <option value="Written Off">Written Off</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-10 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">No items found</p>
          <button onClick={openAdd} className="mt-3 text-sm text-blue-600 hover:underline">Add your first item</button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Category</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Condition</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Units</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Location</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const issued = item.quantity_total - item.quantity_available;
                return (
                  <tr key={item.id} className="border-b last:border-0 border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{item.name}</p>
                      {item.serial_number && <p className="text-xs text-slate-400">S/N: {item.serial_number}</p>}
                      {item.asset_tag     && <p className="text-xs text-slate-400">Tag: {item.asset_tag}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{TYPE_LABELS[item.item_type] ?? item.item_type}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.category_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONDITION_COLORS[item.condition] ?? ''}`}>
                        {item.condition}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-slate-900 dark:text-white">{item.quantity_available}</span>
                      <span className="text-slate-400"> / {item.quantity_total}</span>
                      {issued > 0 && <span className="ml-1 text-xs text-amber-600">({issued} out)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{item.location ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end flex-wrap">
                        {item.condition !== 'Written Off' && item.quantity_available > 0 && (
                          <button
                            onClick={() => { setIssueItem(item); setIssueTo(''); setIssueRole(''); setIssueQty('1'); setIssueNotes(''); setIssueError(''); }}
                            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                          >Issue</button>
                        )}
                        {issued > 0 && (
                          <button
                            onClick={() => { setReturnItem(item); setReturnQty('1'); setReturnCond('Good'); setReturnNotes(''); setReturnError(''); }}
                            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40"
                          >Return</button>
                        )}
                        <button
                          onClick={() => { setCondItem(item); setNewCond(item.condition === 'Written Off' ? 'Good' : item.condition); setCondNotes(''); setCondError(''); }}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                        >Condition</button>
                        <button
                          onClick={() => openEdit(item)}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                        >Edit</button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          disabled={deletingId === item.id}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-40"
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                {editItem ? 'Edit Item' : 'Add Item'}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Type</label>
                    <select value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                      <option value="equipment">Equipment</option>
                      <option value="book">Book</option>
                      <option value="asset">Asset</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Category</label>
                    <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                      <option value="">No category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Description</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Serial Number</label>
                    <input value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Asset Tag</label>
                    <input value={form.asset_tag} onChange={e => setForm(f => ({ ...f, asset_tag: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                  </div>
                </div>
                {!editItem && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Quantity</label>
                    <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Location</label>
                    <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Acquired Date</label>
                    <input type="date" value={form.acquired_date} onChange={e => setForm(f => ({ ...f, acquired_date: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none" />
                </div>
              </div>
              {formError && <p className="mt-3 text-sm text-red-500">{formError}</p>}
              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                <button onClick={saveItem} disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                  {saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issue Modal */}
      {issueItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Issue Item</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{issueItem.name} — {issueItem.quantity_available} available</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Issued To *</label>
                  <input value={issueTo} onChange={e => setIssueTo(e.target.value)} placeholder="Recipient name"
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Role / Class</label>
                  <input value={issueRole} onChange={e => setIssueRole(e.target.value)} placeholder="e.g. Teacher, Class 2A"
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Quantity</label>
                  <input type="number" min="1" max={issueItem.quantity_available} value={issueQty} onChange={e => setIssueQty(e.target.value)}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Notes</label>
                  <input value={issueNotes} onChange={e => setIssueNotes(e.target.value)}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                </div>
              </div>
              {issueError && <p className="mt-3 text-sm text-red-500">{issueError}</p>}
              <div className="flex gap-2 mt-5">
                <button onClick={() => setIssueItem(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                <button onClick={submitIssue} disabled={issueSaving === 'saving'} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                  {issueSaving === 'saving' ? 'Issuing…' : 'Confirm Issue'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {returnItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Process Return</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {returnItem.name} — {returnItem.quantity_total - returnItem.quantity_available} unit(s) currently out
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Quantity Returned</label>
                  <input type="number" min="1" max={returnItem.quantity_total - returnItem.quantity_available} value={returnQty} onChange={e => setReturnQty(e.target.value)}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Returned Condition</label>
                  <select value={returnCond} onChange={e => setReturnCond(e.target.value)}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                    <option value="Good">Good</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Notes</label>
                  <input value={returnNotes} onChange={e => setReturnNotes(e.target.value)}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                </div>
              </div>
              {returnError && <p className="mt-3 text-sm text-red-500">{returnError}</p>}
              <div className="flex gap-2 mt-5">
                <button onClick={() => setReturnItem(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                <button onClick={submitReturn} disabled={returnSaving} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40">
                  {returnSaving ? 'Processing…' : 'Confirm Return'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Condition Modal */}
      {condItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Update Condition</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{condItem.name} — currently: {condItem.condition}</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">New Condition</label>
                  <select value={newCond} onChange={e => setNewCond(e.target.value)}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                    <option value="Good">Good / Working</option>
                    <option value="Damaged">Damaged / Under Repair</option>
                    <option value="Written Off">Written Off / Disposed</option>
                  </select>
                  {newCond === 'Written Off' && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">This will set available units to 0 and the item cannot be issued.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Notes</label>
                  <input value={condNotes} onChange={e => setCondNotes(e.target.value)} placeholder="Reason for condition change"
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                </div>
              </div>
              {condError && <p className="mt-3 text-sm text-red-500">{condError}</p>}
              <div className="flex gap-2 mt-5">
                <button onClick={() => setCondItem(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                <button onClick={submitCondition} disabled={condSaving} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-slate-700 dark:bg-slate-600 text-white hover:bg-slate-800 disabled:opacity-40">
                  {condSaving ? 'Saving…' : 'Update Condition'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
