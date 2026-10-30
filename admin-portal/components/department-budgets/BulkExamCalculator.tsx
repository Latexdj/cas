'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import type { ClassLevel, ClassItem, Subject } from '@/types/api';

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';

export default function BulkExamCalculator({ apiClient, onApply, onClose }: {
  apiClient: AxiosInstance; onApply: (quantity: number, categoryName: string) => void; onClose: () => void;
}) {
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [classSearch, setClassSearch] = useState('');

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pagesBySubject, setPagesBySubject] = useState<Record<string, string>>({});
  const [populations, setPopulations] = useState<Record<string, number>>({});
  const [fillPages, setFillPages] = useState('');

  const [doubleSided, setDoubleSided] = useState(true);
  const [sheetsPerUnit, setSheetsPerUnit] = useState('500');
  const [bufferPct, setBufferPct] = useState('0');
  const [categoryName, setCategoryName] = useState('A4 Sheets — Exams');

  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingPop, setLoadingPop] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get<ClassLevel[]>('/api/class-levels').then(r => setClassLevels(r.data)).catch(() => {});
    apiClient.get<ClassItem[]>('/api/classes').then(r => setClasses(r.data)).catch(() => {});
  }, [apiClient]);

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

  const loadSubjects = useCallback(async () => {
    if (selectedClassIds.size === 0) { setSubjects([]); setPopulations({}); return; }
    setLoadingSubjects(true); setError('');
    try {
      const classIds = Array.from(selectedClassIds);
      const { data } = await apiClient.get<Subject[]>('/api/department-budgets/subjects-for-classes', {
        params: { class_ids: classIds.join(',') },
      });
      setSubjects(data);
      if (data.length) {
        setLoadingPop(true);
        const { data: popData } = await apiClient.post<{ populations: Record<string, number> }>(
          '/api/department-budgets/population-bulk', { class_ids: classIds, subject_ids: data.map(s => s.id) }
        );
        setPopulations(popData.populations);
        setLoadingPop(false);
      } else {
        setPopulations({});
      }
    } catch (e: unknown) {
      const serverMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(serverMsg ?? 'Could not load subjects for the selected classes.');
      setLoadingPop(false);
    } finally { setLoadingSubjects(false); }
  }, [apiClient, selectedClassIds]);

  useEffect(() => { loadSubjects(); }, [loadSubjects]);

  const filteredClasses = classSearch.trim()
    ? classes.filter(c => c.name.toLowerCase().includes(classSearch.trim().toLowerCase()))
    : classes;

  const doubleSidedNum = doubleSided ? 2 : 1;
  const sheetsPerUnitNum = parseFloat(sheetsPerUnit) || 0;
  const bufferNum = parseFloat(bufferPct) || 0;

  const rows = subjects.map(s => {
    const pages = parseFloat(pagesBySubject[s.id] || '') || 0;
    const population = populations[s.id] ?? 0;
    const sheetsPerStudent = pages > 0 ? Math.ceil(pages / doubleSidedNum) : 0;
    const subtotalSheets = sheetsPerStudent * population;
    return { subject: s, pages, population, sheetsPerStudent, subtotalSheets };
  });

  const totalSheetsRaw = rows.reduce((sum, r) => sum + r.subtotalSheets, 0);
  const anyPagesEntered = rows.some(r => r.pages > 0);
  const totalReams = anyPagesEntered && sheetsPerUnitNum > 0
    ? Math.ceil((totalSheetsRaw * (1 + bufferNum / 100)) / sheetsPerUnitNum)
    : null;

  function applyFillPages() {
    const n = parseFloat(fillPages);
    if (!(n > 0)) return;
    setPagesBySubject(prev => {
      const next = { ...prev };
      for (const s of subjects) next[s.id] = String(n);
      return next;
    });
  }

  function applyAndClose() {
    if (selectedClassIds.size === 0) { setError('Select at least one class sitting this exam.'); return; }
    if (!anyPagesEntered) { setError('Enter the number of pages for at least one subject’s paper.'); return; }
    if (sheetsPerUnitNum <= 0) { setError('Enter how many sheets make up one ream/box.'); return; }
    if (totalReams == null) { setError('Could not compute a total.'); return; }
    if (!categoryName.trim()) { setError('Enter a name for this budget line.'); return; }
    setSaving(true);
    onApply(totalReams, categoryName.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/45 px-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-900 dark:text-white">Calculate Whole Exam (All Subjects)</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm">✕</button>
        </div>
        <p className="text-xs text-slate-400">
          Picks up every subject allocated to the classes you select, adds up the sheets each one needs, and gives
          you one combined reams total — instead of calculating subject by subject.
        </p>

        <div>
          <label className={labelCls}>Budget line name</label>
          <input className={inputCls} value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="e.g. A4 Sheets — Mock Exams" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls + ' mb-0'}>
              Classes sitting this exam <span className="text-slate-400 font-normal">({selectedClassIds.size} selected)</span>
            </label>
            <select className="text-xs border-0 bg-transparent font-semibold cursor-pointer" style={{ color: '#145C44' }}
              value="" onChange={e => { if (e.target.value) selectClassesInLevel(e.target.value); }}>
              <option value="">+ Add a whole level…</option>
              {classLevels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <input className={inputCls + ' mb-2'} placeholder="Search classes…" value={classSearch} onChange={e => setClassSearch(e.target.value)} />
          <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-xl divide-y divide-slate-100 dark:divide-slate-700">
            {filteredClasses.map(c => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40">
                <input type="checkbox" checked={selectedClassIds.has(c.id)} onChange={() => toggleClass(c.id)} />
                <span className="text-slate-700 dark:text-slate-200">{c.name}</span>
              </label>
            ))}
            {filteredClasses.length === 0 && <p className="text-sm text-slate-400 px-3 py-3 text-center">No classes match.</p>}
          </div>
        </div>

        {selectedClassIds.size > 0 && (
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelCls + ' mb-0'}>Subjects &amp; pages per paper</label>
              {loadingSubjects || loadingPop ? <span className="text-xs text-slate-400">Loading…</span> : null}
            </div>
            <div className="flex gap-2">
              <input className={inputCls} type="number" min="1" step="1" placeholder="Fill all with N pages"
                value={fillPages} onChange={e => setFillPages(e.target.value)} />
              <button onClick={applyFillPages} type="button"
                className="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                Apply to all
              </button>
            </div>

            {subjects.length === 0 && !loadingSubjects && (
              <p className="text-sm text-slate-400 py-2">
                No subjects are allocated to these classes yet — set them up under Curriculum → Allocations first.
              </p>
            )}

            {subjects.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 divide-y divide-slate-100 dark:divide-slate-700 max-h-64 overflow-y-auto">
                <div className="grid grid-cols-[1fr_70px_90px_90px] gap-2 px-3 py-1.5 text-xs font-semibold text-slate-400 bg-slate-50 dark:bg-slate-700/40">
                  <span>Subject</span><span className="text-right">Students</span><span className="text-right">Pages</span><span className="text-right">Sheets</span>
                </div>
                {rows.map(r => (
                  <div key={r.subject.id} className="grid grid-cols-[1fr_70px_90px_90px] gap-2 px-3 py-1.5 items-center text-sm">
                    <span className="text-slate-700 dark:text-slate-200 truncate">{r.subject.name}</span>
                    <span className="text-right text-slate-500 dark:text-slate-400">{r.population}</span>
                    <input type="number" min="0" step="1" className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-right"
                      value={pagesBySubject[r.subject.id] || ''} onChange={e => setPagesBySubject(prev => ({ ...prev, [r.subject.id]: e.target.value }))} />
                    <span className="text-right text-slate-500 dark:text-slate-400">{r.subtotalSheets || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-slate-100 dark:border-slate-700 pt-3 grid grid-cols-3 gap-3 items-end">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 pb-2.5">
            <input type="checkbox" checked={doubleSided} onChange={e => setDoubleSided(e.target.checked)} />
            Both sides
          </label>
          <div>
            <label className={labelCls}>Sheets/ream</label>
            <input type="number" min="1" step="1" className={inputCls} value={sheetsPerUnit} onChange={e => setSheetsPerUnit(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Buffer %</label>
            <input type="number" min="0" step="1" className={inputCls} value={bufferPct} onChange={e => setBufferPct(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5 text-sm">
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>Total sheets (before buffer)</span>
            <span>{totalSheetsRaw || '—'}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-800 dark:text-white mt-1">
            <span>Suggested Quantity (reams/boxes)</span>
            <span>{totalReams ?? '—'}</span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          This whole-exam total isn&apos;t saved as a reusable formula — paper lengths change each exam period, so recalculate next time.
        </p>

        {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600">Cancel</button>
          <button onClick={applyAndClose} disabled={saving || totalReams == null}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#145C44' }}>
            Add As Budget Line
          </button>
        </div>
      </div>
    </div>
  );
}
