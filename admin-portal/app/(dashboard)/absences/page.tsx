'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { AbsenceRecord, Teacher } from '@/types/api';

export default function AbsencesPage() {
  const [records, setRecords]   = useState<AbsenceRecord[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading]   = useState(true);
  const [teacherId, setTeacherId] = useState('');
  const [status, setStatus]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [reasonModal, setReasonModal] = useState<AbsenceRecord | null>(null);
  const [reason, setReason]     = useState('');
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (teacherId) params.teacherId = teacherId;
      if (status)    params.status    = status;
      if (dateFrom)  params.from      = dateFrom;
      if (dateTo)    params.to        = dateTo;
      const [a, t] = await Promise.all([
        api.get<AbsenceRecord[]>('/api/absences', { params }),
        teachers.length ? Promise.resolve({ data: teachers }) : api.get<Teacher[]>('/api/teachers'),
      ]);
      setRecords(a.data); setTeachers(t.data);
    } finally { setLoading(false); }
  }, [teacherId, status, dateFrom, dateTo, teachers]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(e: React.FormEvent) { e.preventDefault(); await load(); }

  async function saveReason() {
    if (!reasonModal) return;
    setSaving(true);
    try {
      await api.patch(`/api/absences/${reasonModal.id}/reason`, { reason });
      setReasonModal(null); await load();
    } finally { setSaving(false); }
  }

  function openReason(r: AbsenceRecord) {
    setReason(r.reason ?? ''); setReasonModal(r);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teacher</label>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
            className="mt-1 w-44 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
            <option value="">All</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="mt-1 w-44 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
            <option value="">All</option>
            <option value="Absent">Absent</option>
            <option value="Remedial Scheduled">Remedial Scheduled</option>
            <option value="Completed">Completed</option>
            <option value="Verified">Verified</option>
            <option value="Made Up">Made Up</option>
            <option value="Cleared">Cleared</option>
          </select>
        </div>
        <Input label="From" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
        <Input label="To"   type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="w-40" />
        <Button type="submit">Filter</Button>
        <Button type="button" variant="secondary" onClick={() => { setTeacherId(''); setStatus(''); setDateFrom(''); setDateTo(''); }}>
          Clear
        </Button>
      </form>

      <p className="text-sm text-gray-500">{records.length} absence{records.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Date','Teacher','Subject','Class','Status','Reason','Auto',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{r.date}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.teacher_name}</td>
                  <td className="px-4 py-3 text-gray-700">{r.subject}</td>
                  <td className="px-4 py-3 text-gray-700">{r.class_name}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                  <td className="px-4 py-3 text-gray-600 max-w-48 truncate">{r.reason ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{r.is_auto_generated ? 'Auto' : 'Manual'}</td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => openReason(r)}>Reason</Button>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No absences found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!reasonModal} onClose={() => setReasonModal(null)} title="Edit Absence Reason">
        {reasonModal && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              <strong>{reasonModal.teacher_name}</strong> — {reasonModal.subject} / {reasonModal.class_name} on {reasonModal.date}
            </p>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                placeholder="Enter reason for absence…" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setReasonModal(null)}>Cancel</Button>
              <Button onClick={saveReason} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
