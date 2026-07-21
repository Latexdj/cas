'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogSubject {
  id: string; subject_name: string; description: string | null;
  sort_order: number; class_count: number;
}
interface ClassItem { id: string; class_name: string; }
interface ClassSubject {
  catalog_id: string; subject_name: string; catalog_sort: number;
  subject_id: string | null; max_class_score: number | null; max_exam_score: number | null;
  sort_order: number | null; assigned: boolean;
}

// GES defaults keyed by class name (used for bulk-seed)
const GES_DEFAULTS: Record<string, string[]> = {
  'Nursery 1': ['Literacy','Numeracy','Creative Arts','Physical Development','Environmental Studies'],
  'Nursery 2': ['Literacy','Numeracy','Creative Arts','Physical Development','Environmental Studies'],
  'KG 1':     ['Literacy','Numeracy','Environmental Studies','Creative Arts','RME','Physical Development'],
  'KG 2':     ['Literacy','Numeracy','Environmental Studies','Creative Arts','RME','Physical Development'],
  'Basic 1':  ['Science','English Language','Mathematics','Creative Arts','Ghanaian Language','Our World Our People (OWAP)','History','Physical Education (PE)','Religious & Moral Education (RME)'],
  'Basic 2':  ['Science','English Language','Mathematics','Creative Arts','Ghanaian Language','Our World Our People (OWAP)','History','Physical Education (PE)','Religious & Moral Education (RME)'],
  'Basic 3':  ['Science','English Language','Mathematics','Creative Arts','Ghanaian Language','Our World Our People (OWAP)','History','Physical Education (PE)','Religious & Moral Education (RME)'],
  'Basic 4':  ['Science','English Language','Mathematics','Creative Arts','Ghanaian Language','Our World Our People (OWAP)','History','Physical Education (PE)','Computing','Religious & Moral Education (RME)'],
  'Basic 5':  ['Science','English Language','Mathematics','Creative Arts','Ghanaian Language','Our World Our People (OWAP)','History','Physical Education (PE)','Computing','Religious & Moral Education (RME)'],
  'Basic 6':  ['Science','English Language','Mathematics','Creative Arts','Ghanaian Language','Our World Our People (OWAP)','History','Physical Education (PE)','Computing','Religious & Moral Education (RME)'],
  'JHS 1':   ['English Language','Mathematics','Integrated Science','Social Studies','RME','Creative Arts','Ghanaian Language','French','Computing','Career Technology'],
  'JHS 2':   ['English Language','Mathematics','Integrated Science','Social Studies','RME','Creative Arts','Ghanaian Language','French','Computing','Career Technology'],
  'JHS 3':   ['English Language','Mathematics','Integrated Science','Social Studies','RME','Creative Arts','Ghanaian Language','French','Computing','Career Technology'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin mx-auto"
      style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
  );
}

function errMsg(e: unknown) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Something went wrong.';
}

// ── Catalog modal ─────────────────────────────────────────────────────────────

