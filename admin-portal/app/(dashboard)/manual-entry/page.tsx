'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Teacher, Location } from '@/types/api';

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  teacherId:   '',
  date:        today(),
  subject:     '',
  classNames:  '',
  periods:     '1',
  topic:       '',
  locationName:'',
};

export default function ManualEntryPage() {
  const [teachers,  setTeachers]  = useState<Teacher[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form,      setForm]      = useState(EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');

  useEffect(() => {
    api.get<Teacher[]>('/api/teachers').then(r => setTeachers(r.data.filter(t => t.status === 'Active')));
    api.get<Location[]>('/api/locations').then(r => setLocations(r.data));
  }, []);

  function set(field: keyof typeof EMPTY, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setError(''); setSuccess('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.teacherId || !form.subject.trim() || !form.classNames.trim() || !form.date) {
      setError('Teacher, date, subject and class names are required.');
      return;
    }
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.post('/api/admin/attendance', {
        teacherId:    form.teacherId,
        date:         form.date,
        subject:      form.subject.trim(),
        classNames:   form.classNames.trim(),
        periods:      parseInt(form.periods, 10) || 1,
        topic:        form.topic.trim() || undefined,
        locationName: form.locationName || undefined,
      });
      const teacher = teachers.find(t => t.id === form.teacherId);
      setSuccess(`Attendance recorded for ${teacher?.name ?? 'teacher'} on ${form.date}.`);
      setForm({ ...EMPTY, date: form.date }); // keep date for quick consecutive entries
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to record attendance.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500';
  const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Manual Attendance Entry</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record attendance on behalf of a teacher — use when a teacher cannot submit via the app.
        </p>
      </div>

      {/* Info banner */}
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>No photo required.</strong> This entry will be marked as "Manual entry by admin" in the attendance log.
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 font-medium">
          ✓ {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">

        {/* Teacher */}
        <div>
          <label className={labelCls}>Teacher *</label>
          <select
            className={inputCls}
            value={form.teacherId}
            onChange={e => set('teacherId', e.target.value)}
            required
          >
            <option value="">— Select teacher —</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{t.department ? ` (${t.department})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className={labelCls}>Date *</label>
          <input
            type="date"
            className={inputCls}
            value={form.date}
            max={today()}
            onChange={e => set('date', e.target.value)}
            required
          />
        </div>

        {/* Subject */}
        <div>
          <label className={labelCls}>Subject *</label>
          <input
            type="text"
            className={inputCls}
            placeholder="e.g. Mathematics"
            value={form.subject}
            onChange={e => set('subject', e.target.value)}
            required
          />
        </div>

        {/* Class Names */}
        <div>
          <label className={labelCls}>Class Name(s) *</label>
          <input
            type="text"
            className={inputCls}
            placeholder="e.g. Form 1A, Form 1B"
            value={form.classNames}
            onChange={e => set('classNames', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">Separate multiple classes with commas.</p>
        </div>

        {/* Periods */}
        <div>
          <label className={labelCls}>Periods *</label>
          <input
            type="number"
            className={inputCls}
            min={1} max={10}
            value={form.periods}
            onChange={e => set('periods', e.target.value)}
            required
          />
        </div>

        {/* Topic */}
        <div>
          <label className={labelCls}>Topic <span className="text-slate-400 font-normal">(optional)</span></label>
          <input
            type="text"
            className={inputCls}
            placeholder="e.g. Quadratic equations"
            value={form.topic}
            onChange={e => set('topic', e.target.value)}
          />
        </div>

        {/* Location */}
        <div>
          <label className={labelCls}>Location <span className="text-slate-400 font-normal">(optional)</span></label>
          <select
            className={inputCls}
            value={form.locationName}
            onChange={e => set('locationName', e.target.value)}
          >
            <option value="">— Not specified —</option>
            {locations.map(l => (
              <option key={l.id} value={l.name}>{l.name}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: '#15803D' }}
        >
          {saving ? 'Recording…' : 'Record Attendance'}
        </button>
      </form>
    </div>
  );
}
