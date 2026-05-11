'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { Location } from '@/types/api';

const EMPTY = { name: '', type: 'classroom', latitude: '', longitude: '', radius_meters: '50' };

export default function LocationsPage() {
  const [locs, setLocs]       = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<'create' | 'edit' | null>(null);
  const [form, setForm]       = useState<typeof EMPTY>(EMPTY);
  const [editId, setEditId]   = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Location[]>('/api/locations');
      setLocs(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm(EMPTY); setError(''); setEditId(null); setModal('create');
  }
  function openEdit(l: Location) {
    setForm({
      name: l.name, type: l.type,
      latitude:  l.latitude  != null ? String(l.latitude)  : '',
      longitude: l.longitude != null ? String(l.longitude) : '',
      radius_meters: String(l.radius_meters),
    });
    setEditId(l.id); setError(''); setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const body = {
        name: form.name, type: form.type,
        latitude:      form.latitude  ? parseFloat(form.latitude)  : null,
        longitude:     form.longitude ? parseFloat(form.longitude) : null,
        radius_meters: parseInt(form.radius_meters) || 50,
      };
      if (modal === 'create') await api.post('/api/locations', body);
      else                    await api.put(`/api/locations/${editId}`, body);
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save location.');
    } finally { setSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete location "${name}"?`)) return;
    await api.delete(`/api/locations/${id}`);
    await load();
  }

  function f(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>+ Add Location</Button>
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
                {['Name','Type','Latitude','Longitude','Radius (m)','GPS',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {locs.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{l.name}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{l.type}</td>
                  <td className="px-4 py-3 text-gray-600">{l.latitude ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{l.longitude ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{l.radius_meters}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${l.has_coordinates ? 'text-green-600' : 'text-gray-400'}`}>
                      {l.has_coordinates ? '✓ Set' : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(l)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => del(l.id, l.name)}>Del</Button>
                  </td>
                </tr>
              ))}
              {locs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No locations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Location' : 'Edit Location'}>
        <div className="space-y-3">
          <Input label="Name *" value={form.name} onChange={f('name')} required />
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
            <select value={form.type} onChange={f('type')}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
              <option value="classroom">Classroom</option>
              <option value="lab">Lab</option>
              <option value="hall">Hall</option>
              <option value="field">Field</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude"  type="number" step="any" placeholder="5.6037" value={form.latitude}  onChange={f('latitude')}  />
            <Input label="Longitude" type="number" step="any" placeholder="-0.1870" value={form.longitude} onChange={f('longitude')} />
          </div>
          <Input label="Radius (metres)" type="number" value={form.radius_meters} onChange={f('radius_meters')} />
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
