'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { AcademicYear } from '@/types/api';

const EMPTY = { name: '', is_current: false, current_semester: '1' };

export default function AcademicYearsPage() {
  const [years, setYears]     = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<'create' | 'edit' | null>(null);
  const [form, setForm]       = useState<typeof EMPTY>(EMPTY);
  const [editId, setEditId]   = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<AcademicYear[]>('/api/academic-years');
      setYears(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm(EMPTY); setError(''); setEditId(null); setModal('create');
  }
  function openEdit(y: AcademicYear) {
    setForm({ name: y.name, is_current: y.is_current, current_semester: String(y.current_semester ?? 1) });
    setEditId(y.id); setError(''); setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const body = { name: form.name, is_current: form.is_current, current_semester: parseInt(form.current_semester) };
      if (modal === 'create') await api.post('/api/academic-years', body);
      else                    await api.put(`/api/academic-years/${editId}`, body);
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save academic year.');
    } finally { setSaving(false); }
  }

  async function setCurrent(id: string) {
    await api.put(`/api/academic-years/${id}/set-current`);
    await load();
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete academic year "${name}"?`)) return;
    await api.delete(`/api/academic-years/${id}`);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>+ Add Academic Year</Button>
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
                {['Year Name','Current','Semester',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {years.map(y => (
                <tr key={y.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{y.name}</td>
                  <td className="px-4 py-3">
                    {y.is_current
                      ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Current</span>
                      : <Button variant="ghost" size="sm" onClick={() => setCurrent(y.id)}>Set Current</Button>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">Semester {y.current_semester ?? '—'}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(y)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => del(y.id, y.name)}>Del</Button>
                  </td>
                </tr>
              ))}
              {years.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No academic years yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Academic Year' : 'Edit Academic Year'}>
        <div className="space-y-3">
          <Input label="Year Name *" placeholder="2025/2026" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <div>
            <label className="text-sm font-medium text-gray-700">Current Semester</label>
            <select value={form.current_semester} onChange={e => setForm(f => ({ ...f, current_semester: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_current}
              onChange={e => setForm(f => ({ ...f, is_current: e.target.checked }))} />
            Mark as current academic year
          </label>
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
