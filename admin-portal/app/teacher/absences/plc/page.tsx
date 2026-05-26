'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface PlcAbsence {
  id: string;
  date: string;
  reason: string | null;
  status: string | null;
  session_title: string;
  start_time: string;
  end_time: string;
}

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusStyle(s: string) {
  if (s === 'excused') return { bg: '#DCFCE7', color: '#166534' };
  return { bg: '#FEE2E2', color: '#991B1B' };
}

export default function PlcAbsencesPage() {
  const router = useRouter();
  const [absences, setAbsences] = useState<PlcAbsence[]>([]);
  const [loading,  setLoading]  = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await teacherApi.get('/api/plc/my-absences');
      setAbsences(Array.isArray(res.data) ? res.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getTeacherColors();
    loadData();
  }, [loadData]);

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
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
          <h1 className="text-xl font-bold text-[#2C2218]">PLC Absences</h1>
          <p className="text-sm text-[#8C7E6E]">{loading ? '…' : `${absences.length} record${absences.length !== 1 ? 's' : ''}`}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl h-24 animate-pulse border border-[#E2D9CC]" />)}
        </div>
      ) : absences.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-sm font-semibold text-[#2C2218]">No PLC absences</p>
          <p className="text-xs text-[#8C7E6E] mt-1">You have attended all recorded PLC sessions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {absences.map(ab => {
            const s = ab.status ? statusStyle(ab.status) : null;
            return (
              <div key={ab.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-sm font-semibold text-[#2C2218]">{ab.session_title}</p>
                    <p className="text-xs text-[#8C7E6E] mt-0.5">
                      {fmt(ab.date)} · {ab.start_time?.slice(0, 5)}–{ab.end_time?.slice(0, 5)}
                    </p>
                    {ab.reason && <p className="text-xs text-[#4A3F32] mt-1 italic">&ldquo;{ab.reason}&rdquo;</p>}
                  </div>
                  {s && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                      style={{ background: s.bg, color: s.color }}>
                      {ab.status!.charAt(0).toUpperCase() + ab.status!.slice(1)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
