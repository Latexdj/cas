'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import type { Teacher } from '@/types/api';

const EMPTY: Partial<Teacher & { password: string }> = {
  name: '', email: '', phone: '', department: '', status: 'Active', is_admin: false, notes: '', password: '',
};

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [modal, setModal]       = useState<'create' | 'edit' | null>(null);
  const [form, setForm]         = useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [editId, setEditId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Teacher[]>('/api/teachers');
      setTeachers(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm(EMPTY); setError(''); setEditId(null); setModal('create');
  }
  function openEdit(t: Teacher) {
    setForm({ name: t.name, email: t.email ?? '', phone: t.phone ?? '', department: t.department ?? '',
      status: t.status, is_admin: t.is_admin, notes: t.notes ?? '', password: '' });
    setEditId(t.id); setError(''); setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const body: Record<string, unknown> = { ...form };
      if (!body.password) delete body.password;
      if (modal === 'create') {
        await api.post('/api/teachers', body);
      } else {
        await api.put(`/api/teachers/${editId}`, body);
      }
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save teacher.');
    } finally { setSaving(false); }
  }

  async function deleteTeacher(id: string, name: string) {
    if (!confirm(`Delete teacher "${name}"? This cannot be undone.`)) return;
    await api.delete(`/api/teachers/${id}`);
    await load();
  }

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (t.department ?? '').toLowerCase().includes(search.toLowerCase())
  );

  function field(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input placeholder="Search teachers…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Button onClick={openCreate}>+ Add Teacher</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Name','Email','Phone','Department','Periods','Role','Status',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3 text-gray-600">{t.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.department ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.total_periods}</td>
                  <td className="px-4 py-3 text-gray-600">{t.is_admin ? 'Admin' : 'Teacher'}</td>
                  <td className="px-4 py-3"><Badge status={t.status} /></td>
                  <td className="px-4 py-3 flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => deleteTeacher(t.id, t.name)}>Del</Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No teachers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Teacher' : 'Edit Teacher'} maxWidth="max-w-lg">
        <div className="space-y-3">
          <Input label="Full Name *" value={form.name ?? ''} onChange={field('name')} required />
          <Input label="Email" type="email" value={form.email ?? ''} onChange={field('email')} />
          <Input label="Phone" value={form.phone ?? ''} onChange={field('phone')} />
          <Input label="Department" value={form.department ?? ''} onChange={field('department')} />
          <Input label={modal === 'create' ? 'Password *' : 'New Password (leave blank to keep)'} type="password" value={form.password ?? ''} onChange={field('password')} />
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <select value={form.status} onChange={field('status')}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              Status
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.is_admin}
                onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))} />
              Admin role
            </label>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</label>
            <textarea value={form.notes ?? ''} onChange={field('notes')} rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
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
