'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { fmtDateShort as fmtDate } from '@/lib/dates';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { AttendanceRecord, Teacher } from '@/types/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

function PhotoModal({ record, onClose }: { record: AttendanceRecord; onClose: () => void }) {
  const submittedAt = record.submitted_at
    ? new Date(record.submitted_at).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '—';

  const mapsUrl = record.gps_coordinates
    ? `https://www.google.com/maps?q=${record.gps_coordinates}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/65 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {record.photo_url ? (
          <img src={record.photo_url} alt="Classroom photo" className="w-full max-h-80 object-cover" />
        ) : (
          <div className="w-full h-48 bg-slate-100 flex items-center justify-center text-slate-400">No photo available</div>
        )}

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Photo Properties</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold font-medium text-slate-400 mb-1">Time Taken</p>
              <p className="text-slate-800 font-medium">{submittedAt}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold font-medium text-slate-400 mb-1">File Size</p>
              <p className="text-slate-800 font-medium">{record.photo_size_kb != null ? `${record.photo_size_kb} KB` : '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold font-medium text-slate-400 mb-1">Location</p>
              <p className="text-slate-800 font-medium">{record.location_name || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold font-medium text-slate-400 mb-1">GPS Coordinates</p>
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium break-all">
                  {record.gps_coordinates}
                </a>
              ) : (
                <p className="text-slate-400">—</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            {record.photo_url && (
              <a href={record.photo_url} target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                Open full size
              </a>
            )}
            <button onClick={onClose} className="flex-1 text-sm font-medium px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const [tab,          setTab]          = useState<'all' | 'pending'>('all');
  const [records,      setRecords]      = useState<AttendanceRecord[]>([]);
  const [teachers,     setTeachers]     = useState<Teacher[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [teacherId,    setTeacherId]    = useState('');
  const [photoRecord,  setPhotoRecord]  = useState<AttendanceRecord | null>(null);

  // Revoke modal state
  const [revokeRecord, setRevokeRecord] = useState<AttendanceRecord | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking,     setRevoking]     = useState(false);
  const [revokeError,  setRevokeError]  = useState('');

  // Reject-pending modal state
  const [rejectRecord, setRejectRecord] = useState<AttendanceRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting,    setRejecting]    = useState(false);
  const [rejectError,  setRejectError]  = useState('');
  const [approvingId,  setApprovingId]  = useState<string | null>(null);

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(records);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (dateFrom)  params.from      = dateFrom;
      if (dateTo)    params.to        = dateTo;
      if (teacherId) params.teacherId = teacherId;
      if (tab === 'pending') params.verification_status = 'pending';
      const [r, t] = await Promise.all([
        api.get<AttendanceRecord[]>('/api/attendance', { params }),
        teachers.length ? Promise.resolve({ data: teachers }) : api.get<Teacher[]>('/api/teachers'),
      ]);
      setRecords(r.data); setTeachers(t.data);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, teacherId, tab, teachers]);

  useEffect(() => { load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function approvePending(id: string) {
    setApprovingId(id);
    try { await api.patch(`/api/attendance/${id}/approve-pending`); await load(); }
    catch { alert('Failed to approve submission.'); }
    finally { setApprovingId(null); }
  }

  async function confirmRejectPending() {
    if (!rejectRecord) return;
    if (!rejectReason.trim()) { setRejectError('Please enter a reason for rejecting this submission.'); return; }
    setRejecting(true); setRejectError('');
    try {
      await api.patch(`/api/attendance/${rejectRecord.id}/reject-pending`, { reason: rejectReason.trim() });
      setRejectRecord(null);
      setRejectReason('');
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRejectError(msg ?? 'Failed to reject submission.');
    } finally { setRejecting(false); }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault(); await load();
  }

  async function deleteRecord(id: string) {
    if (!confirm('Remove this record? The teacher will be notified and their student attendance records for this session will also be deleted.')) return;
    try { await api.delete(`/api/attendance/${id}`); await load(); }
    catch { alert('Failed to delete attendance record.'); }
  }

  async function confirmRevoke() {
    if (!revokeRecord) return;
    if (!revokeReason.trim()) { setRevokeError('Please enter a reason for revoking this record.'); return; }
    setRevoking(true); setRevokeError('');
    try {
      await api.post(`/api/attendance/${revokeRecord.id}/revoke`, { reason: revokeReason.trim() });
      setRevokeRecord(null);
      setRevokeReason('');
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRevokeError(msg ?? 'Failed to revoke record.');
    } finally { setRevoking(false); }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex gap-2 border-b border-gray-100">
          {(['all', 'pending'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'all' ? 'All Records' : 'Pending Review'}
            </button>
          ))}
        </div>

        <form onSubmit={search} className="flex items-end gap-3 flex-wrap">
          <Input label="From" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          <Input label="To"   type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="w-40" />
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Teacher</label>
            <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
              className="mt-1 w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600">
              <option value="">All</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <Button type="submit">Filter</Button>
          <Button type="button" variant="secondary" onClick={() => { setDateFrom(''); setDateTo(''); setTeacherId(''); }}>Clear</Button>
        </form>

        <p className="text-sm text-gray-500">{records.length} record{records.length !== 1 ? 's' : ''}</p>

        {loading ? (
          <div className="flex justify-center h-32 items-center">
            <div className="w-6 h-6 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <Th label="Date" sortKey="date" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-xs font-semibold text-gray-500 font-medium" />
                  <Th label="Teacher" sortKey="teacher_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-xs font-semibold text-gray-500 font-medium" />
                  <Th label="Subject" sortKey="subject" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-xs font-semibold text-gray-500 font-medium" />
                  <Th label="Class" sortKey="class_names" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-xs font-semibold text-gray-500 font-medium" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-medium">Periods</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-medium">Topic</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-medium">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-medium">Photo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-medium">Week</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-medium sticky right-0 bg-gray-50">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(displayRows as typeof records).map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.teacher_name}</td>
                    <td className="px-4 py-3 text-gray-700">{r.subject}</td>
                    <td className="px-4 py-3 text-gray-700">{r.class_names}</td>
                    <td className="px-4 py-3 text-gray-700">{r.periods}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-48 truncate">{r.topic ?? '—'}</td>
                    <td className="px-4 py-3">
                      {r.location_name
                        ? <span className={`text-xs font-medium ${r.location_verified ? 'text-[#145C44]' : 'text-yellow-600'}`}>
                            {r.location_name} {r.location_verified ? '✓' : '~'}
                          </span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.verification_status === 'pending' ? (
                        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700" title={r.pending_reason ?? ''}>Pending Review</span>
                      ) : r.verification_status === 'rejected' ? (
                        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700" title={r.review_note ?? ''}>Rejected</span>
                      ) : (
                        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">Verified</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.photo_url ? (
                        <button onClick={() => setPhotoRecord(r)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909.47.47a.75.75 0 11-1.06 1.06L6.53 8.091a.75.75 0 00-1.06 0l-3 3v-.03zm13-3.81a.75.75 0 01-.75.75 2.25 2.25 0 11-2.25-2.25.75.75 0 010 1.5 .75.75 0 110-1.5 2.25 2.25 0 012.25 2.25.75.75 0 01-.75.75z" clipRule="evenodd" />
                          </svg>
                          View
                        </button>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">Wk {r.week_number}</td>
                    <td className="px-4 py-3 sticky right-0 bg-white">
                      <div className="flex gap-2 items-center">
                        {r.verification_status === 'pending' ? (
                          <>
                            <Button variant="primary" size="sm" loading={approvingId === r.id} onClick={() => approvePending(r.id)}>
                              Approve
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => { setRejectRecord(r); setRejectReason(''); setRejectError(''); }}>
                              Reject
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="danger" size="sm" onClick={() => { setRevokeRecord(r); setRevokeReason(''); setRevokeError(''); }}>
                              Revoke
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteRecord(r.id)}>
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">No records found.</td></tr>
                )}
              </tbody>
            </table>
            </div>
            {records.length > 0 && (
              <Pagination page={page} pageSize={pageSize} total={total}
                onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} className="px-4" />
            )}
          </div>
        )}
      </div>

      {photoRecord && (
        <PhotoModal record={photoRecord} onClose={() => setPhotoRecord(null)} />
      )}

      {/* Revoke modal */}
      <Modal open={!!revokeRecord} onClose={() => setRevokeRecord(null)} title="Revoke Attendance Record">
        {revokeRecord && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm" style={{ color: '#7F1D1D' }}>
              <p className="font-semibold mb-1">This action will:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Delete the attendance record and associated student attendance</li>
                <li>Mark the teacher absent for each affected class</li>
                <li>Send the teacher an email notification with your reason</li>
                <li>Log this action in the audit trail</li>
              </ul>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 text-sm">
              <p><span className="font-semibold text-slate-700">Teacher:</span> <span className="text-slate-600">{revokeRecord.teacher_name}</span></p>
              <p><span className="font-semibold text-slate-700">Subject:</span> <span className="text-slate-600">{revokeRecord.subject} — {revokeRecord.class_names}</span></p>
              <p><span className="font-semibold text-slate-700">Date:</span> <span className="text-slate-600">{fmtDate(revokeRecord.date)}</span></p>
            </div>

            <div>
              <label className="text-xs font-semibold font-medium" style={{ color: '#64748B' }}>
                Reason for revocation *
              </label>
              <textarea
                value={revokeReason}
                onChange={e => { setRevokeReason(e.target.value); setRevokeError(''); }}
                rows={3}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: revokeError ? '#FCA5A5' : '#E2D9CC', color: '#1C1208' }}
                placeholder="e.g. GPS coordinates inconsistent with classroom location; photo shows different room…"
              />
              {revokeError && <p className="text-xs text-red-600 mt-1">{revokeError}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setRevokeRecord(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmRevoke} loading={revoking}>
                Revoke & Mark Absent
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject pending submission modal */}
      <Modal open={!!rejectRecord} onClose={() => setRejectRecord(null)} title="Reject Pending Submission">
        {rejectRecord && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm" style={{ color: '#7F1D1D' }}>
              <p className="font-semibold mb-1">This action will:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Keep this record for audit, marked as rejected</li>
                <li>Delete the associated student attendance for this session</li>
                <li>Mark the teacher absent for each affected class</li>
                <li>Send the teacher an email notification with your reason</li>
              </ul>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 text-sm">
              <p><span className="font-semibold text-slate-700">Teacher:</span> <span className="text-slate-600">{rejectRecord.teacher_name}</span></p>
              <p><span className="font-semibold text-slate-700">Subject:</span> <span className="text-slate-600">{rejectRecord.subject} — {rejectRecord.class_names}</span></p>
              <p><span className="font-semibold text-slate-700">Date:</span> <span className="text-slate-600">{fmtDate(rejectRecord.date)}</span></p>
              {rejectRecord.pending_reason && (
                <p className="mt-1"><span className="font-semibold text-slate-700">Teacher's reason:</span> <span className="text-slate-600">{rejectRecord.pending_reason}</span></p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold font-medium" style={{ color: '#64748B' }}>
                Reason for rejection *
              </label>
              <textarea
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); setRejectError(''); }}
                rows={3}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: rejectError ? '#FCA5A5' : '#E2D9CC', color: '#1C1208' }}
                placeholder="e.g. Photo does not show the stated classroom…"
              />
              {rejectError && <p className="text-xs text-red-600 mt-1">{rejectError}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setRejectRecord(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmRejectPending} loading={rejecting}>
                Reject & Mark Absent
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
