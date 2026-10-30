'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import type { PopulationBasis, ClassLevel, BudgetDepartment } from '@/types/api';

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';

const BASIS_LABELS: Record<PopulationBasis, string> = {
  all_students: 'All active students',
  class_level: 'Students in a class level',
  all_teachers: 'All active teachers',
  department: 'Teachers in a department',
};

export default function PopulationCalculator({ apiClient, itemName, onApply, onClose }: {
  apiClient: AxiosInstance; itemName: string;
  onApply: (quantity: number) => void; onClose: () => void;
}) {
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [departments, setDepartments] = useState<BudgetDepartment[]>([]);
  const [basis, setBasis] = useState<PopulationBasis>('all_students');
  const [classLevelId, setClassLevelId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [ratio, setRatio] = useState('1');
  const [bufferPct, setBufferPct] = useState('0');
  const [population, setPopulation] = useState<number | null>(null);
  const [loadingPop, setLoadingPop] = useState(false);
  const [savedFormulaLoaded, setSavedFormulaLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get<ClassLevel[]>('/api/class-levels').then(r => setClassLevels(r.data)).catch(() => {});
    apiClient.get<BudgetDepartment[]>('/api/department-budgets/departments-all').then(r => setDepartments(r.data)).catch(() => {});
  }, [apiClient]);

  useEffect(() => {
    const lookup = itemName.trim()
      ? apiClient.get(`/api/department-budgets/formulas`, { params: { item_name: itemName.trim() } }).then(r => r.data).catch(() => null)
      : Promise.resolve(null);
    lookup.then(f => {
      if (f) {
        setBasis(f.population_basis);
        setClassLevelId(f.class_level_id || '');
        setDepartmentId(f.department_id || '');
        setRatio(String(f.ratio));
        setBufferPct(String(f.buffer_pct));
      }
      setSavedFormulaLoaded(true);
    });
  }, [apiClient, itemName]);

  const loadPopulation = useCallback(async () => {
    if (basis === 'class_level' && !classLevelId) { setPopulation(null); return; }
    if (basis === 'department' && !departmentId) { setPopulation(null); return; }
    setLoadingPop(true);
    try {
      const params: Record<string, string> = { basis };
      if (basis === 'class_level') params.class_level_id = classLevelId;
      if (basis === 'department') params.department_id = departmentId;
      const { data } = await apiClient.get<{ count: number }>('/api/department-budgets/population', { params });
      setPopulation(data.count);
    } catch { setPopulation(null); }
    finally { setLoadingPop(false); }
  }, [apiClient, basis, classLevelId, departmentId]);

  useEffect(() => { if (savedFormulaLoaded) loadPopulation(); }, [savedFormulaLoaded, loadPopulation]);

  const ratioNum = parseFloat(ratio) || 0;
  const bufferNum = parseFloat(bufferPct) || 0;
  const computedQuantity = population != null ? Math.ceil(population * ratioNum * (1 + bufferNum / 100)) : null;

  async function applyAndSave() {
    if (!itemName.trim()) { setError('Enter a category name for this item before calculating.'); return; }
    if (basis === 'class_level' && !classLevelId) { setError('Select a class level.'); return; }
    if (basis === 'department' && !departmentId) { setError('Select a department.'); return; }
    if (ratioNum <= 0) { setError('Ratio must be greater than 0.'); return; }
    if (computedQuantity == null) { setError('Could not determine the population count.'); return; }

    setSaving(true); setError('');
    try {
      await apiClient.put('/api/department-budgets/formulas', {
        item_name: itemName.trim(), population_basis: basis,
        class_level_id: basis === 'class_level' ? classLevelId : undefined,
        department_id: basis === 'department' ? departmentId : undefined,
        ratio: ratioNum, buffer_pct: bufferNum,
      });
      onApply(computedQuantity);
      onClose();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save formula.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/45 px-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-900 dark:text-white">Calculate Quantity</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm">✕</button>
        </div>
        <p className="text-xs text-slate-400">For <strong className="text-slate-600 dark:text-slate-300">{itemName || 'this item'}</strong></p>

        <div>
          <label className={labelCls}>Based on</label>
          <select className={inputCls} value={basis} onChange={e => setBasis(e.target.value as PopulationBasis)}>
            {(Object.keys(BASIS_LABELS) as PopulationBasis[]).map(b => <option key={b} value={b}>{BASIS_LABELS[b]}</option>)}
          </select>
        </div>

        {basis === 'class_level' && (
          <div>
            <label className={labelCls}>Class Level</label>
            <select className={inputCls} value={classLevelId} onChange={e => setClassLevelId(e.target.value)}>
              <option value="">Select level…</option>
              {classLevels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        {basis === 'department' && (
          <div>
            <label className={labelCls}>Department</label>
            <select className={inputCls} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
              <option value="">Select department…</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Ratio (per 1)</label>
            <input type="number" min="0" step="0.01" className={inputCls} value={ratio} onChange={e => setRatio(e.target.value)} placeholder="e.g. 1" />
          </div>
          <div>
            <label className={labelCls}>Buffer %</label>
            <input type="number" min="0" step="1" className={inputCls} value={bufferPct} onChange={e => setBufferPct(e.target.value)} placeholder="e.g. 10" />
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5 text-sm">
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>Population</span>
            <span>{loadingPop ? '…' : population ?? '—'}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-800 dark:text-white mt-1">
            <span>Suggested Quantity</span>
            <span>{computedQuantity ?? '—'}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600">Cancel</button>
          <button onClick={applyAndSave} disabled={saving || computedQuantity == null}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#145C44' }}>
            {saving ? 'Saving…' : 'Use This Quantity'}
          </button>
        </div>
      </div>
    </div>
  );
}
