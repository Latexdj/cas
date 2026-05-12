'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { ClassItem } from '@/types/api';

export default function ClassesPage() {
  const [classes,  setClasses]  = useState<ClassItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<'create' | 'edit' | null>(null);
  const [name,     setName]     = useState('');
  const [editId,   setEditId]   = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<ClassItem[]>('/api/classes');
      setClasses(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setName(''); setError(''); setEditId(null); setModal('create'); }
  function openEdit(c: ClassItem) { setName(c.name); setEditId(c.id); setError(''); setModal('edit'); }

  async function save() {
    if (!name.trim()) { setError('Class name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'create') await api.post('/api/classes', { name: name.trim() });
      else                    await api.put(`/api/classes/${editId}`, { name: name.trim() });
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string, n: string) {
    if (!confirm(`Delete class "${n}"?`)) return;
    try {
      await api.delete(`/api/classes/${id}`);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Failed to delete.');
    }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="space-y-4 max-w-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{classes.length} class{classes.length !== 1 ? 'es' : ''} defined</p>
        <Button onClick={openCreate}>+ Add Class</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Class Name', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {classes.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => del(c.id, c.name)}>Del</Button>
                  </td>
                </tr>
              ))}
              {classes.length === 0 && (
                <tr><td colSpan={2} className="px-4 py-8 text-center text-gray-400">No classes yet. Add your first class (e.g. 1A, 2B).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Class' : 'Edit Class'} maxWidth="max-w-xs">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Class Name *</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 1A" maxLength={20} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
