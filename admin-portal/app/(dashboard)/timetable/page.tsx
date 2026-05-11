'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { TimetableEntry, Teacher } from '@/types/api';

const DAYS = ['', 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const EMPTY = { teacher_id: '', day_of_week: '1', start_time: '08:00', end_time: '09:00', subject: '', class_name: '' };

export default function TimetablePage() {
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<'create' | 'edit' | null>(null);
  const [form, setForm]       = useState<typeof EMPTY>(EMPTY);
  const [editId, setEditId]   = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [filterDay, setFilterDay] = useState('0');
  const [filterTeacher, setFilterTeacher] = useState('');

  const load = useCallback(async () => {
    try {
      const [e, t] = await Promise.all([
        api.get<TimetableEntry[]>('/api/timetable'),
        api.get<Teacher[]>('/api/teachers'),
      ]);
      setEntries(e.data); setTeachers(t.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm(EMPTY); setError(''); setEditId(null); setModal('create');
  }
  function openEdit(e: TimetableEntry) {
    setForm({ teacher_id: e.teacher_id, day_of_week: String(e.day_of_week),
      start_time: e.start_time, end_time: e.end_time, subject: e.subject, class_name: e.class_name });
    setEditId(e.id); setError(''); setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const body = { ...form, day_of_week: parseInt(form.day_of_week) };
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

  const filtered = entries.filter(e =>
    (filterDay === '0' || e.day_of_week === parseInt(filterDay)) &&
    (!filterTeacher || e.teacher_id === filterTeacher)
  ).sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterDay} onChange={e => setFilterDay(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600">
          <option value="0">All Days</option>
          {DAYS.slice(1,7).map((d,i) => <option key={d} value={i+1}>{d}</option>)}
        </select>
        <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600">
          <option value="">All Teachers</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Button onClick={openCreate} className="ml-auto">+ Add Slot</Button>
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
                {['Day','Time','Subject','Class','Teacher',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{DAYS[e.day_of_week]}</td>
                  <td className="px-4 py-3 text-gray-700">{e.start_time}–{e.end_time}</td>
                  <td className="px-4 py-3 text-gray-700">{e.subject}</td>
                  <td className="px-4 py-3 text-gray-700">{e.class_name}</td>
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

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Timetable Slot' : 'Edit Timetable Slot'}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teacher *</label>
            <select value={form.teacher_id} onChange={f('teacher_id')}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600">
              <option value="">Select teacher…</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Day *</label>
            <select value={form.day_of_week} onChange={f('day_of_week')}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600">
              {DAYS.slice(1,7).map((d,i) => <option key={d} value={i+1}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Time *" type="time" value={form.start_time} onChange={f('start_time')} />
            <Input label="End Time *"   type="time" value={form.end_time}   onChange={f('end_time')}   />
          </div>
          <Input label="Subject *"    value={form.subject}    onChange={f('subject')}    />
          <Input label="Class Name *" value={form.class_name} onChange={f('class_name')} />
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
