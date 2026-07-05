'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Term    { id: string; name: string; is_current: boolean; }
interface Subject { id: string; subject_name: string; max_class_score: number; max_exam_score: number; }
interface Student { id: string; surname: string; other_names: string | null; admission_number: string; }

interface ScoreEntry { class_score: number | null; exam_score: number | null; total: number | null; grade: string | null; position: number | null; }
interface ScoresData { subjects: Subject[]; students: Student[]; scoreMap: Record<string, Record<string, ScoreEntry>>; }

const CLASSES = ['Nursery 1','Nursery 2','KG 1','KG 2','Basic 1','Basic 2','Basic 3','Basic 4','Basic 5','Basic 6','JHS 1','JHS 2','JHS 3'];

export default function PrimaryScoresAdminPage() {
  const [terms,      setTerms]      = useState<Term[]>([]);
  const [termId,     setTermId]     = useState('');
  const [className,  setClassName]  = useState('');
  const [subjects,   setSubjects]   = useState<Subject[]>([]);
  const [students,   setStudents]   = useState<Student[]>([]);
  const [scoreMap,   setScoreMap]   = useState<ScoresData['scoreMap']>({});
  const [selSubject, setSelSubject] = useState('');
  const [draft,      setDraft]      = useState<Record<string, { cs: string; ex: string }>>({});
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
    if (!termId || !className) return;
    setLoading(true); setError('');
    try {
      const { data } = await api.get<ScoresData>(`/api/primary/scores?term_id=${termId}&class_name=${encodeURIComponent(className)}`);
      setSubjects(data.subjects);
      setStudents(data.students);
      setScoreMap(data.scoreMap);
      if (data.subjects.length) setSelSubject(data.subjects[0].id);
    } catch { setError('Failed to load scores.'); }
    finally { setLoading(false); }
  }, [termId, className]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selSubject || !students.length) return;
    const existing = scoreMap[selSubject] ?? {};
    const d: Record<string, { cs: string; ex: string }> = {};
    students.forEach(s => {
      const r = existing[s.id];
      d[s.id] = { cs: r?.class_score != null ? String(r.class_score) : '', ex: r?.exam_score != null ? String(r.exam_score) : '' };
    });
    setDraft(d); setSaved(false);
  }, [selSubject, students, scoreMap]);

  async function save() {
    if (!termId || !selSubject) return;
    setSaving(true); setError('');
    try {
      const scores = students.map(s => ({
        student_id:  s.id,
        class_score: draft[s.id]?.cs !== '' ? parseFloat(draft[s.id]?.cs ?? '') : null,
        exam_score:  draft[s.id]?.ex !== '' ? parseFloat(draft[s.id]?.ex ?? '') : null,
      }));
      await api.post('/api/primary/scores', { term_id: termId, subject_id: selSubject, scores });
      setSaved(true); load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  const activeSubject = subjects.find(s => s.id === selSubject);
  const existing = scoreMap[selSubject] ?? {};

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Score Entry</h1>
          <p className="text-sm text-slate-500 mt-0.5">Enter class and exam scores per subject and term</p>
        </div>
        <button onClick={save} disabled={saving || loading || !selSubject}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 shadow-sm"
          style={{ backgroundColor: '#15803D' }}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Scores'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        <select value={termId} onChange={e => setTermId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700">
          <option value="">Select term…</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={className} onChange={e => setClassName(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700">
          <option value="">Select class…</option>
          {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {subjects.length > 0 && (
          <select value={selSubject} onChange={e => setSelSubject(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700">
            {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
          </select>
        )}
        {activeSubject && (
          <span className="text-xs text-slate-500 ml-auto">
            Class: <strong>{activeSubject.max_class_score}</strong> + Exam: <strong>{activeSubject.max_exam_score}</strong> = <strong>{activeSubject.max_class_score + activeSubject.max_exam_score}</strong>
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {(!termId || !className) ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm text-slate-400 text-sm">
          Select a term and class to enter scores
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Class /{activeSubject?.max_class_score ?? 30}</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Exam /{activeSubject?.max_exam_score ?? 70}</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Grade</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pos.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {students.map((s, i) => {
                  const row   = existing[s.id];
                  const cs    = draft[s.id]?.cs ?? '';
                  const ex    = draft[s.id]?.ex ?? '';
                  const total = cs !== '' && ex !== '' ? (parseFloat(cs) + parseFloat(ex)).toFixed(1) : '—';
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{s.surname}{s.other_names ? ` ${s.other_names}` : ''}</p>
                        <p className="text-xs text-slate-400">{s.admission_number}</p>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={cs} onChange={e => { setDraft(d => ({ ...d, [s.id]: { ...d[s.id], cs: e.target.value } })); setSaved(false); }}
                          min={0} max={activeSubject?.max_class_score ?? 30} step={0.5}
                          className="w-20 border border-gray-200 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-green-500" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={ex} onChange={e => { setDraft(d => ({ ...d, [s.id]: { ...d[s.id], ex: e.target.value } })); setSaved(false); }}
                          min={0} max={activeSubject?.max_exam_score ?? 70} step={0.5}
                          className="w-20 border border-gray-200 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-green-500" />
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-900">{total}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-bold ${row?.grade ? 'text-green-700' : 'text-slate-300'}`}>{row?.grade ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{row?.position ?? '—'}</td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400 text-sm">No active students in this class.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
