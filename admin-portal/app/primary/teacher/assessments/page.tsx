'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Term     { id: string; name: string; is_current: boolean; }
interface Subject  { id: string; subject_name: string; class_name: string; max_class_score: number; max_exam_score: number; }
interface Assessment {
  id: string; title: string; type: 'formative' | 'summative';
  max_score: number; subject_name: string; class_name: string;
  score_count: number; created_at: string;
}

const TYPES = [
  { value: 'formative',  label: 'Formative',  desc: 'Class exercise / quiz / homework' },
  { value: 'summative',  label: 'Summative',  desc: 'End-of-term exam (1 per subject/term)' },
];

export default function TeacherAssessmentsPage() {
  const router = useRouter();

  const [terms,      setTerms]      = useState<Term[]>([]);
  const [termId,     setTermId]     = useState('');
  const [subjects,   setSubjects]   = useState<Subject[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState(false);
  const [form, setForm] = useState({ title: '', type: 'formative', subject_id: '', max_score: '' });
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [editId,     setEditId]     = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState({ title: '', max_score: '' });

  useEffect(() => {
    api.get<Term[]>('/api/primary/terms').then(r => {
      setTerms(r.data);
      const cur = r.data.find(t => t.is_current);
      if (cur) setTermId(cur.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!termId) return;
    setLoading(true);
    Promise.all([
      api.get<Subject[]>(`/api/primary/subjects`),
      api.get<Assessment[]>(`/api/primary/assessments?term_id=${termId}`),
    ]).then(([s, a]) => {
      setSubjects(s.data);
      setAssessments(a.data);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [termId]);

  async function create() {
    if (!form.title || !form.subject_id || !form.max_score || !termId) return;
    setSaving(true); setError('');
    try {
      const sub = subjects.find(s => s.id === form.subject_id);
      const { data } = await api.post<Assessment>('/api/primary/assessments', {
        term_id: termId, subject_id: form.subject_id,
        class_name: sub?.class_name ?? '',
        title: form.title, type: form.type, max_score: parseFloat(form.max_score),
      });
      setAssessments(prev => [data, ...prev]);
      setModal(false);
      setForm({ title: '', type: 'formative', subject_id: '', max_score: '' });
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create');
    } finally { setSaving(false); }
  }

  async function saveEdit(id: string) {
    setSaving(true); setError('');
    try {
      await api.put(`/api/primary/assessments/${id}`, {
        title: editForm.title || undefined,
        max_score: editForm.max_score ? parseFloat(editForm.max_score) : undefined,
      });
      setAssessments(prev => prev.map(a => a.id === id
        ? { ...a, title: editForm.title || a.title, max_score: editForm.max_score ? parseFloat(editForm.max_score) : a.max_score }
        : a));
      setEditId(null);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update');
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this assessment and all its scores?')) return;
    await api.delete(`/api/primary/assessments/${id}`);
    setAssessments(prev => prev.filter(a => a.id !== id));
  }

  const grouped = assessments.reduce<Record<string, Assessment[]>>((acc, a) => {
    (acc[a.subject_name] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Assessments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create formative exercises and summative exams, then enter scores</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={termId} onChange={e => setTermId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Select term…</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {termId && (
            <button onClick={() => setModal(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: '#15803D' }}>
              + New Assessment
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : !termId ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-slate-400 text-sm">Select a term to view assessments.</div>
      ) : assessments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center">
          <p className="text-slate-400 text-sm mb-3">No assessments yet for this term.</p>
          <button onClick={() => setModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#15803D' }}>
            Create your first assessment
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([subj, items]) => (
            <div key={subj} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-sm font-bold text-slate-700">{subj}</p>
                <p className="text-xs text-slate-400">{items[0].class_name}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map(a => (
                  <div key={a.id} className="px-5 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      {editId === a.id ? (
                        <div className="flex items-center gap-2">
                          <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                            placeholder={a.title}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm flex-1" />
                          <input value={editForm.max_score} onChange={e => setEditForm(f => ({ ...f, max_score: e.target.value }))}
                            placeholder={String(a.max_score)} type="number" min={0}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-20" />
                          <button onClick={() => saveEdit(a.id)} disabled={saving}
                            className="text-xs font-semibold text-green-600 hover:text-green-800">Save</button>
                          <button onClick={() => setEditId(null)}
                            className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-slate-800 truncate">{a.title}</p>
                          <p className="text-xs text-slate-400">Max {a.max_score} pts · {a.score_count} score{a.score_count !== 1 ? 's' : ''} entered</p>
                        </>
                      )}
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      a.type === 'summative' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>{a.type}</span>
                    {editId !== a.id && (
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button onClick={() => router.push(`/primary/teacher/assessments/${a.id}`)}
                          className="text-xs font-semibold hover:underline" style={{ color: '#15803D' }}>
                          Enter Scores
                        </button>
                        <button onClick={() => { setEditId(a.id); setEditForm({ title: a.title, max_score: String(a.max_score) }); }}
                          className="text-xs text-slate-400 hover:text-slate-600">Edit</button>
                        <button onClick={() => remove(a.id)}
                          className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New assessment modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">New Assessment</h2>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {TYPES.map(t => (
                <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))}
                  className={`rounded-xl border-2 p-3 text-left transition-colors ${form.type === t.value ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                  <p className="text-sm font-bold text-slate-800">{t.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
                <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select subject…</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name} ({s.class_name})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Title / Name</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Week 3 Quiz, Mid-term Exam"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Max Score</label>
                <input value={form.max_score} onChange={e => setForm(f => ({ ...f, max_score: e.target.value }))}
                  type="number" min={0} placeholder="e.g. 20"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                {form.subject_id && (() => {
                  const sub = subjects.find(s => s.id === form.subject_id);
                  if (!sub) return null;
                  return (
                    <p className="text-xs text-slate-400 mt-1">
                      {form.type === 'formative'
                        ? `Scores will be scaled to ${sub.max_class_score} class marks`
                        : `Scores will be scaled to ${sub.max_exam_score} exam marks`}
                    </p>
                  );
                })()}
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-slate-600">Cancel</button>
              <button onClick={create} disabled={saving || !form.title || !form.subject_id || !form.max_score}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#15803D' }}>
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
