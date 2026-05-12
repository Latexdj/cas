'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Teacher, Location, Subject, ClassItem } from '@/types/api';

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  teacherId:   '',
  date:        today(),
  subject:     '',
  periods:     '1',
  topic:       '',
  locationName:'',
};

export default function ManualEntryPage() {
  const [teachers,  setTeachers]  = useState<Teacher[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [subjects,  setSubjects]  = useState<Subject[]>([]);
  const [classes,   setClasses]   = useState<ClassItem[]>([]);
  const [selCls,    setSelCls]    = useState<Set<string>>(new Set());
  const [form,      setForm]      = useState(EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');

  useEffect(() => {
    api.get<Teacher[]>('/api/teachers').then(r => setTeachers(r.data.filter(t => t.status === 'Active')));
    api.get<Location[]>('/api/locations').then(r => setLocations(r.data));
    api.get<Subject[]>('/api/subjects').then(r => setSubjects(r.data));
    api.get<ClassItem[]>('/api/classes').then(r => setClasses(r.data));
  }, []);

  function toggleClass(name: string) {
    setSelCls(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
    setError(''); setSuccess('');
  }

  function set(field: keyof typeof EMPTY, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setError(''); setSuccess('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.teacherId || !form.subject || selCls.size === 0 || !form.date || !form.topic.trim()) {
      setError('Teacher, date, subject, at least one class, and topic are all required.');
      return;
    }
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.post('/api/admin/attendance', {
        teacherId:    form.teacherId,
        date:         form.date,
        subject:      form.subject,
        classNames:   Array.from(selCls).join(', '),
        periods:      parseInt(form.periods, 10) || 1,
        topic:        form.topic.trim(),
        locationName: form.locationName || undefined,
      });
      const teacher = teachers.find(t => t.id === form.teacherId);
      setSuccess(`Attendance recorded for ${teacher?.name ?? 'teacher'} on ${form.date}.`);
      setForm({ ...EMPTY, date: form.date });
      setSelCls(new Set());
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
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Manual Attendance Entry</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record attendance on behalf of a teacher — use when a teacher cannot submit via the app.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>No photo required.</strong> This entry will be marked as &quot;Manual entry by admin&quot; in the attendance log.
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
          <select className={inputCls} value={form.teacherId} onChange={e => set('teacherId', e.target.value)} required>
            <option value="">— Select teacher —</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.department ? ` (${t.department})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className={labelCls}>Date *</label>
          <input type="date" className={inputCls} value={form.date} max={today()} onChange={e => set('date', e.target.value)} required />
        </div>

        {/* Subject */}
        <div>
          <label className={labelCls}>Subject *</label>
          {subjects.length > 0 ? (
            <select className={inputCls} value={form.subject} onChange={e => set('subject', e.target.value)} required>
              <option value="">— Select subject —</option>
              {subjects.map(s => (
                <option key={s.id} value={s.name}>{s.name}{s.code ? ` (${s.code})` : ''}</option>
              ))}
            </select>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              No subjects defined. Add subjects in the <strong>Subjects</strong> section first.
            </p>
          )}
        </div>

        {/* Classes multi-picker */}
        <div>
          <label className={labelCls}>
            Class(es) *
            {selCls.size > 0 && (
              <span className="ml-2 text-green-600 font-normal text-xs">({Array.from(selCls).join(', ')})</span>
            )}
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
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              No classes defined. Add classes in the <strong>Classes</strong> section first.
            </p>
          )}
        </div>

        {/* Periods */}
        <div>
          <label className={labelCls}>Periods *</label>
          <input type="number" className={inputCls} min={1} max={10} value={form.periods}
            onChange={e => set('periods', e.target.value)} required />
        </div>

        {/* Topic */}
        <div>
          <label className={labelCls}>Topic *</label>
          <input type="text" className={inputCls} placeholder="e.g. Quadratic equations"
            value={form.topic} onChange={e => set('topic', e.target.value)} required />
        </div>

        {/* Location */}
        <div>
          <label className={labelCls}>Location <span className="text-slate-400 font-normal">(optional)</span></label>
          <select className={inputCls} value={form.locationName} onChange={e => set('locationName', e.target.value)}>
            <option value="">— Not specified —</option>
            {locations.map(l => (
              <option key={l.id} value={l.name}>{l.name}</option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: '#15803D' }}>
          {saving ? 'Recording…' : 'Record Attendance'}
        </button>
      </form>
    </div>
  );
}
