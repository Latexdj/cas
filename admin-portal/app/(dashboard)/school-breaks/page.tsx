'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';

interface SchoolBreak {
  id: string;
  name: string;
  day_of_week: number | null;
  day_label: string;
  start_time: string;
  end_time: string;
}

const DAYS = [
  { value: '',  label: 'All days (Mon – Sun)' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' },
];

const EMPTY_FORM = { name: '', day_of_week: '', start_time: '', end_time: '' };

function fmt(t: string) {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function SchoolBreaksPage() {
  const [breaks,   setBreaks]   = useState<SchoolBreak[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [editId,   setEditId]   = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<SchoolBreak[]>('/api/school-breaks');
      setBreaks(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function startEdit(b: SchoolBreak) {
    setEditId(b.id);
    setForm({
      name:        b.name,
      day_of_week: b.day_of_week ? String(b.day_of_week) : '',
      start_time:  b.start_time.slice(0, 5),
      end_time:    b.end_time.slice(0, 5),
    });
    setError('');
  }

  function cancelEdit() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.start_time || !form.end_time) {
      setError('Name, start time and end time are required.');
      return;
    }
    if (form.start_time >= form.end_time) {
      setError('Start time must be before end time.');
      return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        name:        form.name.trim(),
        day_of_week: form.day_of_week || null,
        start_time:  form.start_time,
        end_time:    form.end_time,
      };
      if (editId) {
        await api.put(`/api/school-breaks/${editId}`, payload);
      } else {
        await api.post('/api/school-breaks', payload);
      }
      setForm(EMPTY_FORM);
      setEditId(null);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save break.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this break? Period calculations will update immediately.')) return;
    setDeleting(id);
    try {
      await api.delete(`/api/school-breaks/${id}`);
      setBreaks(prev => prev.filter(b => b.id !== id));
      if (editId === id) cancelEdit();
    } catch {
      alert('Failed to delete break.');
    } finally {
      setDeleting(null);
    }
  }

  const { displayRows, total, page, setPage, pageSize, setPageSize } = useTableControls(breaks);

  const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500';
  const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <p className="font-semibold mb-0.5">How break deduction works</p>
        <p>
          When a lesson spans a break (e.g. 08:00–10:30 with a 09:00–09:30 break), the system
          subtracts the overlapping break time and counts <strong>2 periods</strong> instead of 2.5.
          Changes take effect immediately for all future timetable lookups.
        </p>
      </div>

      {/* Add / Edit form */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          {editId ? 'Edit Break' : 'Add Break'}
        </h2>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Break name *</label>
            <input type="text" className={inputCls} placeholder="e.g. Morning Break"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div>
            <label className={labelCls}>Applies to</label>
            <select className={inputCls} value={form.day_of_week}
              onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))}>
              {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start time *</label>
              <input type="time" className={inputCls} value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>End time *</label>
              <input type="time" className={inputCls} value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            {editId && (
              <button type="button" onClick={cancelEdit}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
            )}
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#15803D' }}>
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Break'}
            </button>
          </div>
        </form>
      </div>

      {/* Break list */}
      <div>
        <h2 className="text-base font-bold text-slate-900 mb-3">
          Configured Breaks
          {breaks.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">({breaks.length})</span>
          )}
        </h2>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl bg-white border border-slate-100 animate-pulse" />
            ))}
          </div>
        ) : breaks.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-500">No breaks configured yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Add your school&apos;s regular break times above so periods are calculated correctly.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {(displayRows as typeof breaks).map(b => (
              <div key={b.id}
                className="bg-white rounded-xl border px-4 py-3 flex items-center gap-4"
                style={{ borderColor: editId === b.id ? '#15803D' : '#E2E8F0' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{b.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {b.day_label} · {fmt(b.start_time)} – {fmt(b.end_time)}
                    <span className="ml-2 font-medium text-slate-400">
                      ({(() => {
                        const [sh, sm] = b.start_time.split(':').map(Number);
                        const [eh, em] = b.end_time.split(':').map(Number);
                        const mins = (eh * 60 + em) - (sh * 60 + sm);
                        return `${mins} min`;
                      })()})
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => startEdit(b)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(b.id)} disabled={deleting === b.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                    {deleting === b.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
      </div>
    </div>
  );
}
