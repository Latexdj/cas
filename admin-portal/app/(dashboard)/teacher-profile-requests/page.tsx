'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const STATUS_OPTIONS = ['Pending', 'Approved', 'Rejected'];

function labelize(key: string) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function TeacherProfileRequestsPage() {
  const [status, setStatus] = useState('Pending');
  const [teacherId, setTeacherId] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/teacher-profile-requests', {
        params: {
          status,
          teacherId: teacherId || undefined,
        },
      });
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status, teacherId]);

  async function handleAction(id: string, action: 'approve' | 'reject') {
    const note = (reviewNotes[id] || '').trim();
    if (action === 'reject' && !note) {
      alert('Please add a rejection note before rejecting the request.');
      return;
    }

    setBusyId(id);
    try {
      await api.patch(`/api/admin/teacher-profile-requests/${id}/${action}`, {
        review_note: note || undefined,
      });
      setReviewNotes((prev) => ({ ...prev, [id]: '' }));
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'The request could not be updated.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F4EFE6] px-4 py-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#8C7E6E]">Admin Review</p>
          <h1 className="text-2xl font-bold text-[#2C2218] mt-1">Teacher Profile Change Queue</h1>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-4 mb-6 shadow-sm">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
            <div className="flex-1">
              <label className="text-xs text-[#8C7E6E] block mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none">
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-[#8C7E6E] block mb-1">Teacher ID</label>
              <input value={teacherId} onChange={(e) => setTeacherId(e.target.value)}
                placeholder="Filter by teacher ID"
                className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-[#E2D9CC] p-6 text-sm text-[#8C7E6E]">Loading requests…</div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2D9CC] p-6 text-sm text-[#8C7E6E]">
            No {status.toLowerCase()} profile change requests found.
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div key={request.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                    <p className="text-lg font-bold text-[#2C2218]">{request.teacher_name || 'Teacher'}</p>
                    <p className="text-xs text-[#8C7E6E]">{request.teacher_code || request.teacher_id} • {new Date(request.submitted_at).toLocaleString()}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                    style={{
                      borderColor: request.status === 'Pending' ? '#D5B14A' : request.status === 'Approved' ? '#145C44' : '#B83232',
                      background: request.status === 'Pending' ? '#FFF7D6' : request.status === 'Approved' ? '#E8F4EE' : '#FEF2F2',
                      color: request.status === 'Pending' ? '#7A5C00' : request.status === 'Approved' ? '#145C44' : '#B83232',
                    }}>
                    {request.status}
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E]">Changed fields</p>
                    <div className="rounded-xl border border-[#F4EFE6] bg-[#FAF8F3] p-3">
                      {Array.isArray(request.field_names) && request.field_names.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {request.field_names.map((field: string) => (
                            <span key={field} className="px-2 py-1 text-xs rounded-full bg-[#E8F4EE] text-[#145C44] border border-[#B8D9C8]">
                              {labelize(field)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#8C7E6E]">No field list supplied.</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E]">Document</p>
                    {request.supporting_document_url ? (
                      <a href={request.supporting_document_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm font-medium text-[#2C2218]">
                        {request.supporting_document_filename || 'Open supporting document'}
                      </a>
                    ) : (
                      <p className="text-xs text-[#8C7E6E]">No supporting document attached.</p>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mt-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">Old values</p>
                    <div className="rounded-xl border border-[#F4EFE6] bg-[#FAF8F3] p-3 space-y-2">
                      {Array.isArray(request.field_names) && request.field_names.length > 0 ? (
                        request.field_names.map((field: string) => (
                          <div key={`old-${field}`} className="text-xs">
                            <span className="font-semibold text-[#2C2218]">{labelize(field)}:</span> {formatValue(request.old_values?.[field])}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#8C7E6E]">No prior values.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">New values</p>
                    <div className="rounded-xl border border-[#F4EFE6] bg-[#FAF8F3] p-3 space-y-2">
                      {Array.isArray(request.field_names) && request.field_names.length > 0 ? (
                        request.field_names.map((field: string) => (
                          <div key={`new-${field}`} className="text-xs">
                            <span className="font-semibold text-[#2C2218]">{labelize(field)}:</span> {formatValue(request.new_values?.[field])}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#8C7E6E]">No new values.</p>
                      )}
                    </div>
                  </div>
                </div>

                {request.status === 'Pending' && (
                  <div className="mt-5">
                    <label className="text-xs text-[#8C7E6E] block mb-1">Review note</label>
                    <textarea value={reviewNotes[request.id] || ''} onChange={(e) => setReviewNotes((prev) => ({ ...prev, [request.id]: e.target.value }))}
                      rows={3}
                      className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2 text-sm text-[#2C2218] bg-white focus:outline-none" placeholder="Add reason for approval or rejection" />
                    <div className="flex gap-3 mt-3">
                      <button type="button" onClick={() => handleAction(request.id, 'approve')} disabled={busyId === request.id}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                        style={{ background: '#145C44' }}>
                        {busyId === request.id ? 'Processing…' : 'Approve'}
                      </button>
                      <button type="button" onClick={() => handleAction(request.id, 'reject')} disabled={busyId === request.id}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                        style={{ background: '#B83232' }}>
                        {busyId === request.id ? 'Processing…' : 'Reject'}
                      </button>
                    </div>
                  </div>
                )}

                {request.review_note && request.status !== 'Pending' && (
                  <div className="mt-4 rounded-xl border border-[#E2D9CC] bg-[#FAF8F3] p-3 text-xs text-[#2C2218]">
                    <span className="font-semibold">Review note:</span> {request.review_note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
