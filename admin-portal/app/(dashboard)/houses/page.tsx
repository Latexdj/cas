'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input }  from '@/components/ui/Input';
import { Modal }  from '@/components/ui/Modal';

interface House {
  id:               string;
  name:             string;
  notes:            string | null;
  student_count:    number;
  male_count:       number;
  female_count:     number;
  boarding_count:   number;
  day_count:        number;
  housemaster_names: string | null;
}

const emptyForm = { id: '', name: '', notes: '' };

function MiniBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-slate-500">{value}</span>
    </div>
  );
}

export default function HousesPage() {
  const [houses,  setHouses]  = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<'none' | 'add' | 'edit'>('none');
  const [form,    setForm]    = useState(emptyForm);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  function load() {
    setLoading(true);
    api.get<House[]>('/api/houses/overview')
      .then(r => setHouses(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openAdd() { setForm(emptyForm); setError(''); setModal('add'); }
  function openEdit(h: House) { setForm({ id: h.id, name: h.name, notes: h.notes ?? '' }); setError(''); setModal('edit'); }

  async function save() {
    if (!form.name.trim()) { setError('House name is required'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'add') {
        const r = await api.post<House>('/api/houses', { name: form.name.trim(), notes: form.notes || null });
        setHouses(prev => [...prev, { ...r.data, student_count: 0, male_count: 0, female_count: 0, boarding_count: 0, day_count: 0, housemaster_names: null }].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const r = await api.put<House>(`/api/houses/${form.id}`, { name: form.name.trim(), notes: form.notes || null });
        setHouses(prev => prev.map(h => h.id === form.id ? { ...h, name: r.data.name, notes: r.data.notes } : h));
      }
      setModal('none');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  async function remove(h: House) {
    if (!confirm(`Delete "${h.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/houses/${h.id}`);
      setHouses(prev => prev.filter(x => x.id !== h.id));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error ?? 'Failed to delete');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Houses</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Student residential houses. Assign housemasters via <span className="font-medium">Clearance → Offices & Staff</span>.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>+ Add House</Button>
      </div>

      {/* Summary cards */}
      {!loading && houses.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{houses.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Houses</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{houses.reduce((s, h) => s + h.student_count, 0)}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total Students</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{houses.reduce((s, h) => s + h.boarding_count, 0)}</p>
            <p className="text-xs text-slate-500 mt-0.5">Boarding</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{houses.filter(h => h.housemaster_names).length}</p>
            <p className="text-xs text-slate-500 mt-0.5">With Housemaster</p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : houses.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No houses yet. Add one to get started.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                    {['House', 'Housemaster', 'Students', 'Gender', 'Residential', 'Notes', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {houses.map(h => (
                    <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{h.name}</td>
                      <td className="px-4 py-3">
                        {h.housemaster_names ? (
                          <span className="text-sm text-slate-700 dark:text-slate-300">{h.housemaster_names}</span>
                        ) : (
                          <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full font-medium">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 dark:text-white">{h.student_count}</span>
                      </td>
                      <td className="px-4 py-3 space-y-1">
                        <MiniBar value={h.male_count}   total={h.student_count} color="#3b82f6" />
                        <MiniBar value={h.female_count} total={h.student_count} color="#ec4899" />
                      </td>
                      <td className="px-4 py-3 space-y-1">
                        <MiniBar value={h.boarding_count} total={h.student_count} color="#6366f1" />
                        <MiniBar value={h.day_count}      total={h.student_count} color="#f59e0b" />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[160px] truncate">{h.notes ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => openEdit(h)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                          <button onClick={() => remove(h)}   className="text-xs text-red-600 dark:text-red-400 hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              {houses.map(h => (
                <div key={h.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{h.name}</p>
                      {h.housemaster_names ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{h.housemaster_names}</p>
                      ) : (
                        <span className="text-[11px] text-amber-600 font-medium">No housemaster assigned</span>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(h)} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => remove(h)}   className="text-xs text-red-600 hover:underline">Delete</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 dark:bg-slate-700 rounded-lg py-2">
                      <p className="text-lg font-bold text-slate-900 dark:text-white">{h.student_count}</p>
                      <p className="text-[10px] text-slate-500">Total</p>
                    </div>
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg py-2">
                      <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{h.boarding_count}</p>
                      <p className="text-[10px] text-indigo-500">Boarding</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg py-2">
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{h.day_count}</p>
                      <p className="text-[10px] text-amber-500">Day</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[11px] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                      ♂ {h.male_count} Male
                    </span>
                    <span className="text-[11px] bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 px-2 py-0.5 rounded-full font-medium">
                      ♀ {h.female_count} Female
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal
        open={modal !== 'none'}
        onClose={() => setModal('none')}
        title={modal === 'add' ? 'Add House' : 'Edit House'}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <Input
            label="House Name *"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Aggrey House"
          />
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Optional description…"
              rows={3}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2">
            To assign a housemaster, go to <span className="font-semibold">Clearance → Offices & Staff</span> and create or edit an office with type <span className="font-semibold">Housemaster</span> linked to this house.
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setModal('none')}>Cancel</Button>
            <Button loading={saving} onClick={save}>{modal === 'add' ? 'Add House' : 'Save Changes'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
