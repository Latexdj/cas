'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const MODULE_LABELS: Record<string, { label: string; color: string }> = {
  library: { label: 'Library', color: 'bg-green-100 text-green-700' },
};

interface AssignedTeacher { id: string; name: string; teacher_code: string; }
interface Responsibility {
  id: string; name: string; description: string | null; module_key: string | null;
  sort_order: number; created_at: string;
  teacher_count: number; teachers: AssignedTeacher[];
}

type FormData = { name: string; description: string; module_key: string; sort_order: number };
const EMPTY_FORM: FormData = { name: '', description: '', module_key: '', sort_order: 0 };

export default function ResponsibilitiesPage() {
  const [items,     setItems]     = useState<Responsibility[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [modal,     setModal]     = useState<'create' | 'edit' | null>(null);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [form,      setForm]      = useState<FormData>(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  async function load() {
    try {
      const { data } = await api.get<Responsibility[]>('/api/responsibilities');
      setItems(data);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm(EMPTY_FORM); setError(''); setEditId(null); setModal('create');
  }
  function openEdit(r: Responsibility) {
    setForm({ name: r.name, description: r.description ?? '', module_key: r.module_key ?? '', sort_order: r.sort_order });
    setError(''); setEditId(r.id); setModal('edit');
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const body = { ...form, module_key: form.module_key || null, description: form.description || null };
      if (modal === 'create') await api.post('/api/responsibilities', body);
      else await api.put(`/api/responsibilities/${editId}`, body);
      setModal(null);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  async function remove(r: Responsibility) {
    if (!confirm(`Delete "${r.name}"? This will also remove all teacher assignments.`)) return;
    try {
      await api.delete(`/api/responsibilities/${r.id}`);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Failed to delete');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Teacher Responsibilities</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define roles that can be assigned to teachers. Roles with a module unlock that module in the teacher app.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#15803D' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Responsibility
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 text-center">
          <p className="text-gray-400 text-sm">No responsibilities defined yet.</p>
          <button onClick={openCreate} className="mt-3 text-sm font-semibold text-green-700 hover:underline">
            Create your first responsibility
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setExpanded(e => e === r.id ? null : r.id)}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${expanded === r.id ? 'rotate-90' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{r.name}</span>
                      {r.module_key && MODULE_LABELS[r.module_key] && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${MODULE_LABELS[r.module_key].color}`}>
                          {MODULE_LABELS[r.module_key].label} module
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{r.description}</p>
                    )}
                  </div>
                  <span className="ml-auto flex-shrink-0 text-xs text-gray-400 font-medium">
                    {r.teacher_count} teacher{r.teacher_count !== 1 ? 's' : ''}
                  </span>
                </button>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => openEdit(r)}
                    className="px-2.5 py-1 rounded text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
                    Edit
                  </button>
                  <button onClick={() => remove(r)}
                    className="px-2.5 py-1 rounded text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50">
                    Delete
                  </button>
                </div>
              </div>

              {expanded === r.id && (
                <div className="border-t border-gray-50 bg-gray-50 px-4 py-3">
                  {r.teachers.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No teachers assigned. Edit a teacher to assign this responsibility.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {r.teachers.map(t => (
                        <span key={t.id} className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-gray-200 rounded-full px-3 py-1 text-gray-700">
                          <span className="font-mono text-green-700 font-bold text-[10px]">{t.teacher_code}</span>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">
              {modal === 'create' ? 'New Responsibility' : 'Edit Responsibility'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Name *</label>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Library Teacher, HOD Science"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600"
                  rows={2}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Short description of this role"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">App Module</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600"
                  value={form.module_key}
                  onChange={e => setForm(f => ({ ...f, module_key: e.target.value }))}
                >
                  <option value="">None — label only</option>
                  <option value="library">Library — unlocks Library tab in teacher app</option>
                </select>
                <p className="mt-1 text-xs text-slate-400">Choosing a module will show that module in the teacher&apos;s app menu when this responsibility is assigned to them.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Sort Order</label>
                <input
                  type="number" min={0}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#15803D' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
