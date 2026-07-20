'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number; }
interface Teacher      { id: string; name: string; }

interface ExamBatch {
  teacher_id:          string;
  teacher_name:        string | null;
  subject:             string;
  class_name:          string;
  academic_year_id:    string;
  academic_year_name:  string;
  semester:            number;
  max_score:           number;
  score_count:         number;
  class_size:          number;
  submitted_at:        string | null;
}

interface EditForm {
  academic_year_id: string;
  semester:         string;
  subject:          string;
  class_name:       string;
  teacher_id:       string;
  max_score:        string;
}

export default function AdminExamScoresPage() {
  const [years,        setYears]        = useState<AcademicYear[]>([]);
  const [teachers,     setTeachers]     = useState<Teacher[]>([]);
  const [filterYear,   setFilterYear]   = useState('');
  const [filterSem,    setFilterSem]    = useState('');
  const [filterTch,    setFilterTch]    = useState('');
  const [filterSubj,   setFilterSubj]   = useState('');
  const [filterClass,  setFilterClass]  = useState('');
  const [rows,         setRows]         = useState<ExamBatch[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  // Edit modal
  const [editing,      setEditing]      = useState<ExamBatch | null>(null);
  const [editForm,     setEditForm]     = useState<EditForm>({ academic_year_id: '', semester: '', subject: '', class_name: '', teacher_id: '', max_score: '' });
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState('');

  // Delete modal
  const [deleting,     setDeleting]     = useState<ExamBatch | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,  setDeleteError]  = useState('');

  useEffect(() => {
    Promise.all([
      api.get<AcademicYear[]>('/api/academic-years'),
      api.get<Teacher[]>('/api/teachers'),
    ]).then(([yr, tch]) => {
      setYears(yr.data);
      setTeachers(tch.data);
      const cur = yr.data.find(y => y.is_current);
      if (cur) { setFilterYear(cur.id); setFilterSem(String(cur.current_semester)); }
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = {};
      if (filterYear)  params.academic_year_id = filterYear;
      if (filterSem)   params.semester         = filterSem;
      if (filterTch)   params.teacher_id       = filterTch;
      if (filterSubj)  params.subject          = filterSubj;
      if (filterClass) params.class_name       = filterClass;
      const { data } = await api.get<ExamBatch[]>('/api/exam-scores/admin-list', { params });
      setRows(data);
    } catch {
      setError('Failed to load exam scores.');
    } finally { setLoading(false); }
  }, [filterYear, filterSem, filterTch, filterSubj, filterClass]);

  useEffect(() => { load(); }, [load]);

  function openEdit(b: ExamBatch) {
    setEditing(b);
    setSaveError('');
    setEditForm({
      academic_year_id: b.academic_year_id,
      semester:         String(b.semester),
      subject:          b.subject,
      class_name:       b.class_name,
      teacher_id:       b.teacher_id,
      max_score:        String(b.max_score),
    });
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editForm.max_score || parseFloat(editForm.max_score) <= 0) {
      setSaveError('Max score must be greater than 0.');
      return;
    }
    setSaving(true); setSaveError('');
    try {
      await api.patch('/api/exam-scores/admin-edit', {
        current: {
          academic_year_id: editing.academic_year_id,
          semester:         editing.semester,
          subject:          editing.subject,
          class_name:       editing.class_name,
          teacher_id:       editing.teacher_id,
        },
        update: {
          academic_year_id: editForm.academic_year_id,
          semester:         parseInt(editForm.semester),
          subject:          editForm.subject.trim(),
          class_name:       editForm.class_name.trim(),
          teacher_id:       editForm.teacher_id,
          max_score:        parseFloat(editForm.max_score),
        },
      });
      setEditing(null);
      load();
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { error?: string } } })?.response?.data;
      setSaveError(d?.error ?? 'Failed to save changes.');
    } finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!deleting) return;
    if (!deleteReason.trim()) { setDeleteError('A reason is required.'); return; }
    setDeleteLoading(true); setDeleteError('');
    try {
      await api.delete('/api/exam-scores/admin-delete', {
        data: {
          academic_year_id: deleting.academic_year_id,
          semester:         deleting.semester,
          subject:          deleting.subject,
          class_name:       deleting.class_name,
          teacher_id:       deleting.teacher_id,
          reason:           deleteReason.trim(),
        },
      });
      setDeleting(null);
      setDeleteReason('');
      load();
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { error?: string } } })?.response?.data;
      setDeleteError(d?.error ?? 'Failed to delete exam scores.');
    } finally { setDeleteLoading(false); }
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Exam Scores</h1>
        <p className="text-sm text-slate-500 mt-0.5">View and correct end-of-semester exam scores across teachers, subjects, and academic years.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-3 items-center shadow-sm">
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900">
          <option value="">All Years</option>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>

        <select value={filterSem} onChange={e => setFilterSem(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900">
          <option value="">All Semesters</option>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>

        <select value={filterTch} onChange={e => setFilterTch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900">
          <option value="">All Teachers</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <input value={filterSubj} onChange={e => setFilterSubj(e.target.value)}
          placeholder="Subject…" onKeyDown={e => e.key === 'Enter' && load()}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 w-32" />

        <input value={filterClass} onChange={e => setFilterClass(e.target.value)}
          placeholder="Class…" onKeyDown={e => e.key === 'Enter' && load()}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 w-24" />

        <button onClick={load} disabled={loading}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          style={{ backgroundColor: '#15803D' }}>
          {loading ? 'Loading…' : 'Apply'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No exam scores found for the selected filters.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-400 font-medium">
            {rows.length} batch{rows.length !== 1 ? 'es' : ''}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Teacher', 'Subject', 'Class', 'Year / Sem', 'Max', 'Scores', 'Last Saved', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5 text-slate-800 font-medium whitespace-nowrap">{r.teacher_name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.subject}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.class_name}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.academic_year_name} · Sem {r.semester}</td>
                    <td className="px-3 py-2.5 text-slate-600 text-center">{r.max_score}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-semibold tabular-nums ${r.score_count > 0 ? 'text-green-700' : 'text-slate-300'}`}>
                        {r.score_count} / {r.class_size}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(r.submitted_at)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(r)}
                          className="text-xs px-2.5 py-1 rounded-md font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => { setDeleting(r); setDeleteReason(''); setDeleteError(''); }}
                          className="text-xs px-2.5 py-1 rounded-md font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Edit Exam Scores</h2>
                <p className="text-xs text-slate-500 mt-0.5">{editing.subject} · {editing.class_name} — {editing.score_count} score{editing.score_count !== 1 ? 's' : ''} entered</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {editing.score_count > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  {editing.score_count} score{editing.score_count !== 1 ? 's' : ''} will be moved to the updated period / subject / class.
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Academic Year</label>
                  <select value={editForm.academic_year_id}
                    onChange={e => setEditForm(f => ({ ...f, academic_year_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900">
                    {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Semester</label>
                  <select value={editForm.semester}
                    onChange={e => setEditForm(f => ({ ...f, semester: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900">
                    <option value="1">Semester 1</option>
                    <option value="2">Semester 2</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
                  <input value={editForm.subject}
                    onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Class</label>
                  <input value={editForm.class_name}
                    onChange={e => setEditForm(f => ({ ...f, class_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Teacher</label>
                  <select value={editForm.teacher_id}
                    onChange={e => setEditForm(f => ({ ...f, teacher_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900">
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Max Score</label>
                  <input type="number" value={editForm.max_score} min={1}
                    onChange={e => setEditForm(f => ({ ...f, max_score: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900" />
                </div>
              </div>

              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#15803D' }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5 space-y-3">
              <h2 className="font-bold text-slate-900 text-base">Delete Exam Scores?</h2>
              <p className="text-sm text-slate-600">
                All <strong>{deleting.score_count}</strong> exam score{deleting.score_count !== 1 ? 's' : ''} for{' '}
                <strong>{deleting.subject}</strong> / <strong>{deleting.class_name}</strong>{' '}
                ({deleting.academic_year_name}, Sem {deleting.semester}) entered by{' '}
                <strong>{deleting.teacher_name ?? 'this teacher'}</strong> will be permanently deleted.
              </p>
              <p className="text-xs text-slate-500">The teacher will be notified and the action will be recorded in the audit log.</p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Reason for deletion <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Wrong semester selected, duplicate entry…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 resize-none focus:outline-none focus:ring-2 focus:ring-red-200"
                />
              </div>
              {deleteError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
              )}
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button onClick={() => setDeleting(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleteLoading || !deleteReason.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleteLoading ? 'Deleting…' : 'Delete Scores'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
