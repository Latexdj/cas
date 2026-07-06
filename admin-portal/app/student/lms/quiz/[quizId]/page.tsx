'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface QuizInfo {
  id: string;
  title: string;
  instructions?: string;
  question_count: number;
  time_limit_mins?: number;
  total_marks: number;
  show_answers_after?: boolean;
}

interface Question {
  id: string;
  question_text: string;
  question_type: 'mcq' | 'short';
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  marks: number;
}

interface AttemptResponse {
  attempt: { id: string };
  questions: Question[];
  quiz: QuizInfo;
}

interface Answer {
  question_id: string;
  selected_option?: string;
  answer_text?: string;
}

interface ResultQuestion {
  id: string;
  question_text: string;
  your_answer?: string;
  correct_answer?: string;
  explanation?: string;
  marks_awarded: number;
  marks: number;
}

interface QuizResult {
  score: number;
  total_marks: number;
  percentage: number;
  show_answers_after?: boolean;
  questions: ResultQuestion[];
}

type Phase = 'start' | 'quiz' | 'review' | 'results';

function gradeBadge(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 80) return { label: 'Excellent', color: '#15803D', bg: '#DCFCE7' };
  if (pct >= 60) return { label: 'Good', color: '#1D4ED8', bg: '#DBEAFE' };
  if (pct >= 40) return { label: 'Pass', color: '#D97706', bg: '#FEF3C7' };
  return { label: 'Fail', color: '#DC2626', bg: '#FEE2E2' };
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const OPTIONS = ['a', 'b', 'c', 'd'] as const;
const OPTION_LABELS: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' };

