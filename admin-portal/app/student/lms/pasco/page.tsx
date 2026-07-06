'use client';

import { useEffect, useState } from 'react';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface PascoQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation?: string;
  difficulty?: string;
  year?: number;
  subject_name?: string;
}

type Phase = 'setup' | 'practice' | 'done';

const GHANA_SUBJECTS = [
  'English Language',
  'Core Mathematics',
  'Integrated Science',
  'Social Studies',
  'Physics',
  'Chemistry',
  'Biology',
  'Elective Mathematics',
  'Economics',
  'Geography',
  'Government',
  'Literature-in-English',
  'Financial Accounting',
  'Business Management',
  'History',
  'Christian Religious Studies',
  'French',
];

const DIFFICULTIES = ['All', 'Easy', 'Medium', 'Hard'];

const OPTIONS = ['a', 'b', 'c', 'd'] as const;
const OPTION_LABELS: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' };

export default function PascoPage() {
  const [primary, setPrimary] = useState('#3B82F6');
  const [phase, setPhase] = useState<Phase>('setup');

  const [subject, setSubject] = useState(GHANA_SUBJECTS[0]);
  const [difficulty, setDifficulty] = useState('All');
  const [year, setYear] = useState('');

  const [questions, setQuestions] = useState<PascoQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    const colors = getStudentColors();
    setPrimary(colors.primary);
  }, []);

  async function handleStart() {
    setFetchError('');
    setLoading(true);
    try {
      const params = new URLSearchParams({
        subject_name: subject,
        limit: '20',
        randomise: 'true',
      });
      if (difficulty !== 'All') params.set('difficulty', difficulty.toLowerCase());
      if (year) params.set('year', year);
      const r = await studentApi.get<PascoQuestion[]>(`/api/lms/pasco?${params}`);
      if (!r.data || r.data.length === 0) {
        setFetchError('No questions found for your selection. Try different filters.');
        return;
      }
      setQuestions(r.data);
      setCurrentIndex(0);
      setSelected(null);
      setRevealed(false);
      setCorrectCount(0);
      setPhase('practice');
    } catch {
      setFetchError('Failed to load questions. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(opt: string) {
    if (revealed) return;
    setSelected(opt);
    setRevealed(true);
    if (opt === questions[currentIndex].correct_option) {
      setCorrectCount(c => c + 1);
    }
  }

  function handleNext() {
    if (currentIndex + 1 >= questions.length) {
      setPhase('done');
      return;
    }
    setCurrentIndex(i => i + 1);
    setSelected(null);
    setRevealed(false);
  }

  function handleRestart() {
    setPhase('setup');
    setQuestions([]);
    setCurrentIndex(0);
    setSelected(null);
    setRevealed(false);
    setCorrectCount(0);
  }

  const currentQ = questions[currentIndex];
  const pct = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

  if (phase === 'setup') {
    return (
      <div className="p-4 md:p-6 max-w-xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">Pasco Practice</h1>
          <p className="text-sm text-slate-400 mt-1">Ghana WAEC past questions drill</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Subject</label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none"
            >
              {GHANA_SUBJECTS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Difficulty</label>
            <div className="flex gap-2 flex-wrap">
              {DIFFICULTIES.map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-colors"
                  style={difficulty === d
                    ? { borderColor: primary, background: `${primary}10`, color: primary }
                    : { borderColor: '#E2E8F0', color: '#64748B' }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Year (optional)</label>
            <input
              type="number"
              value={year}
              onChange={e => setYear(e.target.value)}
              placeholder="e.g. 2019"
              min={1990}
              max={2024}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none"
            />
          </div>

          {fetchError && <p className="text-sm text-red-500">{fetchError}</p>}

          <button
            onClick={handleStart}
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: primary }}
          >
            {loading ? 'Loading…' : 'Start Practice'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const grade =
      pct >= 80 ? { label: 'Excellent', color: '#15803D', bg: '#DCFCE7' } :
      pct >= 60 ? { label: 'Good', color: '#1D4ED8', bg: '#DBEAFE' } :
      pct >= 40 ? { label: 'Pass', color: '#D97706', bg: '#FEF3C7' } :
                  { label: 'Needs Work', color: '#DC2626', bg: '#FEE2E2' };
    return (
      <div className="p-4 md:p-6 max-w-md mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Session Complete</p>
          <div className="text-5xl font-black mb-2" style={{ color: primary }}>
            {correctCount}<span className="text-2xl text-slate-400">/{questions.length}</span>
          </div>
          <p className="text-slate-500 text-sm mb-4">{pct}% correct</p>
          <span className="inline-block text-sm font-bold px-4 py-1.5 rounded-full mb-6"
            style={{ color: grade.color, background: grade.bg }}>
            {grade.label}
          </span>
          <div className="space-y-3">
            <button
              onClick={handleStart}
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: primary }}
            >
              {loading ? 'Loading…' : 'Try Again'}
            </button>
            <button
              onClick={handleRestart}
              className="w-full py-3 rounded-xl font-semibold text-slate-600 border-2 border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Change Subject
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQ) return null;

  const optTexts: Record<string, string> = {
    a: currentQ.option_a,
    b: currentQ.option_b,
    c: currentQ.option_c,
    d: currentQ.option_d,
  };

  function optStyle(opt: string): React.CSSProperties {
    if (!revealed) {
      return selected === opt
        ? { borderColor: primary, background: `${primary}10` }
        : { borderColor: '#E2E8F0', background: '#fff' };
    }
    if (opt === currentQ.correct_option) {
      return { borderColor: '#16A34A', background: '#F0FDF4' };
    }
    if (opt === selected && opt !== currentQ.correct_option) {
      return { borderColor: '#DC2626', background: '#FEF2F2' };
    }
    return { borderColor: '#E2E8F0', background: '#fff', opacity: 0.5 };
  }

  function optLabelStyle(opt: string): React.CSSProperties {
    if (!revealed) {
      return selected === opt
        ? { borderColor: primary, background: primary, color: '#fff' }
        : { borderColor: '#CBD5E1', color: '#64748B' };
    }
    if (opt === currentQ.correct_option) return { borderColor: '#16A34A', background: '#16A34A', color: '#fff' };
    if (opt === selected) return { borderColor: '#DC2626', background: '#DC2626', color: '#fff' };
    return { borderColor: '#CBD5E1', color: '#94A3B8' };
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400">{subject}</p>
          <p className="text-sm font-bold text-slate-700">Question {currentIndex + 1} of {questions.length}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Score</p>
          <p className="text-base font-black" style={{ color: primary }}>{correctCount}/{currentIndex + (revealed ? 1 : 0)}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%`, background: primary }}
        />
      </div>

      {/* Question card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {currentQ.year && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-500">{currentQ.year}</span>
          )}
          {currentQ.difficulty && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded"
              style={{
                color: currentQ.difficulty === 'easy' ? '#16A34A' : currentQ.difficulty === 'hard' ? '#DC2626' : '#D97706',
                background: currentQ.difficulty === 'easy' ? '#F0FDF4' : currentQ.difficulty === 'hard' ? '#FEF2F2' : '#FFF7ED',
              }}>
              {currentQ.difficulty.charAt(0).toUpperCase() + currentQ.difficulty.slice(1)}
            </span>
          )}
        </div>
        <p className="text-base font-semibold text-slate-800 leading-relaxed">{currentQ.question_text}</p>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {OPTIONS.map(opt => (
          <button
            key={opt}
            onClick={() => handleSelect(opt)}
            disabled={revealed}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors disabled:cursor-default"
            style={optStyle(opt)}
          >
            <span className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 transition-colors"
              style={optLabelStyle(opt)}>
              {OPTION_LABELS[opt]}
            </span>
            <span className="text-sm text-slate-700">{optTexts[opt]}</span>
            {revealed && opt === currentQ.correct_option && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 text-green-600 ml-auto shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            {revealed && opt === selected && opt !== currentQ.correct_option && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 text-red-600 ml-auto shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {revealed && (
        <div className={`rounded-xl p-4 border ${selected === currentQ.correct_option ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-sm font-bold mb-1 ${selected === currentQ.correct_option ? 'text-green-700' : 'text-red-700'}`}>
            {selected === currentQ.correct_option ? 'Correct!' : `Incorrect. The correct answer is ${OPTION_LABELS[currentQ.correct_option]}.`}
          </p>
          {currentQ.explanation && (
            <p className="text-sm text-slate-600 leading-relaxed">{currentQ.explanation}</p>
          )}
        </div>
      )}

      {/* Next button */}
      {revealed && (
        <button
          onClick={handleNext}
          className="w-full py-3 rounded-xl font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: primary }}
        >
          {currentIndex + 1 >= questions.length ? 'See Results' : 'Next Question'}
        </button>
      )}
    </div>
  );
}
