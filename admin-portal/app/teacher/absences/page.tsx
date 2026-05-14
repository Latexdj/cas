'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface AbsenceRecord {
  id: string;
  date: string;
  subject: string;
  class_name: string;
  scheduled_period: string | null;
  status: string;
  reason: string | null;
}

interface RemedialLesson {
  id: string;
  subject: string;
  class_name: string;
  remedial_date: string;
  remedial_time: string;
  duration_periods: number | null;
  topic: string | null;
  location_name: string | null;
  status: string;
}

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

export default function AbsencesPage() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');

  const [absences,  setAbsences]  = useState<AbsenceRecord[]>([]);
  const [remedials, setRemedials] = useState<RemedialLesson[]>([]);
  const [leaves,    setLeaves]    = useState<TeacherExcuse[]>([]);
  const [loading,   setLoading]   = useState(true);

  // Inline reason form
  const [reasonId,      setReasonId]      = useState('');
  const [reasonText,    setReasonText]    = useState('');
  const [reasonLoading, setReasonLoading] = useState(false);
  const [reasonError,   setReasonError]   = useState('');

  // Leave form
  const [showLeave,    setShowLeave]    = useState(false);
  const [leaveType,    setLeaveType]    = useState('Sick Leave');
  const [leaveFrom,    setLeaveFrom]    = useState('');
  const [leaveTo,      setLeaveTo]      = useState('');
  const [leaveReason,  setLeaveReason]  = useState('');
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError,   setLeaveError]   = useState('');

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
      if (absRes.status === 'fulfilled') setAbsences(Array.isArray(absRes.value.data) ? absRes.value.data : []);
      if (remRes.status === 'fulfilled') setRemedials(Array.isArray(remRes.value.data) ? remRes.value.data : []);
      if (levRes.status === 'fulfilled') setLeaves(Array.isArray(levRes.value.data) ? levRes.value.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadData();
  }, [loadData]);

  async function handleSaveReason(absenceId: string) {
    if (!reasonText.trim()) { setReasonError('Reason is required.'); return; }
    setReasonLoading(true); setReasonError('');
    try {
      await teacherApi.patch(`/api/absences/${absenceId}/reason`, { reason: reasonText.trim() });
      setReasonId(''); setReasonText('');
      await loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setReasonError(msg ?? 'Failed to save reason.');
    } finally { setReasonLoading(false); }
  }

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
        <h1 className="text-xl font-bold text-[#2C2218]">Absences &amp; Leave</h1>
        <button
          onClick={() => { setShowLeave(v => !v); setLeaveError(''); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: primary }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Request Leave
        </button>
      </div>

      {/* Leave form */}
      {showLeave && (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-6">
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
            {leaveError && <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-lg px-3 py-2">{leaveError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowLeave(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[#E2D9CC] text-[#8C7E6E] bg-white">
                Cancel
              </button>
              <button type="submit" disabled={leaveLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: primary }}>
                {leaveLoading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-[#E2D9CC]" />)}
        </div>
      ) : (
        <div className="space-y-6">

          {/* Outstanding Absences */}
          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">
              Outstanding Absences ({absences.length})
            </p>
            {absences.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] p-5 text-center">
                <p className="text-sm text-[#8C7E6E]">🎉 No outstanding absences</p>
              </div>
            ) : absences.map(ab => (
              <div key={ab.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-3">
                <p className="text-sm font-semibold text-[#2C2218]">{ab.subject} — {ab.class_name}</p>
                <p className="text-xs text-[#8C7E6E]">{fmt(ab.date)}</p>
                {ab.reason && <p className="text-xs text-[#8C7E6E] mt-1 italic">"{ab.reason}"</p>}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => {
                    if (reasonId === ab.id) { setReasonId(''); } else { setReasonId(ab.id); setReasonText(ab.reason ?? ''); setReasonError(''); }
                  }} className="flex-1 py-2 rounded-xl text-xs font-semibold border border-[#E2D9CC] text-[#8C7E6E] bg-[#F4EFE6]">
                    {reasonId === ab.id ? 'Cancel' : 'Add Reason'}
                  </button>
                  <button
                    onClick={() => router.push(`/teacher/absences/remedial?absenceId=${ab.id}&subject=${encodeURIComponent(ab.subject)}&className=${encodeURIComponent(ab.class_name)}&date=${ab.date}`)}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-white"
                    style={{ background: primary }}>
                    Schedule Remedial
                  </button>
                </div>
                {reasonId === ab.id && (
                  <div className="mt-3 pt-3 border-t border-[#F4EFE6]">
                    <textarea value={reasonText} onChange={e => setReasonText(e.target.value)}
                      placeholder="Explain the reason for absence..." rows={3}
                      className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none resize-none" />
                    {reasonError && <p className="text-xs text-[#B83232] mt-1">{reasonError}</p>}
                    <button onClick={() => handleSaveReason(ab.id)} disabled={reasonLoading}
                      className="mt-2 w-full py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-40"
                      style={{ background: primary }}>
                      {reasonLoading ? 'Saving...' : 'Save Reason'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* Remedial Lessons */}
          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">
              Remedial Lessons ({remedials.length})
            </p>
            {remedials.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] p-5 text-center">
                <p className="text-sm text-[#8C7E6E]">📅 No remedial lessons scheduled</p>
              </div>
            ) : remedials.map(rem => (
              <div key={rem.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#2C2218]">{rem.subject} — {rem.class_name}</p>
                    <p className="text-xs text-[#8C7E6E]">{fmt(rem.remedial_date)} at {rem.remedial_time?.slice(0,5)}</p>
                    {rem.topic && <p className="text-xs text-[#4A3F32] mt-1 italic">{rem.topic}</p>}
                    {rem.location_name && <p className="text-xs text-[#8C7E6E]">{rem.location_name}</p>}
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                    style={{ background: `${primary}18`, color: primary }}>
                    {rem.status}
                  </span>
                </div>
              </div>
            ))}
          </section>

          {/* Leave Requests */}
          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">
              Leave Requests ({leaves.length})
            </p>
            {leaves.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] p-5 text-center">
                <p className="text-sm text-[#8C7E6E]">📋 No leave requests submitted yet</p>
              </div>
            ) : leaves.map(lv => {
              const s = statusStyle(lv.status);
              const dateLabel = lv.date_from.slice(0,10) === lv.date_to.slice(0,10)
                ? fmt(lv.date_from)
                : `${fmt(lv.date_from)} – ${fmt(lv.date_to)}`;
              return (
                <div key={lv.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 mb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#2C2218]">{lv.type}</p>
                      <p className="text-xs text-[#8C7E6E]">{dateLabel}</p>
                      {lv.reason && <p className="text-xs text-[#4A3F32] mt-1 italic">"{lv.reason}"</p>}
                      {lv.approved_by_name && (
                        <p className="text-xs text-[#8C7E6E] mt-1">
                          {lv.status === 'Approved' ? 'Approved' : 'Reviewed'} by {lv.approved_by_name}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2"
                      style={{ background: s.bg, color: s.color }}>
                      {lv.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

        </div>
      )}
    </div>
  );
}
