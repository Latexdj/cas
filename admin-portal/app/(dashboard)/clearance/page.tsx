'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface ClearanceStudent {
  id: string; name: string; student_code: string; class_name: string;
  clearance_id: string | null; is_fully_cleared: boolean | null;
  initiated_at: string | null; fully_cleared_at: string | null;
  total_offices: number; cleared_count: number; not_cleared_count: number;
}
interface ClearanceItem {
  id: string; office_id: string; office_name: string; office_type: string;
  status: 'pending' | 'cleared' | 'not_cleared'; notes: string | null; actioned_at: string | null;
}
interface StudentDetail {
  student: { id: string; name: string; student_code: string; class_name: string; picture_url: string | null };
  clearance: ClearanceItem[];
}

const STATUS_STYLE = {
  cleared:     { dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50',  label: 'Cleared'       },
  not_cleared: { dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    label: 'Not Cleared'   },
  pending:     { dot: 'bg-amber-400',  text: 'text-amber-700',  bg: 'bg-amber-50',  label: 'Pending'       },
};

export default function ClearancePage() {
  const [classes,    setClasses]    = useState<string[]>([]);
  const [students,   setStudents]   = useState<ClearanceStudent[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detail,     setDetail]     = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Batch initiation
  const [showBatch,    setShowBatch]    = useState(false);
  const [batchClasses, setBatchClasses] = useState<string[]>([]);
  const [initiating,   setInitiating]   = useState(false);
  const [batchResult,  setBatchResult]  = useState<{ initiated: number; skipped: number; total: number } | null>(null);
  const [batchError,   setBatchError]   = useState('');

  // Override modal
  const [override,    setOverride]    = useState<{ item: ClearanceItem; studentId: string } | null>(null);
  const [ovStatus,    setOvStatus]    = useState<'pending' | 'cleared' | 'not_cleared'>('pending');
  const [ovNotes,     setOvNotes]     = useState('');
  const [ovSaving,    setOvSaving]    = useState(false);

  useEffect(() => {
    api.get<string[]>('/api/clearance-admin/classes').then(r => setClasses(r.data)).catch(() => {});
  }, []);

  const loadStudents = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (search)       q.set('search',     search);
    if (classFilter)  q.set('class_name', classFilter);
    if (statusFilter) q.set('status',     statusFilter);
    api.get<ClearanceStudent[]>(`/api/clearance-admin/students?${q}`)
      .then(r => setStudents(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, classFilter, statusFilter]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  async function loadDetail(studentId: string) {
    setDetailLoading(true);
    try {
      const r = await api.get<StudentDetail>(`/api/clearance-admin/students/${studentId}`);
      setDetail(r.data);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  }

  async function handleBatchInitiate() {
    if (!batchClasses.length) return;
    setInitiating(true); setBatchResult(null); setBatchError('');
    try {
      const r = await api.post<{ initiated: number; skipped: number; total: number }>(
        '/api/clearance-admin/initiate', { class_names: batchClasses }
      );
      setBatchResult(r.data);
      loadStudents();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setBatchError(msg ?? 'Initiation failed. Please try again.');
    } finally { setInitiating(false); }
  }

  function openOverride(item: ClearanceItem, studentId: string) {
    setOverride({ item, studentId });
    setOvStatus(item.status);
    setOvNotes(item.notes ?? '');
  }

  async function submitOverride() {
    if (!override) return;
    if (ovStatus === 'not_cleared' && !ovNotes.trim()) return;
    setOvSaving(true);
    try {
      await api.post(`/api/clearance-admin/students/${override.studentId}/override`, {
        item_id: override.item.id, status: ovStatus, notes: ovNotes.trim() || null,
      });
      setOverride(null);
      await loadDetail(override.studentId);
      loadStudents();
    } catch { }
    finally { setOvSaving(false); }
  }

  const sel = 'border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Student Clearance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track and manage student clearance for certificate collection</p>
        </div>
        <button onClick={() => { setShowBatch(true); setBatchResult(null); setBatchError(''); setBatchClasses([]); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          Initiate Batch Clearance
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Search</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or student ID…"
            className={`${sel} w-full`} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Class</label>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className={sel}>
            <option value="">All classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={sel}>
            <option value="">All</option>
            <option value="not_initiated">Not Initiated</option>
            <option value="in_progress">In Progress</option>
            <option value="fully_cleared">Fully Cleared</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-7 h-7 rounded-full border-2 border-green-600 border-t-transparent animate-spin" /></div>
        ) : students.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">No students found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Progress</th>
                <th className="px-4 py-3 text-left">Initiated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map(s => {
                const pct = s.total_offices > 0 ? Math.round((s.cleared_count / s.total_offices) * 100) : 0;
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{s.student_code}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.class_name}</td>
                    <td className="px-4 py-3 text-center">
                      {!s.clearance_id ? (
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full font-semibold">Not started</span>
                      ) : s.is_fully_cleared ? (
                        <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded-full font-semibold">Fully Cleared</span>
                      ) : s.not_cleared_count > 0 ? (
                        <span className="text-xs text-red-700 bg-red-100 px-2 py-1 rounded-full font-semibold">Action Required</span>
                      ) : (
                        <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded-full font-semibold">In Progress</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.clearance_id ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2 min-w-[60px]">
                            <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 shrink-0">{s.cleared_count}/{s.total_offices}</span>
                        </div>
                      ) : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {s.initiated_at ? new Date(s.initiated_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => loadDetail(s.id)}
                        className="text-xs font-semibold text-green-700 hover:text-green-900 px-3 py-1.5 rounded-lg hover:bg-green-50">
                        View →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Student Detail Drawer */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg bg-white h-full flex flex-col shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="flex-1">
                <p className="font-bold text-slate-800">{detail?.student.name ?? '…'}</p>
                <p className="text-xs text-slate-400 font-mono">{detail?.student.student_code} · {detail?.student.class_name}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            {detailLoading ? (
              <div className="flex-1 flex justify-center items-center"><div className="w-7 h-7 rounded-full border-2 border-green-600 border-t-transparent animate-spin" /></div>
            ) : !detail?.clearance.length ? (
              <div className="p-8 text-center text-slate-400 text-sm">Clearance not initiated for this student.</div>
            ) : (
              <div className="p-5 space-y-3">
                {detail.clearance.map(item => {
                  const st = STATUS_STYLE[item.status];
                  return (
                    <div key={item.id} className={`rounded-xl border p-4 ${item.status === 'cleared' ? 'border-green-100 bg-green-50' : item.status === 'not_cleared' ? 'border-red-100 bg-red-50' : 'border-slate-100 bg-white'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                          <p className="font-semibold text-slate-800 text-sm">{item.office_name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                          <button onClick={() => openOverride(item, detail.student.id)}
                            className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100">
                            Override
                          </button>
                        </div>
                      </div>
                      {item.notes && <p className="text-xs text-slate-600 mt-1.5 ml-5">{item.notes}</p>}
                      {item.actioned_at && <p className="text-[10px] text-slate-400 mt-1 ml-5">{new Date(item.actioned_at).toLocaleString()}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch Initiation Modal */}
      {showBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <p className="font-bold text-slate-800">Initiate Batch Clearance</p>
              <button onClick={() => setShowBatch(false)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {batchResult ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    {[{ l: 'Total', v: batchResult.total }, { l: 'Initiated', v: batchResult.initiated }, { l: 'Skipped', v: batchResult.skipped }].map(({ l, v }) => (
                      <div key={l} className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase">{l}</p>
                        <p className="text-2xl font-bold text-slate-800 mt-0.5">{v}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 text-center">Already-initiated students were skipped. New clearance records created for the rest.</p>
                  <button onClick={() => setShowBatch(false)} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700">Done</button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600">Select the classes to initiate clearance for. Students already in the system will be skipped.</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {classes.map(c => (
                      <label key={c} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={batchClasses.includes(c)}
                          onChange={e => setBatchClasses(prev => e.target.checked ? [...prev, c] : prev.filter(x => x !== c))}
                          className="w-4 h-4 accent-green-600" />
                        <span className="text-sm font-medium text-slate-700">{c}</span>
                      </label>
                    ))}
                  </div>
                  {batchError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{batchError}</p>}
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowBatch(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                    <button onClick={handleBatchInitiate} disabled={initiating || batchClasses.length === 0}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      {initiating && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                      {initiating ? 'Initiating…' : `Initiate for ${batchClasses.length} class${batchClasses.length !== 1 ? 'es' : ''}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {override && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <p className="font-bold text-slate-800">Admin Override</p>
              <button onClick={() => setOverride(null)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-slate-500">Override clearance status for: <span className="font-semibold text-slate-700">{override.item.office_name}</span></p>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Status</label>
                <div className="flex gap-2">
                  {(['pending', 'cleared', 'not_cleared'] as const).map(s => (
                    <button key={s} onClick={() => setOvStatus(s)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize border transition-colors ${ovStatus === s ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200 hover:border-green-300'}`}>
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Notes {ovStatus === 'not_cleared' && <span className="text-red-500">*</span>}
                </label>
                <textarea value={ovNotes} onChange={e => setOvNotes(e.target.value)} rows={3}
                  placeholder={ovStatus === 'not_cleared' ? 'Reason required…' : 'Optional notes…'}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setOverride(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={submitOverride} disabled={ovSaving || (ovStatus === 'not_cleared' && !ovNotes.trim())}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                  {ovSaving ? 'Saving…' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
