'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface AssessmentMode { id: string; name: string; ca_contribution: number }
interface AcademicYear  { id: string; name: string; is_current: boolean }
interface Assessment {
  id: string;
  mode_id: string;
  mode_name: string;
  ca_contribution: number;
  title: string | null;
  date: string | null;
  max_score: number;
  score_count: number;
  academic_year_id: string;
  semester: number;
  created_at: string;
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

  // Edit modal state
  const [editTarget,   setEditTarget]   = useState<Assessment | null>(null);
  const [editYears,    setEditYears]    = useState<AcademicYear[]>([]);
  const [editYearId,   setEditYearId]   = useState('');
  const [editSemester, setEditSemester] = useState('');
  const [editModeId,   setEditModeId]   = useState('');
  const [editTitle,    setEditTitle]    = useState('');
  const [editDate,     setEditDate]     = useState('');
  const [editMaxScore, setEditMaxScore] = useState('');
  const [editSaving,   setEditSaving]   = useState(false);
  const [editErr,      setEditErr]      = useState('');
  const [yearsLoaded,  setYearsLoaded]  = useState(false);

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

  function openEdit(a: Assessment) {
    setEditTarget(a);
    setEditYearId(a.academic_year_id);
    setEditSemester(String(a.semester));
    setEditModeId(a.mode_id);
    setEditTitle(a.title ?? '');
    setEditDate(a.date?.slice(0, 10) ?? '');
    setEditMaxScore(String(a.max_score));
    setEditErr('');
    if (!yearsLoaded) {
      teacherApi.get<AcademicYear[]>('/api/academic-years')
        .then(r => { setEditYears(r.data ?? []); setYearsLoaded(true); })
        .catch(() => {});
    }
  }

  async function saveEdit() {
    if (!editTarget || !editModeId) { setEditErr('Please select a mode.'); return; }
    setEditSaving(true); setEditErr('');
    try {
      await teacherApi.put(`/api/assessments/${editTarget.id}`, {
        academic_year_id: editYearId,
        semester:         parseInt(editSemester),
        mode_id:          editModeId,
        title:            editTitle.trim() || null,
        date:             editDate || null,
        max_score:        parseFloat(editMaxScore) || 100,
      });
      setEditTarget(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setEditErr(msg ?? 'Failed to save changes.');
    } finally { setEditSaving(false); }
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
                  className="px-3 flex items-center justify-center border-l border-[#E2D9CC] hover:bg-[#F4EFE6] transition-colors"
                  onClick={() => openEdit(item)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
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

      {/* Edit modal */}
      {editTarget && (() => {
        const ageHours = (Date.now() - new Date(editTarget.created_at).getTime()) / 3_600_000;
        const structuralLocked = editTarget.score_count > 0 || ageHours > 48;
        const lockReason = editTarget.score_count > 0
          ? 'scores have already been entered'
          : 'the assessment is more than 48 hours old';
        return (
          <div className="fixed inset-0 bg-black/40 z-40 flex items-end md:items-center justify-center" onClick={() => setEditTarget(null)}>
            <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-3xl p-6 pb-8 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-[#2C2218]">Edit Assessment</h2>
                <button onClick={() => setEditTarget(null)} className="w-7 h-7 rounded-full bg-[#F4EFE6] flex items-center justify-center text-[#8C7E6E] text-xs font-bold">✕</button>
              </div>

              {structuralLocked && (
                <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
                  <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p className="text-xs text-amber-800"><strong>Semester &amp; Year are locked</strong> — {lockReason}. You can still edit the mode, title, date, and max score.</p>
                </div>
              )}

              <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Academic Year</p>
              <div className="relative mb-3">
                <select
                  className={`${inputCls} appearance-none ${structuralLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={editYearId}
                  disabled={structuralLocked}
                  onChange={e => setEditYearId(e.target.value)}
                >
                  {editYears.length === 0
                    ? <option value={editYearId}>{year_name}</option>
                    : editYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)
                  }
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Semester</p>
              <div className="relative mb-4">
                <select
                  className={`${inputCls} appearance-none ${structuralLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={editSemester}
                  disabled={structuralLocked}
                  onChange={e => setEditSemester(e.target.value)}
                >
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-2">Mode *</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {modes.map(m => (
                  <button key={m.id} onClick={() => setEditModeId(m.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                    style={editModeId === m.id
                      ? { background: primary, borderColor: primary, color: '#fff' }
                      : { background: '#F4EFE6', borderColor: '#E2D9CC', color: '#5C4F42' }
                    }>
                    {m.name}
                  </button>
                ))}
              </div>

              <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Title (optional)</p>
              <input className={`${inputCls} mb-3`} value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="e.g. Week 3 Test" />

              <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Date</p>
              <input type="date" className={`${inputCls} mb-3`} value={editDate} onChange={e => setEditDate(e.target.value)} />

              <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Max Score</p>
              <input type="number" className={`${inputCls} mb-4`} value={editMaxScore} onChange={e => setEditMaxScore(e.target.value)} placeholder="100" />

              {editErr && <p className="text-xs text-[#B83232] mb-3">{editErr}</p>}

              <div className="flex gap-3">
                <button onClick={() => setEditTarget(null)}
                  className="flex-1 py-3 rounded-xl border border-[#E2D9CC] text-sm font-semibold text-[#5C4F42] bg-[#F4EFE6]">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={editSaving}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: primary }}>
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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

            <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Date (optional)</p>
            <input type="date" className={`${inputCls} mb-3`} value={date} onChange={e => setDate(e.target.value)} />

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
