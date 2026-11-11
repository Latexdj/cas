'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface StudentHit {
  id: string; student_code: string; name: string; class_name: string | null;
  house: string | null; guardian_mobile: string | null;
}

const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';
const labelCls = 'text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1';

function today() { return new Date().toISOString().slice(0, 10); }
function nowTime() { return new Date().toTimeString().slice(0, 5); }

// Admin issues an exeat for any student (internal or external). Housemasters
// issue theirs from the teacher portal's House Students page.
export default function IssueExeatModal({ onClose, onIssued }: { onClose: () => void; onIssued: () => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState<StudentHit | null>(null);
  const [type, setType] = useState<'internal' | 'external'>('internal');
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState('');
  const [depDate, setDepDate] = useState(today());
  const [depTime, setDepTime] = useState(nowTime());
  const [retDate, setRetDate] = useState(today());
  const [retTime, setRetTime] = useState('18:00');
  const [notes, setNotes] = useState('');
  const [grantNow, setGrantNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (student || query.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      setSearching(true);
      api.get<StudentHit[]>('/api/exeat/house-students', { params: { q: query.trim() } })
        .then(r => setHits(r.data))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, student]);

  function pick(s: StudentHit) {
    setStudent(s); setHits([]); setQuery('');
    setContact(s.guardian_mobile ?? '');
  }

  async function save() {
    if (!student) { setError('Choose a student.'); return; }
    if (!depDate || !depTime || !retDate || !retTime) { setError('Enter the departure and expected return date and time.'); return; }
    if (`${retDate}T${retTime}` <= `${depDate}T${depTime}`) { setError('The expected return must be after the departure.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/exeat', {
        student_id: student.id, exeat_type: type,
        destination: destination.trim() || null, reason: reason.trim() || null,
        parent_contact: contact.trim() || null,
        departure_date: depDate, departure_time: depTime,
        expected_return_date: retDate, expected_return_time: retTime,
        notes: notes.trim() || null, grant_immediately: grantNow,
      });
      onIssued();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Could not issue the exeat. Check your connection and try again.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/55 px-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-900 dark:text-white">Issue exeat</p>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div>
          <label className={labelCls}>Student</label>
          {student ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{student.name}</p>
                <p className="text-xs text-slate-400">{student.student_code}, {student.class_name ?? 'no class'}{student.house ? `, ${student.house}` : ''}</p>
              </div>
              <button onClick={() => setStudent(null)} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">Change</button>
            </div>
          ) : (
            <>
              <input className={inputCls} value={query} onChange={e => setQuery(e.target.value)} placeholder="Type a name or student ID" autoFocus />
              {searching && <p className="text-xs text-slate-400 mt-1">Searching…</p>}
              {hits.length > 0 && (
                <div className="mt-1 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                  {hits.map(h => (
                    <button key={h.id} onClick={() => pick(h)} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700">
                      <span className="block text-sm text-slate-900 dark:text-white">{h.name}</span>
                      <span className="block text-xs text-slate-400">{h.student_code}, {h.class_name ?? 'no class'}{h.house ? `, ${h.house}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
              {!searching && query.trim().length >= 2 && hits.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No active student matches that name or ID.</p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-1 bg-slate-100 dark:bg-slate-900/40 rounded-lg p-1">
          {(['internal', 'external'] as const).map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 py-1.5 rounded-md text-sm font-semibold capitalize transition-colors ${type === t ? 'bg-[#145C44] text-white' : 'text-slate-600 dark:text-slate-300'}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Destination</label>
            <input className={inputCls} value={destination} onChange={e => setDestination(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Parent contact</label>
            <input className={inputCls} value={contact} onChange={e => setContact(e.target.value)} placeholder="Phone for the SMS" />
          </div>
          <div>
            <label className={labelCls}>Leaves</label>
            <div className="flex gap-2">
              <input type="date" className={inputCls} value={depDate} onChange={e => setDepDate(e.target.value)} />
              <input type="time" className={`${inputCls} w-28`} value={depTime} onChange={e => setDepTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Expected back</label>
            <div className="flex gap-2">
              <input type="date" className={inputCls} value={retDate} onChange={e => setRetDate(e.target.value)} />
              <input type="time" className={`${inputCls} w-28`} value={retTime} onChange={e => setRetTime(e.target.value)} />
            </div>
          </div>
        </div>
        <div>
          <label className={labelCls}>Reason</label>
          <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Notes (optional)</label>
          <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={grantNow} onChange={e => setGrantNow(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#145C44]" />
          <span>Grant now <span className="text-slate-400">(the student is marked as out and the parent gets an SMS). Untick to save it as pending.</span></span>
        </label>

        {error && <p className="text-sm text-[#B83232]">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#145C44] hover:bg-[#0B3D2E] text-white text-sm font-semibold disabled:opacity-40 transition-colors">
            {saving ? 'Issuing…' : grantNow ? 'Grant exeat' : 'Save as pending'}
          </button>
        </div>
      </div>
    </div>
  );
}
