'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';
import type { AcademicYear, StudentResult } from '@/types/api';

interface FinalQueueItem {
  id: string;
  subject: string;
  class_name: string;
  status: 'submitted' | 'hod_approved' | 'final_approved' | 'published';
  submitted_at: string;
  hod_reviewed_at: string | null;
  hod_comment: string | null;
  final_reviewed_at: string | null;
  final_comment: string | null;
  rejected_reason: string | null;
  published_at: string | null;
  academic_year_id: string;
  teacher_name: string;
  hod_name: string | null;
  academic_year: string;
  semester: number;
  student_count: number;
}

const SUB_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  submitted:      { label: 'Awaiting HOD',   color: '#B83232', bg: '#FEF2F2' },
  hod_approved:   { label: 'HOD Approved',   color: '#C8780A', bg: '#FEF3C7' },
  final_approved: { label: 'Final Approved', color: '#145C44', bg: '#E8F4EE' },
  published:      { label: 'Published',      color: '#0B3D2E', bg: '#D1EAD9' },
};

interface AssessmentCheck { label: string; modeName: string; actedOn: number; total: number; complete: boolean; }
interface ReadinessData {
  totalStudents:  number;
  examScoredCount: number;
  examComplete:   boolean;
  missingModes:   string[];
  assessments:    AssessmentCheck[];
  canApprove:     boolean;
}

const selectStyle: React.CSSProperties = {
  border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px',
  fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer', outline: 'none',
};

