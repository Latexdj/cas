'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Student { id: string; surname: string; other_names: string | null; admission_number: string; }
interface AttendanceRow {
  student_id: string; status: 'present' | 'absent' | 'late' | 'excused' | null;
  attendance_id: string | null; notes: string | null;
}

const STATUSES = ['present','absent','late','excused'] as const;
type Status = typeof STATUSES[number];

const STATUS_COLOR: Record<Status, string> = {
  present: 'bg-green-500 text-white',
  absent:  'bg-red-500 text-white',
  late:    'bg-yellow-400 text-white',
  excused: 'bg-blue-400 text-white',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PrimaryAttendancePage() {
  const [date,        setDate]        = useState(today());
  const [students,    setStudents]    = useState<Student[]>([]);
  const [attend,      setAttend]      = useState<Record<string, Status>>({});
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState('');
  // Submission lock state
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [isLocked,         setIsLocked]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setSaved(false); setIsLocked(false); setAlreadySubmitted(false);
    try {
      const [stuRes, attRes] = await Promise.all([
        api.get<Student[]>('/api/primary/students'),
        api.get<AttendanceRow[]>(`/api/primary/attendance?date=${date}`),
      ]);
      setStudents(stuRes.data);

      const hasExisting = attRes.data.some(r => r.attendance_id != null);
      setAlreadySubmitted(hasExisting);
      setIsLocked(hasExisting);

      const map: Record<string, Status> = {};
      attRes.data.forEach(r => { if (r.status) map[r.student_id] = r.status as Status; });
      stuRes.data.forEach(s => { if (!map[s.id]) map[s.id] = 'present'; });
      setAttend(map);
    } catch { setError('Failed to load attendance.'); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  function setStatus(studentId: string, status: Status) {
    if (isLocked) return;
    setAttend(a => ({ ...a, [studentId]: status }));
    setSaved(false);
  }

  function markAll(status: Status) {
    if (isLocked) return;
    const next: Record<string, Status> = {};
    students.forEach(s => { next[s.id] = status; });
    setAttend(next); setSaved(false);
  }

  function requestEdit() {
    if (!confirm(
      `Attendance for ${date} has already been submitted.\n\n` +
      `Are you sure you want to edit it? This will overwrite the saved records.`
    )) return;
    setIsLocked(false);
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const records = students.map(s => ({ student_id: s.id, status: attend[s.id] ?? 'present' }));
      await api.post('/api/primary/attendance', { date, records });
      setSaved(true);
      setAlreadySubmitted(true);
      setIsLocked(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = students.filter(st => attend[st.id] === s).length;
    return acc;
  }, {});

  const isFutureDate = date > today();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Daily Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">{students.length} students</p>
        </div>
        {!isLocked && !isFutureDate && (
          <button onClick={save} disabled={saving || loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#15803D' }}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Attendance'}
          </button>
        )}
        {isLocked && (
          <button onClick={requestEdit}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100">
            Edit Attendance
          </button>
        )}
      </div>

      {/* Submission status banners */}
      {alreadySubmitted && isLocked && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <strong>Attendance already submitted</strong> for {date}. Click <em>Edit Attendance</em> if you need to make corrections.
          </span>
        </div>
      )}
      {alreadySubmitted && !isLocked && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span><strong>Editing already-submitted attendance.</strong> Saving will overwrite the existing records for {date}.</span>
        </div>
      )}
      {isFutureDate && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Attendance cannot be submitted for a future date.</span>
        </div>
      )}

      {/* Date + quick-mark */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-3 items-center shadow-sm">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          max={today()}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
        {!isLocked && !isFutureDate && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-500 font-medium">Mark all:</span>
            {STATUSES.map(s => (
              <button key={s} onClick={() => markAll(s)}
                className={`text-xs px-2.5 py-1 rounded-md font-semibold capitalize ${STATUS_COLOR[s]} opacity-80 hover:opacity-100`}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {STATUSES.map(s => (
          <div key={s} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 text-center">
            <p className="text-2xl font-black text-slate-900">{counts[s] ?? 0}</p>
            <p className="text-xs text-slate-500 capitalize">{s}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s, i) => {
                  const status = attend[s.id] ?? 'present';
                  return (
                    <tr key={s.id} className={status === 'absent' ? 'bg-red-50/50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{s.surname}{s.other_names ? ` ${s.other_names}` : ''}</p>
                        <p className="text-xs text-slate-400">{s.admission_number}</p>
                      </td>
                      <td className="px-3 py-2">
                        {isLocked || isFutureDate ? (
                          // Read-only display when locked
                          <span className={`text-xs px-2.5 py-1 rounded-md font-semibold capitalize ${STATUS_COLOR[status]}`}>
                            {status}
                          </span>
                        ) : (
                          <div className="flex gap-1.5 flex-wrap">
                            {STATUSES.map(st => (
                              <button key={st} onClick={() => setStatus(s.id, st)}
                                className={`text-xs px-2.5 py-1 rounded-md font-semibold capitalize border transition-all ${
                                  status === st
                                    ? STATUS_COLOR[st] + ' border-transparent shadow-sm'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                }`}>
                                {st}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-10 text-slate-400 text-sm">No students in your class.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
