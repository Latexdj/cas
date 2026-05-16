'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Teacher, Location, Subject, ClassItem } from '@/types/api';

interface Student {
  id: string;
  student_code: string;
  name: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  teacherId:    '',
  date:         today(),
  subject:      '',
  periods:      '1',
  topic:        '',
  locationName: '',
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

  // Step 2 state
  const [step,         setStep]         = useState<1 | 2>(1);
  const [attendanceId, setAttendanceId] = useState('');
  const [classQueue,   setClassQueue]   = useState<string[]>([]);
  const [queueIdx,     setQueueIdx]     = useState(0);
  const [students,     setStudents]     = useState<Student[]>([]);
  const [absentIds,    setAbsentIds]    = useState<Set<string>>(new Set());
  const [studLoading,  setStudLoading]  = useState(false);
  const [step2Saving,  setStep2Saving]  = useState(false);
  const [step2Error,   setStep2Error]   = useState('');

  useEffect(() => {
    api.get<Teacher[]>('/api/teachers').then(r => setTeachers(r.data.filter(t => t.status === 'Active')));
    api.get<Location[]>('/api/locations').then(r => setLocations(r.data));
    api.get<Subject[]>('/api/subjects').then(r => setSubjects(r.data));
    api.get<ClassItem[]>('/api/classes').then(r => setClasses(r.data));
  }, []);

  function toggleClass(name: string) {
    setSelCls(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
    setError('');
  }

  function setField(field: keyof typeof EMPTY, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  }

  const loadClassStudents = useCallback(async (className: string) => {
    setStudLoading(true);
    try {
      const { data } = await api.get<Student[]>(`/api/students?class_name=${encodeURIComponent(className)}&status=Active`);
      setStudents(data ?? []);
      setAbsentIds(new Set());
    } finally {
      setStudLoading(false);
    }
  }, []);

  // ── Step 1: record teacher attendance ──────────────────────────
  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    if (!form.teacherId || !form.subject || selCls.size === 0 || !form.date || !form.topic.trim()) {
      setError('Teacher, date, subject, at least one class, and topic are all required.');
      return;
    }
    setSaving(true); setError('');
    try {
      const { data } = await api.post<{ id: string; classQueue: string[] }>('/api/admin/attendance', {
        teacherId:    form.teacherId,
        date:         form.date,
        subject:      form.subject,
        classNames:   Array.from(selCls).join(', '),
        periods:      parseInt(form.periods, 10) || 1,
        topic:        form.topic.trim(),
        locationName: form.locationName || undefined,
      });
      setAttendanceId(data.id);
      setClassQueue(data.classQueue);
      setQueueIdx(0);
      await loadClassStudents(data.classQueue[0]);
      setStep(2);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to record attendance.');
    } finally {
      setSaving(false);
    }
  }

