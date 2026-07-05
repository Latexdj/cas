'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Assessment {
  id: string; title: string; type: string; max_score: number;
  subject_name: string; class_name: string; max_class_score: number; max_exam_score: number;
}
interface StudentRow {
  student_id: string; name: string; admission_number: string;
  score: number | null; absent: boolean;
}

export default function AssessmentScoresPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [rows,       setRows]       = useState<StudentRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [saved,      setSaved]      = useState(false);

  useEffect(() => {
    api.get<{ assessment: Assessment; students: StudentRow[] }>(`/api/primary/assessments/${id}/scores`)
      .then(r => {
        setAssessment(r.data.assessment);
        setRows(r.data.students.map(s => ({
          ...s,
          score: s.score ?? null,
          absent: s.absent ?? false,
        })));
      })
      .catch(() => setError('Failed to load assessment scores.'))
      .finally(() => setLoading(false));
  }, [id]);

  function setScore(studentId: string, value: string) {
    setRows(prev => prev.map(r => r.student_id === studentId
      ? { ...r, score: value === '' ? null : parseFloat(value), absent: false }
      : r));
  }

  function toggleAbsent(studentId: string) {
    setRows(prev => prev.map(r => r.student_id === studentId
      ? { ...r, absent: !r.absent, score: !r.absent ? 0 : r.score }
      : r));
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.post(`/api/primary/assessments/${id}/scores`, {
        scores: rows.map(r => ({ student_id: r.student_id, score: r.absent ? 0 : (r.score ?? null), absent: r.absent })),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save scores');
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
    </div>
  );

  if (!assessment) return (
    <div className="text-center py-20 text-slate-400">{error || 'Assessment not found.'}</div>
  );

  const scaleTo = assessment.type === 'summative' ? assessment.max_exam_score : assessment.max_class_score;
  const filled  = rows.filter(r => r.absent || r.score !== null).length;

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} className="mt-0.5 text-slate-400 hover:text-slate-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{assessment.title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {assessment.subject_name} · {assessment.class_name} ·{' '}
            <span className={`font-semibold ${assessment.type === 'summative' ? 'text-purple-600' : 'text-blue-600'}`}>
              {assessment.type}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Max score</p>
          <p className="text-xl font-black text-slate-800">{assessment.max_score}</p>
          <p className="text-xs text-slate-400 mt-0.5">→ scaled to {scaleTo} marks</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
      {saved  && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">✓ Scores saved and primary scores recalculated.</p>}

      {/* Progress */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3">
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${rows.length ? (filled / rows.length * 100) : 0}%`, backgroundColor: '#15803D' }} />
        </div>
        <span className="text-xs font-bold text-slate-600 whitespace-nowrap">{filled} / {rows.length} entered</span>
      </div>

      {/* Score table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Admission No.</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Score / {assessment.max_score}</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Absent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <tr key={r.student_id} className={r.absent ? 'bg-red-50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-2.5 text-slate-400 text-xs tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.admission_number}</td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number" min={0} max={assessment.max_score} step="0.5"
                      value={r.absent ? '' : (r.score ?? '')}
                      disabled={r.absent}
                      onChange={e => setScore(r.student_id, e.target.value)}
                      placeholder={r.absent ? 'Absent' : '–'}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm tabular-nums disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input type="checkbox" checked={r.absent} onChange={() => toggleAbsent(r.student_id)}
                      className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-5 px-5 py-3 lg:-mx-7 lg:px-7 flex items-center justify-between gap-4">
        <p className="text-xs text-slate-500">
          Scores are proportionally scaled to the subject&apos;s{' '}
          {assessment.type === 'summative' ? 'exam' : 'class'} mark of {scaleTo}.
        </p>
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 rounded-lg text-sm font-bold text-white shadow-sm disabled:opacity-50 flex-shrink-0"
          style={{ backgroundColor: '#15803D' }}>
          {saving ? 'Saving…' : 'Save Scores'}
        </button>
      </div>
    </div>
  );
}