export default function QuizRoomPage() {
  const params = useParams<{ quizId: string }>();
  const quizId = params.quizId;
  const router = useRouter();
  const [primary, setPrimary] = useState('#3B82F6');

  const [phase, setPhase] = useState<Phase>('start');
  const [previewQuiz, setPreviewQuiz] = useState<QuizInfo | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  const [attemptId, setAttemptId] = useState('');
  const [quiz, setQuiz] = useState<QuizInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    const colors = getStudentColors();
    setPrimary(colors.primary);
  }, []);

  useEffect(() => {
    studentApi.get<QuizInfo>(`/api/lms/quizzes/${quizId}`)
      .then(r => setPreviewQuiz(r.data))
      .catch(() => {})
      .finally(() => setPreviewLoading(false));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [quizId]);

  function startTimer(mins: number) {
    setTimeLeft(mins * 60);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleStart() {
    setStartError('');
    setStarting(true);
    try {
      const r = await studentApi.post<AttemptResponse>(`/api/lms/quizzes/${quizId}/attempt`);
      const { attempt, questions: qs, quiz: q } = r.data;
      setAttemptId(attempt.id);
      setQuiz(q);
      setQuestions(qs);
      setAnswers({});
      setCurrentIndex(0);
      setPhase('quiz');
      if (q.time_limit_mins) startTimer(q.time_limit_mins);
    } catch {
      setStartError('Failed to start quiz. Please try again.');
    } finally {
      setStarting(false);
    }
  }

  function setAnswer(questionId: string, patch: Partial<Answer>) {
    setAnswers(prev => ({
      ...prev,
      [questionId]: { ...prev[questionId], question_id: questionId, ...patch },
    }));
  }

  async function handleSubmit(auto = false) {
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitError('');
    setSubmitting(true);
    try {
      const answerList = questions.map(q => ({
        question_id: q.id,
        selected_option: answers[q.id]?.selected_option,
        answer_text: answers[q.id]?.answer_text,
      }));
      const r = await studentApi.post<QuizResult>(`/api/lms/attempts/${attemptId}/submit`, { answers: answerList });
      setResult(r.data);
      setPhase('results');
    } catch {
      setSubmitError('Submission failed. Please try again.');
      setSubmitting(false);
    }
  }

  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter(q => {
    const a = answers[q.id];
    return a && (a.selected_option || (a.answer_text && a.answer_text.trim()));
  }).length;

  if (phase === 'start') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {previewLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: primary, borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <>
              <div className="mb-6 text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: `${primary}18` }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7" style={{ color: primary }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-slate-800 mb-1">{previewQuiz?.title ?? 'Quiz'}</h1>
                <p className="text-sm text-slate-400">Ready to begin?</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-slate-800">{previewQuiz?.question_count ?? '—'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Questions</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-slate-800">
                    {previewQuiz?.time_limit_mins ? `${previewQuiz.time_limit_mins}m` : '∞'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Time Limit</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center col-span-2">
                  <p className="text-2xl font-black text-slate-800">{previewQuiz?.total_marks ?? '—'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Total Marks</p>
                </div>
              </div>

              {previewQuiz?.instructions && (
                <div className="mb-6 p-3 bg-amber-50 rounded-lg border border-amber-100 text-sm text-amber-800">
                  {previewQuiz.instructions}
                </div>
              )}

              {startError && <p className="text-sm text-red-500 text-center mb-4">{startError}</p>}

              <button
                onClick={handleStart}
                disabled={starting}
                className="w-full py-3 rounded-xl font-bold text-white text-base disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: primary }}
              >
                {starting ? 'Starting…' : 'Start Quiz'}
              </button>
              <button
                onClick={() => router.back()}
                className="w-full mt-3 py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                Go back
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'review') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Review Answers</h2>
          <p className="text-sm text-slate-400 mb-5">
            {answeredCount} of {questions.length} questions answered. Unanswered questions will be scored zero.
          </p>
          <div className="space-y-2 mb-6 max-h-72 overflow-y-auto">
            {questions.map((q, i) => {
              const a = answers[q.id];
              const answered = a && (a.selected_option || (a.answer_text && a.answer_text.trim()));
              return (
                <div key={q.id}
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors"
                  style={{ borderColor: answered ? '#BBF7D0' : '#FED7AA', background: answered ? '#F0FDF4' : '#FFF7ED' }}
                  onClick={() => { setCurrentIndex(i); setPhase('quiz'); }}
                >
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: answered ? '#16A34A' : '#D97706', color: '#fff' }}>
                    {i + 1}
                  </span>
                  <p className="text-xs text-slate-700 flex-1 line-clamp-1">{q.question_text}</p>
                  <span className="text-[10px] font-semibold shrink-0" style={{ color: answered ? '#16A34A' : '#D97706' }}>
                    {answered ? 'Answered' : 'Skipped'}
                  </span>
                </div>
              );
            })}
          </div>
          {submitError && <p className="text-sm text-red-500 mb-3">{submitError}</p>}
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="w-full py-3 rounded-xl font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: primary }}
          >
            {submitting ? 'Submitting…' : 'Submit Quiz'}
          </button>
          <button
            onClick={() => setPhase('quiz')}
            className="w-full mt-3 py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Back to questions
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'results' && result) {
    const grade = gradeBadge(result.percentage ?? Math.round((result.score / result.total_marks) * 100));
    const pct = result.percentage ?? Math.round((result.score / result.total_marks) * 100);
    const showAnswers = result.show_answers_after ?? quiz?.show_answers_after ?? false;

    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quiz Complete</p>
          <div className="text-5xl font-black mb-2" style={{ color: primary }}>
            {result.score}<span className="text-2xl text-slate-400">/{result.total_marks}</span>
          </div>
          <p className="text-slate-500 text-sm mb-4">{pct}% score</p>
          <span className="inline-block text-sm font-bold px-4 py-1.5 rounded-full"
            style={{ color: grade.color, background: grade.bg }}>
            {grade.label}
          </span>
        </div>

        {result.questions && result.questions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700">Question Breakdown</h2>
            {result.questions.map((rq, i) => {
              const correct = rq.marks_awarded > 0;
              return (
                <div key={rq.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-start gap-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {correct ? '✓' : '✗'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 mb-2">Q{i + 1}. {rq.question_text}</p>
                      <div className="space-y-1 text-xs">
                        {rq.your_answer && (
                          <p className={correct ? 'text-green-700' : 'text-red-600'}>
                            Your answer: <span className="font-semibold">{rq.your_answer.toUpperCase()}</span>
                          </p>
                        )}
                        {!rq.your_answer && <p className="text-slate-400">Not answered</p>}
                        {showAnswers && rq.correct_answer && (
                          <p className="text-green-700">
                            Correct: <span className="font-semibold">{rq.correct_answer.toUpperCase()}</span>
                          </p>
                        )}
                        {showAnswers && rq.explanation && (
                          <p className="text-slate-500 mt-1 leading-relaxed">{rq.explanation}</p>
                        )}
                      </div>
                      <p className="text-xs font-semibold mt-2" style={{ color: primary }}>
                        {rq.marks_awarded}/{rq.marks} marks
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={() => router.back()}
          className="w-full py-3 rounded-xl font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: primary }}
        >
          Back to Course
        </button>
      </div>
    );
  }

  if (phase === 'quiz' && currentQuestion) {
    const currentAnswer = answers[currentQuestion.id];
    const isLast = currentIndex === questions.length - 1;

    return (
      <div className="min-h-screen flex flex-col">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-1 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%`, background: primary }}
          />
        </div>

        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-4 md:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Question {currentIndex + 1} of {questions.length}</p>
              <p className="text-sm font-bold text-slate-700 mt-0.5">{quiz?.title}</p>
            </div>
            <div className="flex items-center gap-3">
              {timeLeft !== null && (
                <div className={`text-sm font-bold px-3 py-1.5 rounded-lg ${timeLeft < 60 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-700'}`}>
                  {formatTime(timeLeft)}
                </div>
              )}
            </div>
          </div>

          {/* Question */}
          <div className="flex-1">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
              <div className="flex items-start gap-3 mb-4">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
                  style={{ background: primary }}>
                  {currentIndex + 1}
                </span>
                <p className="text-base font-semibold text-slate-800 leading-relaxed">{currentQuestion.question_text}</p>
              </div>
              <p className="text-xs text-slate-400 ml-10">{currentQuestion.marks} mark{currentQuestion.marks !== 1 ? 's' : ''}</p>
            </div>

            {currentQuestion.question_type === 'mcq' && (
              <div className="space-y-2">
                {OPTIONS.map(opt => {
                  const optKey = `option_${opt}` as keyof Question;
                  const optText = currentQuestion[optKey] as string | undefined;
                  if (!optText) return null;
                  const selected = currentAnswer?.selected_option === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setAnswer(currentQuestion.id, { selected_option: opt })}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors"
                      style={selected
                        ? { borderColor: primary, background: `${primary}10` }
                        : { borderColor: '#E2E8F0', background: '#fff' }}
                    >
                      <span className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 transition-colors"
                        style={selected
                          ? { borderColor: primary, background: primary, color: '#fff' }
                          : { borderColor: '#CBD5E1', color: '#64748B' }}>
                        {OPTION_LABELS[opt]}
                      </span>
                      <span className="text-sm text-slate-700">{optText}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {currentQuestion.question_type === 'short' && (
              <textarea
                value={currentAnswer?.answer_text ?? ''}
                onChange={e => setAnswer(currentQuestion.id, { answer_text: e.target.value })}
                placeholder="Write your answer here…"
                rows={5}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none resize-none"
                style={{ borderColor: currentAnswer?.answer_text ? primary : '#E2E8F0' }}
              />
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              Previous
            </button>
            {isLast ? (
              <button
                onClick={() => setPhase('review')}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: primary }}
              >
                Review & Submit
              </button>
            ) : (
              <button
                onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: primary }}
              >
                Next
              </button>
            )}
          </div>

          {/* Question dots */}
          <div className="flex flex-wrap gap-1.5 justify-center mt-4">
            {questions.map((q, i) => {
              const a = answers[q.id];
              const answered = a && (a.selected_option || (a.answer_text && a.answer_text.trim()));
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(i)}
                  className="w-6 h-6 rounded-full text-[10px] font-bold transition-colors"
                  style={i === currentIndex
                    ? { background: primary, color: '#fff' }
                    : answered
                    ? { background: '#BBF7D0', color: '#15803D' }
                    : { background: '#E2E8F0', color: '#94A3B8' }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: primary, borderTopColor: 'transparent' }} />
    </div>
  );
}
