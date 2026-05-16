'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface TeacherExcuse {
  id: string;
  date_from: string;
  date_to: string;
  type: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by_name: string | null;
}

const LEAVE_TYPES = ['Sick Leave', 'Official Duty', 'Permission', 'Other'];

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusStyle(status: string) {
  if (status === 'Approved') return { bg: '#DCFCE7', color: '#166534' };
  if (status === 'Rejected') return { bg: '#FEE2E2', color: '#991B1B' };
  return { bg: '#FEF3C7', color: '#92400E' };
}

function LeavesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [primary, setPrimary] = useState('#2ab289');
  const [leaves, setLeaves] = useState<TeacherExcuse[]>([]);
  const [loading, setLoading] = useState(true);

  const [showLeave,    setShowLeave]    = useState(searchParams.get('new') === '1');
  const [leaveType,    setLeaveType]    = useState('Sick Leave');
  const [leaveFrom,    setLeaveFrom]    = useState('');
  const [leaveTo,      setLeaveTo]      = useState('');
  const [leaveReason,  setLeaveReason]  = useState('');
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError,   setLeaveError]   = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await teacherApi.get('/api/teacher-excuses');
      setLeaves(Array.isArray(res.data) ? res.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadData();
  }, [loadData]);

  async function handleLeaveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leaveFrom)          { setLeaveError('Start date is required.'); return; }
    if (!leaveTo)            { setLeaveError('End date is required.'); return; }
    if (!leaveReason.trim()) { setLeaveError('Reason is required.'); return; }
    const teacher = getTeacher();
    if (!teacher) return;
    setLeaveLoading(true); setLeaveError('');
    try {
      await teacherApi.post('/api/teacher-excuses', {
        teacherId: teacher.id,
        dateFrom:  leaveFrom,
        dateTo:    leaveTo,
        type:      leaveType,
        reason:    leaveReason.trim(),
      });
      setShowLeave(false);
      setLeaveType('Sick Leave'); setLeaveFrom(''); setLeaveTo(''); setLeaveReason('');
      await loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setLeaveError(msg ?? 'Failed to submit leave request.');
    } finally { setLeaveLoading(false); }
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/teacher/absences')}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#2C2218]">Leave Requests</h1>
            <p className="text-sm text-[#8C7E6E]">{loading ? '…' : `${leaves.length} total`}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowLeave(v => !v); setLeaveError(''); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: primary }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Request
        </button>
      </div>

      {/* Leave form */}
      {showLeave && (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-5">
          <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-4">New Leave Request</p>
          <form onSubmit={handleLeaveSubmit} className="space-y-3">
            <div>
              <p className="text-xs text-[#8C7E6E] mb-2">Type</p>
              <div className="flex flex-wrap gap-2">
                {LEAVE_TYPES.map(t => (
                  <button key={t} type="button" onClick={() => setLeaveType(t)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                    style={leaveType === t
                      ? { background: primary, borderColor: primary, color: 'white' }
                      : { background: 'white', borderColor: '#E2D9CC', color: '#8C7E6E' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">From</label>
                <input type="date" value={leaveFrom} onChange={e => setLeaveFrom(e.target.value)}
                  className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">To</label>
                <input type="date" value={leaveTo} onChange={e => setLeaveTo(e.target.value)}
                  className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none" />
              </div>
            </div>
            <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)}
              placeholder="Describe your reason..." rows={3}
              className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none resize-none" />
            {leaveError && (
              <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2">{leaveError}</p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowLeave(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[#E2D9CC] text-[#8C7E6E] bg-white">
                Cancel
              </button>
              <button type="submit" disabled={leaveLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: primary }}>
                {leaveLoading ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl h-24 animate-pulse border border-[#E2D9CC]" />
          ))}
        </div>
      ) : leaves.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm font-semibold text-[#2C2218]">No leave requests yet</p>
          <p className="text-xs text-[#8C7E6E] mt-1">Tap Request to submit one</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map(lv => {
            const s = statusStyle(lv.status);
            const dateLabel = lv.date_from.slice(0, 10) === lv.date_to.slice(0, 10)
              ? fmt(lv.date_from)
              : `${fmt(lv.date_from)} – ${fmt(lv.date_to)}`;
            return (
              <div key={lv.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-sm font-semibold text-[#2C2218]">{lv.type}</p>
                    <p className="text-xs text-[#8C7E6E] mt-0.5">{dateLabel}</p>
                    {lv.reason && <p className="text-xs text-[#4A3F32] mt-1 italic">&ldquo;{lv.reason}&rdquo;</p>}
                    {lv.approved_by_name && (
                      <p className="text-xs text-[#8C7E6E] mt-1">
                        {lv.status === 'Approved' ? 'Approved' : 'Reviewed'} by {lv.approved_by_name}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                    style={{ background: s.bg, color: s.color }}>
                    {lv.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function LeavesPage() {
  return (
    <Suspense>
      <LeavesContent />
    </Suspense>
  );
}
