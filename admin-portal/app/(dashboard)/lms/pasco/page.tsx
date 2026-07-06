'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy:   'bg-green-100 text-green-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Hard:   'bg-red-100 text-red-700',
};

interface Option {
  text: string;
  is_correct: boolean;
}

interface PascoQuestion {
  id: string;
  subject: string;
  year: number | null;
  source: string | null;
  topic: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard' | null;
  question_text: string;
  options: Option[];
  explanation: string | null;
}

const emptyForm = {
  subject: '',
  year: new Date().getFullYear(),
  source: '',
  topic: '',
  difficulty: 'Medium' as 'Easy' | 'Medium' | 'Hard',
  question_text: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correct: 'A' as 'A' | 'B' | 'C' | 'D',
  explanation: '',
};

type FormState = typeof emptyForm;

function buildOptions(form: FormState): Option[] {
  return [
    { text: form.optionA, is_correct: form.correct === 'A' },
    { text: form.optionB, is_correct: form.correct === 'B' },
    { text: form.optionC, is_correct: form.correct === 'C' },
    { text: form.optionD, is_correct: form.correct === 'D' },
  ];
}

function formFromQuestion(q: PascoQuestion): FormState {
  const [a, b, c, d] = q.options ?? [{text:'',is_correct:false},{text:'',is_correct:false},{text:'',is_correct:false},{text:'',is_correct:false}];
  const correctIdx = q.options?.findIndex(o => o.is_correct) ?? 0;
  const correctLetter = (['A','B','C','D'][correctIdx] ?? 'A') as 'A'|'B'|'C'|'D';
  return {
    subject: q.subject,
    year: q.year ?? new Date().getFullYear(),
    source: q.source ?? '',
    topic: q.topic ?? '',
    difficulty: q.difficulty ?? 'Medium',
    question_text: q.question_text,
    optionA: a?.text ?? '',
    optionB: b?.text ?? '',
    optionC: c?.text ?? '',
    optionD: d?.text ?? '',
    correct: correctLetter,
    explanation: q.explanation ?? '',
  };
}

export default function PascoPage() {
  const [questions, setQuestions] = useState<PascoQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminSubjects, setAdminSubjects] = useState<string[]>([]);

  const [filterSubject, setFilterSubject] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.get<PascoQuestion[]>('/api/lms/pasco?limit=100')
      .then(r => setQuestions(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    api.get<{ id: string; name: string }[]>('/api/subjects')
      .then(r => setAdminSubjects((r.data ?? []).map(s => s.name)))
      .catch(() => {});
  }, []);

  const allSubjects = Array.from(new Set([
    ...adminSubjects,
    ...questions.map(q => q.subject).filter(Boolean),
  ])).sort();

  const allYears = Array.from(new Set(questions.map(q => q.year).filter(Boolean))).sort((a, b) => (b as number) - (a as number));

  const filtered = questions.filter(q => {
    if (filterSubject && q.subject !== filterSubject) return false;
    if (filterDifficulty && q.difficulty !== filterDifficulty) return false;
    if (filterYear && String(q.year) !== filterYear) return false;
    if (search && !q.question_text.toLowerCase().includes(search.toLowerCase()) && !q.topic?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function openAdd() {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(q: PascoQuestion) {
    setEditId(q.id);
    setForm(formFromQuestion(q));
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      subject: form.subject,
      year: form.year,
      source: form.source,
      topic: form.topic,
      difficulty: form.difficulty,
      question_text: form.question_text,
      options: buildOptions(form),
      explanation: form.explanation,
    };
    try {
      if (editId) {
        await api.put(`/api/lms/pasco/${editId}`, payload);
      } else {
        await api.post('/api/lms/pasco', payload);
      }
      load();
      setShowModal(false);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/lms/pasco/${id}`);
      setQuestions(prev => prev.filter(q => q.id !== id));
    } catch {
      // silently fail
    } finally {
      setConfirmDelete(null);
    }
  }

  const F = form;
  const setF = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pasco Bank</h1>
          <p className="text-sm text-slate-500 mt-0.5">Ghana SHS past questions organised by subject, year, and topic</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: '#15803D' }}
        >
          + Add Question
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <select
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="">All Subjects</option>
            {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterDifficulty}
            onChange={e => setFilterDifficulty(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="">All Years</option>
            {allYears.map(y => <option key={String(y)} value={String(y)}>{y}</option>)}
          </select>
          <input
            type="text"
            placeholder="Search question or topic…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 min-w-[200px]"
          />
        </div>

        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Subject', 'Year', 'Source', 'Topic', 'Difficulty', 'Question', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">No questions found.</td>
                  </tr>
                ) : filtered.map(q => (
                  <tr key={q.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 whitespace-nowrap">{q.subject}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{q.year ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{q.source ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{q.topic ?? '—'}</td>
                    <td className="px-4 py-3">
                      {q.difficulty ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${DIFFICULTY_COLORS[q.difficulty] ?? 'bg-slate-100 text-slate-600'}`}>
                          {q.difficulty}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">
                      <span title={q.question_text}>
                        {q.question_text.length > 80 ? q.question_text.slice(0, 80) + '…' : q.question_text}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => openEdit(q)} className="text-xs font-medium text-green-700 hover:text-green-900">
                          Edit
                        </button>
                        <button onClick={() => setConfirmDelete(q.id)} className="text-xs font-medium text-red-600 hover:text-red-800">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-2">Delete Question?</h2>
            <p className="text-sm text-slate-500 mb-5">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-900">{editId ? 'Edit Question' : 'Add Question'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
                  <select
                    required
                    value={F.subject}
                    onChange={e => setF({ subject: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="">Select subject…</option>
                    {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
                  <input
                    required
                    type="number"
                    min={2000}
                    max={2026}
                    value={F.year}
                    onChange={e => setF({ year: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Difficulty</label>
                  <select
                    required
                    value={F.difficulty}
                    onChange={e => setF({ difficulty: e.target.value as FormState['difficulty'] })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Source</label>
                  <input
                    type="text"
                    value={F.source}
                    onChange={e => setF({ source: e.target.value })}
                    placeholder="e.g. WAEC 2022"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Topic</label>
                  <input
                    type="text"
                    value={F.topic}
                    onChange={e => setF({ topic: e.target.value })}
                    placeholder="e.g. Algebra"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Question Text</label>
                <textarea
                  required
                  rows={3}
                  value={F.question_text}
                  onChange={e => setF({ question_text: e.target.value })}
                  placeholder="Enter the question…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">Options</label>
                {(['A', 'B', 'C', 'D'] as const).map(letter => (
                  <div key={letter} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct"
                      value={letter}
                      checked={F.correct === letter}
                      onChange={() => setF({ correct: letter })}
                      className="accent-green-700 flex-shrink-0"
                    />
                    <span className="text-xs font-semibold text-slate-500 w-4">{letter}</span>
                    <input
                      required
                      type="text"
                      value={F[`option${letter}` as keyof FormState] as string}
                      onChange={e => setF({ [`option${letter}`]: e.target.value } as Partial<FormState>)}
                      placeholder={`Option ${letter}`}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                    />
                  </div>
                ))}
                <p className="text-xs text-slate-400">Select the radio button next to the correct answer.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Explanation</label>
                <textarea
                  rows={2}
                  value={F.explanation}
                  onChange={e => setF({ explanation: e.target.value })}
                  placeholder="Optional explanation of the correct answer…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 border border-slate-200">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: '#15803D' }}
                >
                  {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
