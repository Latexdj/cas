'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Subject { id: string; class_name: string; subject_name: string; max_class_score: number; max_exam_score: number; sort_order: number; }

const CLASSES = ['Nursery 1','Nursery 2','KG 1','KG 2','Basic 1','Basic 2','Basic 3','Basic 4','Basic 5','Basic 6','JHS 1','JHS 2','JHS 3'];

const DEFAULT_SUBJECTS: Record<string, string[]> = {
  'KG 1':    ['Literacy','Numeracy','Environmental Studies','Creative Arts','RME','Physical Development'],
  'KG 2':    ['Literacy','Numeracy','Environmental Studies','Creative Arts','RME','Physical Development'],
  'Basic 1': ['English Language','Mathematics','Science','Social Studies','RME','Creative Arts','Ghanaian Language'],
  'Basic 2': ['English Language','Mathematics','Science','Social Studies','RME','Creative Arts','Ghanaian Language'],
  'Basic 3': ['English Language','Mathematics','Science','Social Studies','RME','Creative Arts','Ghanaian Language'],
  'Basic 4': ['English Language','Mathematics','Integrated Science','Social Studies','RME','Creative Arts','Ghanaian Language','French','Computing'],
  'Basic 5': ['English Language','Mathematics','Integrated Science','Social Studies','RME','Creative Arts','Ghanaian Language','French','Computing'],
  'Basic 6': ['English Language','Mathematics','Integrated Science','Social Studies','RME','Creative Arts','Ghanaian Language','French','Computing'],
  'JHS 1':   ['English Language','Mathematics','Integrated Science','Social Studies','RME','Creative Arts','Ghanaian Language','French','Computing','Career Technology'],
  'JHS 2':   ['English Language','Mathematics','Integrated Science','Social Studies','RME','Creative Arts','Ghanaian Language','French','Computing','Career Technology'],
  'JHS 3':   ['English Language','Mathematics','Integrated Science','Social Studies','RME','Creative Arts','Ghanaian Language','French','Computing','Career Technology'],
};

export default function PrimarySubjectsPage() {
  const [filterClass, setFilterClass] = useState('');
  const [subjects,    setSubjects]    = useState<Subject[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState<Subject | null>(null);
  const [form,        setForm]        = useState({ class_name: '', subject_name: '', max_class_score: '30', max_exam_score: '70', sort_order: '0' });
  const [saving,      setSaving]      = useState(false);
  const [bulkClass,   setBulkClass]   = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterClass) params.class_name = filterClass;
      const { data } = await api.get<Subject[]>('/api/primary/subjects', { params });
      setSubjects(data);
    } catch { setError('Failed to load subjects.'); }
    finally { setLoading(false); }
  }, [filterClass]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({ class_name: filterClass, subject_name: '', max_class_score: '30', max_exam_score: '70', sort_order: String(subjects.length) });
    setShowForm(true);
  }

  function openEdit(s: Subject) {
    setEditing(s);
    setForm({ class_name: s.class_name, subject_name: s.subject_name, max_class_score: String(s.max_class_score), max_exam_score: String(s.max_exam_score), sort_order: String(s.sort_order) });
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/primary/subjects/${editing.id}`, { subject_name: form.subject_name, max_class_score: form.max_class_score, max_exam_score: form.max_exam_score, sort_order: form.sort_order });
      } else {
        await api.post('/api/primary/subjects', form);
      }
      setShowForm(false); load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this subject? All related scores will also be deleted.')) return;
    try { await api.delete(`/api/primary/subjects/${id}`); load(); }
    catch { setError('Delete failed.'); }
  }

  async function bulkAdd() {
    if (!bulkClass) return;
    const defaults = DEFAULT_SUBJECTS[bulkClass];
    if (!defaults) { setError('No default subjects for this class.'); return; }
    setBulkLoading(true);
    try {
      for (let i = 0; i < defaults.length; i++) {
        await api.post('/api/primary/subjects', { class_name: bulkClass, subject_name: defaults[i], max_class_score: 30, max_exam_score: 70, sort_order: i });
      }
      if (!filterClass) setFilterClass(bulkClass);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Bulk add failed.');
    } finally { setBulkLoading(false); }
  }

  const grouped = subjects.reduce<Record<string, Subject[]>>((acc, s) => {
    (acc[s.class_name] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Subjects</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure subjects and score weights per class.</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#15803D' }}>
          + Add Subject
        </button>
      </div>

      {/* Filters + quick-seed */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-3 items-center shadow-sm">
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">All Classes</option>
          {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-500">Seed defaults for:</span>
          <select value={bulkClass} onChange={e => setBulkClass(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Select class…</option>
            {Object.keys(DEFAULT_SUBJECTS).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={bulkAdd} disabled={!bulkClass || bulkLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
            {bulkLoading ? 'Adding…' : 'Seed'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No subjects yet. Use "Seed" to add GES defaults for a class.</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cls, subs]) => (
            <div key={cls} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="font-bold text-slate-900">{cls}</p>
                <p className="text-xs text-slate-400">{subs.length} subject{subs.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="divide-y divide-slate-50">
                {subs.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{s.subject_name}</p>
                      <p className="text-xs text-slate-400">Class: {s.max_class_score} + Exam: {s.max_exam_score} = {parseFloat(String(s.max_class_score)) + parseFloat(String(s.max_exam_score))}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(s)} className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50">Edit</button>
                      <button onClick={() => del(s.id)} className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-slate-900">{editing ? 'Edit Subject' : 'Add Subject'}</h2>
            {!editing && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Class</label>
                <select value={form.class_name} onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select class…</option>
                  {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Subject Name</label>
              <input value={form.subject_name} onChange={e => setForm(f => ({ ...f, subject_name: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Max Class Score</label>
                <input type="number" value={form.max_class_score} onChange={e => setForm(f => ({ ...f, max_class_score: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Max Exam Score</label>
                <input type="number" value={form.max_exam_score} onChange={e => setForm(f => ({ ...f, max_exam_score: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
