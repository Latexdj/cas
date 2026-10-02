'use client';
import { useState, useEffect, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import { buildFeePaymentListHtml, computePaymentStatus, type FeeStatusRow } from '@/lib/fee-report-print';
import type { SlSchool } from '@/lib/sign-list-print';

interface AcademicYear { id: string; name: string; is_current: boolean; }
interface ClassLevel { id: string; name: string; }

interface ScheduleRow {
  schedule_id: string;
  fee_item_name: string;
  class_name: string | null;
  semester: number | null;
  academic_year_name: string | null;
  scheduled_amount: number;
  bill_count: number;
  total_billed: number;
  total_collected: number;
}
interface ByScheduleResponse {
  schedules: ScheduleRow[];
  unscheduled: { bill_count: number; total_billed: number; total_collected: number };
  adhoc_total: number;
}

function fmtGHS(n: number) {
  return `GH₵ ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const card = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700';
const inputCls = 'text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none';
const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';

// Shared between the admin Fees page and the staff-portal Accounts section —
// identical behavior in both places (one report, not two divergent copies).
// `apiClient` is required, not defaulted to the admin `api` singleton from
// '@/lib/api': staff-portal reads its auth token from a *different* source
// (its own `staffApi()`, shadowing the name `api` locally in that page) and
// its 401 handling redirects to the staff login, not /login — defaulting to
// the admin client here would silently send the wrong token (or none) for
// every staff-role session. Each caller passes its own already-correct
// instance (mirrors the existing useEnabledModules(apiClient, ...) pattern).
// `years`/`levels` are optional: the admin page already loads them at page
// level and can pass them in to skip a redundant fetch; the accounts portal
// doesn't preload them, so the component fetches its own if they're omitted.
export function FeeReportsPanel({ apiClient, years: yearsProp, levels: levelsProp }: {
  apiClient: AxiosInstance; years?: AcademicYear[]; levels?: ClassLevel[];
}) {
  const [subTab, setSubTab] = useState<'schedule' | 'student'>('schedule');
  const [years, setYears] = useState<AcademicYear[]>(yearsProp ?? []);
  const [levels, setLevels] = useState<ClassLevel[]>(levelsProp ?? []);

  useEffect(() => {
    if (!yearsProp) apiClient.get<AcademicYear[]>('/api/academic-years').then(r => setYears(r.data)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsProp]);
  useEffect(() => {
    if (!levelsProp) apiClient.get<ClassLevel[]>('/api/class-levels').then(r => setLevels(r.data)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelsProp]);

  // ── By Schedule ──────────────────────────────────────────────────────────
  const [scheduleYearId, setScheduleYearId] = useState('');
  const [scheduleData, setScheduleData] = useState<ByScheduleResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const r = await apiClient.get<ByScheduleResponse>('/api/fees/reports/by-schedule', {
        params: scheduleYearId ? { year_id: scheduleYearId } : {},
      });
      setScheduleData(r.data);
    } catch { setScheduleData(null); }
    finally { setScheduleLoading(false); }
  }, [scheduleYearId]);

  useEffect(() => { if (subTab === 'schedule') loadSchedule(); }, [subTab, loadSchedule]);

  // ── By Student ───────────────────────────────────────────────────────────
  const [studentYearId, setStudentYearId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [enrollmentStatus, setEnrollmentStatus] = useState<'Active' | 'Graduated' | 'Inactive' | 'all'>('Active');
  const [scheduleFilter, setScheduleFilter] = useState<{ id: string; label: string } | null>(null);
  const [studentRows, setStudentRows] = useState<FeeStatusRow[]>([]);
  const [school, setSchool] = useState<SlSchool>({});
  const [studentLoading, setStudentLoading] = useState(false);

  const loadStudents = useCallback(async () => {
    setStudentLoading(true);
    try {
      const r = await apiClient.get<{ rows: FeeStatusRow[]; school: SlSchool }>('/api/fees/reports/student-status', {
        params: {
          year_id: scheduleFilter ? undefined : (studentYearId || undefined),
          level_id: levelId || undefined,
          fee_schedule_id: scheduleFilter?.id,
          status: statusFilter,
          enrollment_status: enrollmentStatus,
        },
      });
      setStudentRows(r.data.rows);
      setSchool(r.data.school);
    } catch { setStudentRows([]); }
    finally { setStudentLoading(false); }
  }, [studentYearId, levelId, statusFilter, enrollmentStatus, scheduleFilter]);

  useEffect(() => { if (subTab === 'student') loadStudents(); }, [subTab, loadStudents]);

  function drillIntoSchedule(row: ScheduleRow) {
    setScheduleFilter({ id: row.schedule_id, label: `${row.fee_item_name} — ${row.class_name ?? 'All Classes'}` });
    setSubTab('student');
  }

  function printList() {
    const filterParts: string[] = [];
    if (scheduleFilter) filterParts.push(`Bill: ${scheduleFilter.label}`);
    else if (studentYearId) filterParts.push(years.find(y => y.id === studentYearId)?.name ?? 'Selected Year');
    else filterParts.push('All Time');
    if (levelId) filterParts.push(levels.find(l => l.id === levelId)?.name ?? 'Selected Group');
    if (enrollmentStatus !== 'all') filterParts.push(`${enrollmentStatus} Students`);
    filterParts.push(statusFilter === 'all' ? 'All Payment Statuses' : statusFilter === 'paid' ? 'Paid Only' : 'Unpaid Only');

    const html = buildFeePaymentListHtml({
      title: 'Student Fee Payment Status',
      filterLabel: filterParts.join(' · '),
      asOfDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      rows: studentRows,
      school,
    });
    const w = window.open('', '_blank');
    if (!w) { alert('Pop-ups are blocked. Please allow pop-ups for this site and try again.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['schedule', 'student'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              subTab === t
                ? 'bg-[#145C44] border-[#145C44] text-white'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-[#145C44]'
            }`}>
            {t === 'schedule' ? 'By Schedule' : 'By Student'}
          </button>
        ))}
      </div>

      {subTab === 'schedule' && (
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div>
              <label className={labelCls}>Academic Year</label>
              <select className={inputCls} value={scheduleYearId} onChange={e => setScheduleYearId(e.target.value)}>
                <option value="">All Time</option>
                {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
              </select>
            </div>
          </div>

          {scheduleLoading ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
          ) : !scheduleData ? (
            <p className="text-sm text-slate-400 text-center py-8">Could not load report.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {['Fee Item', 'Class', 'Term', 'Year', 'Bills', 'Billed', 'Collected', '%'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduleData.schedules.map(row => {
                    const pct = row.total_billed > 0 ? Math.round((row.total_collected / row.total_billed) * 100) : 0;
                    return (
                      <tr key={row.schedule_id}
                        onClick={() => drillIntoSchedule(row)}
                        className="border-b border-slate-100 dark:border-slate-700/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{row.fee_item_name}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.class_name ?? 'All Classes'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.semester ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.academic_year_name ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.bill_count}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{fmtGHS(row.total_billed)}</td>
                        <td className="px-3 py-2 font-semibold text-[#145C44]">{fmtGHS(row.total_collected)}</td>
                        <td className="px-3 py-2 text-slate-500">{pct}%</td>
                      </tr>
                    );
                  })}
                  {scheduleData.schedules.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No scheduled bills for this filter.</td></tr>
                  )}
                </tbody>
              </table>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-xs font-semibold text-slate-500">Unscheduled Bills</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">
                    {scheduleData.unscheduled.bill_count} bill(s) · Billed {fmtGHS(scheduleData.unscheduled.total_billed)} ·
                    Collected <span className="font-semibold text-[#145C44]">{fmtGHS(scheduleData.unscheduled.total_collected)}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-xs font-semibold text-slate-500">Ad-hoc Payments (no bill, all-time)</p>
                  <p className="text-sm font-semibold text-[#145C44] mt-1">{fmtGHS(scheduleData.adhoc_total)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {subTab === 'student' && (
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex gap-3 flex-wrap items-end">
              {scheduleFilter ? (
                <div>
                  <label className={labelCls}>Scoped to Bill</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{scheduleFilter.label}</span>
                    <button onClick={() => setScheduleFilter(null)} className="text-xs text-[#145C44] underline">Clear</button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Academic Year</label>
                  <select className={inputCls} value={studentYearId} onChange={e => setStudentYearId(e.target.value)}>
                    <option value="">All Time</option>
                    {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Year Group</label>
                <select className={inputCls} value={levelId} onChange={e => setLevelId(e.target.value)}>
                  <option value="">All Year Groups</option>
                  {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Enrollment</label>
                <select className={inputCls} value={enrollmentStatus} onChange={e => setEnrollmentStatus(e.target.value as typeof enrollmentStatus)}>
                  <option value="Active">Active</option>
                  <option value="Graduated">Graduated</option>
                  <option value="Inactive">Inactive</option>
                  <option value="all">All Students</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}>
                  <option value="all">All</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
            </div>
            <button onClick={printList} disabled={studentLoading || studentRows.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#145C44] disabled:opacity-40">
              Print
            </button>
          </div>

          {studentLoading ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Name', 'Student ID', 'Class', 'Billed', 'Paid', 'Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {studentRows.map(r => {
                  const status = computePaymentStatus(r);
                  const color = status === 'Paid' ? '#166534' : status === 'Partial' ? '#92400e' : '#991b1b';
                  return (
                    <tr key={r.student_id} className="border-b border-slate-100 dark:border-slate-700/50">
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{r.student_name}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.student_code}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.class_name}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{fmtGHS(r.total_billed)}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{fmtGHS(r.total_paid)}</td>
                      <td className="px-3 py-2 font-semibold" style={{ color }}>{status}</td>
                    </tr>
                  );
                })}
                {studentRows.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No students match this filter.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
