'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Term   { id: string; name: string; is_current: boolean; }
interface Student { id: string; surname: string; other_names: string | null; admission_number: string; }

interface SubjectScore {
  subject_name: string;
  class_score: number | null;
  exam_score:  number | null;
  total:       number | null;
  grade:       string | null;
  position:    number | null;
  max_class_score: number;
  max_exam_score: number;
}

interface StudentFullReport {
  student: { id: string; surname: string; other_names: string | null; class_name: string; };
  term:    { name: string; };
  scores:  SubjectScore[];
  attendance: { present: number; absent: number; late: number; excused: number; total_days: number; };
  remarks: {
    id: string | null;
    affective_ratings: Record<string, number> | null;
    class_teacher_remarks: string | null;
    status: string;
  };
}

interface ReportStatus {
  student_id: string;
  student_name: string;
  admission_number: string;
  status: string;
  report_id: string | null;
}

const AFFECTIVE = ['Punctuality','Neatness','Attentiveness','Participation','Conduct','Honesty','Leadership'];

const STATUS_BADGE: Record<string, string> = {
  draft:     'text-slate-600 bg-slate-100',
  submitted: 'text-blue-700 bg-blue-50',
  approved:  'text-green-700 bg-green-50',
  rejected:  'text-red-700 bg-red-50',
};

