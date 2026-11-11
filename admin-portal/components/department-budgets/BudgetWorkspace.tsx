'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import Link from 'next/link';
import type { DepartmentBudget, BudgetDepartment, AcademicYear, BudgetMe, BudgetTrack } from '@/types/api';
import { statusStyle, TRACK_LABEL, fmtMoney, fmtDate, describeApiError, inputCls, selectCls, labelCls, cardCls, btnPrimary } from './shared';

const OTHER_OPTION = '__other__';

// The list of budgets a person can see, plus "Create budget". Used by every
// portal: pages pass basePath (Next routes) or onOpen (the staff portal,
// which switches views in state because its sidebar lives in the page).
export default function BudgetWorkspace({ apiClient, basePath, onOpen, title = 'Budgets', subtitle }: {
  apiClient: AxiosInstance; basePath?: string; onOpen?: (id: string) => void; title?: string; subtitle?: string;
  /** @deprecated custom offices now follow the server's can_create_custom */
  canUseCustomDepartment?: boolean;
}) {
  const [budgets, setBudgets] = useState<DepartmentBudget[]>([]);
  const [owners, setOwners] = useState<BudgetDepartment[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [me, setMe] = useState<BudgetMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [filterYear, setFilterYear] = useState('');
  const [filterTrack, setFilterTrack] = useState<'' | BudgetTrack>('');
  const [newOwner, setNewOwner] = useState('');
  const [newYearId, setNewYearId] = useState('');
  const [customName, setCustomName] = useState('');
  const [customTrack, setCustomTrack] = useState<BudgetTrack>('academic');

  const recentYears = academicYears.slice(0, 3);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [budgetsRes, ownersRes, yearsRes, meRes] = await Promise.all([
        apiClient.get<DepartmentBudget[]>('/api/department-budgets'),
        apiClient.get<BudgetDepartment[]>('/api/department-budgets/departments-mine'),
        apiClient.get<AcademicYear[]>('/api/academic-years'),
        apiClient.get<BudgetMe>('/api/department-budgets/me'),
      ]);
      setBudgets(budgetsRes.data);
      setOwners(ownersRes.data);
      setAcademicYears(yearsRes.data);
      setMe(meRes.data);
      if (meRes.data.reviewer_tracks.length === 1) setCustomTrack(meRes.data.reviewer_tracks[0]);
      const current = yearsRes.data.find(y => y.is_current) || yearsRes.data[0];
      if (current) {
        setFilterYear(y => y || current.id);
        setNewYearId(y => y || current.id);
      }
      if (ownersRes.data.length === 1) setNewOwner(`${ownersRes.data[0].kind ?? 'department'}:${ownersRes.data[0].id}`);
    } catch (e: unknown) {
      setError(describeApiError(e, 'Could not load budgets. Check your connection and try again.'));
    } finally { setLoading(false); }
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  const visibleBudgets = budgets.filter(b =>
    (!filterYear || b.academic_year_id === filterYear) && (!filterTrack || b.track === filterTrack));
  const tracksShown = new Set(budgets.map(b => b.track));
  const canCreate = owners.length > 0 || !!me?.can_create_custom;
  const usingCustom = newOwner === OTHER_OPTION;
  const customTracks: BudgetTrack[] = me?.is_admin ? ['academic', 'administration'] : (me?.reviewer_tracks ?? []);

  function open(id: string) {
    if (onOpen) onOpen(id);
    else if (basePath) window.location.href = `${basePath}/${id}`;
  }

  async function createBudget() {
    if (!newYearId) { setError('Choose an academic year.'); return; }
    let body: Record<string, string> = { academic_year_id: newYearId };
    if (usingCustom) {
      if (!customName.trim()) { setError('Type a name for the office.'); return; }
      body = { ...body, custom_department_name: customName.trim(), track: customTrack };
    } else {
      const [kind, id] = newOwner.split(':');
      if (!id) { setError('Choose a department or unit.'); return; }
      body = { ...body, [kind === 'unit' ? 'budget_unit_id' : 'department_id']: id };
    }
    setSaving(true); setError('');
    try {
      const { data } = await apiClient.post<DepartmentBudget>('/api/department-budgets', body);
      setCreating(false);
      open(data.id);
    } catch (e: unknown) {
      setError(describeApiError(e, 'Could not create the budget. Check your connection and try again.'));
    } finally { setSaving(false); }
  }

  const departmentsOwned = owners.filter(o => (o.kind ?? 'department') === 'department');
  const unitsOwned = owners.filter(o => o.kind === 'unit');

  const emptyText = !canCreate
    ? 'No budgets have reached you yet. Budgets appear here once departments or units submit them.'
    : 'No budgets for this year yet. Use Create budget to start one.';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {tracksShown.size > 1 && (
            <select className={`${selectCls} w-40`} value={filterTrack} onChange={e => setFilterTrack(e.target.value as '' | BudgetTrack)}>
              <option value="">Both tracks</option>
              <option value="academic">Academics</option>
              <option value="administration">Administration</option>
            </select>
          )}
          <select className={`${selectCls} w-48`} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            <option value="">All years</option>
            {recentYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
          </select>
          {canCreate && (
            <button onClick={() => { setCreating(c => !c); setError(''); }}
              className={creating ? 'px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300' : btnPrimary}>
              {creating ? 'Cancel' : 'Create budget'}
            </button>
          )}
        </div>
      </div>

      {creating && (
        <div className={`${cardCls} p-5 space-y-4`}>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">Create budget</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Department or unit</label>
              <select className={inputCls} value={newOwner} onChange={e => setNewOwner(e.target.value)}>
                <option value="">Choose…</option>
                {departmentsOwned.length > 0 && (
                  <optgroup label="Departments">
                    {departmentsOwned.map(d => <option key={d.id} value={`department:${d.id}`}>{d.name}</option>)}
                  </optgroup>
                )}
                {unitsOwned.length > 0 && (
                  <optgroup label="Units">
                    {unitsOwned.map(u => <option key={u.id} value={`unit:${u.id}`}>{u.name}</option>)}
                  </optgroup>
                )}
                {me?.can_create_custom && <option value={OTHER_OPTION}>Another office (type its name)</option>}
              </select>
            </div>
            <div>
              <label className={labelCls}>Academic year</label>
              <select className={inputCls} value={newYearId} onChange={e => setNewYearId(e.target.value)}>
                <option value="">Choose…</option>
                {recentYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
              </select>
            </div>
            {usingCustom && (
              <>
                <div>
                  <label className={labelCls}>Office name</label>
                  <input className={inputCls} value={customName} onChange={e => setCustomName(e.target.value)} placeholder="e.g. Exam Office" />
                </div>
                <div>
                  <label className={labelCls}>Goes to</label>
                  <select className={inputCls} value={customTrack} onChange={e => setCustomTrack(e.target.value as BudgetTrack)}>
                    {customTracks.map(t => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
          {error && <p className="text-sm text-[#B83232]">{error}</p>}
          <div className="flex justify-end">
            <button onClick={createBudget} disabled={saving} className={btnPrimary}>{saving ? 'Creating…' : 'Create draft'}</button>
          </div>
        </div>
      )}

      {error && !creating && <p className="text-sm text-[#B83232]">{error}</p>}

      {loading ? (
        <div className="flex py-16">
          <div className="w-7 h-7 rounded-full border-4 border-b-transparent animate-spin" style={{ borderColor: '#145C44', borderBottomColor: 'transparent' }} />
        </div>
      ) : visibleBudgets.length === 0 ? (
        <div className={`${cardCls} px-5 py-10 text-sm text-slate-500 dark:text-slate-400`}>{emptyText}</div>
      ) : (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  {['Department or unit', 'Track', 'Year', 'Lines', 'Total', 'Status', 'Submitted', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {visibleBudgets.map(b => {
                  const ss = statusStyle(b.status);
                  const toReview = b.status === 'Submitted' && me?.reviewer_tracks.includes(b.track);
                  const label = toReview ? 'Review' : 'Open';
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">{b.department_name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{TRACK_LABEL[b.track] ?? b.track}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{b.academic_year_name}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{b.item_count}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200 font-mono text-xs whitespace-nowrap">{fmtMoney(b.total_amount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ backgroundColor: ss.bg, color: ss.color }}>{b.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(b.submitted_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {onOpen || !basePath ? (
                          <button onClick={() => open(b.id)} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">{label}</button>
                        ) : (
                          <Link href={`${basePath}/${b.id}`} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">{label}</Link>
                        )}
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
