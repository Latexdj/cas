'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AcademicYear {
  id: string; name: string; start_date: string | null; end_date: string | null;
  is_current: boolean; created_at: string;
}

export default function PrimaryAcademicYearsPage() {
  const [years,   setYears]   = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [modal,   setModal]   = useState<'create'|'edit'|null>(null);
  const [editId,  setEditId]  = useState('');
  const [form,    setForm]    = useState({ name: '', start_date: '', end_date: '' });
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<AcademicYear[]>('/api/academic-years');
      setYears(data);
    } catch { setError('Failed to load academic years.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    const now = new Date();
    setEditId('');
    setForm({ name: `${now.getFullYear()}/${now.getFullYear() + 1}`, start_date: '', end_date: '' });
    setModal('create');
  }
  function openEdit(y: AcademicYear) {
    setEditId(y.id);
    setForm({ name: y.name, start_date: y.start_date?.slice(0,10) ?? '', end_date: y.end_date?.slice(0,10) ?? '' });
    setModal('edit');
  }

  async function save() {
    if (!form.name.trim()) return setError('Year name is required.');
    setSaving(true); setError('');
    try {
      const body = { name: form.name, start_date: form.start_date || null, end_date: form.end_date || null };
      if (editId) { await api.put(`/api/academic-years/${editId}`, body); }
      else { await api.post('/api/academic-years', body); }
      setModal(null); load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  async function setCurrent(id: string) {
    try { await api.put(`/api/academic-years/${id}/set-current`); load(); }
    catch { setError('Failed to set current year.'); }
  }

  async function del(id: string) {
    if (!confirm('Delete this academic year?')) return;
    try { await api.delete(`/api/academic-years/${id}`); load(); }
    catch { setError('Delete failed — terms or records may exist for this year.'); }
  }

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Academic Years</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage academic years for your school</p>
        </div>
        <button onClick={openCreate}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:opacity-90"
          style={{ backgroundColor: '#15803D' }}>
          + New Year
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {years.map(y => (
            <div key={y.id} className={`bg-white rounded-xl border shadow-sm p-5 space-y-4 transition-all ${y.is_current ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-100 hover:border-gray-200'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold text-slate-900">{y.name}</p>
                  {y.is_current && (
                    <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full text-green-700 bg-green-50 border border-green-200">Current Year</span>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Start:</span>
                  <span className="font-medium text-slate-700">{fmtDate(y.start_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span>End:</span>
                  <span className="font-medium text-slate-700">{fmtDate(y.end_date)}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                {!y.is_current && (
                  <button onClick={() => setCurrent(y.id)}
                    className="text-xs px-2.5 py-1 rounded-md border border-green-200 text-green-700 hover:bg-green-50 font-semibold transition-colors">
                    Set Current
                  </button>
                )}
                <button onClick={() => openEdit(y)}
                  className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-slate-700 hover:bg-gray-50 transition-colors">
                  Edit
                </button>
                {!y.is_current && (
                  <button onClick={() => del(y.id)}
                    className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {years.length === 0 && (
            <div className="col-span-3 text-center py-12 text-slate-400 text-sm">No academic years yet. Create one to get started.</div>
          )}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-slate-900">{editId ? 'Edit Academic Year' : 'New Academic Year'}</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Year Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 2025/2026"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Start Date</label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">End Date</label>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setModal(null); setError(''); }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#15803D' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
