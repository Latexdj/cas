'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';
import { api } from '@/lib/api';
import type { Teacher, TeacherExcuse, AcademicYear } from '@/types/api';

const EXCUSE_COUNT_WARN_THRESHOLD = 3;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const EXCUSE_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Pending:              { bg: '#FFFBEB', color: '#D97706' },
  'Pending Acceptance': { bg: '#EFF6FF', color: '#1D4ED8' },
  Approved:             { bg: '#DCFCE7', color: '#145C44' },
  Rejected:             { bg: '#FEF2F2', color: '#DC2626' },
};

export default function LeaveExcusesPage() {
  const [teachers,   setTeachers]   = useState<Teacher[]>([]);
  const [excuses,    setExcuses]    = useState<TeacherExcuse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [acting,     setActing]     = useState<string | null>(null);
  const [addOpen,    setAddOpen]    = useState(false);
  const [form,       setForm]       = useState({ teacherId: '', dateFrom: '', dateTo: '', timeFrom: '', timeTo: '', type: 'Official Duty', reason: '' });
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');
  const [rejectId,     setRejectId]     = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError,  setRejectError]  = useState('');
  const [approveId,    setApproveId]    = useState<string | null>(null);
  const [approveNote,  setApproveNote]  = useState('');
  const [approveError, setApproveError] = useState('');

  const [currentYearId, setCurrentYearId] = useState('');
  const [excuseCounts, setExcuseCounts] = useState<Record<string, number>>({});

  const { displayRows: excRows, total: excTotal, page: excPage, setPage: setExcPage,
          pageSize: excPageSize, setPageSize: setExcPageSize,
          sortKey: excSortKey, sortDir: excSortDir, handleSort: handleExcSort } =
    useTableControls(excuses);

  useEffect(() => {
    api.get<Teacher[]>('/api/teachers').then(r => setTeachers(r.data)).catch(() => {});
    api.get<AcademicYear[]>('/api/academic-years').then(r => {
      const current = r.data.find(y => y.is_current) || r.data[0];
      if (current) setCurrentYearId(current.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentYearId) return;
    api.get<{ teacher_id: string; count: number }[]>('/api/teacher-excuses/counts', { params: { academic_year_id: currentYearId } })
      .then(r => setExcuseCounts(Object.fromEntries(r.data.map(row => [row.teacher_id, row.count]))))
      .catch(() => {});
  }, [currentYearId, excuses]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTeacher) params.set('teacherId', filterTeacher);
      if (filterStatus)  params.set('status', filterStatus);
      const { data } = await api.get<TeacherExcuse[]>(`/api/teacher-excuses?${params}`);
      setExcuses(data);
    } finally { setLoading(false); }
  }, [filterTeacher, filterStatus]);

  useEffect(() => { load(); }, [load]);

  function openApprove(id: string) {
    setApproveId(id); setApproveNote(''); setApproveError('');
  }

  async function submitApprove() {
    if (!approveId) return;
    setActing(approveId);
    try {
      await api.patch(`/api/teacher-excuses/${approveId}/approve`, { note: approveNote.trim() || undefined });
      setApproveId(null);
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApproveError(e.response?.data?.error ?? 'Failed to approve.');
    } finally { setActing(null); }
  }

  function openReject(id: string) {
    setRejectId(id); setRejectReason(''); setRejectError('');
  }

  async function submitReject() {
    if (!rejectId) return;
    if (!rejectReason.trim()) { setRejectError('A reason is required when rejecting a leave request.'); return; }
    setActing(rejectId);
    try {
      await api.patch(`/api/teacher-excuses/${rejectId}/reject`, { reason: rejectReason.trim() });
      setRejectId(null);
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setRejectError(e.response?.data?.error ?? 'Failed to reject.');
    } finally { setActing(null); }
  }

  async function del(id: string) {
    if (!confirm('Delete this excuse record?')) return;
    try { await api.delete(`/api/teacher-excuses/${id}`); await load(); }
    catch { alert('Failed to delete.'); }
  }

  async function saveExcuse() {
    if (!form.teacherId || !form.dateFrom || !form.dateTo || !form.reason.trim()) {
      setFormError('All fields are required.'); return;
    }
    if ((form.timeFrom && !form.timeTo) || (form.timeTo && !form.timeFrom)) {
      setFormError('Enter both a start and end time, or leave both blank to excuse the whole day.'); return;
    }
    if (form.timeFrom && form.timeTo && form.timeTo <= form.timeFrom) {
      setFormError('End time must be after start time.'); return;
    }
    setSaving(true); setFormError('');
    try {
      await api.post('/api/teacher-excuses', {
        teacherId: form.teacherId,
        dateFrom:  form.dateFrom,
        dateTo:    form.dateTo,
        timeFrom:  form.timeFrom || undefined,
        timeTo:    form.timeTo || undefined,
        type:      form.type,
        reason:    form.reason,
      });
      setAddOpen(false);
      setForm({ teacherId: '', dateFrom: '', dateTo: '', timeFrom: '', timeTo: '', type: 'Official Duty', reason: '' });
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } | string }; message?: string };
      const serverMsg = typeof e.response?.data === 'object' ? e.response?.data?.error : e.response?.data as string;
      setFormError(serverMsg ?? e.message ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  const selectCls = 'border rounded-lg px-3 py-2 text-sm' + ' border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';
  const inputCls  = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1C1208' }}>Leave &amp; Excuses</h1>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>Review teacher leave requests and record admin-approved excuses</p>
      </div>

      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap gap-3">
            <select className={selectCls} value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
              <option value="">All Teachers</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className={selectCls} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Pending Acceptance">Pending Acceptance</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <button
            onClick={() => { setAddOpen(o => !o); setFormError(''); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: addOpen ? '#64748B' : '#145C44' }}>
            {addOpen ? 'Cancel' : '+ Add Excuse'}
          </button>
        </div>

        {/* Add form */}
        {addOpen && (
          <div className="bg-white rounded-xl p-5 space-y-4" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
            <p className="text-sm font-bold" style={{ color: '#1C1208' }}>
              New Excuse <span className="font-normal text-xs" style={{ color: '#94A3B8' }}>(admin-created excuses are automatically approved)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold font-medium" style={{ color: '#64748B' }}>Teacher *</label>
                <select className={inputCls} value={form.teacherId} onChange={e => setForm(f => ({ ...f, teacherId: e.target.value }))}>
                  <option value="">Select teacher…</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {form.teacherId && (
                  <p className="text-xs mt-1" style={{ color: (excuseCounts[form.teacherId] || 0) >= EXCUSE_COUNT_WARN_THRESHOLD ? '#D97706' : '#94A3B8' }}>
                    {(excuseCounts[form.teacherId] || 0) >= EXCUSE_COUNT_WARN_THRESHOLD ? '⚠ ' : ''}
                    This teacher has had {excuseCounts[form.teacherId] || 0} excuse{(excuseCounts[form.teacherId] || 0) === 1 ? '' : 's'} this academic year.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold font-medium" style={{ color: '#64748B' }}>Type *</label>
                <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {['Official Duty', 'Permission', 'Sick Leave', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold font-medium" style={{ color: '#64748B' }}>Date From *</label>
                <input type="date" className={inputCls} value={form.dateFrom} onChange={e => setForm(f => ({ ...f, dateFrom: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold font-medium" style={{ color: '#64748B' }}>Date To *</label>
                <input type="date" className={inputCls} value={form.dateTo} onChange={e => setForm(f => ({ ...f, dateTo: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold font-medium" style={{ color: '#64748B' }}>Time From</label>
                <input type="time" className={inputCls} value={form.timeFrom} onChange={e => setForm(f => ({ ...f, timeFrom: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold font-medium" style={{ color: '#64748B' }}>Time To</label>
                <input type="time" className={inputCls} value={form.timeTo} onChange={e => setForm(f => ({ ...f, timeTo: e.target.value }))} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  Leave Time From/To blank to excuse the whole day. Set them to excuse only lessons within that window — e.g. a teacher called to a 9:00–10:00 meeting still owes their other lessons that day.
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-xs font-semibold font-medium" style={{ color: '#64748B' }}>Reason *</label>
                <input className={inputCls} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. Regional workshop, medical appointment, called to a meeting…" />
              </div>
            </div>
            {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
            <div className="flex justify-end">
              <button onClick={saveExcuse} disabled={saving}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: '#145C44' }}>
                {saving ? 'Saving…' : 'Save Excuse'}
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#145C44', borderTopColor: 'transparent' }} />
            </div>
          ) : excuses.length === 0 ? (
            <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>No excuse records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[800px] w-full text-sm">
                <thead style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F5F0E8' }}>
                  <tr>
                    <Th label="Teacher" sortKey="teacher_name" currentKey={excSortKey} currentDir={excSortDir} onSort={handleExcSort} className="px-4 py-3 text-left text-xs font-semibold font-medium" style={{ color: '#94A3B8' }} />
                    <Th label="Type" sortKey="type" currentKey={excSortKey} currentDir={excSortDir} onSort={handleExcSort} className="px-4 py-3 text-left text-xs font-semibold font-medium" style={{ color: '#94A3B8' }} />
                    <th className="px-4 py-3 text-left text-xs font-semibold font-medium" style={{ color: '#94A3B8' }}>Period</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold font-medium" style={{ color: '#94A3B8' }}>Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold font-medium" style={{ color: '#94A3B8' }}>Document</th>
                    <Th label="Status" sortKey="status" currentKey={excSortKey} currentDir={excSortDir} onSort={handleExcSort} className="px-4 py-3 text-left text-xs font-semibold font-medium" style={{ color: '#94A3B8' }} />
                    <th className="px-4 py-3 text-left text-xs font-semibold font-medium" style={{ color: '#94A3B8' }}>Approved By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold font-medium" style={{ color: '#94A3B8' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(excRows as typeof excuses).map((ex, i) => {
                    const ss = EXCUSE_STATUS_STYLE[ex.status] ?? { bg: '#F1F5F9', color: '#64748B' };
                    const period = (ex.date_from === ex.date_to ? fmtDate(ex.date_from) : `${fmtDate(ex.date_from)} – ${fmtDate(ex.date_to)}`)
                      + (ex.time_from && ex.time_to ? ` · ${ex.time_from.slice(0, 5)}–${ex.time_to.slice(0, 5)}` : '');
                    return (
                      <tr key={ex.id} className="hover:bg-slate-50 transition-colors"
                        style={{ borderBottom: i < excRows.length - 1 ? '1px solid #F0EBE1' : 'none' }}>
                        <td className="px-4 py-3 font-semibold" style={{ color: '#1C1208' }}>
                          {ex.teacher_name}
                          {currentYearId && (
                            <p className="text-xs font-normal mt-0.5" style={{ color: (excuseCounts[ex.teacher_id] || 0) >= EXCUSE_COUNT_WARN_THRESHOLD ? '#D97706' : '#94A3B8' }}>
                              {excuseCounts[ex.teacher_id] || 0} this year
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#475569' }}>{ex.type}</td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: '#64748B' }}>{period}</td>
                        <td className="px-4 py-3 max-w-xs truncate" style={{ color: '#475569' }} title={ex.reason}>{ex.reason}</td>
                        <td className="px-4 py-3">
                          {ex.document_url ? (
                            <a href={ex.document_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              View
                            </a>
                          ) : (
                            <span className="text-xs" style={{ color: ex.type === 'Official Duty' ? '#94A3B8' : '#F59E0B' }}>
                              {ex.type === 'Official Duty' ? '—' : 'Missing'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: ss.bg, color: ss.color }}>{ex.status}</span>
                          {ex.status === 'Rejected' && ex.rejection_reason && (
                            <p className="text-xs mt-1 max-w-[180px] truncate" style={{ color: '#DC2626' }} title={ex.rejection_reason}>
                              {ex.rejection_reason}
                            </p>
                          )}
                          {ex.status === 'Approved' && ex.approval_note && (
                            <p className="text-xs mt-1 max-w-[180px] truncate" style={{ color: '#D97706' }} title={ex.approval_note}>
                              Condition: {ex.approval_note}
                            </p>
                          )}
                          {ex.status === 'Pending Acceptance' && ex.approval_note && (
                            <p className="text-xs mt-1 max-w-[180px] truncate" style={{ color: '#1D4ED8' }} title={ex.approval_note}>
                              Condition (awaiting teacher): {ex.approval_note}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{ex.approved_by_name ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex gap-2 items-center">
                            {ex.status === 'Pending' && (() => {
                              const docRequired = ex.type !== 'Official Duty' && !ex.document_url;
                              return (
                                <>
                                  <button
                                    disabled={acting === ex.id || docRequired}
                                    onClick={() => openApprove(ex.id)}
                                    title={docRequired ? 'Supporting document required before approval' : ''}
                                    className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ backgroundColor: '#DCFCE7', color: '#145C44' }}>
                                    {acting === ex.id ? '…' : 'Approve'}
                                  </button>
                                  <button disabled={acting === ex.id}
                                    onClick={() => openReject(ex.id)}
                                    className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                                    style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                                    Reject
                                  </button>
                                </>
                              );
                            })()}
                            <button onClick={() => del(ex.id)}
                              className="text-xs font-semibold" style={{ color: '#94A3B8' }}>
                              Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination page={excPage} pageSize={excPageSize} total={excTotal}
                onPage={setExcPage} onPageSize={p => { setExcPageSize(p); setExcPage(1); }} />
            </div>
          )}
        </div>

        {/* Approve modal */}
        {approveId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/45 px-4">
            <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-bold" style={{ color: '#1C1208' }}>Approve Leave Request</p>
                <button onClick={() => setApproveId(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm">✕</button>
              </div>
              <div>
                <label className="text-xs font-semibold font-medium block mb-1" style={{ color: '#64748B' }}>
                  Condition / Note (optional)
                </label>
                <textarea value={approveNote} rows={3}
                  onChange={e => { setApproveNote(e.target.value); setApproveError(''); }}
                  placeholder="e.g. approved provided you arrange cover for your lessons…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-600 resize-none" />
                <p className="text-xs mt-1.5" style={{ color: '#94A3B8' }}>
                  Shown to the teacher and attached to the approved request. Leave blank for a plain approval.
                </p>
              </div>
              {approveError && <p className="text-sm text-red-600">{approveError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setApproveId(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600">
                  Cancel
                </button>
                <button onClick={submitApprove} disabled={acting === approveId}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#145C44] disabled:opacity-50">
                  {acting === approveId ? 'Approving…' : 'Confirm Approve'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject modal */}
        {rejectId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/45 px-4">
            <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-bold" style={{ color: '#1C1208' }}>Reject Leave Request</p>
                <button onClick={() => setRejectId(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm">✕</button>
              </div>
              <div>
                <label className="text-xs font-semibold font-medium block mb-1" style={{ color: '#64748B' }}>
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea value={rejectReason} rows={3}
                  onChange={e => { setRejectReason(e.target.value); setRejectError(''); }}
                  placeholder="Required — state the reason clearly…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-600 resize-none" />
              </div>
              {rejectError && <p className="text-sm text-red-600">{rejectError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setRejectId(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600">
                  Cancel
                </button>
                <button onClick={submitReject} disabled={acting === rejectId || !rejectReason.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 disabled:opacity-50">
                  {acting === rejectId ? 'Rejecting…' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
