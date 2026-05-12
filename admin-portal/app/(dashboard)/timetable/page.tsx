'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { TimetableEntry, Teacher, Subject, ClassItem } from '@/types/api';

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EMPTY_FORM = { teacher_id: '', day_of_week: '1', start_time: '08:00', end_time: '09:00', subject: '' };

export default function TimetablePage() {
  const [entries,   setEntries]   = useState<TimetableEntry[]>([]);
  const [teachers,  setTeachers]  = useState<Teacher[]>([]);
  const [subjects,  setSubjects]  = useState<Subject[]>([]);
  const [classes,   setClasses]   = useState<ClassItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState<'create' | 'edit' | null>(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [selCls,    setSelCls]    = useState<Set<string>>(new Set());
  const [editId,    setEditId]    = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [filterDay, setFilterDay] = useState('0');
  const [filterTch, setFilterTch] = useState('');

  const load = useCallback(async () => {
    try {
      const [e, t, s, c] = await Promise.all([
        api.get<TimetableEntry[]>('/api/timetable'),
        api.get<Teacher[]>('/api/teachers'),
        api.get<Subject[]>('/api/subjects'),
        api.get<ClassItem[]>('/api/classes'),
      ]);
      setEntries(e.data); setTeachers(t.data); setSubjects(s.data); setClasses(c.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleClass(name: string) {
    setSelCls(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }

  function openCreate() {
    setForm(EMPTY_FORM); setSelCls(new Set()); setError(''); setEditId(null); setModal('create');
  }
  function openEdit(e: TimetableEntry) {
    setForm({ teacher_id: e.teacher_id, day_of_week: String(e.day_of_week),
      start_time: e.start_time.slice(0, 5), end_time: e.end_time.slice(0, 5), subject: e.subject });
    setSelCls(new Set(e.class_names.split(',').map(c => c.trim()).filter(Boolean)));
    setEditId(e.id); setError(''); setModal('edit');
  }

  async function save() {
    if (!form.teacher_id || !form.subject || selCls.size === 0) {
      setError('Teacher, subject, and at least one class are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const body = {
        ...form,
        day_of_week: parseInt(form.day_of_week),
        class_names: Array.from(selCls).join(', '),
      };
      if (modal === 'create') await api.post('/api/timetable', body);
      else                    await api.put(`/api/timetable/${editId}`, body);
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save entry.');
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this timetable entry?')) return;
    await api.delete(`/api/timetable/${id}`);
    await load();
  }

  function f(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  const filtered = entries
    .filter(e =>
      (filterDay === '0' || e.day_of_week === parseInt(filterDay)) &&
      (!filterTch || e.teacher_id === filterTch)
    )
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));

  const selectCls ='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterDay} onChange={e => setFilterDay(e.target.value)} className={selectCls}>
          <option value="0">All Days</option>
          {DAYS.slice(1, 8).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
        </select>
        <select value={filterTch} onChange={e => setFilterTch(e.target.value)} className={selectCls}>
          <option value="">All Teachers</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Button onClick={openCreate} className="ml-auto">+ Add Slot</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Day', 'Time', 'Subject', 'Class(es)', 'Teacher', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{DAYS[e.day_of_week]}</td>
                  <td className="px-4 py-3 text-gray-700">{e.start_time.slice(0,5)}–{e.end_time.slice(0,5)}</td>
                  <td className="px-4 py-3 text-gray-700">{e.subject}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="flex flex-wrap gap-1">
                      {e.class_names.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                        <span key={c} className="inline-block bg-slate-100 text-slate-700 text-xs font-medium px-2 py-0.5 rounded">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{e.teacher_name}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(e)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => del(e.id)}>Del</Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No timetable entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Timetable Slot' : 'Edit Timetable Slot'} maxWidth="max-w-lg">
        <div className="space-y-3">
          {/* Teacher */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teacher *</label>
            <select value={form.teacher_id} onChange={f('teacher_id')} className={`mt-1 w-full ${selectCls}`}>
              <option value="">Select teacher…</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {/* Day */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Day *</label>
            <select value={form.day_of_week} onChange={f('day_of_week')} className={`mt-1 w-full ${selectCls}`}>
              {DAYS.slice(1, 8).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </div>
          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start Time *</label>
              <input type="time" value={form.start_time} onChange={f('start_time')} className={`mt-1 w-full ${selectCls}`} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">End Time *</label>
              <input type="time" value={form.end_time} onChange={f('end_time')} className={`mt-1 w-full ${selectCls}`} />
            </div>
          </div>
          {/* Subject */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject *</label>
            {subjects.length > 0 ? (
              <select value={form.subject} onChange={f('subject')} className={`mt-1 w-full ${selectCls}`}>
                <option value="">Select subject…</option>
                {subjects.map(s => <option key={s.id} value={s.name}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
              </select>
            ) : (
              <p className="mt-1 text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                No subjects defined yet. Go to <strong>Subjects</strong> in the sidebar to add them first.
              </p>
            )}
          </div>
          {/* Classes multi-select */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">
              Class(es) * {selCls.size > 0 && <span className="text-green-600 normal-case font-normal ml-1">({Array.from(selCls).join(', ')})</span>}
            </label>
            {classes.length > 0 ? (
              <div className="border border-slate-200 rounded-lg p-3 max-h-44 overflow-y-auto space-y-0.5">
                {classes.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-2 py-1.5">
                    <input type="checkbox" checked={selCls.has(c.name)} onChange={() => toggleClass(c.name)}
                      className="w-4 h-4 accent-green-600" />
                    <span className="text-sm text-slate-900 font-medium">{c.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                No classes defined yet. Go to <strong>Classes</strong> in the sidebar to add them first.
              </p>
            )}
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