export default function PrimaryTeacherReportsPage() {
  const [terms,    setTerms]    = useState<Term[]>([]);
  const [termId,   setTermId]   = useState('');
  const [students, setStudents] = useState<ReportStatus[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // selected student panel
  const [selStudent, setSelStudent] = useState<ReportStatus | null>(null);
  const [fullReport, setFullReport] = useState<StudentFullReport | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  // remarks form
  const [ratings,   setRatings]   = useState<Record<string, number>>({});
  const [remarks,   setRemarks]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<Term[]>('/api/primary/terms').then(r => {
      setTerms(r.data);
      const cur = r.data.find(t => t.is_current);
      if (cur) setTermId(cur.id);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!termId) return;
    setLoading(true); setError('');
    try {
      const sts = await api.get<Student[]>('/api/primary/students');
      const overview = await api.get<ReportStatus[]>(`/api/primary/reports/overview?term_id=${termId}`);
      // overview already has status per student; if empty fill with 'draft'
      if (overview.data.length) {
        setStudents(overview.data);
      } else {
        setStudents(sts.data.map(s => ({ student_id: s.id, student_name: `${s.surname}${s.other_names ? ' '+s.other_names : ''}`, admission_number: s.admission_number, status: 'draft', report_id: null })));
      }
    } catch { setError('Failed to load reports.'); }
    finally { setLoading(false); }
  }, [termId]);

  useEffect(() => { load(); }, [load]);

  async function openStudent(r: ReportStatus) {
    setSelStudent(r); setPanelLoading(true); setFullReport(null);
    try {
      const { data } = await api.get<StudentFullReport>(`/api/primary/reports/student?term_id=${termId}&student_id=${r.student_id}`);
      setFullReport(data);
      setRatings(data.remarks.affective_ratings ?? {});
      setRemarks(data.remarks.class_teacher_remarks ?? '');
    } catch { setError('Failed to load student report.'); }
    finally { setPanelLoading(false); }
  }

  async function saveRemarks() {
    if (!selStudent || !termId) return;
    setSaving(true); setError('');
    try {
      await api.post('/api/primary/reports/remarks', {
        student_id: selStudent.student_id,
        term_id: termId,
        affective_ratings: ratings,
        class_teacher_remarks: remarks,
      });
      await openStudent(selStudent);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  async function submit() {
    if (!selStudent || !termId) return;
    setSubmitting(true); setError('');
    try {
      // Save draft first if needed, which creates the remarks record
      if (!fullReport?.remarks.id) {
        const saved = await api.post('/api/primary/reports/remarks', {
          student_id: selStudent.student_id,
          term_id: termId,
          affective_ratings: ratings,
          class_teacher_remarks: remarks,
        });
        await api.put(`/api/primary/reports/${(saved.data as {id: string}).id}/submit`);
      } else {
        await api.put(`/api/primary/reports/${fullReport.remarks.id}/submit`);
      }
      await load();
      await openStudent({ ...selStudent, status: 'submitted' });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Submit failed.');
    } finally { setSubmitting(false); }
  }

  const canEdit = !selStudent || ['draft','rejected'].includes(selStudent.status);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Term Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">Add remarks and submit end-of-term reports for headmaster approval.</p>
      </div>

      <div className="flex gap-3">
        <select value={termId} onChange={e => setTermId(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Select term…</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Student list */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-700">Students ({students.length})</p>
            </div>
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {students.map(r => (
                  <button key={r.student_id} onClick={() => openStudent(r)}
                    className={`w-full text-left flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors ${selStudent?.student_id === r.student_id ? 'bg-green-50 border-l-2 border-green-600' : ''}`}>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{r.student_name}</p>
                      <p className="text-xs text-slate-400">{r.admission_number}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[r.status] ?? STATUS_BADGE.draft}`}>
                      {r.status}
                    </span>
                  </button>
                ))}
                {students.length === 0 && (
                  <p className="text-center py-10 text-slate-400 text-sm">No students.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Student panel */}
        <div className="lg:col-span-3">
          {!selStudent ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center h-64 text-slate-400 text-sm">
              Select a student to view their report
            </div>
          ) : panelLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center h-64">
              <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
            </div>
          ) : fullReport ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">{fullReport.student.surname}{fullReport.student.other_names ? ` ${fullReport.student.other_names}` : ''}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{fullReport.student.class_name} · {fullReport.term.name}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_BADGE[selStudent.status] ?? STATUS_BADGE.draft}`}>
                  {selStudent.status}
                </span>
              </div>

              {/* Scores summary */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">Academic Performance</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        {['Subject','Class','Exam','Total','Grade','Pos.'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {fullReport.scores.map(s => (
                        <tr key={s.subject_name} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{s.subject_name}</td>
                          <td className="px-3 py-2 text-slate-600">{s.class_score ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{s.exam_score ?? '—'}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{s.total ?? '—'}</td>
                          <td className="px-3 py-2 font-bold text-green-700">{s.grade ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{s.position ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Attendance */}
              {fullReport.attendance && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Attendance</p>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    {[
                      { label: 'Present', val: fullReport.attendance.present, color: 'text-green-700' },
                      { label: 'Absent',  val: fullReport.attendance.absent,  color: 'text-red-600' },
                      { label: 'Late',    val: fullReport.attendance.late,    color: 'text-yellow-600' },
                      { label: 'Excused', val: fullReport.attendance.excused, color: 'text-blue-600' },
                    ].map(a => (
                      <div key={a.label} className="bg-slate-50 rounded-lg py-2">
                        <p className={`text-xl font-black ${a.color}`}>{a.val}</p>
                        <p className="text-xs text-slate-400">{a.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Affective ratings */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Affective Domain</p>
                <div className="grid grid-cols-2 gap-2">
                  {AFFECTIVE.map(trait => (
                    <div key={trait} className="flex items-center justify-between">
                      <span className="text-xs text-slate-700">{trait}</span>
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => canEdit && setRatings(r => ({ ...r, [trait]: n }))}
                            className={`w-6 h-6 rounded-full text-xs font-bold transition-all ${
                              ratings[trait] >= n
                                ? 'text-white shadow-sm'
                                : 'bg-slate-100 text-slate-400'
                            } ${!canEdit ? 'cursor-default' : 'hover:opacity-80'}`}
                            style={ratings[trait] >= n ? { backgroundColor: '#15803D' } : {}}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Class Teacher Remarks</p>
                <textarea value={remarks} onChange={e => canEdit && setRemarks(e.target.value)}
                  disabled={!canEdit} rows={3}
                  placeholder="Enter remarks for this student…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-500" />

                {selStudent.status === 'rejected' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                    Report was rejected. Update remarks and re-submit.
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  {canEdit && (
                    <button onClick={saveRemarks} disabled={saving}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save Draft'}
                    </button>
                  )}
                  {['draft','rejected'].includes(selStudent.status) && (
                    <button onClick={submit} disabled={submitting}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
                      {submitting ? 'Submitting…' : 'Submit for Approval'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
