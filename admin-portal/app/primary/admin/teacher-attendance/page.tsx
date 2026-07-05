'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface TeacherAttRow {
  teacher_id: string; teacher_name: string; teacher_code: string;
  status: 'present' | 'absent' | 'late' | 'excused'; notes: string | null;
  attendance_id: string | null;
}
interface SummaryRow {
  teacher_id: string; teacher_name: string; teacher_code: string;
  present_days: number; absent_days: number; late_days: number; excused_days: number; total_marked: number;
}

const STATUSES = ['present','absent','late','excused'] as const;
type Status = typeof STATUSES[number];

const STATUS_STYLE: Record<Status, { active: string; bg: string }> = {
  present: { active: 'bg-green-600 text-white border-transparent',  bg: 'bg-green-50 text-green-700' },
  absent:  { active: 'bg-red-600 text-white border-transparent',    bg: 'bg-red-50 text-red-700' },
  late:    { active: 'bg-amber-500 text-white border-transparent',  bg: 'bg-amber-50 text-amber-700' },
  excused: { active: 'bg-blue-600 text-white border-transparent',   bg: 'bg-blue-50 text-blue-700' },
};

function today() { return new Date().toISOString().slice(0, 10); }
function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default function PrimaryTeacherAttendancePage() {
  const [tab, setTab] = useState<'daily'|'summary'>('daily');

  // Daily tab
  const [date,    setDate]    = useState(today());
  const [rows,    setRows]    = useState<TeacherAttRow[]>([]);
  const [draft,   setDraft]   = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  // Summary tab
  const [month,   setMonth]   = useState(currentMonth());
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [sumLoad, setSumLoad] = useState(false);

  const loadDaily = useCallback(async () => {
    setLoading(true); setError(''); setSaved(false);
    try {
      const { data } = await api.get<TeacherAttRow[]>(`/api/primary/teacher-attendance?date=${date}`);
      setRows(data);
      const d: Record<string, Status> = {};
      data.forEach(r => { d[r.teacher_id] = r.status; });
      setDraft(d);
    } catch { setError('Failed to load attendance.'); }
    finally { setLoading(false); }
  }, [date]);

  const loadSummary = useCallback(async () => {
    setSumLoad(true);
    try {
      const { data } = await api.get<SummaryRow[]>(`/api/primary/teacher-attendance/summary?month=${month}`);
      setSummary(data);
    } catch { setError('Failed to load summary.'); }
    finally { setSumLoad(false); }
  }, [month]);

  useEffect(() => { if (tab === 'daily') loadDaily(); }, [tab, loadDaily]);
  useEffect(() => { if (tab === 'summary') loadSummary(); }, [tab, loadSummary]);

  function markAll(s: Status) {
    setDraft(d => { const n = { ...d }; rows.forEach(r => { n[r.teacher_id] = s; }); return n; });
    setSaved(false);
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const records = rows.map(r => ({ teacher_id: r.teacher_id, status: draft[r.teacher_id] ?? 'present' }));
      await api.post('/api/primary/teacher-attendance', { date, records });
      setSaved(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = rows.filter(r => draft[r.teacher_id] === s).length;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Teacher Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Daily register and monthly summary</p>
        </div>
        {tab === 'daily' && (
          <button onClick={save} disabled={saving || loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 shadow-sm"
            style={{ backgroundColor: '#15803D' }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Attendance'}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['daily', 'summary'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'daily' ? 'Daily Register' : 'Monthly Summary'}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {/* DAILY TAB */}
      {tab === 'daily' && (
        <>
          {/* Controls */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-slate-500 font-medium">Mark all:</span>
              {STATUSES.map(s => (
                <button key={s} onClick={() => markAll(s)}
                  className={`text-xs px-2.5 py-1 rounded-md font-semibold capitalize border ${STATUS_STYLE[s].active} opacity-80 hover:opacity-100`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Summary pills */}
          <div className="grid grid-cols-4 gap-3">
            {STATUSES.map(s => (
              <div key={s} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
                <p className="text-2xl font-black text-slate-900">{counts[s] ?? 0}</p>
                <p className="text-xs text-slate-500 capitalize mt-0.5">{s}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Teacher</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={3} className="text-center py-12">
                      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin mx-auto" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                    </td></tr>
                  ) : rows.map((r, i) => (
                    <tr key={r.teacher_id} className={draft[r.teacher_id] === 'absent' ? 'bg-red-50/40' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{r.teacher_name}</p>
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded border" style={{ color: '#15803D', backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }}>{r.teacher_code}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5 flex-wrap">
                          {STATUSES.map(s => (
                            <button key={s} onClick={() => { setDraft(d => ({ ...d, [r.teacher_id]: s })); setSaved(false); }}
                              className={`text-xs px-2.5 py-1 rounded-md font-semibold capitalize border transition-all ${
                                draft[r.teacher_id] === s ? STATUS_STYLE[s].active : 'bg-white text-slate-500 border-gray-200 hover:border-gray-300'
                              }`}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={3} className="text-center py-12 text-slate-400 text-sm">No active teachers found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* SUMMARY TAB */}
      {tab === 'summary' && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex gap-3 items-center">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Teacher','Code','Present','Absent','Late','Excused','Days Marked'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sumLoad ? (
                    <tr><td colSpan={7} className="text-center py-12">
                      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin mx-auto" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                    </td></tr>
                  ) : summary.map(r => (
                    <tr key={r.teacher_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-slate-900">{r.teacher_name}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded border" style={{ color: '#15803D', backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }}>{r.teacher_code}</span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-green-700">{r.present_days}</td>
                      <td className="px-3 py-2.5 font-semibold text-red-600">{r.absent_days}</td>
                      <td className="px-3 py-2.5 font-semibold text-amber-600">{r.late_days}</td>
                      <td className="px-3 py-2.5 font-semibold text-blue-600">{r.excused_days}</td>
                      <td className="px-3 py-2.5 text-slate-600">{r.total_marked}</td>
                    </tr>
                  ))}
                  {!sumLoad && summary.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-sm">No records for this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
