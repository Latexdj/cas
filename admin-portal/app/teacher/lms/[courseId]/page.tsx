'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

const INPUT = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Course {
  id: string;
  subject_name: string;
  class_name: string;
  status: 'draft' | 'published' | 'archived';
  description?: string;
}

interface Lesson {
  id: string;
  title: string;
  content_type: 'text' | 'file' | 'youtube' | 'link';
  body?: string;
  external_url?: string;
  file_data?: string;
  is_published: boolean;
  sort_order: number;
}

interface AssessmentMode {
  id: string;
  name: string;
  ca_contribution: number;
}

interface Assignment {
  id: string;
  title: string;
  instructions?: string;
  max_score: number;
  due_date?: string;
  allow_late: boolean;
  is_published: boolean;
  submission_count?: number;
  graded_count?: number;
  assessment_mode_id?: string | null;
  assessment_mode_name?: string | null;
  ca_synced_at?: string | null;
}

interface QuizQuestion {
  id?: string;
  question_text: string;
  question_type: 'mcq' | 'short_answer';
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_option?: string;
  marks: number;
  explanation?: string;
}

interface Quiz {
  id: string;
  title: string;
  instructions?: string;
  time_limit_mins?: number | null;
  max_attempts: number;
  show_answers_after: boolean;
  is_published: boolean;
  question_count?: number;
  total_marks?: number;
  assessment_mode_id?: string | null;
  assessment_mode_name?: string | null;
  ca_synced_at?: string | null;
}

