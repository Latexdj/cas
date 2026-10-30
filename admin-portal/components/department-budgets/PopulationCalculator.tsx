'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import type { PopulationBasis, BudgetCalcMode, ClassLevel, BudgetDepartment, ClassItem, Subject } from '@/types/api';

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';

const BASIS_LABELS: Record<PopulationBasis, string> = {
  all_students: 'All active students',
  class_level: 'Students in a class level',
  all_teachers: 'All active teachers',
  department: 'Teachers in a department',
  subjects_school: 'Subjects offered school-wide',
  subjects_class: 'Subjects offered to a class',
  subjects_class_level: 'Subjects offered to a class level / year batch',
  students_offering_subject: 'Students offering a specific subject',
};

const CLASS_LEVEL_BASES: PopulationBasis[] = ['class_level', 'subjects_class_level'];
const DEFAULT_SHEETS_PER_UNIT = '500';

export default function PopulationCalculator({ apiClient, itemName, onApply, onClose }: {
  apiClient: AxiosInstance; itemName: string;
  onApply: (quantity: number) => void; onClose: () => void;
}) {
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [departments, setDepartments] = useState<BudgetDepartment[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [basis, setBasis] = useState<PopulationBasis>('all_students');
  const [classLevelId, setClassLevelId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [classSearch, setClassSearch] = useState('');

  const [calcMode, setCalcMode] = useState<BudgetCalcMode>('ratio');
  const [ratio, setRatio] = useState('1');
  const [bufferPct, setBufferPct] = useState('0');
  const [pagesPerPaper, setPagesPerPaper] = useState('');
  const [doubleSided, setDoubleSided] = useState(true);
  const [sheetsPerUnit, setSheetsPerUnit] = useState(DEFAULT_SHEETS_PER_UNIT);

  const [population, setPopulation] = useState<number | null>(null);
  const [loadingPop, setLoadingPop] = useState(false);
  const [savedFormulaLoaded, setSavedFormulaLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get<ClassLevel[]>('/api/class-levels').then(r => setClassLevels(r.data)).catch(() => {});
    apiClient.get<BudgetDepartment[]>('/api/department-budgets/departments-all').then(r => setDepartments(r.data)).catch(() => {});
    apiClient.get<ClassItem[]>('/api/classes').then(r => setClasses(r.data)).catch(() => {});
    apiClient.get<Subject[]>('/api/subjects').then(r => setSubjects(r.data)).catch(() => {});
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
        setClassId(f.class_id || '');
        setSubjectId(f.subject_id || '');
        setSelectedClassIds(new Set(f.class_ids || []));
        setRatio(String(f.ratio));
        setBufferPct(String(f.buffer_pct));
        setCalcMode(f.calc_mode || 'ratio');
        setPagesPerPaper(f.pages_per_paper != null ? String(f.pages_per_paper) : '');
        setDoubleSided(f.double_sided ?? true);
        setSheetsPerUnit(f.sheets_per_unit != null ? String(f.sheets_per_unit) : DEFAULT_SHEETS_PER_UNIT);
      }
      setSavedFormulaLoaded(true);
    });
  }, [apiClient, itemName]);

  function toggleClass(id: string) {
    setSelectedClassIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectClassesInLevel(levelId: string) {
    const ids = classes.filter(c => c.level_id === levelId).map(c => c.id);
    setSelectedClassIds(prev => new Set([...prev, ...ids]));
  }

  const loadPopulation = useCallback(async () => {
    if (CLASS_LEVEL_BASES.includes(basis) && !classLevelId) { setPopulation(null); return; }
    if (basis === 'department' && !departmentId) { setPopulation(null); return; }
    if (basis === 'subjects_class' && !classId) { setPopulation(null); return; }
    if (basis === 'students_offering_subject' && (!subjectId || selectedClassIds.size === 0)) { setPopulation(null); return; }
    setLoadingPop(true);
    try {
      const params: Record<string, string> = { basis };
      if (CLASS_LEVEL_BASES.includes(basis)) params.class_level_id = classLevelId;
      if (basis === 'department') params.department_id = departmentId;
      if (basis === 'subjects_class') params.class_id = classId;
      if (basis === 'students_offering_subject') {
        params.subject_id = subjectId;
        params.class_ids = Array.from(selectedClassIds).join(',');
      }
      const { data } = await apiClient.get<{ count: number }>('/api/department-budgets/population', { params });
      setPopulation(data.count);
    } catch { setPopulation(null); }
    finally { setLoadingPop(false); }
  }, [apiClient, basis, classLevelId, departmentId, classId, subjectId, selectedClassIds]);

  useEffect(() => { if (savedFormulaLoaded) loadPopulation(); }, [savedFormulaLoaded, loadPopulation]);

  const ratioNum = parseFloat(ratio) || 0;
  const bufferNum = parseFloat(bufferPct) || 0;
  const pagesNum = parseFloat(pagesPerPaper) || 0;
  const sheetsPerUnitNum = parseFloat(sheetsPerUnit) || 0;
  const sheetsPerPerson = calcMode === 'print_job' ? Math.ceil(pagesNum / (doubleSided ? 2 : 1)) : ratioNum;

  const computedQuantity = (() => {
    if (population == null || sheetsPerPerson <= 0) return null;
    const rawTotal = sheetsPerPerson * population * (1 + bufferNum / 100);
    if (calcMode === 'print_job') {
      if (sheetsPerUnitNum <= 0) return null;
      return Math.ceil(rawTotal / sheetsPerUnitNum);
    }
    return Math.ceil(rawTotal);
  })();

  const filteredClasses = classSearch.trim()
    ? classes.filter(c => c.name.toLowerCase().includes(classSearch.trim().toLowerCase()))
    : classes;

  async function applyAndSave() {
    if (!itemName.trim()) { setError('Enter a category name for this item before calculating.'); return; }
    if (CLASS_LEVEL_BASES.includes(basis) && !classLevelId) { setError('Select a class level.'); return; }
    if (basis === 'department' && !departmentId) { setError('Select a department.'); return; }
    if (basis === 'subjects_class' && !classId) { setError('Select a class.'); return; }
    if (basis === 'students_offering_subject') {
      if (!subjectId) { setError('Select a subject.'); return; }
      if (selectedClassIds.size === 0) { setError('Select at least one class sitting this subject.'); return; }
    }
    if (calcMode === 'print_job') {
      if (pagesNum <= 0) { setError('Enter how many pages the paper is.'); return; }
      if (sheetsPerUnitNum <= 0) { setError('Enter how many sheets make up one ream/box.'); return; }
    } else if (ratioNum <= 0) {
      setError('Ratio must be greater than 0.'); return;
    }
    if (computedQuantity == null) { setError('Could not determine the population count.'); return; }

    setSaving(true); setError('');
    try {
      await apiClient.put('/api/department-budgets/formulas', {
        item_name: itemName.trim(), population_basis: basis,
        class_level_id: CLASS_LEVEL_BASES.includes(basis) ? classLevelId : undefined,
        department_id: basis === 'department' ? departmentId : undefined,
        class_id: basis === 'subjects_class' ? classId : undefined,
        subject_id: basis === 'students_offering_subject' ? subjectId : undefined,
        class_ids: basis === 'students_offering_subject' ? Array.from(selectedClassIds) : undefined,
        ratio: sheetsPerPerson, buffer_pct: bufferNum,
        calc_mode: calcMode,
        pages_per_paper: calcMode === 'print_job' ? pagesNum : undefined,
        double_sided: doubleSided,
        sheets_per_unit: calcMode === 'print_job' ? sheetsPerUnitNum : undefined,
      });
      onApply(computedQuantity);
      onClose();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save formula.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/45 px-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
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

        {CLASS_LEVEL_BASES.includes(basis) && (
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
        {basis === 'subjects_class' && (
          <div>
            <label className={labelCls}>Class</label>
            <select className={inputCls} value={classId} onChange={e => setClassId(e.target.value)}>
              <option value="">Select class…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {basis === 'students_offering_subject' && (
          <div className="space-y-2">
            <div>
              <label className={labelCls}>Subject</label>
              <select className={inputCls} value={subjectId} onChange={e => setSubjectId(e.target.value)}>
                <option value="">Select subject…</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls + ' mb-0'}>
                  Classes sitting this paper <span className="text-slate-400 font-normal">({selectedClassIds.size} selected)</span>
                </label>
                <select className="text-xs border-0 bg-transparent font-semibold cursor-pointer" style={{ color: '#145C44' }}
                  value="" onChange={e => { if (e.target.value) selectClassesInLevel(e.target.value); }}>
                  <option value="">+ Add a whole level…</option>
                  {classLevels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <input className={inputCls + ' mb-2'} placeholder="Search classes…" value={classSearch} onChange={e => setClassSearch(e.target.value)} />
              <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-xl divide-y divide-slate-100 dark:divide-slate-700">
                {filteredClasses.map(c => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <input type="checkbox" checked={selectedClassIds.has(c.id)} onChange={() => toggleClass(c.id)} />
                    <span className="text-slate-700 dark:text-slate-200">{c.name}</span>
                  </label>
                ))}
                {filteredClasses.length === 0 && <p className="text-sm text-slate-400 px-3 py-3 text-center">No classes match.</p>}
              </div>
              <p className="text-xs text-slate-400 mt-1">Only students actually offering this subject in the selected classes are counted — electives are respected.</p>
            </div>
          </div>
        )}

        <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/40 rounded-lg p-1 mb-3 w-fit">
            {(['ratio', 'print_job'] as BudgetCalcMode[]).map(m => (
              <button key={m} type="button" onClick={() => setCalcMode(m)}
                className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors"
                style={{ backgroundColor: calcMode === m ? '#145C44' : 'transparent', color: calcMode === m ? '#fff' : '#64748B' }}>
                {m === 'ratio' ? 'Simple ratio' : 'Print job (pages → sheets)'}
              </button>
            ))}
          </div>

          {calcMode === 'ratio' ? (
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
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Pages in the paper</label>
                  <input type="number" min="1" step="1" className={inputCls} value={pagesPerPaper} onChange={e => setPagesPerPaper(e.target.value)} placeholder="e.g. 6" />
                </div>
                <div className="flex items-end pb-2.5">
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={doubleSided} onChange={e => setDoubleSided(e.target.checked)} />
                    Photocopy both sides
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Sheets per ream/box</label>
                  <input type="number" min="1" step="1" className={inputCls} value={sheetsPerUnit} onChange={e => setSheetsPerUnit(e.target.value)} placeholder="e.g. 500" />
                </div>
                <div>
                  <label className={labelCls}>Buffer %</label>
                  <input type="number" min="0" step="1" className={inputCls} value={bufferPct} onChange={e => setBufferPct(e.target.value)} placeholder="e.g. 10" />
                </div>
              </div>
              {pagesNum > 0 && (
                <p className="text-xs text-slate-400">
                  {doubleSided ? `${pagesNum} pages ÷ 2 sides = ` : `${pagesNum} pages, single-sided = `}
                  <strong className="text-slate-600 dark:text-slate-300">{sheetsPerPerson} sheet{sheetsPerPerson !== 1 ? 's' : ''} per student</strong>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5 text-sm">
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>Population</span>
            <span>{loadingPop ? '…' : population ?? '—'}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-800 dark:text-white mt-1">
            <span>Suggested Quantity{calcMode === 'print_job' ? ' (reams/boxes)' : ''}</span>
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