function CatalogModal({ editing, onClose, onSaved }: {
  editing: CatalogSubject | null; onClose: () => void; onSaved: () => void;
}) {
  const [name,   setName]   = useState(editing?.subject_name ?? '');
  const [desc,   setDesc]   = useState(editing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function save() {
    if (!name.trim()) return setErr('Subject name is required.');
    setSaving(true); setErr('');
    try {
      if (editing) {
        await api.put(`/api/primary/subject-catalog/${editing.id}`, { subject_name: name.trim(), description: desc || null });
      } else {
        await api.post('/api/primary/subject-catalog', { subject_name: name.trim(), description: desc || null });
      }
      onSaved(); onClose();
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h2 className="font-bold text-slate-900">{editing ? 'Edit Subject' : 'Add Subject to Catalog'}</h2>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Subject Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder="e.g. English Language"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Description <span className="font-normal text-slate-400">(optional)</span></label>
          <input value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Short note about this subject"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-slate-700 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#15803D' }}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Subject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PrimarySubjectsPage() {
  const [catalog,      setCatalog]      = useState<CatalogSubject[]>([]);
  const [classes,      setClasses]      = useState<ClassItem[]>([]);
  const [catLoading,   setCatLoading]   = useState(true);
  const [modal,        setModal]        = useState<'create'|'edit'|null>(null);
  const [editItem,     setEditItem]     = useState<CatalogSubject | null>(null);
  const [catError,     setCatError]     = useState('');

  // Class-subject assignment panel
  const [selClass,     setSelClass]     = useState('');
  const [classSubjs,   setClassSubjs]   = useState<ClassSubject[]>([]);
  const [drafts,       setDrafts]       = useState<Record<string, { assigned: boolean; cs: string; ex: string }>>({});
  const [assignLoad,   setAssignLoad]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState('');
  const [assignError,  setAssignError]  = useState('');

  // Bulk seed
  const [seeding,      setSeeding]      = useState(false);

  const loadCatalog = useCallback(async () => {
    setCatLoading(true); setCatError('');
    try {
      const { data } = await api.get<CatalogSubject[]>('/api/primary/subject-catalog');
      setCatalog(data);
    } catch { setCatError('Failed to load subjects.'); }
    finally { setCatLoading(false); }
  }, []);

  useEffect(() => {
    loadCatalog();
    api.get<ClassItem[]>('/api/primary/classes').then(r => setClasses(r.data)).catch(() => {});
  }, [loadCatalog]);

  const loadClassSubjects = useCallback(async (className: string) => {
    setAssignLoad(true); setAssignError(''); setSaveMsg('');
    try {
      const { data } = await api.get<ClassSubject[]>(`/api/primary/class-subjects?class_name=${encodeURIComponent(className)}`);
      setClassSubjs(data);
      const d: Record<string, { assigned: boolean; cs: string; ex: string }> = {};
      data.forEach(s => {
        d[s.catalog_id] = {
          assigned: s.assigned,
          cs: s.max_class_score != null ? String(s.max_class_score) : '30',
          ex: s.max_exam_score  != null ? String(s.max_exam_score)  : '70',
        };
      });
      setDrafts(d);
    } catch { setAssignError('Failed to load class subjects.'); }
    finally { setAssignLoad(false); }
  }, []);

  useEffect(() => {
    if (selClass) loadClassSubjects(selClass);
    else { setClassSubjs([]); setDrafts({}); }
  }, [selClass, loadClassSubjects]);

  async function saveAssignments() {
    if (!selClass) return;
    setSaving(true); setAssignError(''); setSaveMsg('');
    try {
      const assignments = classSubjs.map(s => ({
        catalog_id:      s.catalog_id,
        assigned:        drafts[s.catalog_id]?.assigned ?? false,
        max_class_score: parseFloat(drafts[s.catalog_id]?.cs ?? '30') || 30,
        max_exam_score:  parseFloat(drafts[s.catalog_id]?.ex ?? '70') || 70,
        sort_order:      classSubjs.findIndex(x => x.catalog_id === s.catalog_id),
      }));
      await api.put('/api/primary/class-subjects', { class_name: selClass, assignments });
      setSaveMsg('Saved!');
      loadClassSubjects(selClass);
      loadCatalog();
    } catch (e) { setAssignError(errMsg(e)); }
    finally { setSaving(false); }
  }

  async function deleteCatalog(item: CatalogSubject) {
    const warn = item.class_count > 0
      ? `"${item.subject_name}" is assigned to ${item.class_count} class(es). Deleting it will remove it from all classes and erase related scores. Continue?`
      : `Delete "${item.subject_name}" from the subject catalog?`;
    if (!confirm(warn)) return;
    try {
      await api.delete(`/api/primary/subject-catalog/${item.id}`);
      loadCatalog();
      if (selClass) loadClassSubjects(selClass);
    } catch (e) { setCatError(errMsg(e)); }
  }

  async function seedGES() {
    const defaults = GES_DEFAULTS[selClass]
      ?? GES_DEFAULTS[Object.keys(GES_DEFAULTS).find(k => k.toLowerCase() === selClass.toLowerCase()) ?? ''];
    if (!defaults) {
      setAssignError('No GES defaults available for this class. Add subjects to the catalog manually.');
      return;
    }
    if (!confirm(`Seed GES default subjects for ${selClass}? This will add missing subjects to the catalog and assign them to this class.`)) return;
    setSeeding(true); setAssignError('');
    try {
      // Add any missing subjects to catalog first
      for (let i = 0; i < defaults.length; i++) {
        try {
          await api.post('/api/primary/subject-catalog', { subject_name: defaults[i], sort_order: i });
        } catch { /* already exists — that's fine */ }
      }
      // Reload catalog, then load class-subjects and auto-assign
      const { data: freshCatalog } = await api.get<CatalogSubject[]>('/api/primary/subject-catalog');
      setCatalog(freshCatalog);
      const { data: freshClass } = await api.get<ClassSubject[]>(`/api/primary/class-subjects?class_name=${encodeURIComponent(selClass)}`);
      // Build assignments: assign all GES defaults, keep existing others unchanged
      const assignments = freshClass.map(s => {
        const isDefault = defaults.some(d => d.toLowerCase() === s.subject_name.toLowerCase());
        return {
          catalog_id:      s.catalog_id,
          assigned:        isDefault ? true : (s.assigned),
          max_class_score: s.max_class_score ?? 30,
          max_exam_score:  s.max_exam_score  ?? 70,
          sort_order:      defaults.findIndex(d => d.toLowerCase() === s.subject_name.toLowerCase()),
        };
      });
      await api.put('/api/primary/class-subjects', { class_name: selClass, assignments });
      setSaveMsg(`GES defaults applied to ${selClass}`);
      loadClassSubjects(selClass);
    } catch (e) { setAssignError(errMsg(e)); }
    finally { setSeeding(false); }
  }

  const assignedCount = Object.values(drafts).filter(d => d.assigned).length;
  const { displayRows: catalogRows, total: catalogTotal, page: catalogPage, setPage: setCatalogPage, pageSize: catalogPageSize, setPageSize: setCatalogPageSize } = useTableControls(catalog);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Subjects</h1>
        <p className="text-sm text-slate-500 mt-0.5">Build a subject catalog, then assign subjects to each class with their score weights.</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6 items-start">

        {/* ── LEFT: Subject Catalog ── */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Subject Catalog</h2>
              <p className="text-xs text-slate-400 mt-0.5">{catalog.length} subject{catalog.length !== 1 ? 's' : ''} school-wide</p>
            </div>
            <button onClick={() => { setEditItem(null); setModal('create'); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: '#15803D' }}>
              + Add Subject
            </button>
          </div>

          {catError && <p className="text-xs text-red-600 px-4 py-2">{catError}</p>}

          {catLoading ? (
            <div className="py-10"><Spinner /></div>
          ) : catalog.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-slate-400 mb-3">No subjects yet.</p>
              <p className="text-xs text-slate-400">Add subjects to the catalog first, then assign them to classes.</p>
              <button onClick={() => { setEditItem(null); setModal('create'); }}
                className="mt-3 text-xs font-semibold hover:underline" style={{ color: '#15803D' }}>
                + Add First Subject
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {(catalogRows as typeof catalog).map(s => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{s.subject_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {s.class_count > 0
                        ? <span style={{ color: '#15803D' }}>{s.class_count} class{s.class_count !== 1 ? 'es' : ''}</span>
                        : <span className="italic">Not assigned to any class</span>}
                      {s.description ? ` · ${s.description}` : ''}
                    </p>
                  </div>
                  {/* Always visible on touch; hover-reveal on desktop */}
                  <div className="flex gap-1 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditItem(s); setModal('edit'); }}
                      className="p-1.5 rounded-md hover:bg-gray-200 text-slate-400 hover:text-slate-700" title="Edit">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => deleteCatalog(s)}
                      className="p-1.5 rounded-md hover:bg-red-100 text-slate-400 hover:text-red-500" title="Delete">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination page={catalogPage} pageSize={catalogPageSize} total={catalogTotal} onPage={setCatalogPage} onPageSize={(s) => { setCatalogPageSize(s); setCatalogPage(1); }} />
        </div>

        {/* ── RIGHT: Class Assignment ── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Class selector */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3.5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Assign Subjects to a Class</h2>
            <div className="flex flex-wrap gap-3 items-center">
              <select value={selClass} onChange={e => setSelClass(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 flex-1 min-w-40">
                <option value="">Select a class…</option>
                {classes.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
              </select>
              {selClass && catalog.length > 0 && (
                <>
                  <button onClick={seedGES} disabled={seeding}
                    className="px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-slate-600 hover:bg-gray-50 disabled:opacity-50">
                    {seeding ? 'Seeding…' : '⚡ Seed GES Defaults'}
                  </button>
                  <button onClick={saveAssignments} disabled={saving}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ml-auto"
                    style={{ backgroundColor: '#15803D' }}>
                    {saving ? 'Saving…' : `Save (${assignedCount} subject${assignedCount !== 1 ? 's' : ''})`}
                  </button>
                </>
              )}
            </div>
            {saveMsg && <p className="text-xs font-semibold mt-2" style={{ color: '#15803D' }}>✓ {saveMsg}</p>}
            {assignError && <p className="text-xs text-red-600 mt-2">{assignError}</p>}
          </div>

          {/* Subject checklist */}
          {!selClass ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-slate-200 mx-auto mb-3">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-sm text-slate-400">Select a class to manage its subjects</p>
            </div>
          ) : catalog.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center px-6">
              <p className="text-sm text-slate-400">Add subjects to the catalog first, then come back to assign them to classes.</p>
            </div>
          ) : assignLoad ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-10"><Spinner /></div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selClass} — Subject Checklist</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Tick the subjects this class offers and set score weights.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    const allOn = classSubjs.every(s => drafts[s.catalog_id]?.assigned);
                    setDrafts(d => {
                      const n = { ...d };
                      classSubjs.forEach(s => { n[s.catalog_id] = { ...n[s.catalog_id], assigned: !allOn }; });
                      return n;
                    });
                  }} className="text-xs font-semibold hover:underline" style={{ color: '#15803D' }}>
                    {classSubjs.every(s => drafts[s.catalog_id]?.assigned) ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
              </div>

              <div className="divide-y divide-gray-50">
                {classSubjs.map(s => {
                  const d = drafts[s.catalog_id] ?? { assigned: false, cs: '30', ex: '70' };
                  return (
                    <div key={s.catalog_id}
                      className={`px-4 py-3 transition-colors ${d.assigned ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}>
                      {/* Top row: checkbox + subject name */}
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={d.assigned}
                          onChange={e => setDrafts(prev => ({
                            ...prev,
                            [s.catalog_id]: { ...prev[s.catalog_id], assigned: e.target.checked }
                          }))}
                          className="w-4 h-4 rounded accent-green-600 flex-shrink-0 cursor-pointer" />
                        <span className={`text-sm ${d.assigned ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                          {s.subject_name}
                        </span>
                      </div>
                      {/* Score weights — shown below when assigned, indented to align with text */}
                      {d.assigned && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2 ml-7">
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-slate-400 whitespace-nowrap">Class score /</label>
                            <input type="number" value={d.cs}
                              onChange={e => setDrafts(prev => ({
                                ...prev,
                                [s.catalog_id]: { ...prev[s.catalog_id], cs: e.target.value }
                              }))}
                              min={0} max={100} step={1}
                              className="w-16 border border-gray-200 rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-slate-400 whitespace-nowrap">Exam score /</label>
                            <input type="number" value={d.ex}
                              onChange={e => setDrafts(prev => ({
                                ...prev,
                                [s.catalog_id]: { ...prev[s.catalog_id], ex: e.target.value }
                              }))}
                              min={0} max={100} step={1}
                              className="w-16 border border-gray-200 rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500" />
                          </div>
                          <span className="text-xs text-slate-400">
                            = {(parseFloat(d.cs) || 0) + (parseFloat(d.ex) || 0)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer save */}
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <p className="text-xs text-slate-500">
                  <span className="font-semibold" style={{ color: '#15803D' }}>{assignedCount}</span> of {classSubjs.length} subjects assigned to {selClass}
                </p>
                <button onClick={saveAssignments} disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#15803D' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <CatalogModal
          editing={modal === 'edit' ? editItem : null}
          onClose={() => { setModal(null); setEditItem(null); }}
          onSaved={() => { loadCatalog(); if (selClass) loadClassSubjects(selClass); }}
        />
      )}
    </div>
  );
}
