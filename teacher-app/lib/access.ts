// What this teacher can open: licensed modules for the school, plus the
// responsibilities that unlock extra areas (form class, HOD, housemaster,
// library desk, clearance office, budgets). Same checks as the web
// TeacherShell, so the app shows exactly what the web shows.
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';

export interface Access {
  ready: boolean;
  modules: string[] | null;   // null = unknown (treated as all allowed, like the web)
  formTeacher: boolean;
  hod: boolean;
  housemaster: boolean;
  seniorHousemaster: boolean;
  clearance: boolean;
  library: boolean;
  headsBudget: boolean;
}

const initial: Access = {
  ready: false, modules: null, formTeacher: false, hod: false, housemaster: false,
  seniorHousemaster: false, clearance: false, library: false, headsBudget: false,
};
let state: Access = initial;
const listeners = new Set<() => void>();
const set = (p: Partial<Access>) => { state = { ...state, ...p }; listeners.forEach(l => l()); };
let loading: Promise<void> | null = null;

export function loadAccess(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    const quiet = { validateStatus: () => true } as const;
    const [mods, form, offices, resp, hod, budget] = await Promise.all([
      api.get<string[]>('/api/school-modules/enabled', { params: { view: 'teacher' }, ...quiet }).catch(() => null),
      api.get('/api/form-teacher/assignment', quiet).catch(() => null),
      api.get<{ id: string; office_type: string }[]>('/api/clearance/my-offices', quiet).catch(() => null),
      api.get<{ module_keys: string[] }>('/api/responsibilities/my-modules', quiet).catch(() => null),
      api.get('/api/hod/check', quiet).catch(() => null),
      api.get<{ heads_budget: boolean }>('/api/department-budgets/me', quiet).catch(() => null),
    ]);
    const ok = (r: { status: number } | null) => !!r && r.status >= 200 && r.status < 300;
    const officeList = ok(offices) && Array.isArray(offices!.data) ? offices!.data : [];
    const keys = ok(resp) ? resp!.data?.module_keys ?? [] : [];
    set({
      ready: true,
      modules: ok(mods) && Array.isArray(mods!.data) ? mods!.data : null,
      formTeacher: ok(form) && !!form!.data,
      clearance: officeList.length > 0,
      housemaster: officeList.some(o => ['housemaster', 'senior_housemaster'].includes(o.office_type)),
      seniorHousemaster: officeList.some(o => o.office_type === 'senior_housemaster'),
      library: keys.includes('library'),
      hod: ok(hod) || keys.includes('hod') || officeList.some(o => o.office_type === 'hod'),
      headsBudget: ok(budget) && !!budget!.data?.heads_budget,
    });
  })().finally(() => { loading = null; });
  return loading;
}

export function resetAccess() { state = initial; listeners.forEach(l => l()); }

export function useAccess(): Access {
  const a = useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state, () => state);
  useEffect(() => { if (!state.ready) loadAccess(); }, []);
  return a;
}

/** Whether the school licenses a module (unknown counts as yes, like the web). */
export const hasModule = (a: Access, key?: string) => !key || a.modules === null || a.modules.includes(key);
