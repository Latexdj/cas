'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Term { id: string; name: string; is_current: boolean; }
interface Subject { id: string; subject_name: string; max_class_score: number; max_exam_score: number; }
interface Student { id: string; surname: string; other_names: string | null; admission_number: string; }
interface ScoreMap { [studentId: string]: { class_score: string; exam_score: string; } }

interface ScoresData {
  subjects: Subject[];
  students: Student[];
  scoreMap: { [subjectId: string]: { [studentId: string]: { class_score: number | null; exam_score: number | null; grade: string | null; position: number | null; } } };
}

export default function PrimaryScoresPage() {
  const [terms,      setTerms]      = useState<Term[]>([]);
  const [termId,     setTermId]     = useState('');
  const [subjects,   setSubjects]   = useState<Subject[]>([]);
  const [students,   setStudents]   = useState<Student[]>([]);
  const [scoreMap,   setScoreMap]   = useState<ScoresData['scoreMap']>({});
  const [selSubject, setSelSubject] = useState('');
  const [draft,      setDraft]      = useState<ScoreMap>({});
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    api.get<Term[]>('/api/primary/terms').then(r => {
      setTerms(r.data);
      const cur = r.data.find(t => t.is_current);
      if (cur) setTermId(cur.id);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!termId) return;
    setLoading(true); setError(''); setSaved(false);
    try {
      const { data } = await api.get<ScoresData>(`/api/primary/scores?term_id=${termId}`);
      setSubjects(data.subjects);
      setStudents(data.students);
      setScoreMap(data.scoreMap);
      if (data.subjects.length && !selSubject) setSelSubject(data.subjects[0].id);
    } catch { setError('Failed to load scores.'); }
    finally { setLoading(false); }
  }, [termId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Populate draft when switching subject
  useEffect(() => {
    if (!selSubject || !students.length) return;
    const existing = scoreMap[selSubject] ?? {};
    const next: ScoreMap = {};
    students.forEach(s => {
      const row = existing[s.id];
      next[s.id] = {
        class_score: row?.class_score != null ? String(row.class_score) : '',
        exam_score:  row?.exam_score  != null ? String(row.exam_score)  : '',
      };
    });
    setDraft(next);
    setSaved(false);
  }, [selSubject, students, scoreMap]);

  function update(studentId: string, field: 'class_score' | 'exam_score', val: string) {
    setDraft(d => ({ ...d, [studentId]: { ...d[studentId], [field]: val } }));
    setSaved(false);
  }

  async function save() {
    if (!termId || !selSubject) return;
    setSaving(true); setError('');
    try {
      const scores = students.map(s => ({
        student_id:  s.id,
        class_score: draft[s.id]?.class_score !== '' ? parseFloat(draft[s.id]?.class_score ?? '') : null,
        exam_score:  draft[s.id]?.exam_score  !== '' ? parseFloat(draft[s.id]?.exam_score  ?? '') : null,
      }));
      await api.post('/api/primary/scores', { term_id: termId, subject_id: selSubject, scores });
      setSaved(true);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  const activeSubject = subjects.find(s => s.id === selSubject);
  const existingForSubject = scoreMap[selSubject] ?? {};

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Score Entry</h1>
          <p className="text-sm text-slate-500 mt-0.5">Enter class and exam scores for each subject.</p>
        </div>
        <button onClick={save} disabled={saving || loading || !selSubject}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Scores'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-3 shadow-sm">
        <select value={termId} onChange={e => setTermId(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Select term…</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {subjects.length > 0 && (
          <select value={selSubject} onChange={e => setSelSubject(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
          </select>
        )}
        {activeSubject && (
          <span className="text-xs text-slate-500 self-center">
            Class: <strong>{activeSubject.max_class_score}</strong> + Exam: <strong>{activeSubject.max_exam_score}</strong> = <strong>{activeSubject.max_class_score + activeSubject.max_exam_score}</strong>
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : !selSubject ? (
        <div className="text-center py-12 text-slate-400 text-sm">Select a term and subject to enter scores.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Class Score<br/><span className="text-slate-400 normal-case font-normal">/{activeSubject?.max_class_score ?? 30}</span>
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Exam Score<br/><span className="text-slate-400 normal-case font-normal">/{activeSubject?.max_exam_score ?? 70}</span>
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Grade</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Pos.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s, i) => {
                  const row    = existingForSubject[s.id];
                  const cs     = draft[s.id]?.class_score ?? '';
                  const ex     = draft[s.id]?.exam_score  ?? '';
                  const total  = cs !== '' && ex !== '' ? (parseFloat(cs) + parseFloat(ex)).toFixed(1) : '—';
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{s.surname}{s.other_names ? ` ${s.other_names}` : ''}</p>
                        <p className="text-xs text-slate-400">{s.admission_number}</p>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={cs} onChange={e => update(s.id, 'class_score', e.target.value)}
                          min={0} max={activeSubject?.max_class_score ?? 30} step={0.5}
                          className="w-20 border border-slate-200 rounded-md px-2 py-1 text-sm text-center" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={ex} onChange={e => update(s.id, 'exam_score', e.target.value)}
                          min={0} max={activeSubject?.max_exam_score ?? 70} step={0.5}
                          className="w-20 border border-slate-200 rounded-md px-2 py-1 text-sm text-center" />
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{total}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-bold ${row?.grade ? 'text-green-700' : 'text-slate-300'}`}>
                          {row?.grade ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{row?.position ?? '—'}</td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400 text-sm">No students in your class.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