  // ── Step 2: submit student attendance for current class ────────
  async function handleStep2() {
    const currentClass = classQueue[queueIdx];
    const teacher = teachers.find(t => t.id === form.teacherId)!;
    setStep2Saving(true); setStep2Error('');
    try {
      await api.post('/api/student-attendance/submit', {
        attendanceId,
        teacherId:     form.teacherId,
        subject:       form.subject,
        className:     currentClass,
        lessonEndTime: null,
        records: students.map(s => ({
          studentId: s.id,
          status:    absentIds.has(s.id) ? 'Absent' : 'Present',
        })),
      });

      const nextIdx = queueIdx + 1;
      if (nextIdx < classQueue.length) {
        setQueueIdx(nextIdx);
        await loadClassStudents(classQueue[nextIdx]);
      } else {
        // All classes done — reset
        setStep(1);
        setForm({ ...EMPTY, date: form.date });
        setSelCls(new Set());
        setAttendanceId('');
        setClassQueue([]);
        setQueueIdx(0);
        setStudents([]);
        setAbsentIds(new Set());
        setError('');
        // Show a brief success by setting error to a success-flavoured string
        // (reuse the existing success pattern via a dedicated state below)
        setDoneMsg(`Attendance and student records saved for ${teacher?.name} on ${form.date}.`);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setStep2Error(msg ?? 'Failed to save student attendance.');
    } finally {
      setStep2Saving(false); }
  }

  const [doneMsg, setDoneMsg] = useState('');

  const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500';
  const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

  const presentCount = students.length - absentIds.size;
  const currentClass = classQueue[queueIdx];

  // ── Step 2 UI ──────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep(1)}
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
            ←
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Student Attendance</h1>
            <p className="text-sm text-slate-500">
              {form.subject} — {currentClass}
              {classQueue.length > 1 && ` (${queueIdx + 1} of ${classQueue.length})`}
            </p>
          </div>
        </div>

        {/* Progress chips for merged classes */}
        {classQueue.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {classQueue.map((cls, i) => {
              const isDone    = i < queueIdx;
              const isCurrent = i === queueIdx;
              return (
                <span key={cls} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{
                    background: isDone ? '#DCFCE7' : isCurrent ? '#15803D' : '#F1F5F9',
                    color:      isDone ? '#166534' : isCurrent ? '#fff'    : '#64748B',
                  }}>
                  {isDone ? `✓ ${cls}` : cls}
                </span>
              );
            })}
          </div>
        )}

        {/* Counts */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Present', value: presentCount,    bg: '#F0FDF4', color: '#15803D' },
            { label: 'Absent',  value: absentIds.size,  bg: '#FEF2F2', color: '#DC2626' },
            { label: 'Total',   value: students.length, bg: '#F8FAFC', color: '#64748B' },
          ].map(({ label, value, bg, color }) => (
            <div key={label} className="rounded-xl p-3 text-center" style={{ background: bg }}>
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
              <p className="text-xs font-semibold mt-0.5" style={{ color }}>{label}</p>
            </div>
          ))}
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
          Click a student to mark absent
        </p>

        {studLoading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="bg-white rounded-xl h-14 animate-pulse border border-slate-100" />
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-500">No active students found for <strong>{currentClass}</strong>.</p>
            <p className="text-xs text-slate-400 mt-1">You can still proceed — no student records will be created.</p>
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            {students.map(s => {
              const absent = absentIds.has(s.id);
              return (
                <button key={s.id} type="button"
                  onClick={() => setAbsentIds(prev => {
                    const n = new Set(prev); absent ? n.delete(s.id) : n.add(s.id); return n;
                  })}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-left"
                  style={{ borderColor: absent ? '#FCA5A5' : '#E2E8F0', background: absent ? '#FEF2F2' : 'white' }}>
                  <div>
                    <p className="text-xs font-bold text-slate-400">{s.student_code}</p>
                    <p className="text-sm font-semibold" style={{ color: absent ? '#DC2626' : '#0F172A' }}>{s.name}</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ background: absent ? '#FEE2E2' : '#DCFCE7', color: absent ? '#DC2626' : '#166534' }}>
                    {absent ? 'Absent' : 'Present'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step2Error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {step2Error}
          </p>
        )}

        <button onClick={handleStep2} disabled={step2Saving || studLoading}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: '#15803D' }}>
          {step2Saving
            ? 'Saving…'
            : queueIdx < classQueue.length - 1
              ? `Submit & Mark ${classQueue[queueIdx + 1]} →`
              : 'Save Student Attendance ✓'}
        </button>
      </div>
    );
  }

  // ── Step 1 UI ──────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Manual Attendance Entry</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record attendance on behalf of a teacher — use when a teacher cannot submit via the app.
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>No photo or GPS required.</strong> This entry will be marked as &quot;Manual entry by admin&quot; in the attendance log.
      </div>

      {doneMsg && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 font-medium">
          ✓ {doneMsg}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleStep1} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">

        {/* Teacher */}
        <div>
          <label className={labelCls}>Teacher *</label>
          <select className={inputCls} value={form.teacherId} onChange={e => setField('teacherId', e.target.value)} required>
            <option value="">— Select teacher —</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.department ? ` (${t.department})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className={labelCls}>Date *</label>
          <input type="date" className={inputCls} value={form.date} max={today()}
            onChange={e => setField('date', e.target.value)} required />
        </div>

        {/* Subject */}
        <div>
          <label className={labelCls}>Subject *</label>
          {subjects.length > 0 ? (
            <select className={inputCls} value={form.subject} onChange={e => setField('subject', e.target.value)} required>
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
            onChange={e => setField('periods', e.target.value)} required />
        </div>

        {/* Topic */}
        <div>
          <label className={labelCls}>Topic *</label>
          <input type="text" className={inputCls} placeholder="e.g. Quadratic equations"
            value={form.topic} onChange={e => setField('topic', e.target.value)} required />
        </div>

        {/* Location */}
        <div>
          <label className={labelCls}>Location <span className="text-slate-400 font-normal">(optional)</span></label>
          <select className={inputCls} value={form.locationName} onChange={e => setField('locationName', e.target.value)}>
            <option value="">— Not specified —</option>
            {locations.map(l => (
              <option key={l.id} value={l.name}>{l.name}</option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: '#15803D' }}>
          {saving ? 'Recording…' : 'Next: Mark Student Attendance →'}
        </button>
      </form>
    </div>
  );
}
