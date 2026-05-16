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

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AbsenceListPage() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');
  const [absences, setAbsences] = useState<AbsenceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [reasonId,      setReasonId]      = useState('');
  const [reasonText,    setReasonText]    = useState('');
  const [reasonLoading, setReasonLoading] = useState(false);
  const [reasonError,   setReasonError]   = useState('');

  const loadData = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    setLoading(true);
    try {
      const res = await teacherApi.get(`/api/absences/teacher/${teacher.id}`);
      setAbsences(Array.isArray(res.data) ? res.data : []);
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

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/teacher/absences')}
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">Outstanding Absences</h1>
          <p className="text-sm text-[#8C7E6E]">{loading ? '…' : `${absences.length} unresolved`}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl h-24 animate-pulse border border-[#E2D9CC]" />
          ))}
        </div>
      ) : absences.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-sm font-semibold text-[#2C2218]">No outstanding absences</p>
          <p className="text-xs text-[#8C7E6E] mt-1">Your attendance record is clear</p>
        </div>
      ) : (
        <div className="space-y-3">
          {absences.map(ab => (
            <div key={ab.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
              <p className="text-sm font-semibold text-[#2C2218]">{ab.subject} — {ab.class_name}</p>
              <p className="text-xs text-[#8C7E6E]">
                {fmt(ab.date)}{ab.scheduled_period ? ` · ${ab.scheduled_period}` : ''}
              </p>
              {ab.reason && <p className="text-xs text-[#8C7E6E] mt-1 italic">&ldquo;{ab.reason}&rdquo;</p>}

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    if (reasonId === ab.id) { setReasonId(''); }
                    else { setReasonId(ab.id); setReasonText(ab.reason ?? ''); setReasonError(''); }
                  }}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border border-[#E2D9CC] text-[#8C7E6E] bg-[#F4EFE6]"
                >
                  {reasonId === ab.id ? 'Cancel' : ab.reason ? 'Edit Reason' : 'Add Reason'}
                </button>
                <button
                  onClick={() => router.push(
                    `/teacher/absences/remedial?absenceId=${ab.id}&subject=${encodeURIComponent(ab.subject)}&className=${encodeURIComponent(ab.class_name)}&date=${ab.date}`
                  )}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold text-white"
                  style={{ background: primary }}
                >
                  Schedule Remedial
                </button>
              </div>

              {reasonId === ab.id && (
                <div className="mt-3 pt-3 border-t border-[#F4EFE6]">
                  <textarea
                    value={reasonText}
                    onChange={e => setReasonText(e.target.value)}
                    placeholder="Explain the reason for absence..."
                    rows={3}
                    className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none resize-none"
                  />
                  {reasonError && <p className="text-xs text-[#B83232] mt-1">{reasonError}</p>}
                  <button
                    onClick={() => handleSaveReason(ab.id)}
                    disabled={reasonLoading}
                    className="mt-2 w-full py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-40"
                    style={{ background: primary }}
                  >
                    {reasonLoading ? 'Saving…' : 'Save Reason'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
