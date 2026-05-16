'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

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

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RemedialsPage() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');
  const [remedials, setRemedials] = useState<RemedialLesson[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    setLoading(true);
    try {
      const res = await teacherApi.get(`/api/remedial/teacher/${teacher.id}`);
      setRemedials(Array.isArray(res.data) ? res.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadData();
  }, [loadData]);

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
          <h1 className="text-xl font-bold text-[#2C2218]">Remedial Lessons</h1>
          <p className="text-sm text-[#8C7E6E]">{loading ? '…' : `${remedials.length} total`}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl h-24 animate-pulse border border-[#E2D9CC]" />
          ))}
        </div>
      ) : remedials.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
          <p className="text-3xl mb-2">📅</p>
          <p className="text-sm font-semibold text-[#2C2218]">No remedial lessons</p>
          <p className="text-xs text-[#8C7E6E] mt-1">Schedule one from an outstanding absence</p>
        </div>
      ) : (
        <div className="space-y-3">
          {remedials.map(rem => (
            <div key={rem.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-sm font-semibold text-[#2C2218]">{rem.subject} — {rem.class_name}</p>
                  <p className="text-xs text-[#8C7E6E] mt-0.5">
                    {fmt(rem.remedial_date)} at {rem.remedial_time?.slice(0, 5)}
                    {rem.duration_periods ? ` · ${rem.duration_periods} period${rem.duration_periods !== 1 ? 's' : ''}` : ''}
                  </p>
                  {rem.topic && <p className="text-xs text-[#4A3F32] mt-1 italic">{rem.topic}</p>}
                  {rem.location_name && <p className="text-xs text-[#8C7E6E] mt-0.5">{rem.location_name}</p>}
                </div>
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: `${primary}18`, color: primary }}
                >
                  {rem.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
