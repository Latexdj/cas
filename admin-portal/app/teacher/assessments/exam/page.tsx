'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface AcademicYear { id: string; name: string; is_current: boolean }
interface ExamRow {
  student_id: string;
  student_code: string;
  name: string;
  exam_id: string | null;
  score: number | null;
}

function ExamContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const subject    = sp.get('subject')    ?? '';
  const class_name = sp.get('class_name') ?? '';
  const year_id    = sp.get('year_id')    ?? '';
  const semester   = sp.get('semester')   ?? '';
  const year_name  = sp.get('year_name')  ?? '';

  const [primary, setPrimary] = useState('#2ab289');

  // Year / semester selectors — seeded from URL params, changeable on-page
  const [years,          setYears]          = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState(year_id);
  const [selectedSem,    setSelectedSem]    = useState(semester);

  const [rows,     setRows]    = useState<ExamRow[]>([]);
  const [scores,   setScores]  = useState<Record<string, string>>({});
  const [maxScore, setMaxScore] = useState('100');
  const [loading,  setLoading] = useState(true);
  const [saving,   setSaving]  = useState(false);
  const [saved,    setSaved]   = useState(false);
  const [error,    setError]   = useState('');

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const selectedYearName = years.find(y => y.id === selectedYearId)?.name ?? year_name;

  const load = useCallback(async () => {
    if (!selectedYearId || !selectedSem || !subject || !class_name) return;
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const { data } = await teacherApi.get<ExamRow[]>('/api/exam-scores', {
        params: { academic_year_id: selectedYearId, semester: selectedSem, subject, class_name },
      });
      setRows(data ?? []);
      const s: Record<string, string> = {};
      for (const r of (data ?? []) as ExamRow[]) {
        s[r.student_id] = r.score != null ? String(r.score) : '';
      }
      setScores(s);
    } catch {
      setError('Failed to load exam scores.');
    } finally {
      setLoading(false);
    }
  }, [selectedYearId, selectedSem, subject, class_name]);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);

    // Fetch all academic years for the dropdowns
    teacherApi.get<AcademicYear[]>('/api/academic-years')
      .then(r => setYears(r.data ?? []))
      .catch(() => {});

    load();
  }, [load]);

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const payload = rows.map(r => ({
        student_id: r.student_id,
        score: scores[r.student_id] !== '' ? parseFloat(scores[r.student_id]) : null,
      }));
      await teacherApi.post('/api/exam-scores', {
        academic_year_id: selectedYearId,
        semester:         parseInt(selectedSem),
        subject,
        class_name,
        max_score:        parseFloat(maxScore) || 100,
        scores:           payload,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#F4EFE6] px-4 pt-6 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC] shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-[#2C2218]">End-of-Semester Exam</h1>
            <p className="text-xs text-[#8C7E6E] truncate">{subject} · {class_name}</p>
          </div>
        </div>

        {/* Year + Semester selectors */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] px-4 py-3 flex gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Academic Year</p>
            <div className="relative">
              <select
                value={selectedYearId}
                onChange={e => setSelectedYearId(e.target.value)}
                className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-7 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
              >
                {years.length === 0
                  ? <option value={year_id}>{year_name}</option>
                  : years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)
                }
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="w-32 shrink-0">
            <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Semester</p>
            <div className="relative">
              <select
                value={selectedSem}
                onChange={e => setSelectedSem(e.target.value)}
                className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-7 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
              >
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>

        {/* Max score input */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] px-4 py-3 flex items-center gap-3 mb-2">
          <p className="text-xs font-semibold text-[#8C7E6E] flex-1">Max Score</p>
          <input
            type="number"
            className="w-20 border border-[#E2D9CC] rounded-xl px-3 py-1.5 text-sm font-bold text-center text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
            value={maxScore}
            onChange={e => setMaxScore(e.target.value)}
            placeholder="100"
          />
        </div>

        {error && (
          <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">{error}</p>
        )}
        {saved && (
          <p className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-2">
            ✓ Exam scores saved for {selectedYearName} · Semester {selectedSem}.
          </p>
        )}
      </div>

      {/* Student list */}
      <div className="px-4 space-y-2">
        {loading ? (
          <>
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-14 animate-pulse" />)}
          </>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-semibold text-[#8C7E6E]">No students found</p>
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={row.student_id}
              className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm flex items-center px-3 py-2.5 gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#2C2218] truncate">{row.name}</p>
                <p className="text-xs text-[#8C7E6E]">{row.student_code}</p>
              </div>
              <input
                ref={ref => { inputRefs.current[row.student_id] = ref; }}
                type="number"
                className="w-20 border border-[#E2D9CC] rounded-xl px-2 py-1.5 text-sm font-bold text-center text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
                value={scores[row.student_id] ?? ''}
                onChange={e => setScores(prev => ({ ...prev, [row.student_id]: e.target.value }))}
                placeholder={`/${maxScore}`}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    const nextId = rows[index + 1]?.student_id;
                    if (nextId) inputRefs.current[nextId]?.focus();
                  }
                }}
              />
            </div>
          ))
        )}
      </div>

      {/* Save button */}
      {!loading && rows.length > 0 && (
        <div className="px-4 pt-4 pb-6 flex flex-col items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="w-full max-w-sm px-6 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-60 transition-opacity shadow-sm"
            style={{ background: primary }}
          >
            {saving ? 'Saving…' : 'Save Exam Scores'}
          </button>
          <p className="text-xs text-[#8C7E6E]">{rows.length} student{rows.length !== 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
}

export default function ExamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}><div className="w-7 h-7 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" /></div>}>
      <ExamContent />
    </Suspense>
  );
}
