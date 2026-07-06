'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface CourseInfo { id: string; subject_name: string; teacher_name: string; }

interface Lesson {
  id: string;
  title: string;
  content_type: 'text' | 'youtube' | 'link' | 'file';
  body_text?: string;
  video_url?: string;
  link_url?: string;
  file_url?: string;
}

interface AssignmentSubmission {
  id: string;
  status: 'submitted' | 'graded';
  body_text?: string;
  file_url?: string;
  submitted_at: string;
  score?: number;
  feedback?: string;
}

interface Assignment {
  id: string;
  title: string;
  due_date: string;
  max_score: number;
  description?: string;
  submission?: AssignmentSubmission;
}

interface Quiz {
  id: string;
  title: string;
  question_count: number;
  total_marks: number;
  time_limit_mins?: number;
  attempt_count: number;
  best_score?: number;
  max_attempts?: number;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
  is_pinned: boolean;
}

type Tab = 'lessons' | 'assignments' | 'quizzes' | 'announcements';

function extractYouTubeId(url: string): string {
  const patterns = [
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtu\.be\/([^?\s]+)/,
    /youtube\.com\/embed\/([^?\s]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return '';
}

function ContentIcon({ type }: { type: string }) {
  if (type === 'youtube') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-500 shrink-0">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    );
  }
  if (type === 'link') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-blue-500 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    );
  }
  if (type === 'file') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-amber-500 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-400 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function LessonDetail({ lesson }: { lesson: Lesson }) {
  if (lesson.content_type === 'text') {
    return (
      <div className="mt-3 p-4 bg-slate-50 rounded-lg text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
        {lesson.body_text || 'No content.'}
      </div>
    );
  }
  if (lesson.content_type === 'youtube' && lesson.video_url) {
    const vid = extractYouTubeId(lesson.video_url);
    return vid ? (
      <div className="mt-3 rounded-lg overflow-hidden">
        <iframe
          src={`https://www.youtube.com/embed/${vid}`}
          width="100%"
          height="315"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="block"
          style={{ border: 'none' }}
        />
      </div>
    ) : (
      <p className="mt-3 text-sm text-red-500">Invalid YouTube URL.</p>
    );
  }
  if (lesson.content_type === 'link' && lesson.link_url) {
    return (
      <div className="mt-3">
        <a
          href={lesson.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open Link
        </a>
      </div>
    );
  }
  if (lesson.content_type === 'file' && lesson.file_url) {
    return (
      <div className="mt-3">
        <a
          href={lesson.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download / View File
        </a>
      </div>
    );
  }
  return null;
}

function AssignmentCard({
  assignment,
  primary,
  courseId,
  onRefresh,
}: {
  assignment: Assignment;
  primary: string;
  courseId: string;
  onRefresh: () => void;
}) {
  const sub = assignment.submission;
  const [expanded, setExpanded] = useState(!sub);
  const [bodyText, setBodyText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOverdue = !sub && new Date(assignment.due_date) < new Date();

  async function handleSubmit() {
    setError('');
    setSubmitting(true);
    try {
      let file_base64: string | undefined;
      let file_name: string | undefined;
      if (file) {
        file_base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        file_name = file.name;
      }
      await studentApi.post(`/api/lms/assignments/${assignment.id}/submit`, {
        body_text: bodyText,
        ...(file_base64 ? { file_base64, file_name } : {}),
      });
      setBodyText('');
      setFile(null);
      setExpanded(false);
      onRefresh();
    } catch {
      setError('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-800 truncate">{assignment.title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Due {new Date(assignment.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {isOverdue && <span className="ml-1 text-red-500 font-semibold">· Overdue</span>}
              {' · '}Max: {assignment.max_score}
            </p>
          </div>
          <div className="shrink-0">
            {!sub && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Not Submitted</span>
            )}
            {sub?.status === 'submitted' && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Submitted</span>
            )}
            {sub?.status === 'graded' && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Graded: {sub.score}/{assignment.max_score}
              </span>
            )}
          </div>
        </div>

        {sub?.status === 'graded' && (
          <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs font-bold text-green-700 mb-1">Score: {sub.score} / {assignment.max_score}</p>
            {sub.feedback && <p className="text-sm text-slate-600 mt-1">{sub.feedback}</p>}
          </div>
        )}

        {sub?.status === 'submitted' && (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Submitted {new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            <button onClick={() => setExpanded(e => !e)} className="text-xs font-semibold shrink-0" style={{ color: primary }}>
              {expanded ? 'Cancel' : 'Resubmit'}
            </button>
          </div>
        )}
      </div>

      {(!sub || expanded) && sub?.status !== 'graded' && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          <textarea
            value={bodyText}
            onChange={e => setBodyText(e.target.value)}
            placeholder="Write your answer here..."
            rows={4}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none resize-none"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {file ? file.name : 'Attach file'}
            </button>
            {file && (
              <button onClick={() => setFile(null)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
            )}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={submitting || (!bodyText.trim() && !file)}
            className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: primary }}
          >
            {submitting ? 'Submitting…' : 'Submit Assignment'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CourseViewPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const router = useRouter();
  const [primary, setPrimary] = useState('#3B82F6');
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('lessons');

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizzesLoaded, setQuizzesLoaded] = useState(false);
  const [quizzesLoading, setQuizzesLoading] = useState(false);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoaded, setAnnouncementsLoaded] = useState(false);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);

  useEffect(() => {
    const colors = getStudentColors();
    setPrimary(colors.primary);
  }, []);

  useEffect(() => {
    studentApi.get<CourseInfo>(`/api/lms/courses/${courseId}`)
      .then(r => setCourse(r.data))
      .catch(() => {})
      .finally(() => setCourseLoading(false));
  }, [courseId]);

  useEffect(() => {
    if (tab === 'lessons' && !lessonsLoaded) {
      setLessonsLoading(true);
      studentApi.get<Lesson[]>(`/api/lms/courses/${courseId}/lessons`)
        .then(r => setLessons(r.data))
        .catch(() => setLessons([]))
        .finally(() => { setLessonsLoading(false); setLessonsLoaded(true); });
    }
    if (tab === 'assignments' && !assignmentsLoaded) {
      setAssignmentsLoading(true);
      studentApi.get<Assignment[]>(`/api/lms/courses/${courseId}/assignments`)
        .then(r => setAssignments(r.data))
        .catch(() => setAssignments([]))
        .finally(() => { setAssignmentsLoading(false); setAssignmentsLoaded(true); });
    }
    if (tab === 'quizzes' && !quizzesLoaded) {
      setQuizzesLoading(true);
      studentApi.get<Quiz[]>(`/api/lms/courses/${courseId}/quizzes`)
        .then(r => setQuizzes(r.data))
        .catch(() => setQuizzes([]))
        .finally(() => { setQuizzesLoading(false); setQuizzesLoaded(true); });
    }
    if (tab === 'announcements' && !announcementsLoaded) {
      setAnnouncementsLoading(true);
      studentApi.get<Announcement[]>(`/api/lms/courses/${courseId}/announcements`)
        .then(r => setAnnouncements(r.data))
        .catch(() => setAnnouncements([]))
        .finally(() => { setAnnouncementsLoading(false); setAnnouncementsLoaded(true); });
    }
  }, [tab, courseId, lessonsLoaded, assignmentsLoaded, quizzesLoaded, announcementsLoaded]);

  function refreshAssignments() {
    setAssignmentsLoading(true);
    studentApi.get<Assignment[]>(`/api/lms/courses/${courseId}/assignments`)
      .then(r => setAssignments(r.data))
      .catch(() => {})
      .finally(() => setAssignmentsLoading(false));
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'lessons', label: 'Lessons' },
    { key: 'assignments', label: 'Assignments' },
    { key: 'quizzes', label: 'Quizzes' },
    { key: 'announcements', label: 'Announcements' },
  ];

  function Spinner() {
    return (
      <div className="flex justify-center py-12">
        <div
          className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: primary, borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/student/lms')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        {courseLoading ? (
          <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
        ) : (
          <div>
            <h1 className="text-lg font-bold text-slate-800">{course?.subject_name ?? 'Course'}</h1>
            {course?.teacher_name && <p className="text-xs text-slate-400">{course.teacher_name}</p>}
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 min-w-max px-3 py-2 text-xs font-semibold rounded-lg transition-colors"
            style={tab === t.key ? { background: primary, color: '#fff' } : { color: '#64748B' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lessons' && (
        lessonsLoading ? <Spinner /> :
        lessons.length === 0 ? (
          <p className="text-center text-slate-400 py-8">No lessons yet.</p>
        ) : (
          <div className="space-y-2">
            {lessons.map(lesson => (
              <div key={lesson.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <ContentIcon type={lesson.content_type} />
                  <span className="flex-1 text-sm font-semibold text-slate-700">{lesson.title}</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${expandedLesson === lesson.id ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {expandedLesson === lesson.id && (
                  <div className="px-4 pb-4">
                    <LessonDetail lesson={lesson} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'assignments' && (
        assignmentsLoading ? <Spinner /> :
        assignments.length === 0 ? (
          <p className="text-center text-slate-400 py-8">No assignments yet.</p>
        ) : (
          <div className="space-y-3">
            {assignments.map(assignment => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                primary={primary}
                courseId={courseId}
                onRefresh={refreshAssignments}
              />
            ))}
          </div>
        )
      )}

      {tab === 'quizzes' && (
        quizzesLoading ? <Spinner /> :
        quizzes.length === 0 ? (
          <p className="text-center text-slate-400 py-8">No quizzes yet.</p>
        ) : (
          <div className="space-y-3">
            {quizzes.map(quiz => {
              const maxed = quiz.max_attempts != null && quiz.attempt_count >= quiz.max_attempts;
              return (
                <div key={quiz.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-bold text-slate-800">{quiz.title}</h3>
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                      maxed
                        ? 'bg-red-100 text-red-600'
                        : quiz.attempt_count > 0
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {maxed
                        ? 'Max Attempts'
                        : quiz.attempt_count > 0
                        ? `Best: ${quiz.best_score ?? 0}/${quiz.total_marks}`
                        : 'Not Attempted'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-3">
                    <span>{quiz.question_count} questions</span>
                    <span>{quiz.total_marks} marks</span>
                    {quiz.time_limit_mins && <span>{quiz.time_limit_mins} min</span>}
                    <span>{quiz.attempt_count} attempt{quiz.attempt_count !== 1 ? 's' : ''}</span>
                  </div>
                  {!maxed && (
                    <button
                      onClick={() => router.push(`/student/lms/quiz/${quiz.id}`)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: primary }}
                    >
                      {quiz.attempt_count === 0 ? 'Start Quiz' : 'Retake Quiz'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'announcements' && (
        announcementsLoading ? <Spinner /> :
        announcements.length === 0 ? (
          <p className="text-center text-slate-400 py-8">No announcements.</p>
        ) : (
          <div className="space-y-3">
            {sortedAnnouncements.map(ann => (
              <div key={ann.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {ann.is_pinned && (
                    <>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0" style={{ color: primary }}>
                        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ color: primary, background: `${primary}18` }}>Pinned</span>
                    </>
                  )}
                  <h3 className="text-sm font-bold text-slate-800">{ann.title}</h3>
                </div>
                <p className="text-xs text-slate-400 mb-2">
                  {new Date(ann.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{ann.body}</p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
