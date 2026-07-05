'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Term    { id: string; name: string; is_current: boolean; }
interface Subject { id: string; subject_name: string; class_name: string; max_class_score: number; max_exam_score: number; }
interface Mode    { id: string; name: string; ca_weight: number; is_terminal_exam: boolean; max_instances: number | null; }
interface Assessment {
  id: string; title: string; mode_id: string; mode_name: string; ca_weight: number;
  is_terminal_exam: boolean; max_score: number; score_count: number;
  subject_id: string; subject_name: string; class_name: string; created_at: string;
}
interface StudentRow {
  student_id: string; name: string; admission_number: string;
  score: number | null; absent: boolean;
}

function chip(label: string, isExam: boolean) {
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isExam ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
      {label}
    </span>
  );
}

export default function TeacherAssessmentsPage() {
  const [terms,    setTerms]    = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [modes,    setModes]    = useState<Mode[]>([]);
  const [termId,   setTermId]   = useState('');
  const [subjectId, setSubjectId] = useState('');

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // Create form
  const [createForm, setCreateForm] = useState({ mode_id: '', title: '', max_score: '' });
  const [creating,   setCreating]   = useState(false);
  const [createError, setCreateError] = useState('');

  // Inline score entry
  const [activeAssessment, setActiveAssessment] = useState<Assessment | null>(null);
  const [rows,    setRows]    = useState<StudentRow[]>([]);
  const [scLoading, setScLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [scError, setScError] = useState('');

  // Boot
  useEffect(() => {
    Promise.all([
      api.get<Term[]>('/api/primary/terms'),
      api.get<Subject[]>('/api/primary/subjects'),
      api.get<Mode[]>('/api/primary/assessment-modes'),
    ]).then(([t, s, m]) => {
      setTerms(t.data);
      setSubjects(s.data);
      setModes(m.data);
      const cur = t.data.find(x => x.is_current);
      if (cur) setTermId(cur.id);
      if (s.data.length) setSubjectId(s.data[0].id);
    }).catch(() => {});
  }, []);

  // Load assessments when term+subject change
  const loadAssessments = useCallback(async () => {
    if (!termId || !subjectId) return;
    setListLoading(true);
    setActiveAssessment(null); setRows([]);
    try {
      const { data } = await api.get<Assessment[]>(
        `/api/primary/assessments?term_id=${termId}&subject_id=${subjectId}`
      );
      setAssessments(data);
    } catch { /* silent */ }
    finally { setListLoading(false); }
  }, [termId, subjectId]);

  useEffect(() => { loadAssessments(); }, [loadAssessments]);

  // Load students for an assessment
  async function openAssessment(a: Assessment) {
    setActiveAssessment(a); setSaved(false); setScError('');
    setScLoading(true);
    try {
      const { data } = await api.get<{ assessment: Assessment; students: StudentRow[] }>(
        `/api/primary/assessments/${a.id}/scores`
      );
      setRows(data.students.map(s => ({ ...s, score: s.score ?? null, absent: s.absent ?? false })));
    } catch { setScError('Failed to load students.'); }
    finally { setScLoading(false); }
  }

  async function createAssessment() {
    if (!createForm.mode_id || !createForm.title.trim() || !createForm.max_score) return;
    setCreating(true); setCreateError('');
    try {
      const { data } = await api.post<Assessment>('/api/primary/assessments', {
        term_id: termId, subject_id: subjectId,
        mode_id: createForm.mode_id, title: createForm.title.trim(),
        max_score: parseFloat(createForm.max_score),
      });
      setAssessments(prev => [...prev, data]);
      setCreateForm(f => ({ ...f, title: '', max_score: '' }));
      // Auto-open score entry for the new assessment
      await openAssessment(data);
    } catch (e: unknown) {
      setCreateError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create');
    } finally { setCreating(false); }
  }

  async function deleteAssessment(id: string) {
    if (!confirm('Delete this assessment and all its scores?')) return;
    await api.delete(`/api/primary/assessments/${id}`);
    setAssessments(prev => prev.filter(a => a.id !== id));
    if (activeAssessment?.id === id) { setActiveAssessment(null); setRows([]); }
  }

  function setScore(studentId: string, value: string) {
    setRows(prev => prev.map(r => r.student_id === studentId
      ? { ...r, score: value === '' ? null : parseFloat(value), absent: false }
      : r));
    setSaved(false);
  }

  function toggleAbsent(studentId: string) {
    setRows(prev => prev.map(r => r.student_id === studentId
      ? { ...r, absent: !r.absent, score: !r.absent ? 0 : r.score }
      : r));
    setSaved(false);
  }

  async function saveScores() {
    if (!activeAssessment) return;
    const maxScore = activeAssessment.max_score;

    // Client-side validation
    for (const r of rows) {
      if (r.absent || r.score == null) continue;
      if (r.score < 0 || r.score > maxScore) {
        setScError(`Score for ${r.name} is out of range (0 – ${maxScore})`);
        return;
      }
    }

    setSaving(true); setScError(''); setSaved(false);
    try {
      await api.post(`/api/primary/assessments/${activeAssessment.id}/scores`, {
        scores: rows.map(r => ({ student_id: r.student_id, score: r.absent ? 0 : (r.score ?? null), absent: r.absent })),
      });
      setSaved(true);
      // Update score_count on the assessment card
      setAssessments(prev => prev.map(a => a.id === activeAssessment.id
        ? { ...a, score_count: rows.filter(r => r.absent || r.score !== null).length }
        : a));
    } catch (e: unknown) {
      setScError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  // Group assessments by mode for the list view
  const grouped = assessments.reduce<Record<string, Assessment[]>>((acc, a) => {
    const key = a.mode_name ?? 'No Mode';
    (acc[key] ??= []).push(a);
    return acc;
  }, {});

  const activeSubject = subjects.find(s => s.id === subjectId);
  const activeMode    = modes.find(m => m.id === createForm.mode_id);
  const filled = rows.filter(r => r.absent || r.score !== null).length;

  return (
    <div className="space-y-5">
      {/* Header + filters */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Assessments</h1>
        <p className="text-sm text-slate-500 mt-0.5">Select a term and subject, then create or enter scores for each assessment</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        <select value={termId} onChange={e => { setTermId(e.target.value); setActiveAssessment(null); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="">Select term…</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_current ? ' (current)' : ''}</option>)}
        </select>
        <select value={subjectId} onChange={e => { setSubjectId(e.target.value); setActiveAssessment(null); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="">Select subject…</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
        </select>
        {activeSubject && (
          <span className="text-xs text-slate-400 ml-auto">
            {activeSubject.class_name} · Class max <strong>{activeSubject.max_class_score}</strong> · Exam max <strong>{activeSubject.max_exam_score}</strong>
          </span>
        )}
      </div>

      {!termId || !subjectId ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-slate-400 text-sm">
          Select a term and subject to get started.
        </div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-5 items-start">

          {/* Left: Create + Assessment List */}
          <div className="lg:col-span-2 space-y-4">

            {/* Create panel */}
            {modes.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                No assessment modes set up yet. Ask your admin to configure modes in School Settings.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">New Assessment</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mode</label>
                  <select value={createForm.mode_id} onChange={e => setCreateForm(f => ({ ...f, mode_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select mode…</option>
                    {modes.map(m => {
                      const used = assessments.filter(a => a.mode_id === m.id).length;
                      const atLimit = m.max_instances != null && used >= m.max_instances;
                      const limitLabel = m.max_instances != null ? ` [${used}/${m.max_instances}]` : ` [${used} used]`;
                      return (
                        <option key={m.id} value={m.id} disabled={atLimit}>
                          {m.name} ({m.ca_weight}%){m.is_terminal_exam ? ' — Exam' : ''}{limitLabel}{atLimit ? ' — Full' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Instance <span className="font-normal text-slate-400">(e.g. Exercise 1, Homework 3)</span>
                  </label>
                  <input value={createForm.title}
                    onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Class Test 1"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    onKeyDown={e => { if (e.key === 'Enter') createAssessment(); }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Max Score</label>
                  <input type="number" min={1} value={createForm.max_score}
                    onChange={e => setCreateForm(f => ({ ...f, max_score: e.target.value }))}
                    placeholder="e.g. 20"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    onKeyDown={e => { if (e.key === 'Enter') createAssessment(); }}
                  />
                  {activeMode && activeSubject && (
                    <p className="text-xs text-slate-400 mt-1">
                      Scaled to {activeMode.is_terminal_exam
                        ? `${activeSubject.max_exam_score} exam marks`
                        : `${activeSubject.max_class_score} class marks`} via {activeMode.ca_weight}% weight
                    </p>
                  )}
                </div>
                {createError && <p className="text-xs text-red-600">{createError}</p>}
                <button onClick={createAssessment}
                  disabled={creating || !createForm.mode_id || !createForm.title.trim() || !createForm.max_score}
                  className="w-full py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
                  style={{ backgroundColor: '#15803D' }}>
                  {creating ? 'Creating…' : 'Create & Enter Scores ▶'}
                </button>
              </div>
            )}

            {/* Assessment list grouped by mode */}
            {listLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
              </div>
            ) : assessments.length === 0 ? (
              <p className="text-sm text-center text-slate-400 py-6">No assessments yet for this term and subject.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(grouped).map(([modeName, items]) => {
                  const modeInfo = modes.find(m => m.name === modeName);
                  return (
                    <div key={modeName} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">{modeName}</span>
                        {modeInfo && chip(`${modeInfo.ca_weight}%`, modeInfo.is_terminal_exam)}
                      </div>
                      <div className="divide-y divide-gray-50">
                        {items.map(a => (
                          <div key={a.id}
                            className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${activeAssessment?.id === a.id ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                            onClick={() => openAssessment(a)}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{a.title}</p>
                              <p className="text-xs text-slate-400">Max {a.max_score} · {a.score_count} scores entered</p>
                            </div>
                            {activeAssessment?.id === a.id
                              ? <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-300 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>}
                            <button onClick={e => { e.stopPropagation(); deleteAssessment(a.id); }}
                              className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 ml-1">×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Inline score entry */}
          <div className="lg:col-span-3">
            {!activeAssessment ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-20 text-center text-slate-400 text-sm">
                <p className="text-4xl mb-3">📝</p>
                <p>Create a new assessment or select one from the list to enter scores.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Assessment header */}
                <div className="px-5 py-3.5 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-900">{activeAssessment.title}</p>
                        {chip(activeAssessment.mode_name, activeAssessment.is_terminal_exam)}
                        <span className="text-xs text-slate-400">{activeAssessment.ca_weight}% weight</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {activeAssessment.subject_name} · {activeAssessment.class_name} · Max {activeAssessment.max_score} marks
                        {activeSubject && (
                          <> · scales to {activeAssessment.is_terminal_exam
                            ? `${activeSubject.max_exam_score} exam marks`
                            : `${activeSubject.max_class_score} class marks`}</>
                        )}
                      </p>
                    </div>
                    <button onClick={() => { setActiveAssessment(null); setRows([]); }}
                      className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Progress */}
                  {rows.length > 0 && (
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${filled / rows.length * 100}%`, backgroundColor: '#15803D' }} />
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{filled}/{rows.length} entered</span>
                    </div>
                  )}
                </div>

                {/* Score table */}
                {scLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                  </div>
                ) : (
                  <>
                    {scError && <p className="mx-5 mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{scError}</p>}
                    {saved   && <p className="mx-5 mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">✓ Scores saved — class scores recalculated.</p>}

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Score /{activeAssessment.max_score}
                            </th>
                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Absent</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {rows.map((r, i) => {
                            const outOfRange = !r.absent && r.score !== null && (r.score < 0 || r.score > activeAssessment.max_score);
                            return (
                              <tr key={r.student_id} className={r.absent ? 'bg-red-50' : outOfRange ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                                <td className="px-4 py-2 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                                <td className="px-4 py-2">
                                  <p className="font-medium text-slate-900 leading-tight">{r.name}</p>
                                  <p className="text-xs text-slate-400">{r.admission_number}</p>
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number" min={0} max={activeAssessment.max_score} step={0.5}
                                    value={r.absent ? '' : (r.score ?? '')}
                                    disabled={r.absent}
                                    onChange={e => setScore(r.student_id, e.target.value)}
                                    onBlur={e => {
                                      const v = parseFloat(e.target.value);
                                      if (!isNaN(v) && v > activeAssessment.max_score)
                                        setScore(r.student_id, String(activeAssessment.max_score));
                                      if (!isNaN(v) && v < 0)
                                        setScore(r.student_id, '0');
                                    }}
                                    placeholder={r.absent ? '—' : ''}
                                    className={`w-24 border rounded-lg px-2 py-1 text-sm tabular-nums disabled:bg-gray-100 disabled:text-gray-400 ${
                                      outOfRange ? 'border-red-400 bg-red-50' : 'border-gray-200'
                                    }`}
                                  />
                                  {outOfRange && (
                                    <p className="text-xs text-red-500 mt-0.5">Must be 0 – {activeAssessment.max_score}</p>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <input type="checkbox" checked={r.absent} onChange={() => toggleAbsent(r.student_id)}
                                    className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
                                </td>
                              </tr>
                            );
                          })}
                          {rows.length === 0 && (
                            <tr><td colSpan={4} className="py-10 text-center text-slate-400 text-sm">No active students in this class.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {rows.length > 0 && (
                      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4">
                        <p className="text-xs text-slate-400">
                          Scores are averaged within the <strong>{activeAssessment.mode_name}</strong> mode, then weighted at <strong>{activeAssessment.ca_weight}%</strong> toward the final{' '}
                          {activeAssessment.is_terminal_exam ? 'exam' : 'class'} score.
                        </p>
                        <button onClick={saveScores} disabled={saving || rows.some(r => !r.absent && r.score !== null && (r.score < 0 || r.score > activeAssessment.max_score))}
                          className="px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm disabled:opacity-40 flex-shrink-0"
                          style={{ backgroundColor: '#15803D' }}>
                          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Scores'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
