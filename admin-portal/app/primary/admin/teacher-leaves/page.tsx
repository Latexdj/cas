'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';

interface Excuse {
  id: string; teacher_name: string; excuse_type: string;
  date_from: string; date_to: string; reason: string | null;
  status: string; reviewed_by_name: string | null;
  rejection_reason: string | null; created_at: string;
}

const STATUS_FILTER = ['All', 'Pending', 'Approved', 'Rejected'];

function chip(status: string) {
  const map: Record<string, string> = {
    Approved: 'bg-green-100 text-green-700',
    Rejected: 'bg-red-100 text-red-600',
    Pending:  'bg-amber-100 text-amber-700',
  };
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TeacherLeavesAdminPage() {
  const [excuses,   setExcuses]   = useState<Excuse[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('All');
  const [error,     setError]     = useState('');

  // Reject modal
  const [rejectId,     setRejectId]     = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    api.get<Excuse[]>('/api/primary/excuses')
      .then(r => setExcuses(r.data))
      .catch(() => setError('Failed to load leave requests.'))
      .finally(() => setLoading(false));
  }, []);

  async function approve(id: string) {
    if (!confirm('Approve this leave request? Matching absences will be marked as excused.')) return;
    setSaving(true); setError('');
    try {
      const { data } = await api.patch<Excuse>(`/api/primary/excuses/${id}/approve`, {});
      setExcuses(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to approve');
    } finally { setSaving(false); }
  }

  async function submitReject() {
    if (!rejectId || !rejectReason.trim()) return;
    setSaving(true); setError('');
    try {
      const { data } = await api.patch<Excuse>(`/api/primary/excuses/${rejectId}/reject`, { rejection_reason: rejectReason });
      setExcuses(prev => prev.map(e => e.id === rejectId ? { ...e, ...data } : e));
      setRejectId(null); setRejectReason('');
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to reject');
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this leave request permanently?')) return;
    await api.delete(`/api/primary/excuses/${id}`);
    setExcuses(prev => prev.filter(e => e.id !== id));
  }

  const displayed = filter === 'All' ? excuses : excuses.filter(e => e.status === filter);
  const pendingCount = excuses.filter(e => e.status === 'Pending').length;
  const { displayRows, total, page, setPage, pageSize, setPageSize } = useTableControls(displayed);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Leave Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {pendingCount > 0
              ? <span className="text-amber-600 font-semibold">{pendingCount} pending review</span>
              : 'All requests reviewed'}
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {STATUS_FILTER.map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${filter === f ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-slate-400 text-sm">
          No {filter === 'All' ? '' : filter.toLowerCase()} leave requests.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Teacher', 'Type', 'From', 'To', 'Reason', 'Status', 'Reviewed By', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(displayRows as typeof displayed).map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{e.teacher_name}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{e.excuse_type}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(e.date_from)}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(e.date_to)}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs">
                      {e.reason ?? <span className="italic text-slate-300">None</span>}
                      {e.status === 'Rejected' && e.rejection_reason && (
                        <p className="text-xs text-red-500 mt-0.5">Rejected: {e.rejection_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{chip(e.status)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {e.reviewed_by_name ?? <span className="text-slate-300 italic">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {e.status === 'Pending' ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => approve(e.id)} disabled={saving}
                            className="text-xs font-semibold text-green-600 hover:text-green-800 disabled:opacity-40">
                            Approve
                          </button>
                          <span className="text-gray-300">|</span>
                          <button onClick={() => { setRejectId(e.id); setRejectReason(''); }} disabled={saving}
                            className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-40">
                            Reject
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => remove(e.id)}
                          className="text-xs text-slate-400 hover:text-red-500">
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Reject Leave Request</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Reason for rejection <span className="text-red-500">*</span></label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                rows={3} placeholder="Explain why this request is rejected…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setRejectId(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-slate-600">Cancel</button>
              <button onClick={submitReject} disabled={saving || !rejectReason.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50">
                {saving ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