interface Submission {
  id: string;
  student_name: string;
  class_name?: string;
  submitted_at: string;
  is_late: boolean;
  score?: number | null;
  feedback?: string;
  assignment_id: string;
  assignment_title?: string;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function ContentTypeBadge({ type }: { type: Lesson['content_type'] }) {
  const map: Record<string, string> = {
    text: 'bg-slate-100 text-slate-600',
    file: 'bg-blue-100 text-blue-700',
    youtube: 'bg-red-100 text-red-700',
    link: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${map[type] ?? ''}`}>{type}</span>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type.startsWith('image/')) {
      const canvas = document.createElement('canvas');
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1200;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = url;
    } else {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }
  });
}

// ─── Lessons Tab ──────────────────────────────────────────────────────────────

function LessonsTab({ courseId, primary }: { courseId: string; primary: string }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await teacherApi.get<Lesson[]>(`/api/lms/courses/${courseId}/lessons`);
      setLessons(data ?? []);
    } catch { setError('Failed to load lessons.'); }
    finally { setLoading(false); }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  async function deleteLesson(id: string) {
    if (!confirm('Delete this lesson?')) return;
    try {
      await teacherApi.delete(`/api/lms/lessons/${id}`);
      setLessons(prev => prev.filter(l => l.id !== id));
    } catch { alert('Failed to delete.'); }
  }

  async function togglePublish(lesson: Lesson) {
    try {
      await teacherApi.put(`/api/lms/lessons/${lesson.id}`, { is_published: !lesson.is_published });
      setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, is_published: !l.is_published } : l));
    } catch { alert('Failed to update.'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-500">{lessons.length} lesson{lessons.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: primary }}
        >
          + Add Lesson
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : lessons.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No lessons yet. Add your first lesson.</p>
      ) : (
        <div className="space-y-2">
          {lessons.map((lesson, idx) => (
            <div key={lesson.id} className="bg-white rounded-xl border border-slate-200 flex items-center gap-3 px-4 py-3">
              <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{lesson.title}</p>
              </div>
              <ContentTypeBadge type={lesson.content_type} />
              <button
                onClick={() => togglePublish(lesson)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${lesson.is_published ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
              >
                {lesson.is_published ? 'Published' : 'Draft'}
              </button>
              <button onClick={() => { setEditing(lesson); setShowModal(true); }} className="text-xs text-slate-400 hover:text-slate-700 px-1.5">Edit</button>
              <button onClick={() => deleteLesson(lesson.id)} className="text-xs text-red-400 hover:text-red-600 px-1.5">Del</button>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <LessonModal
          courseId={courseId}
          primary={primary}
          lesson={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function LessonModal({
  courseId,
  primary,
  lesson,
  onClose,
  onSaved,
}: {
  courseId: string;
  primary: string;
  lesson: Lesson | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [contentType, setContentType] = useState<Lesson['content_type']>(lesson?.content_type ?? 'text');
  const [body, setBody] = useState(lesson?.body ?? '');
  const [externalUrl, setExternalUrl] = useState(lesson?.external_url ?? '');
  const [fileData, setFileData] = useState('');
  const [isPublished, setIsPublished] = useState(lesson?.is_published ?? false);
  const [sortOrder, setSortOrder] = useState(lesson?.sort_order ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      setFileData(b64);
    } catch { setError('Failed to read file.'); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError('');
    const payload: Record<string, unknown> = {
      title: title.trim(), content_type: contentType, is_published: isPublished, sort_order: sortOrder,
    };
    if (contentType === 'text') payload.body = body;
    if (contentType === 'youtube' || contentType === 'link') payload.external_url = externalUrl;
    if (contentType === 'file' && fileData) payload.file_data = fileData;
    try {
      if (lesson) {
        await teacherApi.put(`/api/lms/lessons/${lesson.id}`, payload);
      } else {
        await teacherApi.post(`/api/lms/courses/${courseId}/lessons`, payload);
      }
      onSaved();
    } catch { setError('Failed to save lesson.'); }
    finally { setSaving(false); }
  }

  const types: Lesson['content_type'][] = ['text', 'file', 'youtube', 'link'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">{lesson ? 'Edit Lesson' : 'Add Lesson'}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm font-bold hover:bg-slate-200">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Title</label>
            <input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder="Lesson title" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">Content Type</label>
            <div className="flex gap-2">
              {types.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setContentType(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${contentType === t ? 'border-green-600 text-green-700 bg-green-50' : 'border-slate-200 text-slate-500 bg-white'}`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {contentType === 'text' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Content</label>
              <textarea className={INPUT} rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Lesson content…" />
            </div>
          )}
          {(contentType === 'youtube' || contentType === 'link') && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">URL</label>
              <input className={INPUT} value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder={contentType === 'youtube' ? 'https://youtu.be/...' : 'https://'} />
            </div>
          )}
          {contentType === 'file' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">File (image or PDF)</label>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-green-50 file:text-green-700 hover:file:bg-green-100" onChange={handleFile} />
              {fileData && <p className="text-xs text-green-600 mt-1">File ready to upload.</p>}
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Sort Order</label>
              <input type="number" className={INPUT} value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value) || 0)} min={0} />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} className="w-4 h-4 rounded accent-green-600" />
                <span className="text-sm font-semibold text-slate-700">Published</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: primary }}>
              {saving ? 'Saving…' : 'Save Lesson'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Assignments Tab ───────────────────────────────────────────────────────────

function AssignmentsTab({ courseId, primary }: { courseId: string; primary: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await teacherApi.get<Assignment[]>(`/api/lms/courses/${courseId}/assignments`);
      setAssignments(data ?? []);
    } catch { setError('Failed to load assignments.'); }
    finally { setLoading(false); }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  async function deleteAssignment(id: string) {
    if (!confirm('Delete this assignment?')) return;
    try {
      await teacherApi.delete(`/api/lms/assignments/${id}`);
      setAssignments(prev => prev.filter(a => a.id !== id));
    } catch { alert('Failed to delete.'); }
  }

  async function syncToCA(a: Assignment) {
    if (!confirm(`Sync "${a.title}" scores to CA? This will create or update a CA assessment record.`)) return;
    try {
      const { data } = await teacherApi.post<{ message: string; student_count: number }>(`/api/lms/assignments/${a.id}/sync-to-ca`, {});
      alert(`${data.message}. ${data.student_count} student score(s) recorded.`);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Sync failed.');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-500">{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: primary }}
        >
          + Add Assignment
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No assignments yet.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-200 flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{a.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Max: {a.max_score} pts
                  {a.due_date ? ` · Due ${new Date(a.due_date).toLocaleDateString()}` : ''}
                  {a.submission_count !== undefined ? ` · ${a.submission_count} submitted / ${a.graded_count ?? 0} graded` : ''}
                  {a.assessment_mode_name ? ` · CA: ${a.assessment_mode_name}` : ''}
                </p>
                {a.ca_synced_at && (
                  <p className="text-[10px] text-emerald-600 mt-0.5">Synced {new Date(a.ca_synced_at).toLocaleString()}</p>
                )}
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.is_published ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {a.is_published ? 'Published' : 'Draft'}
              </span>
              {a.assessment_mode_id && (
                <button onClick={() => syncToCA(a)} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 whitespace-nowrap">Sync CA</button>
              )}
              <button onClick={() => { setEditing(a); setShowModal(true); }} className="text-xs text-slate-400 hover:text-slate-700 px-1.5">Edit</button>
              <button onClick={() => deleteAssignment(a.id)} className="text-xs text-red-400 hover:text-red-600 px-1.5">Del</button>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <AssignmentModal
          courseId={courseId}
          primary={primary}
          assignment={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function AssignmentModal({
  courseId,
  primary,
  assignment,
  onClose,
  onSaved,
}: {
  courseId: string;
  primary: string;
  assignment: Assignment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [instructions, setInstructions] = useState(assignment?.instructions ?? '');
  const [maxScore, setMaxScore] = useState<number | ''>(assignment?.max_score ?? '');
  const [dueDate, setDueDate] = useState(assignment?.due_date ? assignment.due_date.slice(0, 16) : '');
  const [allowLate, setAllowLate] = useState(assignment?.allow_late ?? false);
  const [isPublished, setIsPublished] = useState(assignment?.is_published ?? true);
  const [assessmentModeId, setAssessmentModeId] = useState(assignment?.assessment_mode_id ?? '');
  const [assessmentModes, setAssessmentModes] = useState<AssessmentMode[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    teacherApi.get<AssessmentMode[]>('/api/assessment-modes')
      .then(r => setAssessmentModes(r.data ?? []))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!maxScore || maxScore <= 0) { setError('Max score is required.'); return; }
    setSaving(true); setError('');
    const payload = {
      title: title.trim(),
      instructions: instructions.trim() || null,
      max_score: maxScore,
      due_date: dueDate || null,
      allow_late: allowLate,
      is_published: isPublished,
      assessment_mode_id: assessmentModeId || null,
    };
    try {
      if (assignment) {
        await teacherApi.put(`/api/lms/assignments/${assignment.id}`, payload);
      } else {
        await teacherApi.post(`/api/lms/courses/${courseId}/assignments`, payload);
      }
      onSaved();
    } catch { setError('Failed to save assignment.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">{assignment ? 'Edit Assignment' : 'Add Assignment'}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm font-bold hover:bg-slate-200">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Title</label>
            <input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder="Assignment title" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Instructions</label>
            <textarea className={INPUT} rows={4} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Assignment instructions…" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Max Score</label>
              <input type="number" className={INPUT} value={maxScore} onChange={e => setMaxScore(parseInt(e.target.value) || '')} min={1} placeholder="e.g. 100" required />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Due Date (optional)</label>
              <input type="datetime-local" className={INPUT} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Count for CA (optional)</label>
            <select className={INPUT} value={assessmentModeId} onChange={e => setAssessmentModeId(e.target.value)}>
              <option value="">— Not a CA assessment —</option>
              {assessmentModes.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.ca_contribution}%)</option>
              ))}
            </select>
            {assessmentModeId && <p className="text-xs text-slate-400 mt-1">After grading, use "Sync CA" to push scores to the CA register.</p>}
          </div>
          <div className="flex gap-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allowLate} onChange={e => setAllowLate(e.target.checked)} className="w-4 h-4 rounded accent-green-600" />
              <span className="text-sm font-semibold text-slate-700">Allow Late</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} className="w-4 h-4 rounded accent-green-600" />
              <span className="text-sm font-semibold text-slate-700">Published</span>
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: primary }}>
              {saving ? 'Saving…' : 'Save Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Quizzes Tab ──────────────────────────────────────────────────────────────

function QuizzesTab({ courseId, primary }: { courseId: string; primary: string }) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [editingMeta, setEditingMeta] = useState<Quiz | null>(null);
  const [builderQuizId, setBuilderQuizId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await teacherApi.get<Quiz[]>(`/api/lms/courses/${courseId}/quizzes`);
      setQuizzes(data ?? []);
    } catch { setError('Failed to load quizzes.'); }
    finally { setLoading(false); }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  async function deleteQuiz(id: string) {
    if (!confirm('Delete this quiz?')) return;
    try {
      await teacherApi.delete(`/api/lms/quizzes/${id}`);
      setQuizzes(prev => prev.filter(q => q.id !== id));
    } catch { alert('Failed to delete.'); }
  }

  async function togglePublish(quiz: Quiz) {
    try {
      await teacherApi.put(`/api/lms/quizzes/${quiz.id}`, { is_published: !quiz.is_published });
      setQuizzes(prev => prev.map(q => q.id === quiz.id ? { ...q, is_published: !q.is_published } : q));
    } catch { alert('Failed to update.'); }
  }

  async function syncToCA(quiz: Quiz) {
    if (!confirm(`Sync "${quiz.title}" scores to CA? This will create or update a CA assessment record.`)) return;
    try {
      const { data } = await teacherApi.post<{ message: string; student_count: number }>(`/api/lms/quizzes/${quiz.id}/sync-to-ca`, {});
      alert(`${data.message}. ${data.student_count} student score(s) recorded.`);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Sync failed.');
    }
  }

  if (builderQuizId) {
    return (
      <QuizBuilder
        quizId={builderQuizId}
        primary={primary}
        onDone={() => { setBuilderQuizId(null); load(); }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-500">{quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}</p>
        <button
          onClick={() => { setEditingMeta(null); setShowMetaModal(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: primary }}
        >
          + New Quiz
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : quizzes.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No quizzes yet.</p>
      ) : (
        <div className="space-y-2">
          {quizzes.map(q => (
            <div key={q.id} className="bg-white rounded-xl border border-slate-200 flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{q.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {q.question_count ?? 0} questions · {q.total_marks ?? 0} marks
                  {q.time_limit_mins ? ` · ${q.time_limit_mins} min` : ''}
                  {q.assessment_mode_name ? ` · CA: ${q.assessment_mode_name}` : ''}
                </p>
                {q.ca_synced_at && (
                  <p className="text-[10px] text-emerald-600 mt-0.5">Synced {new Date(q.ca_synced_at).toLocaleString()}</p>
                )}
              </div>
              <button
                onClick={() => togglePublish(q)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${q.is_published ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
              >
                {q.is_published ? 'Published' : 'Draft'}
              </button>
              {q.assessment_mode_id && (
                <button onClick={() => syncToCA(q)} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 whitespace-nowrap">Sync CA</button>
              )}
              <button onClick={() => { setEditingMeta(q); setShowMetaModal(true); }} className="text-xs text-slate-400 hover:text-slate-700 px-1.5">Edit</button>
              <button onClick={() => setBuilderQuizId(q.id)} className="text-xs text-blue-500 hover:text-blue-700 px-1.5">Questions</button>
              <button onClick={() => deleteQuiz(q.id)} className="text-xs text-red-400 hover:text-red-600 px-1.5">Del</button>
            </div>
          ))}
        </div>
      )}
      {showMetaModal && (
        <QuizMetaModal
          courseId={courseId}
          primary={primary}
          quiz={editingMeta}
          onClose={() => setShowMetaModal(false)}
          onSaved={(id) => { setShowMetaModal(false); if (!editingMeta) { setBuilderQuizId(id); } else { load(); } }}
        />
      )}
    </div>
  );
}

function QuizMetaModal({
  courseId,
  primary,
  quiz,
  onClose,
  onSaved,
}: {
  courseId: string;
  primary: string;
  quiz: Quiz | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [title, setTitle] = useState(quiz?.title ?? '');
  const [instructions, setInstructions] = useState(quiz?.instructions ?? '');
  const [timeLimit, setTimeLimit] = useState(quiz?.time_limit_mins?.toString() ?? '');
  const [maxAttempts, setMaxAttempts] = useState(quiz?.max_attempts ?? 1);
  const [showAnswers, setShowAnswers] = useState(quiz?.show_answers_after ?? false);
  const [isPublished, setIsPublished] = useState(quiz?.is_published ?? false);
  const [assessmentModeId, setAssessmentModeId] = useState(quiz?.assessment_mode_id ?? '');
  const [assessmentModes, setAssessmentModes] = useState<AssessmentMode[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    teacherApi.get<AssessmentMode[]>('/api/assessment-modes')
      .then(r => setAssessmentModes(r.data ?? []))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError('');
    const payload = {
      title: title.trim(),
      instructions: instructions.trim() || null,
      time_limit_mins: timeLimit ? parseInt(timeLimit) : null,
      max_attempts: maxAttempts,
      show_answers_after: showAnswers,
      is_published: isPublished,
      assessment_mode_id: assessmentModeId || null,
    };
    try {
      if (quiz) {
        await teacherApi.put(`/api/lms/quizzes/${quiz.id}`, payload);
        onSaved(quiz.id);
      } else {
        const { data } = await teacherApi.post<{ id: string }>(`/api/lms/courses/${courseId}/quizzes`, payload);
        onSaved(data.id);
      }
    } catch { setError('Failed to save quiz.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">{quiz ? 'Edit Quiz' : 'New Quiz'}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm font-bold hover:bg-slate-200">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Title</label>
            <input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder="Quiz title" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Instructions</label>
            <textarea className={INPUT} rows={3} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Instructions for students…" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Time Limit (mins, optional)</label>
              <input type="number" className={INPUT} value={timeLimit} onChange={e => setTimeLimit(e.target.value)} min={1} placeholder="No limit" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Max Attempts</label>
              <input type="number" className={INPUT} value={maxAttempts} onChange={e => setMaxAttempts(parseInt(e.target.value) || 1)} min={1} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Count for CA (optional)</label>
            <select className={INPUT} value={assessmentModeId} onChange={e => setAssessmentModeId(e.target.value)}>
              <option value="">— Not a CA assessment —</option>
              {assessmentModes.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.ca_contribution}%)</option>
              ))}
            </select>
            {assessmentModeId && <p className="text-xs text-slate-400 mt-1">After students complete the quiz, use "Sync CA" to push scores to the CA register.</p>}
          </div>
          <div className="flex gap-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showAnswers} onChange={e => setShowAnswers(e.target.checked)} className="w-4 h-4 rounded accent-green-600" />
              <span className="text-sm font-semibold text-slate-700">Show Answers After Submit</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} className="w-4 h-4 rounded accent-green-600" />
              <span className="text-sm font-semibold text-slate-700">Published</span>
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: primary }}>
              {saving ? 'Saving…' : quiz ? 'Save Changes' : 'Next: Add Questions →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuizBuilder({ quizId, primary, onDone }: { quizId: string; primary: string; onDone: () => void }) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    teacherApi.get<QuizQuestion[]>(`/api/lms/quizzes/${quizId}/questions`).then(({ data }) => {
      setQuestions(data?.length ? data : [blankQuestion()]);
    }).catch(() => {
      setQuestions([blankQuestion()]);
    }).finally(() => setLoading(false));
  }, [quizId]);

  function blankQuestion(): QuizQuestion {
    return { question_text: '', question_type: 'mcq', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'a', marks: 1, explanation: '' };
  }

  function updateQ(idx: number, patch: Partial<QuizQuestion>) {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
  }

  async function save() {
    setSaving(true); setError('');
    try {
      await teacherApi.put(`/api/lms/quizzes/${quizId}`, { questions });
      onDone();
    } catch { setError('Failed to save questions.'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-2 border-green-600 border-t-transparent animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-slate-800">Question Builder</h3>
          <p className="text-xs text-slate-500 mt-0.5">{questions.length} question{questions.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onDone} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">← Back</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: primary }}>
            {saving ? 'Saving…' : 'Save Questions'}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold text-slate-400 mt-1">Q{idx + 1}</span>
              <div className="flex-1">
                <textarea
                  className={INPUT}
                  rows={2}
                  value={q.question_text}
                  onChange={e => updateQ(idx, { question_text: e.target.value })}
                  placeholder="Question text…"
                />
              </div>
              <button onClick={() => setQuestions(prev => prev.filter((_, i) => i !== idx))} className="text-xs text-red-400 hover:text-red-600 mt-1 px-1">✕</button>
            </div>
            <div className="flex gap-3 items-center">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
                <select className={`${INPUT} w-auto`} value={q.question_type} onChange={e => updateQ(idx, { question_type: e.target.value as QuizQuestion['question_type'] })}>
                  <option value="mcq">MCQ</option>
                  <option value="short_answer">Short Answer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Marks</label>
                <input type="number" className={`${INPUT} w-20`} value={q.marks} onChange={e => updateQ(idx, { marks: parseInt(e.target.value) || 1 })} min={1} />
              </div>
            </div>
            {q.question_type === 'mcq' && (
              <div className="space-y-2">
                {(['a', 'b', 'c', 'd'] as const).map(opt => {
                  const key = `option_${opt}` as keyof QuizQuestion;
                  return (
                    <div key={opt} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct_${idx}`}
                        checked={q.correct_option === opt}
                        onChange={() => updateQ(idx, { correct_option: opt })}
                        className="w-4 h-4 accent-green-600"
                      />
                      <span className="text-xs font-bold text-slate-500 w-4">{opt.toUpperCase()}</span>
                      <input
                        className={`${INPUT} flex-1`}
                        value={(q[key] as string) ?? ''}
                        onChange={e => updateQ(idx, { [key]: e.target.value })}
                        placeholder={`Option ${opt.toUpperCase()}`}
                      />
                    </div>
                  );
                })}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Explanation (optional)</label>
                  <input className={INPUT} value={q.explanation ?? ''} onChange={e => updateQ(idx, { explanation: e.target.value })} placeholder="Explanation shown after submission…" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => setQuestions(prev => [...prev, blankQuestion()])}
        className="mt-4 w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-400 hover:border-green-400 hover:text-green-600 transition-colors"
      >
        + Add Question
      </button>
    </div>
  );
}

// ─── Submissions Tab ──────────────────────────────────────────────────────────

function SubmissionsTab({ courseId, primary }: { courseId: string; primary: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, Submission[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'ungraded' | 'graded'>('all');
  const [loading, setLoading] = useState(true);
  const [gradeEdits, setGradeEdits] = useState<Record<string, { score: string; feedback: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    teacherApi.get<Assignment[]>(`/api/lms/courses/${courseId}/assignments`)
      .then(({ data }) => setAssignments(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId]);

  async function expandAssignment(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (submissionsMap[id]) return;
    setLoadingMap(prev => ({ ...prev, [id]: true }));
    try {
      const { data } = await teacherApi.get<Submission[]>(`/api/lms/assignments/${id}/submissions`);
      setSubmissionsMap(prev => ({ ...prev, [id]: data ?? [] }));
    } catch {
      setSubmissionsMap(prev => ({ ...prev, [id]: [] }));
    } finally {
      setLoadingMap(prev => ({ ...prev, [id]: false }));
    }
  }

  async function saveGrade(submission: Submission) {
    const edit = gradeEdits[submission.id];
    if (!edit) return;
    setSavingId(submission.id);
    try {
      await teacherApi.patch(`/api/lms/submissions/${submission.id}/grade`, {
        score: edit.score !== '' ? parseFloat(edit.score) : null,
        feedback: edit.feedback,
      });
      setSubmissionsMap(prev => {
        const list = prev[submission.assignment_id] ?? [];
        return { ...prev, [submission.assignment_id]: list.map(s => s.id === submission.id ? { ...s, score: edit.score !== '' ? parseFloat(edit.score) : null, feedback: edit.feedback } : s) };
      });
      setGradeEdits(prev => { const n = { ...prev }; delete n[submission.id]; return n; });
    } catch { alert('Failed to save grade.'); }
    finally { setSavingId(null); }
  }

  function filteredSubmissions(list: Submission[]) {
    if (filter === 'ungraded') return list.filter(s => s.score == null);
    if (filter === 'graded') return list.filter(s => s.score != null);
    return list;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {(['all', 'ungraded', 'graded'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${filter === f ? 'text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            style={filter === f ? { background: primary } : {}}
          >
            {f}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No assignments in this course.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map(a => {
            const subs = filteredSubmissions(submissionsMap[a.id] ?? []);
            const isOpen = expandedId === a.id;
            const isLoading = loadingMap[a.id];
            return (
              <div key={a.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => expandAssignment(a.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Max: {a.max_score} pts {a.submission_count !== undefined ? `· ${a.submission_count} submission${a.submission_count !== 1 ? 's' : ''}` : ''}</p>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    {isLoading ? (
                      <div className="flex justify-center py-4"><div className="w-5 h-5 rounded-full border-2 border-green-600 border-t-transparent animate-spin" /></div>
                    ) : subs.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2 text-center">No submissions found.</p>
                    ) : (
                      <div className="space-y-3">
                        {subs.map(sub => {
                          const edit = gradeEdits[sub.id] ?? { score: sub.score?.toString() ?? '', feedback: sub.feedback ?? '' };
                          return (
                            <div key={sub.id} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl">
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-slate-800">{sub.student_name}</p>
                                  <p className="text-xs text-slate-400">{sub.class_name} · {new Date(sub.submitted_at).toLocaleString()}</p>
                                </div>
                                {sub.is_late && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Late</span>}
                              </div>
                              <div className="flex gap-2 items-end">
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Score</label>
                                  <input
                                    type="number"
                                    className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                                    value={edit.score}
                                    onChange={e => setGradeEdits(prev => ({ ...prev, [sub.id]: { ...edit, score: e.target.value } }))}
                                    min={0}
                                    max={a.max_score}
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Feedback</label>
                                  <textarea
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                                    rows={1}
                                    value={edit.feedback}
                                    onChange={e => setGradeEdits(prev => ({ ...prev, [sub.id]: { ...edit, feedback: e.target.value } }))}
                                    placeholder="Feedback…"
                                  />
                                </div>
                                <button
                                  onClick={() => saveGrade({ ...sub, assignment_id: a.id })}
                                  disabled={savingId === sub.id}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                                  style={{ background: primary }}
                                >
                                  {savingId === sub.id ? '…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Announcements Tab ────────────────────────────────────────────────────────

function AnnouncementsTab({ courseId, primary }: { courseId: string; primary: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await teacherApi.get<Announcement[]>(`/api/lms/courses/${courseId}/announcements`);
      setAnnouncements(data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  async function deleteAnnouncement(id: string) {
    if (!confirm('Delete this announcement?')) return;
    try {
      await teacherApi.delete(`/api/lms/announcements/${id}`);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch { alert('Failed to delete.'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-500">{announcements.length} announcement{announcements.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: primary }}
        >
          + New Announcement
        </button>
      </div>
      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No announcements yet.</p>
      ) : (
        <div className="space-y-2">
          {announcements.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                  {a.is_pinned && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Pinned</span>}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.body}</p>
                <p className="text-[10px] text-slate-400 mt-1">{new Date(a.created_at).toLocaleDateString()}</p>
              </div>
              <button onClick={() => deleteAnnouncement(a.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0 px-1 mt-0.5">Del</button>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <AnnouncementModal
          courseId={courseId}
          primary={primary}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function AnnouncementModal({
  courseId,
  primary,
  onClose,
  onSaved,
}: {
  courseId: string;
  primary: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { setError('Title and body are required.'); return; }
    setSaving(true); setError('');
    try {
      await teacherApi.post(`/api/lms/courses/${courseId}/announcements`, {
        title: title.trim(), body: body.trim(), is_pinned: isPinned,
      });
      onSaved();
    } catch { setError('Failed to post announcement.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">New Announcement</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm font-bold hover:bg-slate-200">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Title</label>
            <input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Body</label>
            <textarea className={INPUT} rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Announcement content…" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isPinned} onChange={e => setIsPinned(e.target.checked)} className="w-4 h-4 rounded accent-green-600" />
            <span className="text-sm font-semibold text-slate-700">Pin this announcement</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: primary }}>
              {saving ? 'Posting…' : 'Post Announcement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = 'lessons' | 'assignments' | 'quizzes' | 'submissions' | 'announcements';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'lessons', label: 'Lessons' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'submissions', label: 'Submissions' },
  { key: 'announcements', label: 'Announcements' },
];

function CourseStudioContent() {
  const params = useParams();
  const courseId = params.courseId as string;
  const [primary, setPrimary] = useState('#2ab289');
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('lessons');

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    teacherApi.get<Course>(`/api/lms/courses/${courseId}`).then(({ data }) => {
      setCourse(data);
    }).catch(() => {
      setError('Failed to load course.');
    }).finally(() => setLoading(false));
  }, [courseId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}>
        <div className="w-7 h-7 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen px-4 pt-8" style={{ background: '#F4EFE6' }}>
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error || 'Course not found.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-[#2C2218] leading-tight">{course.subject_name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs font-semibold text-[#8C7E6E]">{course.class_name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                course.status === 'published' ? 'bg-green-100 text-green-700' :
                course.status === 'archived' ? 'bg-orange-100 text-orange-700' :
                'bg-slate-100 text-slate-600'
              }`}>{course.status}</span>
            </div>
            {course.description && <p className="text-xs text-[#8C7E6E] mt-1 line-clamp-2">{course.description}</p>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4">
        <div className="flex gap-1 bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-1 mb-5 overflow-x-auto no-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${activeTab === tab.key ? 'text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
              style={activeTab === tab.key ? { background: primary } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-5">
          {activeTab === 'lessons' && <LessonsTab courseId={courseId} primary={primary} />}
          {activeTab === 'assignments' && <AssignmentsTab courseId={courseId} primary={primary} />}
          {activeTab === 'quizzes' && <QuizzesTab courseId={courseId} primary={primary} />}
          {activeTab === 'submissions' && <SubmissionsTab courseId={courseId} primary={primary} />}
          {activeTab === 'announcements' && <AnnouncementsTab courseId={courseId} primary={primary} />}
        </div>
      </div>
    </div>
  );
}

export default function CourseStudioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}>
        <div className="w-7 h-7 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" />
      </div>
    }>
      <CourseStudioContent />
    </Suspense>
  );
}
