'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AttRow {
  student_id: string; surname: string; other_names: string | null;
  admission_number: string; status: 'present'|'absent'|'late'|'excused'; attendance_id: string | null;
}
interface SummaryRow {
  student_id: string; surname: string; other_names: string | null; admission_number: string;
  present_days: number; absent_days: number; late_days: number; excused_days: number; total_marked: number;
}
interface Term { id: string; name: string; is_current: boolean; start_date: string | null; end_date: string | null; }

const CLASSES = ['Nursery 1','Nursery 2','KG 1','KG 2','Basic 1','Basic 2','Basic 3','Basic 4','Basic 5','Basic 6','JHS 1','JHS 2','JHS 3'];
const STATUSES = ['present','absent','late','excused'] as const;
type Status = typeof STATUSES[number];

const STATUS_STYLE: Record<Status, string> = {
  present: 'bg-green-600 text-white border-transparent',
  absent:  'bg-red-600 text-white border-transparent',
  late:    'bg-amber-500 text-white border-transparent',
  excused: 'bg-blue-600 text-white border-transparent',
};

function today() { return new Date().toISOString().slice(0, 10); }

export default function PrimaryStudentAttendancePage() {
  const [tab,       setTab]       = useState<'daily'|'summary'>('daily');
  const [className, setClassName] = useState('');

  // Daily
  const [date,    setDate]    = useState(today());
  const [rows,    setRows]    = useState<AttRow[]>([]);
  const [draft,   setDraft]   = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  // Summary
  const [terms,    setTerms]    = useState<Term[]>([]);
  const [termId,   setTermId]   = useState('');
  const [summary,  setSummary]  = useState<SummaryRow[]>([]);
  const [sumLoad,  setSumLoad]  = useState(false);

  useEffect(() => {
    api.get<Term[]>('/api/primary/terms').then(r => {
      setTerms(r.data);
      const cur = r.data.find(t => t.is_current);
      if (cur) setTermId(cur.id);
    }).catch(() => {});
  }, []);

  const loadDaily = useCallback(async () => {
    if (!className || !date) return;
    setLoading(true); setError(''); setSaved(false);
    try {
      const { data } = await api.get<AttRow[]>(`/api/primary/attendance?class_name=${encodeURIComponent(className)}&date=${date}`);
      setRows(data);
      const d: Record<string, Status> = {};
      data.forEach(r => { d[r.student_id] = r.status; });
      setDraft(d);
    } catch { setError('Failed to load attendance.'); }
    finally { setLoading(false); }
  }, [className, date]);

  const loadSummary = useCallback(async () => {
    if (!className || !termId) return;
    setSumLoad(true); setError('');
    try {
      const { data } = await api.get<SummaryRow[]>(`/api/primary/attendance/summary?class_name=${encodeURIComponent(className)}&term_id=${termId}`);
      setSummary(data);
    } catch { setError('Failed to load summary.'); }
    finally { setSumLoad(false); }
  }, [className, termId]);

  useEffect(() => { if (tab === 'daily') loadDaily(); }, [tab, loadDaily]);
  useEffect(() => { if (tab === 'summary') loadSummary(); }, [tab, loadSummary]);

  function markAll(s: Status) {
    setDraft(d => { const n = { ...d }; rows.forEach(r => { n[r.student_id] = s; }); return n; });
    setSaved(false);
  }

  async function save() {
    if (!className) return setError('Select a class first.');
    setSaving(true); setError('');
    try {
      const records = rows.map(r => ({ student_id: r.student_id, status: draft[r.student_id] ?? 'present' }));
      await api.post('/api/primary/attendance', { class_name: className, date, records });
      setSaved(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = rows.filter(r => draft[r.student_id] === s).length;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Student Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Daily register and term summary by class</p>
        </div>
        {tab === 'daily' && (
          <button onClick={save} disabled={saving || loading || !className}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 shadow-sm"
            style={{ backgroundColor: '#15803D' }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Attendance'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['daily','summary'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'daily' ? 'Daily Register' : 'Term Summary'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        <select value={className} onChange={e => setClassName(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700">
          <option value="">Select class…</option>
          {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {tab === 'daily' ? (
          <>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-slate-500">Mark all:</span>
              {STATUSES.map(s => (
                <button key={s} onClick={() => markAll(s)}
                  className={`text-xs px-2.5 py-1 rounded-md font-semibold capitalize border ${STATUS_STYLE[s]} opacity-80 hover:opacity-100`}>
                  {s}
                </button>
              ))}
            </div>
          </>
        ) : (
          <select value={termId} onChange={e => setTermId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700">
            <option value="">Select term…</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {!className && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 text-slate-300 mx-auto mb-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-slate-400 text-sm">Select a class to view attendance</p>
        </div>
      )}

      {/* DAILY TABLE */}
      {tab === 'daily' && className && (
        <>
          <div className="grid grid-cols-4 gap-3">
            {STATUSES.map(s => (
              <div key={s} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
                <p className="text-2xl font-black text-slate-900">{counts[s] ?? 0}</p>
                <p className="text-xs text-slate-500 capitalize mt-0.5">{s}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={3} className="text-center py-12">
                      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin mx-auto" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                    </td></tr>
                  ) : rows.map((r, i) => (
                    <tr key={r.student_id} className={draft[r.student_id] === 'absent' ? 'bg-red-50/40' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{r.surname}{r.other_names ? ` ${r.other_names}` : ''}</p>
                        <p className="text-xs text-slate-400">{r.admission_number}</p>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5 flex-wrap">
                          {STATUSES.map(s => (
                            <button key={s} onClick={() => { setDraft(d => ({ ...d, [r.student_id]: s })); setSaved(false); }}
                              className={`text-xs px-2.5 py-1 rounded-md font-semibold capitalize border transition-all ${
                                draft[r.student_id] === s ? STATUS_STYLE[s] : 'bg-white text-slate-500 border-gray-200 hover:border-gray-300'
                              }`}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && <tr><td colSpan={3} className="text-center py-10 text-slate-400 text-sm">No active students in this class.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* SUMMARY TABLE */}
      {tab === 'summary' && className && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['#','Student','Adm. No.','Present','Absent','Late','Excused','Total Days'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sumLoad ? (
                  <tr><td colSpan={8} className="text-center py-12">
                    <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin mx-auto" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                  </td></tr>
                ) : summary.map((r, i) => (
                  <tr key={r.student_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.surname}{r.other_names ? ` ${r.other_names}` : ''}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 font-mono">{r.admission_number}</td>
                    <td className="px-3 py-2.5 font-semibold text-green-700">{r.present_days}</td>
                    <td className="px-3 py-2.5 font-semibold text-red-600">{r.absent_days}</td>
                    <td className="px-3 py-2.5 font-semibold text-amber-600">{r.late_days}</td>
                    <td className="px-3 py-2.5 font-semibold text-blue-600">{r.excused_days}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.total_marked}</td>
                  </tr>
                ))}
                {!sumLoad && summary.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-slate-400 text-sm">No records for this term.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
