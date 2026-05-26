'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface AssessmentMode { id: string; name: string; ca_contribution: number }
interface Assessment {
  id: string;
  mode_id: string;
  mode_name: string;
  ca_contribution: number;
  title: string | null;
  date: string | null;
  max_score: number;
  score_count: number;
}

function SubjectContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const subject    = sp.get('subject')    ?? '';
  const class_name = sp.get('class_name') ?? '';
  const year_id    = sp.get('year_id')    ?? '';
  const semester   = sp.get('semester')   ?? '';
  const year_name  = sp.get('year_name')  ?? '';

  const [primary, setPrimary] = useState('#2ab289');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [modes, setModes] = useState<AssessmentMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [showModal, setShowModal]  = useState(false);
  const [modeId,    setModeId]     = useState('');
  const [title,     setTitle]      = useState('');
  const [date,      setDate]       = useState('');
  const [maxScore,  setMaxScore]   = useState('100');
  const [creating,  setCreating]   = useState(false);
  const [createErr, setCreateErr]  = useState('');
  const [deleting,  setDeleting]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [aRes, mRes] = await Promise.all([
        teacherApi.get<Assessment[]>('/api/assessments', {
          params: { academic_year_id: year_id, semester, subject, class_name },
        }),
        teacherApi.get<AssessmentMode[]>('/api/assessment-modes'),
      ]);
      setAssessments(aRes.data ?? []);
      setModes(mRes.data ?? []);
      if (mRes.data?.length > 0) setModeId(prev => prev || mRes.data[0].id);
    } catch {
      setError('Failed to load assessments.');
    } finally {
      setLoading(false);
    }
  }, [year_id, semester, subject, class_name]);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    load();
  }, [load]);

  async function create() {
    if (!modeId) { setCreateErr('Please select a mode.'); return; }
    setCreating(true); setCreateErr('');
    try {
      await teacherApi.post('/api/assessments', {
        academic_year_id: year_id,
        semester:         parseInt(semester),
        subject,
        class_name,
        mode_id:   modeId,
        title:     title.trim() || null,
        date:      date || null,
        max_score: parseFloat(maxScore) || 100,
      });
      setShowModal(false);
      setTitle(''); setDate(''); setMaxScore('100'); setCreateErr('');
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCreateErr(msg ?? 'Failed to create.');
    } finally { setCreating(false); }
  }

  async function deleteAssessment(id: string, label: string) {
    if (!confirm(`Delete "${label}"? All scores will be lost.`)) return;
    setDeleting(id);
    try {
      await teacherApi.delete(`/api/assessments/${id}`);
      setAssessments(prev => prev.filter(a => a.id !== id));
    } catch {
      alert('Failed to delete assessment.');
    } finally { setDeleting(null); }
  }

  const inputCls = 'w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]';

  return (
    <div className="min-h-screen px-4 pt-6 pb-10" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-[#2C2218] truncate">{subject}</h1>
          <p className="text-xs text-[#8C7E6E]">{class_name} · {year_name} · Semester {semester}</p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>
      )}

      {/* Exam scores link */}
      <button
        onClick={() => router.push(
          `/teacher/assessments/exam?subject=${encodeURIComponent(subject)}&class_name=${encodeURIComponent(class_name)}&year_id=${year_id}&semester=${semester}&year_name=${encodeURIComponent(year_name)}`
        )}
        className="w-full flex items-center gap-2.5 bg-white border-2 border-dashed border-[#E2D9CC] rounded-2xl px-4 py-3 mb-4 text-sm font-semibold hover:border-[#8C7E6E] transition-colors text-left"
        style={{ color: primary }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0" style={{ color: primary }}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        Enter End-of-Semester Exam Scores
      </button>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-20 animate-pulse" />)}
        </div>
      ) : assessments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white border border-[#E2D9CC] flex items-center justify-center mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-[#C8BFB5]">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#8C7E6E]">No assessments yet</p>
          <p className="text-xs text-[#C8BFB5] mt-1">Tap + to add one</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {assessments.map(item => {
            const label = item.title ?? item.mode_name;
            const dateStr = item.date
              ? new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : null;
            return (
              <div key={item.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm flex overflow-hidden">
                <button
                  className="flex-1 p-4 text-left hover:bg-[#F9F6F2] transition-colors"
                  onClick={() => router.push(
                    `/teacher/assessments/scores?assessment_id=${item.id}&assessment_label=${encodeURIComponent(label)}`
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg"
                      style={{ background: `${primary}18`, color: primary }}
                    >
                      {item.mode_name}
                    </span>
                    {dateStr && <span className="text-[10px] text-[#8C7E6E]">{dateStr}</span>}
                  </div>
                  <p className="text-sm font-bold text-[#2C2218]">{label}</p>
                  <p className="text-xs text-[#8C7E6E] mt-0.5">
                    Max: {item.max_score} · {item.score_count} score{item.score_count !== 1 ? 's' : ''} entered
                  </p>
                </button>
                <button
                  className="px-4 flex items-center justify-center border-l border-[#E2D9CC] hover:bg-red-50 transition-colors"
                  onClick={() => deleteAssessment(item.id, label)}
                  disabled={deleting === item.id}
                >
                  {deleting === item.id ? (
                    <div className="w-4 h-4 rounded-full border-2 border-red-300 border-t-transparent animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-red-400">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-24 right-5 md:bottom-8 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl z-10 transition-transform hover:scale-105"
        style={{ background: primary }}
      >
        +
      </button>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end md:items-center justify-center" onClick={() => setShowModal(false)}>
          <div
            className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-3xl p-6 pb-8 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-[#2C2218]">New Assessment</h2>
              <button onClick={() => setShowModal(false)} className="w-7 h-7 rounded-full bg-[#F4EFE6] flex items-center justify-center text-[#8C7E6E] text-xs font-bold">✕</button>
            </div>

            <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-2">Mode *</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {modes.map(m => (
                <button
                  key={m.id}
                  onClick={() => setModeId(m.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                  style={
                    modeId === m.id
                      ? { background: primary, borderColor: primary, color: '#fff' }
                      : { background: '#F4EFE6', borderColor: '#E2D9CC', color: '#5C4F42' }
                  }
                >
                  {m.name}
                </button>
              ))}
            </div>

            <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Title (optional)</p>
            <input className={`${inputCls} mb-3`} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Week 3 Test" />

            <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Date (YYYY-MM-DD)</p>
            <input className={`${inputCls} mb-3`} value={date} onChange={e => setDate(e.target.value)} placeholder="e.g. 2025-03-14" />

            <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Max Score</p>
            <input className={`${inputCls} mb-4`} value={maxScore} onChange={e => setMaxScore(e.target.value)} placeholder="100" type="number" />

            {createErr && <p className="text-xs text-[#B83232] mb-3">{createErr}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl border border-[#E2D9CC] text-sm font-semibold text-[#5C4F42] bg-[#F4EFE6]"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={creating}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                style={{ background: primary }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubjectPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}><div className="w-7 h-7 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" /></div>}>
      <SubjectContent />
    </Suspense>
  );
}
