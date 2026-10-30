'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import Link from 'next/link';
import type { DepartmentBudget, BudgetDepartment, AcademicYear } from '@/types/api';

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Draft:               { bg: '#F1F5F9', color: '#64748B' },
  Submitted:           { bg: '#FFFBEB', color: '#D97706' },
  Approved:            { bg: '#DCFCE7', color: '#145C44' },
  'Changes Requested': { bg: '#EFF6FF', color: '#1D4ED8' },
  Rejected:            { bg: '#FEF2F2', color: '#DC2626' },
};

function fmtMoney(n: number) {
  return `GHS ${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';

const OTHER_OPTION = '__other__';

export default function BudgetWorkspace({ apiClient, basePath, canUseCustomDepartment = false }: {
  apiClient: AxiosInstance; basePath: string; canUseCustomDepartment?: boolean;
}) {
  const [budgets, setBudgets] = useState<DepartmentBudget[]>([]);
  const [departments, setDepartments] = useState<BudgetDepartment[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [filterYear, setFilterYear] = useState('');
  const [newDeptId, setNewDeptId] = useState('');
  const [newYearId, setNewYearId] = useState('');
  const [customDeptName, setCustomDeptName] = useState('');

  const recentYears = academicYears.slice(0, 3);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [budgetsRes, deptRes, yearsRes] = await Promise.all([
        apiClient.get<DepartmentBudget[]>('/api/department-budgets'),
        apiClient.get<BudgetDepartment[]>('/api/department-budgets/departments-mine'),
        apiClient.get<AcademicYear[]>('/api/academic-years'),
      ]);
      setBudgets(budgetsRes.data);
      setDepartments(deptRes.data);
      setAcademicYears(yearsRes.data);
      const current = yearsRes.data.find(y => y.is_current) || yearsRes.data[0];
      if (current) {
        setFilterYear(y => y || current.id);
        setNewYearId(y => y || current.id);
      }
      if (deptRes.data.length === 1) setNewDeptId(deptRes.data[0].id);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load.');
    } finally { setLoading(false); }
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  const visibleBudgets = filterYear ? budgets.filter(b => b.academic_year_id === filterYear) : budgets;
  const existingDeptIdsForYear = new Set(budgets.filter(b => b.academic_year_id === newYearId).map(b => b.department_id));
  const creatableDepartments = departments.filter(d => !existingDeptIdsForYear.has(d.id));

  const usingCustom = newDeptId === OTHER_OPTION;

  async function createBudget() {
    if (!newYearId) { setError('Select an academic year.'); return; }
    if (usingCustom) {
      if (!customDeptName.trim()) { setError('Type a name for the office.'); return; }
    } else if (!newDeptId) {
      setError('Select a department.'); return;
    }
    setSaving(true); setError('');
    try {
      const { data } = await apiClient.post<DepartmentBudget>('/api/department-budgets', {
        department_id: usingCustom ? undefined : newDeptId,
        custom_department_name: usingCustom ? customDeptName.trim() : undefined,
        academic_year_id: newYearId,
      });
      window.location.href = `${basePath}/${data.id}`;
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create budget.');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Department Budgets</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Draft, submit, and review each department&apos;s annual budget.</p>
        </div>
        <div className="flex gap-2 items-center">
          <select className={inputCls + ' w-48'} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            <option value="">All years</option>
            {recentYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>)}
          </select>
          {(departments.length > 0 || canUseCustomDepartment) && (
            <button onClick={() => { setCreating(c => !c); setError(''); }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: creating ? '#64748B' : '#145C44' }}>
              {creating ? 'Cancel' : '+ New Budget'}
            </button>
          )}
        </div>
      </div>

      {creating && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">New Budget</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Department *</label>
              <select className={inputCls} value={newDeptId} onChange={e => setNewDeptId(e.target.value)}>
                <option value="">Select department…</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                {canUseCustomDepartment && <option value={OTHER_OPTION}>Other (type manually)…</option>}
              </select>
            </div>
            <div>
              <label className={labelCls}>Academic Year *</label>
              <select className={inputCls} value={newYearId} onChange={e => setNewYearId(e.target.value)}>
                <option value="">Select year…</option>
                {recentYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>)}
              </select>
            </div>
            {usingCustom && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Office / Department Name *</label>
                <input className={inputCls} value={customDeptName} onChange={e => setCustomDeptName(e.target.value)}
                  placeholder="e.g. Exam Office, Academics" />
                <p className="text-xs text-slate-400 mt-1">For an office or unit not on the department list. Only management can create and manage these.</p>
              </div>
            )}
          </div>
          {!usingCustom && newYearId && creatableDepartments.length === 0 && departments.length > 0 && (
            <p className="text-xs text-slate-400">Every department you can manage already has a budget for that year.</p>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end">
            <button onClick={createBudget} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#145C44' }}>
              {saving ? 'Creating…' : 'Create Draft'}
            </button>
          </div>
        </div>
      )}

      {error && !creating && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#145C44', borderTopColor: 'transparent' }} />
        </div>
      ) : departments.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-center py-16 text-sm text-slate-400">
          You don&apos;t head a department, so there&apos;s nothing to draft here.
        </div>
      ) : visibleBudgets.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-center py-16 text-sm text-slate-400">
          No budgets yet for this year. Click <strong>+ New Budget</strong> to start one.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  {['Department', 'Academic Year', 'Items', 'Total', 'Status', 'Submitted', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                {visibleBudgets.map(b => {
                  const ss = STATUS_STYLES[b.status] ?? { bg: '#F1F5F9', color: '#64748B' };
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">{b.department_name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{b.academic_year_name}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{b.item_count}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200 font-mono text-xs whitespace-nowrap">{fmtMoney(b.total_amount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: ss.bg, color: ss.color }}>{b.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(b.submitted_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`${basePath}/${b.id}`} className="text-xs font-semibold" style={{ color: '#145C44' }}>
                          {b.status === 'Submitted' ? 'Review' : 'Open'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
