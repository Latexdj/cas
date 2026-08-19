'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';
import type { AcademicYear } from '@/types/api';

interface NonSubmitter {
  teacher_id: string;
  teacher_name: string;
  department: string | null;
  subject: string;
  class_name: string;
  submission_status: 'not_started' | 'draft' | 'rejected';
  submission_id: string | null;
}

interface NsDebug {
  params: Record<string, unknown>;
  source_counts: Record<string, unknown> & {
    timetable_raw_rows: number | null;
    timetable_distinct_teacher_subject_class: number | null;
    timetable_after_teacher_join: number | null;
    assessments: { total: number | null; with_teacher_id: number | null } | null;
    assessments_after_teacher_join: number | null;
    exam_scores: { total: number | null } | null;
    result_submissions_by_status: { status: string; count: number }[];
  };
  pipeline: Record<string, unknown> & { total_union_candidates: number | null; final_non_submitter_count: number | null };
  samples: { timetable_rows: Record<string, unknown>[]; submission_rows: Record<string, unknown>[] };
}

const selectStyle: React.CSSProperties = {
  border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px',
  fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer', outline: 'none',
};

export default function OutstandingSubmissionsPage() {
  const [years,       setYears]       = useState<AcademicYear[]>([]);
  const [yearId,      setYearId]      = useState('');
  const [semester,    setSemester]    = useState('1');
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [nonSubmitters,        setNonSubmitters]        = useState<NonSubmitter[]>([]);
  const [nonSubmittersLoading, setNonSubmittersLoading] = useState(false);
  const [nsLoadError,          setNsLoadError]          = useState<string | null>(null);
  const [nsClassFilter,        setNsClassFilter]        = useState('');
  const [nsSubjectFilter,      setNsSubjectFilter]      = useState('');
  const [nsDeptFilter,         setNsDeptFilter]         = useState('');
  const [nsDebug,              setNsDebug]              = useState<NsDebug | null>(null);
  const [nsDebugLoading,       setNsDebugLoading]       = useState(false);

  useEffect(() => {
    api.get<AcademicYear[]>('/api/academic-years').then(r => {
      setYears(r.data);
      const current = r.data.find(y => y.is_current);
      if (current) { setYearId(current.id); setSemester(String(current.current_semester ?? 1)); }
      else if (r.data[0]) setYearId(r.data[0].id);
    }).catch(() => {}).finally(() => setLoadingMeta(false));
  }, []);

  const loadNonSubmitters = useCallback(async () => {
    if (!yearId || !semester) return;
    setNonSubmittersLoading(true);
    setNsLoadError(null);
    try {
      const params = new URLSearchParams({ academic_year_id: yearId, semester });
      const { data } = await api.get<NonSubmitter[]>(`/api/result-submissions/non-submitters?${params}`);
      setNonSubmitters(data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load.';
      setNsLoadError(msg);
    } finally { setNonSubmittersLoading(false); }
  }, [yearId, semester]);

  useEffect(() => { if (yearId) loadNonSubmitters(); }, [loadNonSubmitters, yearId]);

  const nsClasses  = [...new Set(nonSubmitters.map(n => n.class_name))].sort();
  const nsSubjects = [...new Set(nonSubmitters.map(n => n.subject))].sort();
  const nsDepts    = [...new Set(nonSubmitters.map(n => n.department).filter(Boolean))].sort() as string[];
  const filteredNs = nonSubmitters
    .filter(n => !nsClassFilter   || n.class_name === nsClassFilter)
    .filter(n => !nsSubjectFilter || n.subject    === nsSubjectFilter)
    .filter(n => !nsDeptFilter    || n.department === nsDeptFilter);
  const { displayRows: nsRows, total: nsTotal, page: nsPage, setPage: setNsPage, pageSize: nsPageSize, setPageSize: setNsPageSize } = useTableControls(filteredNs);

  async function runDiagnostic() {
    setNsDebugLoading(true); setNsDebug(null);
    try {
      const params = new URLSearchParams({ academic_year_id: yearId, semester });
      const { data } = await api.get<NsDebug>(`/api/result-submissions/non-submitters/debug?${params}`);
      setNsDebug(data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Diagnostic failed';
      alert(msg);
    } finally { setNsDebugLoading(false); }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1C1208]">Outstanding Submissions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Teachers who have not yet submitted results to the HOD</p>
        </div>
        {nonSubmitters.length > 0 && (
          <span style={{ background: '#C8780A', color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
            {nonSubmitters.length} not submitted
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500">Academic Year</label>
          <select value={yearId} onChange={e => { setYearId(e.target.value); setNsDebug(null); }} style={selectStyle} disabled={loadingMeta}>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500">Semester</label>
          <select value={semester} onChange={e => { setSemester(e.target.value); setNsDebug(null); }} style={selectStyle}>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>
        <button onClick={loadNonSubmitters}
          style={{ marginLeft: 'auto', background: '#F5F0E8', color: '#4A3F32', border: '1px solid #E2D9CC', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      {/* Main content */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {nonSubmittersLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-[#145C44] border-b-transparent animate-spin" />
          </div>
        ) : nsLoadError ? (
          <div style={{ padding: 24 }}>
            <p style={{ textAlign: 'center', color: '#B83232', fontSize: 13, marginBottom: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 14px' }}>
              Query error: {nsLoadError}
            </p>
            <div style={{ textAlign: 'center' }}>
              <button onClick={runDiagnostic} disabled={nsDebugLoading}
                style={{ background: '#F5F0E8', border: '1px solid #E2D9CC', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#4A3F32', cursor: 'pointer' }}>
                {nsDebugLoading ? 'Running...' : 'Run Diagnostic'}
              </button>
            </div>
          </div>
        ) : nonSubmitters.length === 0 ? (
          <div style={{ padding: 24 }}>
            <p style={{ textAlign: 'center', color: '#145C44', fontSize: 13, marginBottom: 16 }}>
              No outstanding submissions detected for the selected year and semester.
            </p>
            <div style={{ textAlign: 'center' }}>
              <button onClick={runDiagnostic} disabled={nsDebugLoading}
                style={{ background: '#F5F0E8', border: '1px solid #E2D9CC', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#4A3F32', cursor: 'pointer' }}>
                {nsDebugLoading ? 'Running...' : 'Run Diagnostic'}
              </button>
            </div>
            {nsDebug && <DiagnosticPanel debug={nsDebug} />}
          </div>
        ) : (
          <>
            {/* Table filters */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
              <select value={nsClassFilter} onChange={e => { setNsClassFilter(e.target.value); setNsPage(1); }}
                style={{ ...selectStyle, fontSize: 12, padding: '5px 10px', color: nsClassFilter ? '#0B3D2E' : '#64748B', background: nsClassFilter ? '#E8F4EE' : '#fff', fontWeight: nsClassFilter ? 600 : 400 }}>
                <option value="">All Classes</option>
                {nsClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={nsSubjectFilter} onChange={e => { setNsSubjectFilter(e.target.value); setNsPage(1); }}
                style={{ ...selectStyle, fontSize: 12, padding: '5px 10px', color: nsSubjectFilter ? '#0B3D2E' : '#64748B', background: nsSubjectFilter ? '#E8F4EE' : '#fff', fontWeight: nsSubjectFilter ? 600 : 400 }}>
                <option value="">All Subjects</option>
                {nsSubjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {nsDepts.length > 0 && (
                <select value={nsDeptFilter} onChange={e => { setNsDeptFilter(e.target.value); setNsPage(1); }}
                  style={{ ...selectStyle, fontSize: 12, padding: '5px 10px', color: nsDeptFilter ? '#0B3D2E' : '#64748B', background: nsDeptFilter ? '#E8F4EE' : '#fff', fontWeight: nsDeptFilter ? 600 : 400 }}>
                  <option value="">All Departments</option>
                  {nsDepts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              {(nsClassFilter || nsSubjectFilter || nsDeptFilter) && (
                <button onClick={() => { setNsClassFilter(''); setNsSubjectFilter(''); setNsDeptFilter(''); setNsPage(1); }}
                  style={{ fontSize: 11, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  Clear filters
                </button>
              )}
              <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
                {filteredNs.length === nonSubmitters.length ? `${nonSubmitters.length} outstanding` : `${filteredNs.length} of ${nonSubmitters.length} outstanding`}
              </span>
            </div>

            {filteredNs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: 13 }}>
                No results match the active filters.{' '}
                <button onClick={() => { setNsClassFilter(''); setNsSubjectFilter(''); setNsDeptFilter(''); setNsPage(1); }}
                  style={{ color: '#145C44', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Clear all</button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F5F0E8', borderBottom: '1px solid #E2E8F0' }}>
                      {['Teacher', 'Department', 'Subject', 'Class', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(nsRows as NonSubmitter[]).map((item, idx) => (
                      <tr key={`${item.teacher_id}-${item.subject}-${item.class_name}`} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 600, color: '#1C1208' }}>{item.teacher_name}</td>
                        <td style={{ padding: '11px 14px', color: '#64748B' }}>{item.department ?? '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#374151' }}>{item.subject}</td>
                        <td style={{ padding: '11px 14px', color: '#374151' }}>{item.class_name}</td>
                        <td style={{ padding: '11px 14px' }}>
                          {item.submission_status === 'draft' ? (
                            <span style={{ background: '#FEF3C7', color: '#C8780A', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>Draft</span>
                          ) : item.submission_status === 'rejected' ? (
                            <span style={{ background: '#FEF2F2', color: '#B83232', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>Rejected -- Needs Resubmission</span>
                          ) : (
                            <span style={{ background: '#F1F5F9', color: '#475569', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>Not Submitted to HOD</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={nsPage} pageSize={nsPageSize} total={nsTotal} onPage={setNsPage} onPageSize={s => { setNsPageSize(s); setNsPage(1); }} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DiagnosticPanel({ debug }: { debug: NsDebug }) {
  return (
    <div style={{ marginTop: 16, border: '1px solid #E2D9CC', borderRadius: 10, overflow: 'hidden', fontSize: 12 }}>
      <div style={{ background: '#F5F0E8', padding: '8px 14px', fontWeight: 700, color: '#2C2218', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Diagnostic -- Semester {String(debug.params.semester)}
      </div>
      {[
        { label: 'Timetable raw rows',              value: debug.source_counts.timetable_raw_rows,                              note: debug.source_counts.timetable_raw_error as string | undefined },
        { label: 'Timetable after LATERAL unnest',  value: debug.source_counts.timetable_distinct_teacher_subject_class,        note: debug.source_counts.timetable_distinct_error as string | undefined },
        { label: 'Timetable after JOIN teachers',   value: debug.source_counts.timetable_after_teacher_join,                   note: debug.source_counts.timetable_join_error as string | undefined },
        { label: 'Assessments raw',                 value: debug.source_counts.assessments?.total ?? null,                     note: debug.source_counts.assessments_error as string | undefined },
        { label: 'Assessments after JOIN teachers', value: debug.source_counts.assessments_after_teacher_join,                 note: debug.source_counts.assessments_join_error as string | undefined },
        { label: 'Exam scores raw',                 value: debug.source_counts.exam_scores?.total ?? null,                     note: debug.source_counts.exam_error as string | undefined },
        { label: 'Union candidates (all 4 sources)',value: debug.pipeline.total_union_candidates,                               note: debug.pipeline.union_error as string | undefined },
      ].map(row => (
        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 14px', borderTop: '1px solid #F1F5F9' }}>
          <span style={{ color: '#4A3F32' }}>{row.label}</span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: row.value === null ? '#B83232' : row.value === 0 ? '#B83232' : '#145C44' }}>{row.value ?? 'ERR'}</span>
            {row.note && <span style={{ color: (row.value === null || String(row.note).length > 30) ? '#B83232' : '#8C7E6E', fontSize: 11, maxWidth: 260, wordBreak: 'break-word' }}>{row.note}</span>}
          </span>
        </div>
      ))}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #F1F5F9' }}>
        <span style={{ color: '#4A3F32' }}>Result submissions by status</span>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {debug.source_counts.result_submissions_by_status.length === 0
            ? <span style={{ color: '#B83232', fontWeight: 700 }}>None</span>
            : debug.source_counts.result_submissions_by_status.map(s => (
                <span key={s.status} style={{ background: '#F5F0E8', border: '1px solid #E2D9CC', borderRadius: 6, padding: '2px 10px', fontSize: 11, color: '#2C2218' }}>
                  {s.status}: <strong>{s.count}</strong>
                </span>
              ))}
        </div>
      </div>
      {debug.samples.timetable_rows.length > 0 && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid #F1F5F9' }}>
          <div style={{ color: '#4A3F32', marginBottom: 4 }}>Sample timetable rows</div>
          {debug.samples.timetable_rows.map((r, i) => (
            <div key={i} style={{ color: '#64748B', fontSize: 11 }}>{String(r.teacher_name)} · {String(r.subject)} · {String(r.class_names ?? r.class_name)}</div>
          ))}
        </div>
      )}
      {debug.samples.submission_rows.length > 0 && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid #F1F5F9' }}>
          <div style={{ color: '#4A3F32', marginBottom: 4 }}>Sample submission rows</div>
          {debug.samples.submission_rows.map((r, i) => (
            <div key={i} style={{ color: '#64748B', fontSize: 11 }}>{String(r.teacher_name)} · {String(r.subject)} · {String(r.class_name)} -- <strong>{String(r.status)}</strong></div>
          ))}
        </div>
      )}
    </div>
  );
}