export default function ResultApprovalsPage() {
  const [years,       setYears]       = useState<AcademicYear[]>([]);
  const [yearId,      setYearId]      = useState('');
  const [semester,    setSemester]    = useState('1');
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [queue,          setQueue]          = useState<FinalQueueItem[]>([]);
  const [queueLoading,   setQueueLoading]   = useState(false);
  const [statusFilter,   setStatusFilter]   = useState<'all' | 'submitted' | 'hod_approved' | 'final_approved' | 'published'>('all');
  const [classFilter,    setClassFilter]    = useState('');
  const [subjectFilter,  setSubjectFilter]  = useState('');

  const [target,          setTarget]          = useState<FinalQueueItem | null>(null);
  const [action,          setAction]          = useState<'hod_approve' | 'hod_reject' | 'approve' | 'reject' | 'publish' | 'unlock'>('approve');
  const [comment,         setComment]         = useState('');
  const [acting,          setActing]          = useState(false);
  const [actionError,     setActionError]     = useState('');
  const [previewResults,  setPreviewResults]  = useState<StudentResult[]>([]);
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [previewError,    setPreviewError]    = useState('');
  const [readiness,       setReadiness]       = useState<ReadinessData | null>(null);
  const [readinessLoading,setReadinessLoading]= useState(false);
  const [readinessError,  setReadinessError]  = useState('');

  useEffect(() => {
    api.get<AcademicYear[]>('/api/academic-years').then(r => {
      setYears(r.data);
      const current = r.data.find(y => y.is_current);
      if (current) { setYearId(current.id); setSemester(String(current.current_semester ?? 1)); }
      else if (r.data[0]) setYearId(r.data[0].id);
    }).catch(() => {}).finally(() => setLoadingMeta(false));
  }, []);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const params = new URLSearchParams();
      if (yearId) params.set('academic_year_id', yearId);
      if (semester) params.set('semester', semester);
      const { data } = await api.get<FinalQueueItem[]>(`/api/result-submissions/final-queue?${params}`);
      setQueue(data);
    } catch { /* non-fatal */ }
    finally { setQueueLoading(false); }
  }, [yearId, semester]);

  useEffect(() => { if (yearId) loadQueue(); }, [loadQueue, yearId]);

  async function openModal(item: FinalQueueItem, act: typeof action) {
    setTarget(item); setAction(act); setComment(''); setActionError('');
    setPreviewResults([]); setPreviewError(''); setReadiness(null); setReadinessError('');

    if (act === 'approve' || act === 'hod_approve' || act === 'publish') {
      const fetches: Promise<void>[] = [
        (async () => {
          setPreviewLoading(true);
          try {
            const { data } = await api.get<StudentResult[]>('/api/results', {
              params: { academic_year_id: item.academic_year_id, semester: item.semester, class_name: item.class_name },
            });
            setPreviewResults(data);
          } catch { setPreviewError('Could not load results preview.'); }
          finally { setPreviewLoading(false); }
        })(),
      ];
      if (act === 'approve' || act === 'hod_approve') {
        fetches.push((async () => {
          setReadinessLoading(true);
          try {
            const { data } = await api.get<ReadinessData>(`/api/result-submissions/submission-readiness?submission_id=${item.id}`);
            setReadiness(data);
          } catch { setReadinessError('Could not load completeness check.'); }
          finally { setReadinessLoading(false); }
        })());
      }
      await Promise.all(fetches);
    }
  }

  async function doAction() {
    if (!target) return;
    if ((action === 'reject' || action === 'hod_reject' || action === 'unlock') && !comment.trim()) {
      setActionError('A reason is required.'); return;
    }
    setActing(true); setActionError('');
    try {
      if (action === 'hod_approve') {
        await api.post('/api/result-submissions/hod-review', { submission_id: target.id, action: 'approve', comment: comment.trim() || undefined });
      } else if (action === 'hod_reject') {
        await api.post('/api/result-submissions/hod-review', { submission_id: target.id, action: 'reject', comment: comment.trim() });
      } else if (action === 'approve') {
        await api.post('/api/result-submissions/final-review', { submission_id: target.id, action: 'approve', comment: comment.trim() || undefined });
      } else if (action === 'reject') {
        await api.post('/api/result-submissions/final-review', { submission_id: target.id, action: 'reject', comment: comment.trim() });
      } else if (action === 'publish') {
        await api.post('/api/result-submissions/publish', { submission_id: target.id });
      } else if (action === 'unlock') {
        await api.post('/api/result-submissions/unlock', { submission_id: target.id, reason: comment.trim() });
      }
      setTarget(null); setComment('');
      loadQueue();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setActionError(msg ?? 'Action failed.');
    } finally { setActing(false); }
  }

  async function publishAll() {
    if (!yearId || !semester) return;
    try {
      await api.post('/api/result-submissions/publish', { academic_year_id: yearId, semester: Number(semester) });
      loadQueue();
    } catch { /* ignore */ }
  }

  const queueClasses  = [...new Set(queue.map(q => q.class_name))].sort();
  const queueSubjects = [...new Set(queue.map(q => q.subject))].sort();
  const filtered = queue
    .filter(q => statusFilter === 'all' || q.status === statusFilter)
    .filter(q => !classFilter   || q.class_name === classFilter)
    .filter(q => !subjectFilter || q.subject     === subjectFilter);
  const { displayRows, total, page, setPage, pageSize, setPageSize } = useTableControls(filtered);
  const pendingCount = queue.filter(q => q.status === 'submitted' || q.status === 'hod_approved').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1C1208]">Result Approvals</h1>
          <p className="text-sm text-slate-500 mt-0.5">Review and approve submitted results from teachers</p>
        </div>
        {pendingCount > 0 && (
          <span style={{ background: '#B83232', color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500">Academic Year</label>
          <select value={yearId} onChange={e => setYearId(e.target.value)} style={selectStyle} disabled={loadingMeta}>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500">Semester</label>
          <select value={semester} onChange={e => setSemester(e.target.value)} style={selectStyle}>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>
        <button onClick={publishAll} style={{ marginLeft: 'auto', background: '#145C44', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Publish All Final-Approved
        </button>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {queueLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-[#145C44] border-b-transparent animate-spin" />
          </div>
        ) : queue.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No submissions in queue for the selected year and semester.</div>
        ) : (
          <>
            {/* Status tabs */}
            <div className="flex gap-2 flex-wrap px-4 pt-4 pb-2 border-b border-slate-100">
              {([
                { key: 'all',            label: 'All',            count: queue.length },
                { key: 'submitted',      label: 'Awaiting HOD',   count: queue.filter(q => q.status === 'submitted').length },
                { key: 'hod_approved',   label: 'HOD Approved',   count: queue.filter(q => q.status === 'hod_approved').length },
                { key: 'final_approved', label: 'Final Approved', count: queue.filter(q => q.status === 'final_approved').length },
                { key: 'published',      label: 'Published',      count: queue.filter(q => q.status === 'published').length },
              ] as const).map(({ key, label, count }) => {
                const active = statusFilter === key;
                return (
                  <button key={key} onClick={() => { setStatusFilter(key); setPage(1); }}
                    style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: active ? 'none' : '1px solid #E2E8F0',
                      background: active ? '#0B3D2E' : '#F5F0E8', color: active ? '#fff' : '#64748B' }}>
                    {label}
                    <span style={{ marginLeft: 5, background: active ? 'rgba(255,255,255,0.25)' : '#E2E8F0', color: active ? '#fff' : '#374151', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Class/subject filters */}
            <div className="flex gap-2 flex-wrap items-center px-4 py-3 border-b border-slate-100">
              <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(1); }}
                style={{ ...selectStyle, fontSize: 12, padding: '5px 10px', color: classFilter ? '#0B3D2E' : '#64748B', background: classFilter ? '#E8F4EE' : '#fff', fontWeight: classFilter ? 600 : 400 }}>
                <option value="">All Classes</option>
                {queueClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={subjectFilter} onChange={e => { setSubjectFilter(e.target.value); setPage(1); }}
                style={{ ...selectStyle, fontSize: 12, padding: '5px 10px', color: subjectFilter ? '#0B3D2E' : '#64748B', background: subjectFilter ? '#E8F4EE' : '#fff', fontWeight: subjectFilter ? 600 : 400 }}>
                <option value="">All Subjects</option>
                {queueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {(classFilter || subjectFilter) && (
                <button onClick={() => { setClassFilter(''); setSubjectFilter(''); setPage(1); }}
                  style={{ fontSize: 11, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  Clear filters
                </button>
              )}
              <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
                {filtered.length === queue.length ? `${queue.length} submissions` : `${filtered.length} of ${queue.length}`}
              </span>
            </div>

            {filtered.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                No submissions match the active filters.{' '}
                <button onClick={() => { setStatusFilter('all'); setClassFilter(''); setSubjectFilter(''); setPage(1); }}
                  style={{ color: '#145C44', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear all filters</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F5F0E8', borderBottom: '1px solid #E2E8F0' }}>
                      {['Subject', 'Class', 'Teacher', 'HOD', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(displayRows as typeof queue).map(item => {
                      const sc = SUB_STATUS[item.status] ?? { label: item.status, color: '#64748B', bg: '#F1F5F9' };
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '11px 14px', fontWeight: 500, color: '#1C1208' }}>{item.subject}</td>
                          <td style={{ padding: '11px 14px', color: '#374151' }}>{item.class_name}</td>
                          <td style={{ padding: '11px 14px', color: '#374151' }}>{item.teacher_name}</td>
                          <td style={{ padding: '11px 14px', color: '#374151' }}>{item.hod_name ?? '—'}</td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{ background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>{sc.label}</span>
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {item.status === 'submitted' && (
                                <>
                                  <button onClick={() => openModal(item, 'hod_approve')}
                                    style={{ background: '#0B3D2E', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                    Approve as HOD
                                  </button>
                                  <button onClick={() => openModal(item, 'hod_reject')}
                                    style={{ background: '#FEF2F2', color: '#B83232', border: '1px solid #FECACA', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                    Reject
                                  </button>
                                </>
                              )}
                              {item.status === 'hod_approved' && (
                                <>
                                  <button onClick={() => openModal(item, 'approve')}
                                    style={{ background: '#145C44', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                    Final Approve
                                  </button>
                                  <button onClick={() => openModal(item, 'reject')}
                                    style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                    Reject
                                  </button>
                                </>
                              )}
                              {item.status === 'final_approved' && (
                                <button onClick={() => openModal(item, 'publish')}
                                  style={{ background: '#145C44', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                  Publish
                                </button>
                              )}
                              {item.status === 'published' && (
                                <button onClick={() => openModal(item, 'unlock')}
                                  style={{ background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                  Unlock
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={s => { setPageSize(s); setPage(1); }} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Action modal */}
      {target && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setTarget(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 48px)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1C1208', marginBottom: 4 }}>
                {action === 'hod_approve' ? 'Approve as HOD' : action === 'hod_reject' ? 'Reject & Return (HOD)' : action === 'approve' ? 'Final Approval' : action === 'publish' ? 'Publish Results' : action === 'unlock' ? 'Unlock Submission' : 'Reject & Return'}
              </h3>
              <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{target.subject} · {target.class_name} · {target.teacher_name}</p>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {(action === 'hod_approve' || action === 'hod_reject') && (
                <div style={{ background: '#FFF7ED', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#92400E' }}>
                  You are acting on behalf of the HOD. This submission has not yet been reviewed by the assigned HOD.
                </div>
              )}
              {(action === 'approve' || action === 'hod_approve') && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scores Completeness</p>
                  {readinessLoading ? (
                    <div style={{ textAlign: 'center', padding: '10px 0', color: '#94A3B8', fontSize: 12 }}>Checking...</div>
                  ) : readinessError ? (
                    <p style={{ fontSize: 12, color: '#DC2626' }}>{readinessError}</p>
                  ) : readiness ? (() => {
                    const tick = (ok: boolean) => ok
                      ? <span style={{ color: '#145C44', fontWeight: 700, marginRight: 6 }}>✓</span>
                      : <span style={{ color: '#DC2626', fontWeight: 700, marginRight: 6 }}>✗</span>;
                    const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', fontSize: 12, borderBottom: '1px solid #F1F5F9' };
                    return (
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', background: readiness.canApprove ? '#F0FDF4' : '#FFF7ED' }}>
                        <div style={rowStyle}>
                          <span style={{ display: 'flex', alignItems: 'center' }}>{tick(readiness.examComplete)}<span style={{ color: '#374151' }}>Exam scores</span></span>
                          <span style={{ fontWeight: 600, color: readiness.examComplete ? '#145C44' : '#DC2626' }}>{readiness.examScoredCount} / {readiness.totalStudents} students</span>
                        </div>
                        {readiness.missingModes.map(m => (
                          <div key={m} style={rowStyle}>
                            <span style={{ display: 'flex', alignItems: 'center' }}>{tick(false)}<span style={{ color: '#374151' }}>{m} <span style={{ color: '#94A3B8', fontSize: 11 }}>(no assessment created)</span></span></span>
                            <span style={{ fontWeight: 600, color: '#DC2626' }}>Missing</span>
                          </div>
                        ))}
                        {readiness.assessments.map(a => (
                          <div key={a.label} style={rowStyle}>
                            <span style={{ display: 'flex', alignItems: 'center' }}>{tick(a.complete)}<span style={{ color: '#374151' }}>{a.label} <span style={{ color: '#94A3B8', fontSize: 11 }}>({a.modeName})</span></span></span>
                            <span style={{ fontWeight: 600, color: a.complete ? '#145C44' : '#DC2626' }}>{a.actedOn} / {a.total} students</span>
                          </div>
                        ))}
                        <div style={{ padding: '7px 10px', background: readiness.canApprove ? '#DCFCE7' : '#FEE2E2', fontSize: 12, fontWeight: 700, color: readiness.canApprove ? '#145C44' : '#DC2626' }}>
                          {readiness.canApprove ? '✓ All scores complete — safe to approve' : '✗ Scores incomplete — reject back to teacher to fix'}
                        </div>
                      </div>
                    );
                  })() : null}
                </div>
              )}
              {(action === 'approve' || action === 'hod_approve' || action === 'publish') && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Results Preview</p>
                  {previewLoading ? (
                    <div style={{ textAlign: 'center', padding: '14px 0', color: '#94A3B8', fontSize: 12 }}>Loading results...</div>
                  ) : previewError ? (
                    <p style={{ fontSize: 12, color: '#DC2626' }}>{previewError}</p>
                  ) : previewResults.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>No result data found for this class.</p>
                  ) : (() => {
                    const subject = target.subject;
                    const sortedPrev = [...previewResults].sort((a, b) => {
                      const aS = a.subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase());
                      const bS = b.subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase());
                      return (bS?.total ?? -1) - (aS?.total ?? -1);
                    });
                    const missing = previewResults.length - sortedPrev.filter(r => r.subjects.some(s => s.subject.toLowerCase() === subject.toLowerCase())).length;
                    return (
                      <>
                        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#F5F0E8', zIndex: 1 }}>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                {['Student', 'CA', 'Exam', 'Total', 'Grade'].map(h => (
                                  <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Student' ? 'left' : 'center', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sortedPrev.map((student, idx) => {
                                const sub = student.subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase());
                                return (
                                  <tr key={student.student_id} style={{ borderTop: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                                    <td style={{ padding: '6px 10px', fontWeight: 500, color: '#1C1208' }}>{student.name}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', color: '#374151' }}>{sub?.ca_score != null ? sub.ca_score.toFixed(1) : '—'}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', color: '#374151' }}>{sub?.exam_score != null ? sub.exam_score.toFixed(1) : '—'}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: '#1C1208' }}>{sub?.total != null ? sub.total : '—'}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: sub?.grade?.startsWith('F') || sub?.grade === 'E8' ? '#DC2626' : '#145C44' }}>{sub?.grade ?? '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {missing > 0 && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 6 }}>⚠ {missing} student{missing !== 1 ? 's' : ''} have no score for {subject}</p>}
                      </>
                    );
                  })()}
                </div>
              )}
              {action === 'publish' && (
                <p style={{ fontSize: 13, color: '#374151', background: '#FEF3C7', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                  This will make results visible to students immediately. This action can be undone with Unlock.
                </p>
              )}
              {(action === 'reject' || action === 'hod_reject' || action === 'unlock' || action === 'approve' || action === 'hod_approve') && (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    {action === 'reject' || action === 'hod_reject' || action === 'unlock' ? 'Reason (required)' : 'Comment (optional)'}
                  </label>
                  <textarea value={comment} onChange={e => { setComment(e.target.value); setActionError(''); }} rows={3}
                    placeholder={action === 'unlock' ? 'Why is this being unlocked?' : (action === 'reject' || action === 'hod_reject') ? 'Why is this being returned?' : 'Optional note...'}
                    style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                </>
              )}
            </div>
            <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
              {actionError && <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 8 }}>{actionError}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setTarget(null)}
                  style={{ flex: 1, padding: '9px 0', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={doAction}
                  disabled={acting || ((action === 'approve' || action === 'hod_approve') && readiness !== null && !readiness.canApprove)}
                  style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    cursor: (acting || ((action === 'approve' || action === 'hod_approve') && readiness !== null && !readiness.canApprove)) ? 'not-allowed' : 'pointer',
                    opacity: (acting || ((action === 'approve' || action === 'hod_approve') && readiness !== null && !readiness.canApprove)) ? 0.45 : 1,
                    background: (action === 'reject' || action === 'hod_reject') ? '#B83232' : action === 'unlock' ? '#64748B' : '#145C44',
                    color: '#fff' }}>
                  {acting ? '...' : action === 'hod_approve' ? 'Approve as HOD' : action === 'hod_reject' ? 'Reject & Return' : action === 'approve' ? 'Final Approve' : action === 'publish' ? 'Publish' : action === 'unlock' ? 'Unlock' : 'Reject & Return'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
