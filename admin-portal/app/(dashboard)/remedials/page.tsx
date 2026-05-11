'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { RemedialLesson, Teacher } from '@/types/api';

export default function RemedialsPage() {
  const [items, setItems]       = useState<RemedialLesson[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading]   = useState(true);
  const [teacherId, setTeacherId] = useState('');
  const [status, setStatus]     = useState('');
  const [notesModal, setNotesModal] = useState<RemedialLesson | null>(null);
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (teacherId) params.teacherId = teacherId;
      if (status)    params.status    = status;
      const [r, t] = await Promise.all([
        api.get<RemedialLesson[]>('/api/remedial', { params }),
        teachers.length ? Promise.resolve({ data: teachers }) : api.get<Teacher[]>('/api/teachers'),
      ]);
      setItems(r.data); setTeachers(t.data);
    } finally { setLoading(false); }
  }, [teacherId, status, teachers]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function filter(e: React.FormEvent) { e.preventDefault(); await load(); }

  async function verify(id: string) {
    await api.patch(`/api/remedial/${id}/verify`, { notes });
    setNotesModal(null); await load();
  }

  async function cancel(id: string) {
    if (!confirm('Cancel this remedial lesson?')) return;
    await api.patch(`/api/remedial/${id}/cancel`);
    await load();
  }

  function openVerify(r: RemedialLesson) {
    setNotes(r.notes ?? ''); setNotesModal(r);
  }

  async function saveVerify() {
    if (!notesModal) return;
    setSaving(true);
    try { await verify(notesModal.id); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={filter} className="flex items-end gap-3 flex-wrap">
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
            <option value="Scheduled">Scheduled</option>
            <option value="Completed">Completed</option>
            <option value="Verified">Verified</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <Button type="submit">Filter</Button>
        <Button type="button" variant="secondary" onClick={() => { setTeacherId(''); setStatus(''); }}>Clear</Button>
      </form>

      <p className="text-sm text-gray-500">{items.length} remedial{items.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Absence Date','Remedial Date','Teacher','Subject','Class','Location','Duration','Status',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">{r.original_absence_date}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                    {r.remedial_date} <span className="text-gray-400">{r.remedial_time}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.teacher_name}</td>
                  <td className="px-4 py-3 text-gray-700">{r.subject}</td>
                  <td className="px-4 py-3 text-gray-700">{r.class_name}</td>
                  <td className="px-4 py-3 text-gray-600">{r.location_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.duration_periods ? `${r.duration_periods}p` : '—'}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                  <td className="px-4 py-3 flex gap-2">
                    {r.status === 'Completed' && (
                      <Button variant="ghost" size="sm" onClick={() => openVerify(r)}>Verify</Button>
                    )}
                    {r.status === 'Scheduled' && (
                      <Button variant="danger" size="sm" onClick={() => cancel(r.id)}>Cancel</Button>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No remedial lessons found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!notesModal} onClose={() => setNotesModal(null)} title="Verify Remedial Lesson">
        {notesModal && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              <strong>{notesModal.teacher_name}</strong> — {notesModal.subject} / {notesModal.class_name}<br />
              Scheduled: {notesModal.remedial_date} at {notesModal.remedial_time}
            </p>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verification Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                placeholder="Add verification notes…" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setNotesModal(null)}>Cancel</Button>
              <Button onClick={saveVerify} loading={saving}>Mark Verified</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
