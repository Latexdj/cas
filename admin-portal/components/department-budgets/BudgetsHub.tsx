'use client';
import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import type { AcademicYear, BudgetMe, BudgetTrack } from '@/types/api';
import BudgetWorkspace from './BudgetWorkspace';
import BudgetDetail from './BudgetDetail';
import CompilationsPanel from './CompilationsPanel';
import SchoolBudgetView from './SchoolBudgetView';
import BudgetUnitsManager from './BudgetUnitsManager';
import { describeApiError, selectCls } from './shared';

export type BudgetsTab = 'budgets' | 'compiled' | 'school' | 'units';

interface Task { key: string; label: string; count: number; target: { view: 'budgets' | 'compilation' | 'school'; track?: BudgetTrack } }

// One budgets page for every portal. Which tabs show depends on what the
// person does in the chain (from /me), not on which portal they are in.
// With basePath, a budget opens on its own route (admin, principal, teacher);
// without it, the budget opens in place (staff portal, whose sidebar lives
// in the page rather than the layout).
export default function BudgetsHub({ apiClient, basePath, initialTab = 'budgets', primary = '#145C44' }: {
  apiClient: AxiosInstance; basePath?: string; initialTab?: BudgetsTab; primary?: string;
}) {
  const [me, setMe] = useState<BudgetMe | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<BudgetsTab>(initialTab);
  const [openBudgetId, setOpenBudgetId] = useState<string | null>(null);
  const [compiledTrack, setCompiledTrack] = useState<BudgetTrack | null>(null);
  const [tick, setTick] = useState(0);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');

  useEffect(() => {
    apiClient.get<BudgetMe>('/api/department-budgets/me')
      .then(r => setMe(r.data))
      .catch(e => setError(describeApiError(e, 'Could not load budgets. Check your connection and try again.')));
    apiClient.get<Task[]>('/api/department-budgets/my-tasks').then(r => setTasks(r.data)).catch(() => {});
  }, [apiClient, tick]);

  useEffect(() => {
    apiClient.get<AcademicYear[]>('/api/academic-years').then(r => {
      setYears(r.data);
      const current = r.data.find(y => y.is_current) ?? r.data[0];
      if (current) setYearId(y => y || current.id);
    }).catch(() => {});
  }, [apiClient]);

  useEffect(() => { setTab(initialTab); }, [initialTab]);

  if (error) return <p className="text-sm text-[#B83232]">{error}</p>;
  if (!me) return <p className="text-sm text-slate-400">Loading…</p>;

  const showCompiled = me.view_all || me.reviewer_tracks.length > 0 || me.is_accountant;
  const showSchool = me.view_all || me.reviewer_tracks.length > 0 || me.is_accountant;
  const seesOthers = me.reviewer_tracks.length > 0 || me.view_all || me.is_accountant;
  const tabs: { key: BudgetsTab; label: string }[] = [
    { key: 'budgets', label: seesOthers ? 'Department and unit budgets' : 'My budgets' },
    ...(showCompiled ? [{ key: 'compiled' as const, label: 'Compiled budgets' }] : []),
    ...(showSchool ? [{ key: 'school' as const, label: 'School budget' }] : []),
    ...(me.is_admin ? [{ key: 'units' as const, label: 'Budget units' }] : []),
  ];

  function openBudget(id: string) {
    if (basePath) window.location.href = `${basePath}/${id}`;
    else setOpenBudgetId(id);
  }
  function goTask(t: Task) {
    setOpenBudgetId(null);
    if (t.target.view === 'compilation') { setTab('compiled'); setCompiledTrack(t.target.track ?? null); }
    else if (t.target.view === 'school') setTab('school');
    else setTab('budgets');
  }

  if (openBudgetId) {
    return <BudgetDetail apiClient={apiClient} budgetId={openBudgetId}
      onBack={() => { setOpenBudgetId(null); setTick(t => t + 1); }} />;
  }

  return (
    <div className="space-y-5">
      {tasks.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
          {tasks.map(t => (
            <button key={t.key} type="button" onClick={() => goTask(t)}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40">
              <span className="text-sm text-slate-800 dark:text-white">{t.label}</span>
              <span className="text-sm font-bold tabular-nums text-[#C8780A]">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {tabs.length > 1 && (
        <div className="flex gap-1 flex-wrap border-b border-slate-200 dark:border-slate-700">
          {tabs.map(t => (
            <button key={t.key} type="button" onClick={() => { setTab(t.key); setCompiledTrack(null); }}
              className={`px-3 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${tab === t.key ? 'text-slate-900 dark:text-white' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              style={tab === t.key ? { borderColor: primary } : undefined}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'budgets' && (
        <BudgetWorkspace key={tick} apiClient={apiClient} basePath={basePath} onOpen={basePath ? undefined : openBudget}
          title={seesOthers ? 'Department and unit budgets' : 'My budgets'}
          subtitle={me.reviewer_tracks.length
            ? 'Review submitted budgets: edit lines, accept them into your compiled budget, or send them back.'
            : me.is_accountant ? 'Budgets the Head has approved. Open one to adjust its prices.'
            : me.view_all ? undefined : 'Draft your budget for the year and submit it for review.'} />
      )}
      {(tab === 'compiled' || tab === 'school') && years.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400" htmlFor="budget-year">Academic year</label>
          <select id="budget-year" className={`${selectCls} w-48`} value={yearId} onChange={e => setYearId(e.target.value)}>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
          </select>
        </div>
      )}
      {tab === 'compiled' && showCompiled && (
        <CompilationsPanel key={yearId} apiClient={apiClient} onOpenBudget={openBudget} initialTrack={compiledTrack} yearId={yearId || undefined} />
      )}
      {tab === 'school' && showSchool && <SchoolBudgetView key={yearId} apiClient={apiClient} onOpenBudget={openBudget} yearId={yearId || undefined} />}
      {tab === 'units' && me.is_admin && <BudgetUnitsManager apiClient={apiClient} />}
    </div>
  );
}
