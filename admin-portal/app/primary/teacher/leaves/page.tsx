'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Excuse {
  id: string; date_from: string; date_to: string; excuse_type: string;
  reason: string | null; status: string; reviewed_by_name: string | null;
  rejection_reason: string | null; created_at: string;
}

const EXCUSE_TYPES = ['Sick Leave','Annual Leave','Official Duty','Maternity Leave','Paternity Leave','Other'];

function statusChip(s: string) {
  const cls = s === 'Approved' ? 'bg-green-100 text-green-700' :
              s === 'Rejected' ? 'bg-red-100 text-red-600' :
              'bg-amber-100 text-amber-700';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{s}</span>;
}

export default function TeacherLeavesPage() {
  const [excuses,  setExcuses]  = useState<Excuse[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(false);
  const [form, setForm] = useState({ date_from: '', date_to: '', excuse_type: 'Sick Leave', reason: '' });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    api.get<Excuse[]>('/api/primary/excuses')
      .then(r => setExcuses(r.data))
      .catch(() => setError('Failed to load leave requests.'))
      .finally(() => setLoading(false));
  }, []);

  async function submitLeave() {
    if (!form.date_from || !form.date_to || !form.excuse_type) return;
    setSaving(true); setError('');
    try {
      const { data } = await api.post<Excuse>('/api/primary/excuses', form);
      setExcuses(prev => [data, ...prev]);
      setModal(false);
      setForm({ date_from: '', date_to: '', excuse_type: 'Sick Leave', reason: '' });
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to submit');
    } finally { setSaving(false); }
  }

  async function cancel(id: string) {
    if (!confirm('Cancel this leave request?')) return;
    await api.delete(`/api/primary/excuses/${id}`);
    setExcuses(prev => prev.filter(e => e.id !== id));
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Leave Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">Approved leaves are excused from automated absence</p>
        </div>
        <button onClick={() => setModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: '#15803D' }}>
          + New Request
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : excuses.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No leave requests yet.</div>
      ) : (
        <div className="space-y-3">
          {excuses.map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {statusChip(e.status)}
                    <span className="text-sm font-semibold text-slate-800">{e.excuse_type}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {new Date(e.date_from).toLocaleDateString('en-GB', { day:'numeric',month:'short',year:'numeric' })}
                    {' – '}
                    {new Date(e.date_to).toLocaleDateString('en-GB', { day:'numeric',month:'short',year:'numeric' })}
                  </p>
                  {e.reason && <p className="text-xs text-slate-600 mt-1 italic">{e.reason}</p>}
                  {e.status === 'Rejected' && e.rejection_reason && (
                    <p className="text-xs text-red-600 mt-1">Reason: {e.rejection_reason}</p>
                  )}
                  {e.reviewed_by_name && (
                    <p className="text-xs text-slate-400 mt-1">Reviewed by {e.reviewed_by_name}</p>
                  )}
                </div>
                {e.status === 'Pending' && (
                  <button onClick={() => cancel(e.id)} className="text-xs text-red-500 hover:text-red-700 font-semibold flex-shrink-0">Cancel</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Request Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">New Leave Request</h2>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Leave Type</label>
                <select value={form.excuse_type} onChange={e => setForm(f => ({ ...f, excuse_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {EXCUSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">From</label>
                  <input type="date" value={form.date_from} onChange={e => setForm(f => ({ ...f, date_from: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">To</label>
                  <input type="date" value={form.date_to} onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Reason (optional)</label>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  rows={3} placeholder="Brief explanation…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-slate-600">Cancel</button>
              <button onClick={submitLeave} disabled={saving || !form.date_from || !form.date_to}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#15803D' }}>
                {saving ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
