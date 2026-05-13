'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface Absence {
  id: string;
  date: string;
  subject: string;
  className: string;
  reason?: string;
  status?: string;
}

interface Remedial {
  id: string;
  date: string;
  time?: string;
  subject: string;
  className: string;
  status?: string;
}

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: string;
}

const LEAVE_TYPES = ['Sick Leave', 'Official Duty', 'Permission', 'Other'];

function formatDate(iso: string) {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function leaveStatusStyle(status: string) {
  if (status === 'Approved') return { bg: '#DCFCE7', text: '#166534' };
  if (status === 'Rejected') return { bg: '#FEE2E2', text: '#991B1B' };
  return { bg: '#FEF3C7', text: '#92400E' };
}

export default function AbsencesPage() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [remedials, setRemedials] = useState<Remedial[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline reason form
  const [reasonAbsenceId, setReasonAbsenceId] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [reasonLoading, setReasonLoading] = useState(false);
  const [reasonError, setReasonError] = useState('');

  // Leave form
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveType, setLeaveType] = useState('Sick Leave');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [leaveSuccess, setLeaveSuccess] = useState('');

  const loadData = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    setLoading(true);
    try {
      const [absRes, remRes, levRes] = await Promise.allSettled([
        teacherApi.get(`/api/absences/teacher/${teacher.id}`),
        teacherApi.get(`/api/remedial/teacher/${teacher.id}`),
        teacherApi.get('/api/teacher-excuses'),
      ]);
      if (absRes.status === 'fulfilled') {
        const d = absRes.value.data;
        setAbsences(Array.isArray(d) ? d : d?.absences ?? []);
      }
      if (remRes.status === 'fulfilled') {
        const d = remRes.value.data;
        setRemedials(Array.isArray(d) ? d : d?.remedials ?? []);
      }
      if (levRes.status === 'fulfilled') {
        const d = levRes.value.data;
        setLeaves(Array.isArray(d) ? d : d?.leaves ?? d?.excuses ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadData();
  }, [loadData]);

  async function handleAddReason(absenceId: string) {
    if (!reasonText.trim()) { setReasonError('Reason is required.'); return; }
    setReasonLoading(true);
    setReasonError('');
    try {
      await teacherApi.patch(`/api/absences/${absenceId}/reason`, { reason: reasonText.trim() });
      setReasonAbsenceId('');
      setReasonText('');
      await loadData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        setReasonError(axiosErr.response?.data?.message ?? 'Failed to save reason.');
      } else {
        setReasonError('Failed to save reason.');
      }
    } finally {
      setReasonLoading(false);
    }
  }

  async function handleLeaveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leaveStart) { setLeaveError('Start date is required.'); return; }
    if (!leaveEnd) { setLeaveError('End date is required.'); return; }
    if (!leaveReason.trim()) { setLeaveError('Reason is required.'); return; }
    setLeaveLoading(true);
    setLeaveError('');
    setLeaveSuccess('');
    try {
      await teacherApi.post('/api/teacher-excuses', {
        type: leaveType,
        startDate: leaveStart,
        endDate: leaveEnd,
        reason: leaveReason.trim(),
      });
      setLeaveSuccess('Leave request submitted successfully.');
      setLeaveType('Sick Leave');
      setLeaveStart('');
      setLeaveEnd('');
      setLeaveReason('');
      setShowLeaveForm(false);
      await loadData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        setLeaveError(axiosErr.response?.data?.message ?? 'Failed to submit leave request.');
      } else {
        setLeaveError('Failed to submit leave request.');
      }
    } finally {
      setLeaveLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-6" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#2C2218]">Absences & Leave</h1>
        <button
          onClick={() => { setShowLeaveForm((v) => !v); setLeaveError(''); setLeaveSuccess(''); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: primary }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Request Leave
        </button>
      </div>

      {/* Inline leave form */}
      {showLeaveForm && (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-6 overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-4">New Leave Request</p>
          <form onSubmit={handleLeaveSubmit} className="space-y-3">
            {/* Type chips */}
            <div>
              <p className="text-xs text-[#8C7E6E] mb-2">Type</p>
              <div className="flex flex-wrap gap-2">
                {LEAVE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setLeaveType(t)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                    style={
                      leaveType === t
                        ? { background: primary, borderColor: primary, color: 'white' }
                        : { background: 'white', borderColor: '#E2D9CC', color: '#8C7E6E' }
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">Start Date</label>
                <input
                  type="date"
                  value={leaveStart}
                  onChange={(e) => setLeaveStart(e.target.value)}
                  className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-[#8C7E6E] block mb-1">End Date</label>
                <input
                  type="date"
                  value={leaveEnd}
                  onChange={(e) => setLeaveEnd(e.target.value)}
                  className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#8C7E6E] block mb-1">Reason</label>
              <textarea
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="Briefly describe your reason..."
                rows={3}
                className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none resize-none"
              />
            </div>
            {leaveError && (
              <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2">{leaveError}</p>
            )}
            {leaveSuccess && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{leaveSuccess}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowLeaveForm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[#E2D9CC] text-[#8C7E6E] bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={leaveLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: primary }}
              >
                {leaveLoading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-[#E2D9CC]" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Outstanding Absences */}
          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Outstanding Absences</p>
            {absences.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5 text-center">
                <p className="text-sm text-[#8C7E6E]">No outstanding absences</p>
              </div>
            ) : (
              <div className="space-y-3">
                {absences.map((ab) => (
                  <div key={ab.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-[#2C2218]">{ab.subject} — {ab.className}</p>
                        <p className="text-xs text-[#8C7E6E]">{formatDate(ab.date)}</p>
                        {ab.reason && (
                          <p className="text-xs text-[#8C7E6E] mt-1 italic">{ab.reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          if (reasonAbsenceId === ab.id) {
                            setReasonAbsenceId('');
                          } else {
                            setReasonAbsenceId(ab.id);
                            setReasonText(ab.reason ?? '');
                            setReasonError('');
                          }
                        }}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold border border-[#E2D9CC] text-[#8C7E6E] bg-white"
                      >
                        {reasonAbsenceId === ab.id ? 'Cancel' : 'Add Reason'}
                      </button>
                      <button
                        onClick={() =>
                          router.push(
                            `/teacher/absences/remedial?absenceId=${ab.id}&subject=${encodeURIComponent(ab.subject)}&className=${encodeURIComponent(ab.className)}&date=${ab.date}`
                          )
                        }
                        className="flex-1 py-2 rounded-xl text-xs font-semibold text-white"
                        style={{ background: primary }}
                      >
                        Schedule Remedial
                      </button>
                    </div>
                    {/* Inline reason form */}
                    {reasonAbsenceId === ab.id && (
                      <div className="mt-3 pt-3 border-t border-[#F4EFE6]">
                        <textarea
                          value={reasonText}
                          onChange={(e) => setReasonText(e.target.value)}
                          placeholder="Enter reason for absence..."
                          rows={3}
                          className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none resize-none"
                        />
                        {reasonError && (
                          <p className="text-xs text-[#B83232] mt-1">{reasonError}</p>
                        )}
                        <button
                          onClick={() => handleAddReason(ab.id)}
                          disabled={reasonLoading}
                          className="mt-2 w-full py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-40"
                          style={{ background: primary }}
                        >
                          {reasonLoading ? 'Saving...' : 'Save Reason'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Remedial Lessons */}
          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Remedial Lessons</p>
            {remedials.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5 text-center">
                <p className="text-sm text-[#8C7E6E]">No remedial lessons scheduled</p>
              </div>
            ) : (
              <div className="space-y-3">
                {remedials.map((rem) => (
                  <div key={rem.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#2C2218]">{rem.subject} — {rem.className}</p>
                        <p className="text-xs text-[#8C7E6E]">
                          {formatDate(rem.date)}{rem.time ? ` at ${rem.time}` : ''}
                        </p>
                      </div>
                      {rem.status && (
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: `${primary}18`, color: primary }}
                        >
                          {rem.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Leave Requests */}
          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Leave Requests</p>
            {leaves.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5 text-center">
                <p className="text-sm text-[#8C7E6E]">No leave requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {leaves.map((lv) => {
                  const style = leaveStatusStyle(lv.status);
                  return (
                    <div key={lv.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[#2C2218]">{lv.type}</p>
                          <p className="text-xs text-[#8C7E6E]">
                            {formatDate(lv.startDate)} – {formatDate(lv.endDate)}
                          </p>
                          {lv.reason && (
                            <p className="text-xs text-[#8C7E6E] mt-1">{lv.reason}</p>
                          )}
                        </div>
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                          style={{ background: style.bg, color: style.text }}
                        >
                          {lv.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
