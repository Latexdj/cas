'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface Category {
  id: string; name: string; description: string | null; item_count: number; created_at: string;
}

export default function InventoryCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);

  const [showForm,   setShowForm]   = useState(false);
  const [editCat,    setEditCat]    = useState<Category | null>(null);
  const [name,       setName]       = useState('');
  const [description,setDescription]= useState('');
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');
  const [deletingId, setDeletingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Category[]>('/api/inventory/categories');
      setCategories(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditCat(null); setName(''); setDescription(''); setFormError(''); setShowForm(true);
  }
  function openEdit(cat: Category) {
    setEditCat(cat); setName(cat.name); setDescription(cat.description ?? ''); setFormError(''); setShowForm(true);
  }

  async function save() {
    setSaving(true); setFormError('');
    try {
      if (editCat) {
        await api.put(`/api/inventory/categories/${editCat.id}`, { name, description });
      } else {
        await api.post('/api/inventory/categories', { name, description });
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(msg ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  async function remove(cat: Category) {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    setDeletingId(cat.id);
    try {
      await api.delete(`/api/inventory/categories/${cat.id}`);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Failed to delete');
    } finally { setDeletingId(''); }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Inventory Categories</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Organise items by category</p>
        </div>
        <button onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          + Add Category
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : categories.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-10 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">No categories yet</p>
          <button onClick={openAdd} className="mt-3 text-sm text-blue-600 hover:underline">Create your first category</button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Description</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Items</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id} className="border-b last:border-0 border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{cat.name}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{cat.description ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{cat.item_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(cat)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200">
                        Edit
                      </button>
                      <button onClick={() => remove(cat)} disabled={deletingId === cat.id}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 disabled:opacity-40">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                {editCat ? 'Edit Category' : 'New Category'}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Electronics"
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Description</label>
                  <input value={description} onChange={e => setDescription(e.target.value)}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                </div>
              </div>
              {formError && <p className="mt-3 text-sm text-red-500">{formError}</p>}
              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                  Cancel
                </button>
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                  {saving ? 'Saving…' : editCat ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
