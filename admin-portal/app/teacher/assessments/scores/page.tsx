'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface ScoreRow {
  student_id: string;
  student_code: string;
  name: string;
  score_id: string | null;
  score: number | null;
  absent: boolean;
}

interface AssessmentInfo {
  id: string;
  mode_name: string;
  title: string | null;
  date: string | null;
  max_score: number;
  class_name: string;
  subject: string;
}

function ScoresContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const assessment_id    = sp.get('assessment_id')    ?? '';
  const assessment_label = sp.get('assessment_label') ?? 'Assessment';

  const [primary, setPrimary] = useState('#2ab289');
  const [assessment, setAssessment] = useState<AssessmentInfo | null>(null);
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [absents, setAbsents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    if (!assessment_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await teacherApi.get(`/api/assessments/${assessment_id}/scores`);
      setAssessment(data.assessment);
      setRows(data.scores ?? []);
      const s: Record<string, string> = {};
      const a: Record<string, boolean> = {};
      for (const r of (data.scores ?? []) as ScoreRow[]) {
        s[r.student_id] = r.score != null ? String(r.score) : '';
        a[r.student_id] = r.absent;
      }
      setScores(s);
      setAbsents(a);
    } catch {
      setError('Failed to load scores.');
    } finally {
      setLoading(false);
    }
  }, [assessment_id]);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    load();
  }, [load]);

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const payload = rows.map(r => ({
        student_id: r.student_id,
        score:  absents[r.student_id] ? null : (scores[r.student_id] !== '' ? parseFloat(scores[r.student_id]) : null),
        absent: absents[r.student_id] ?? false,
      }));
      await teacherApi.post(`/api/assessments/${assessment_id}/scores`, { scores: payload });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  const maxScore = assessment?.max_score ?? 100;

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
            <h1 className="text-base font-bold text-[#2C2218] truncate">{assessment_label}</h1>
            {assessment && (
              <p className="text-xs text-[#8C7E6E]">{assessment.subject} · {assessment.class_name} · Max: {maxScore}</p>
            )}
          </div>
        </div>

        {error && (
          <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">{error}</p>
        )}
        {saved && (
          <p className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-2">✓ Scores saved.</p>
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
          rows.map((row, index) => {
            const isAbsent = absents[row.student_id] ?? false;
            return (
              <div
                key={row.student_id}
                className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm flex items-center px-3 py-2.5 gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#2C2218] truncate">{row.name}</p>
                  <p className="text-xs text-[#8C7E6E]">{row.student_code}</p>
                </div>

                {isAbsent ? (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-500 border border-red-100">
                    Absent
                  </span>
                ) : (
                  <input
                    ref={ref => { inputRefs.current[row.student_id] = ref; }}
                    type="number"
                    className="w-16 border border-[#E2D9CC] rounded-xl px-2 py-1.5 text-sm font-bold text-center text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
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
                )}

                <button
                  onClick={() => setAbsents(prev => ({ ...prev, [row.student_id]: !prev[row.student_id] }))}
                  className="w-8 h-8 rounded-full flex items-center justify-center border transition-colors"
                  style={
                    isAbsent
                      ? { background: '#EF4444', borderColor: '#EF4444' }
                      : { background: '#F4EFE6', borderColor: '#E2D9CC' }
                  }
                  title="Toggle absent"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4" style={{ color: isAbsent ? '#fff' : '#C8BFB5' }}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Save button — inline, after the student list */}
      {!loading && rows.length > 0 && (
        <div className="px-4 pt-4 pb-6 flex flex-col items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="w-full max-w-sm px-6 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-60 transition-opacity shadow-sm"
            style={{ background: primary }}
          >
            {saving ? 'Saving…' : 'Save All Scores'}
          </button>
          <p className="text-xs text-[#8C7E6E]">{rows.length} student{rows.length !== 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
}

export default function ScoresPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}><div className="w-7 h-7 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" /></div>}>
      <ScoresContent />
    </Suspense>
  );
}
