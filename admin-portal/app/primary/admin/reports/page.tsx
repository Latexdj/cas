'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Term { id: string; name: string; academic_year_id: string; is_current: boolean; }
interface AcademicYear { id: string; name: string; is_current: boolean; }
interface ReportSummary {
  class_name: string;
  total_students: number;
  draft_count: number;
  submitted_count: number;
  approved_count: number;
  rejected_count: number;
}
interface StudentReport {
  student_id: string;
  student_name: string;
  admission_number: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  report_id: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft:     'text-slate-600 bg-slate-100',
  submitted: 'text-blue-700 bg-blue-50',
  approved:  'text-green-700 bg-green-50',
  rejected:  'text-red-700 bg-red-50',
};

export default function PrimaryReportsPage() {
  const [years,    setYears]    = useState<AcademicYear[]>([]);
  const [terms,    setTerms]    = useState<Term[]>([]);
  const [yearId,   setYearId]   = useState('');
  const [termId,   setTermId]   = useState('');
  const [summary,  setSummary]  = useState<ReportSummary[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // drill-down
  const [drillClass,   setDrillClass]   = useState('');
  const [classReports, setClassReports] = useState<StudentReport[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  // headmaster action
  const [actionId,  setActionId]  = useState('');
  const [remarks,   setRemarks]   = useState('');
  const [showPanel, setShowPanel] = useState<'approve' | 'reject' | null>(null);
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    Promise.all([api.get<AcademicYear[]>('/api/academic-years')])
      .then(([yr]) => {
        setYears(yr.data);
        const cur = yr.data.find(y => y.is_current);
        if (cur) setYearId(cur.id);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!yearId) return;
    api.get<Term[]>(`/api/primary/terms?academic_year_id=${yearId}`)
      .then(r => {
        setTerms(r.data);
        const cur = r.data.find(t => t.is_current);
        if (cur) setTermId(cur.id);
      }).catch(() => {});
  }, [yearId]);

  const load = useCallback(async () => {
    if (!termId) return;
    setLoading(true); setError(''); setDrillClass(''); setClassReports([]);
    try {
      const { data } = await api.get<ReportSummary[]>(`/api/primary/reports/overview?term_id=${termId}`);
      setSummary(data);
    } catch { setError('Failed to load report overview.'); }
    finally { setLoading(false); }
  }, [termId]);

  useEffect(() => { load(); }, [load]);

  async function drillDown(className: string) {
    setDrillClass(className); setDrillLoading(true);
    try {
      const { data } = await api.get<StudentReport[]>(`/api/primary/reports/overview?term_id=${termId}&class_name=${encodeURIComponent(className)}`);
      setClassReports(data);
    } catch { setError('Failed to load class detail.'); }
    finally { setDrillLoading(false); }
  }

  async function doAction(type: 'approve' | 'reject') {
    setActioning(true);
    try {
      if (type === 'approve') {
        await api.put(`/api/primary/reports/${actionId}/approve`, { headmaster_remarks: remarks || null });
      } else {
        await api.put(`/api/primary/reports/${actionId}/reject`, { headmaster_remarks: remarks || null });
      }
      setShowPanel(null); setRemarks(''); setActionId('');
      await drillDown(drillClass);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Action failed.');
    } finally { setActioning(false); }
  }

  function openAction(reportId: string, type: 'approve' | 'reject') {
    setActionId(reportId); setRemarks(''); setShowPanel(type);
  }

  const selectedTerm = terms.find(t => t.id === termId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Report Approvals</h1>
        <p className="text-sm text-slate-500 mt-0.5">Review and approve end-of-term report cards submitted by class teachers.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-3 shadow-sm">
        <select value={yearId} onChange={e => setYearId(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Year…</option>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select value={termId} onChange={e => setTermId(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Term…</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {drillClass && (
          <button onClick={() => { setDrillClass(''); setClassReports([]); }}
            className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            ← All Classes
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : !drillClass ? (
        // Overview grid
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary.map(cls => {
            const total = cls.total_students;
            const approvedPct = total ? Math.round(cls.approved_count / total * 100) : 0;
            return (
              <button key={cls.class_name} onClick={() => drillDown(cls.class_name)}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left hover:border-green-300 hover:shadow-md transition-all">
                <p className="font-bold text-slate-900">{cls.class_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{selectedTerm?.name}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="text-center p-1.5 rounded-lg bg-slate-50">
                    <p className="font-bold text-slate-700">{cls.draft_count}</p>
                    <p className="text-slate-400">Draft</p>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-blue-50">
                    <p className="font-bold text-blue-700">{cls.submitted_count}</p>
                    <p className="text-blue-500">Submitted</p>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-green-50">
                    <p className="font-bold text-green-700">{cls.approved_count}</p>
                    <p className="text-green-500">Approved</p>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-red-50">
                    <p className="font-bold text-red-700">{cls.rejected_count}</p>
                    <p className="text-red-400">Rejected</p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Progress</span><span>{approvedPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${approvedPct}%`, backgroundColor: '#15803D' }} />
                  </div>
                </div>
              </button>
            );
          })}
          {summary.length === 0 && (
            <div className="col-span-3 text-center py-12 text-slate-400 text-sm">
              No data for this term. Select a term to view reports.
            </div>
          )}
        </div>
      ) : (
        // Class drill-down
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="font-bold text-slate-900">{drillClass} — {selectedTerm?.name}</p>
            <p className="text-xs text-slate-400">{classReports.length} students</p>
          </div>
          {drillLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {classReports.map(r => (
                <div key={r.student_id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{r.student_name}</p>
                    <p className="text-xs text-slate-400">{r.admission_number}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[r.status] ?? STATUS_BADGE.draft}`}>
                      {r.status}
                    </span>
                    {r.status === 'submitted' && r.report_id && (
                      <div className="flex gap-2">
                        <button onClick={() => openAction(r.report_id!, 'approve')}
                          className="text-xs px-2.5 py-1 rounded-md border border-green-200 text-green-700 hover:bg-green-50 font-semibold">
                          Approve
                        </button>
                        <button onClick={() => openAction(r.report_id!, 'reject')}
                          className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50">
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {classReports.length === 0 && (
                <p className="text-center py-10 text-slate-400 text-sm">No student reports found for this class.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Approve/Reject panel */}
      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-slate-900 capitalize">{showPanel} Report</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Headmaster Remarks (optional)</label>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
                placeholder={showPanel === 'reject' ? 'Reason for rejection…' : 'Overall remarks for the student…'}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowPanel(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button onClick={() => doAction(showPanel)} disabled={actioning}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${showPanel === 'approve' ? '' : 'bg-red-600'}`}
                style={showPanel === 'approve' ? { backgroundColor: '#15803D' } : {}}>
                {actioning ? 'Processing…' : showPanel === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
