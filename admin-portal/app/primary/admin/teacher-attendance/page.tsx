'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface AttRecord {
  id: string; teacher_id: string; teacher_name: string; teacher_code: string;
  date: string; status: string; is_auto_generated: boolean;
  clock_in_time: string | null; clock_in_gps: string | null; clock_in_location_verified: boolean;
  clock_in_photo: string | null; photo_size_kb_in: number | null;
  clock_out_time: string | null; clock_out_gps: string | null; clock_out_location_verified: boolean;
  clock_out_photo: string | null; photo_size_kb_out: number | null;
  manual_entry_by: string | null; manual_entry_by_name: string | null; manual_entry_note: string | null;
}

interface Teacher { id: string; name: string; teacher_code: string; }
interface ReportRow {
  teacher_id: string; teacher_name: string; teacher_code: string;
  days_present: number; days_absent: number; days_excused: number;
  days_incomplete: number; total_marked: number; attendance_pct: number | null;
}
interface Term { id: string; name: string; }

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function statusChip(status: string, isAuto: boolean) {
  const base = 'text-xs font-semibold px-2 py-0.5 rounded-full';
  if (status === 'present')  return <span className={`${base} bg-green-100 text-green-700`}>Present</span>;
  if (status === 'excused')  return <span className={`${base} bg-blue-100 text-blue-600`}>Excused</span>;
  if (status === 'absent')   return <span className={`${base} ${isAuto ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>{isAuto ? 'Auto-Absent' : 'Absent'}</span>;
  return <span className={`${base} bg-gray-100 text-gray-600`}>{status}</span>;
}

export default function PrimaryTeacherAttendancePage() {
  const [tab, setTab] = useState<'log' | 'report'>('log');

  // Log tab
  const [date,      setDate]      = useState(new Date().toISOString().slice(0, 10));
  const [records,   setRecords]   = useState<AttRecord[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  // Photo modal
  const [photoModal, setPhotoModal] = useState<{ src: string; label: string; gps: string | null; kb: number | null; time: string | null } | null>(null);

  // Manual entry modal
  const [manualModal, setManualModal]   = useState(false);
  const [teachers,    setTeachers]      = useState<Teacher[]>([]);
  const [manTeacher,  setManTeacher]    = useState('');
  const [manDate,     setManDate]       = useState(new Date().toISOString().slice(0, 10));
  const [manNote,     setManNote]       = useState('');
  const [manSaving,   setManSaving]     = useState(false);

  // Report tab
  const [terms,        setTerms]        = useState<Term[]>([]);
  const [termId,       setTermId]       = useState('');
  const [report,       setReport]       = useState<ReportRow[]>([]);
  const [reportLoad,   setReportLoad]   = useState(false);

  const loadLog = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get<AttRecord[]>(`/api/primary/admin/self-attendance?date=${date}`);
      setRecords(data);
    } catch { setError('Failed to load attendance records.'); }
    finally { setLoading(false); }
  }, [date]);

  const loadReport = useCallback(async () => {
    setReportLoad(true);
    try {
      const q = termId ? `?term_id=${termId}` : '';
      const { data } = await api.get<ReportRow[]>(`/api/primary/admin/self-attendance/report${q}`);
      setReport(data);
    } catch { setError('Failed to load report.'); }
    finally { setReportLoad(false); }
  }, [termId]);

  useEffect(() => { if (tab === 'log') loadLog(); }, [tab, loadLog]);
  useEffect(() => { if (tab === 'report') loadReport(); }, [tab, loadReport]);
  useEffect(() => {
    api.get<Teacher[]>('/api/teachers').then(r => setTeachers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get<Term[]>('/api/primary/terms').then(r => {
      setTerms(r.data);
      const cur = r.data.find((t: Term & { is_current?: boolean }) => (t as unknown as { is_current: boolean }).is_current);
      if (cur) setTermId(cur.id);
    }).catch(() => {});
  }, []);

  async function submitManual() {
    if (!manTeacher || !manDate) return;
    setManSaving(true);
    try {
      await api.post('/api/primary/admin/self-attendance/manual', { teacher_id: manTeacher, date: manDate, note: manNote });
      setManualModal(false); setManTeacher(''); setManNote('');
      loadLog();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save');
    } finally { setManSaving(false); }
  }

  async function deleteRecord(id: string) {
    if (!confirm('Delete this attendance record?')) return;
    await api.delete(`/api/primary/admin/self-attendance/${id}`);
    setRecords(r => r.filter(x => x.id !== id));
  }

  const attPctColor = (pct: number | null) => {
    if (pct === null) return 'text-slate-400';
    if (pct >= 90) return 'text-green-600';
    if (pct >= 75) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Teacher Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">GPS-verified clock-in records</p>
        </div>
        <button onClick={() => setManualModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: '#15803D' }}>
          + Manual Entry
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['log', 'report'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'log' ? 'Daily Log' : 'Term Report'}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {/* DAILY LOG */}
      {tab === 'log' && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex gap-3 items-center">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            <button onClick={loadLog} className="text-xs font-semibold text-green-700 hover:text-green-800">Refresh</button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Teacher', 'Status', 'Clock In', 'Clock Out', 'GPS In', 'Photos', 'Actions'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={7} className="text-center py-12">
                      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin mx-auto" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                    </td></tr>
                  ) : records.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-sm">No records for this date.</td></tr>
                  ) : records.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{r.teacher_name}</p>
                        <span className="font-mono text-xs text-slate-400">{r.teacher_code}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {statusChip(r.status, r.is_auto_generated)}
                        {r.manual_entry_by_name && (
                          <p className="text-xs text-slate-400 mt-0.5">by {r.manual_entry_by_name}</p>
                        )}
                        {r.clock_in_time && !r.clock_out_time && !r.is_auto_generated && (
                          <span className="text-xs text-amber-600 font-medium">No clock-out</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{fmt(r.clock_in_time)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{fmt(r.clock_out_time)}</td>
                      <td className="px-3 py-2.5">
                        {r.clock_in_gps ? (
                          <a href={`https://www.google.com/maps?q=${r.clock_in_gps}`} target="_blank" rel="noreferrer"
                            className={`text-xs font-semibold ${r.clock_in_location_verified ? 'text-green-600' : 'text-red-500'}`}>
                            {r.clock_in_location_verified ? '✓ Verified' : '✗ Out of range'}
                          </a>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          {r.clock_in_photo && (
                            <button onClick={() => setPhotoModal({ src: r.clock_in_photo!, label: 'Clock In', gps: r.clock_in_gps, kb: r.photo_size_kb_in, time: r.clock_in_time })}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">In</button>
                          )}
                          {r.clock_out_photo && (
                            <button onClick={() => setPhotoModal({ src: r.clock_out_photo!, label: 'Clock Out', gps: r.clock_out_gps, kb: r.photo_size_kb_out, time: r.clock_out_time })}
                              className="text-xs font-semibold text-purple-600 hover:text-purple-700 border border-purple-200 rounded px-1.5 py-0.5">Out</button>
                          )}
                          {!r.clock_in_photo && !r.clock_out_photo && <span className="text-xs text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => deleteRecord(r.id)} className="text-xs text-red-500 hover:text-red-700 font-semibold">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TERM REPORT */}
      {tab === 'report' && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex gap-3 items-center">
            <select value={termId} onChange={e => setTermId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
              <option value="">All terms</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Teacher', 'Present', 'Absent', 'Excused', 'Incomplete', 'Days Marked', 'Attendance %'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reportLoad ? (
                    <tr><td colSpan={7} className="text-center py-12">
                      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin mx-auto" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                    </td></tr>
                  ) : report.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-sm">No records.</td></tr>
                  ) : report.map(r => (
                    <tr key={r.teacher_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{r.teacher_name}</p>
                        <span className="font-mono text-xs text-slate-400">{r.teacher_code}</span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-green-700">{r.days_present}</td>
                      <td className="px-3 py-2.5 font-semibold text-red-600">{r.days_absent}</td>
                      <td className="px-3 py-2.5 font-semibold text-blue-600">{r.days_excused}</td>
                      <td className="px-3 py-2.5 font-semibold text-amber-600">{r.days_incomplete}</td>
                      <td className="px-3 py-2.5 text-slate-600">{r.total_marked}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${r.attendance_pct ?? 0}%`, backgroundColor: '#15803D' }} />
                          </div>
                          <span className={`text-xs font-bold tabular-nums ${attPctColor(r.attendance_pct)}`}>
                            {r.attendance_pct !== null ? `${r.attendance_pct}%` : 'No data'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Photo Modal */}
      {photoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPhotoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-bold text-slate-800">{photoModal.label} Photo</p>
              <button onClick={() => setPhotoModal(null)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>
            <img src={photoModal.src} alt="Attendance photo" className="w-full object-contain max-h-80" />
            <div className="px-5 py-3 space-y-1 text-xs text-slate-500">
              {photoModal.time && <p>Time: <span className="font-mono text-slate-700">{new Date(photoModal.time).toLocaleString('en-GB')}</span></p>}
              {photoModal.kb && <p>Size: <span className="text-slate-700">{photoModal.kb} KB</span></p>}
              {photoModal.gps && (
                <p>GPS: <a href={`https://www.google.com/maps?q=${photoModal.gps}`} target="_blank" rel="noreferrer"
                  className="text-blue-600 underline font-mono">{photoModal.gps}</a></p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {manualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Manual Entry</h2>
              <button onClick={() => setManualModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <p className="text-xs text-slate-500">No GPS or photo required. Use this for teachers who had network/device issues.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Teacher</label>
                <select value={manTeacher} onChange={e => setManTeacher(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select teacher…</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.teacher_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                <input type="date" value={manDate} onChange={e => setManDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Note (optional)</label>
                <input value={manNote} onChange={e => setManNote(e.target.value)}
                  placeholder="e.g. Phone was out of battery"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setManualModal(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-slate-600">Cancel</button>
              <button onClick={submitManual} disabled={manSaving || !manTeacher}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#15803D' }}>
                {manSaving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
