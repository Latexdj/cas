'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface LibraryStaff { id: string; name: string; email: string; is_active: boolean; created_at: string; }

const empty = { id: '', name: '', email: '', password: '' };

export default function LibraryStaffPage() {
  const [staff,   setStaff]   = useState<LibraryStaff[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal,  setModal]  = useState<'none' | 'add' | 'edit'>('none');
  const [form,   setForm]   = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.get<LibraryStaff[]>('/api/library-admin/staff')
      .then(r => setStaff(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function openAdd()                   { setForm(empty); setError(''); setModal('add'); }
  function openEdit(s: LibraryStaff)  { setForm({ id: s.id, name: s.name, email: s.email, password: '' }); setError(''); setModal('edit'); }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required'); return; }
    if (modal === 'add' && !form.password) { setError('Password is required'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'add') {
        const r = await api.post<LibraryStaff>('/api/library-admin/staff', form);
        setStaff(prev => [...prev, r.data]);
      } else {
        const payload: any = { name: form.name, email: form.email };
        if (form.password) payload.password = form.password;
        const r = await api.put<LibraryStaff>(`/api/library-admin/staff/${form.id}`, payload);
        setStaff(prev => prev.map(s => s.id === form.id ? r.data : s));
      }
      setModal('none');
    } catch (e: any) { setError(e.response?.data?.error ?? 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function toggleActive(s: LibraryStaff) {
    try {
      const r = await api.put<LibraryStaff>(`/api/library-admin/staff/${s.id}`, { is_active: !s.is_active });
      setStaff(prev => prev.map(x => x.id === s.id ? r.data : x));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to update'); }
  }

  async function deleteStaff(id: string) {
    if (!confirm('Delete this librarian account?')) return;
    try {
      await api.delete(`/api/library-admin/staff/${id}`);
      setStaff(prev => prev.filter(s => s.id !== id));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to delete'); }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Library Staff</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage librarian accounts for the library portal</p>
        </div>
        <Button size="sm" onClick={openAdd}>+ Add Librarian</Button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No library staff yet. Add a librarian to get started.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                {['Name','Email','Status','Created',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {staff.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.email}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(s)}
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${s.is_active ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}
                    >
                      {s.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => openEdit(s)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                      <button onClick={() => deleteStaff(s.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modal !== 'none'} onClose={() => setModal('none')} title={modal === 'add' ? 'Add Librarian' : 'Edit Librarian'}>
        <div className="space-y-4">
          <Input label="Full Name *"  value={form.name}     onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="Email *"      value={form.email}    onChange={e => setForm(p => ({ ...p, email: e.target.value }))} type="email" />
          <Input label={modal === 'add' ? 'Password *' : 'New Password (leave blank to keep)'} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} type="password" />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModal('none')}>Cancel</Button>
            <Button loading={saving} onClick={save}>{modal === 'add' ? 'Add Librarian' : 'Save Changes'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
