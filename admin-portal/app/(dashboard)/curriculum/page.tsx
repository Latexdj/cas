'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Subject, ClassItem, Program } from '@/types/api';

/* ── Tab bar ── */
type Tab = 'subjects' | 'classes' | 'programs';

function TabBar({ active, onSelect, subjectCount, classCount, programCount }: {
  active: Tab; onSelect: (t: Tab) => void; subjectCount: number; classCount: number; programCount: number;
}) {
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'subjects', label: 'Subjects', count: subjectCount },
    { id: 'classes',  label: 'Classes',  count: classCount  },
    { id: 'programs', label: 'Programs', count: programCount },
  ];
  return (
    <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: '#F1F5F9' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            backgroundColor: active === t.id ? '#FFFFFF' : 'transparent',
            color: active === t.id ? '#0F172A' : '#64748B',
            boxShadow: active === t.id ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
          }}
        >
          {t.label}
          <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
            style={{ backgroundColor: active === t.id ? '#F1F5F9' : '#E2E8F0', color: '#64748B' }}>
            {t.count}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── Subjects tab ── */
const SUBJECT_EMPTY = { name: '', code: '' };
interface UploadResult { inserted: number; updated: number; skipped: number; errors: { row: number; message: string }[] }

function downloadTemplate() {
  const csv = 'Subject Name,Code\nMATHEMATICS,Math\nENGLISH LANGUAGE,Eng\nBIOLOGY,Bio\nPHYSICS,Phy\nCHEMISTRY,Chem\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'subjects_template.csv'; a.click();
}

function SubjectsTab() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<'create' | 'edit' | 'upload' | null>(null);
  const [form,     setForm]     = useState(SUBJECT_EMPTY);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const fileRef                   = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [result,    setResult]    = useState<UploadResult | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Subject[]>('/api/subjects');
      setSubjects(data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() { setForm(SUBJECT_EMPTY); setError(''); setEditId(null); setModal('create'); }
  function openEdit(s: Subject) { setForm({ name: s.name, code: s.code ?? '' }); setEditId(s.id); setError(''); setModal('edit'); }
  function openUpload() { setUploadErr(''); setResult(null); setModal('upload'); }

  async function save() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'create') await api.post('/api/subjects', form);
      else                    await api.put(`/api/subjects/${editId}`, form);
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete subject "${name}"?`)) return;
    try { await api.delete(`/api/subjects/${id}`); await load(); }
    catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Failed to delete.');
    }
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setUploadErr('Please select a file.'); return; }
    setUploading(true); setUploadErr(''); setResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post<UploadResult>('/api/subjects/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      await load();
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setUploadErr(msg ?? 'Upload failed.');
    } finally { setUploading(false); }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm" style={{ color: '#94A3B8' }}>{subjects.length} subject{subjects.length !== 1 ? 's' : ''} defined</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openUpload}>↑ Upload Excel</Button>
          <Button onClick={openCreate}>+ Add Subject</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <table className="w-full text-sm">
            <thead style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
              <tr>
                {['Subject Name', 'Code', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, i) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors"
                  style={{ borderBottom: i < subjects.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#0F172A' }}>{s.name}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#64748B' }}>{s.code ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => del(s.id, s.name)}>Del</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-sm" style={{ color: '#94A3B8' }}>No subjects yet. Add one or upload an Excel file.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Subject' : 'Edit Subject'} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject Name *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. MATHEMATICS" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Short Code</label>
            <input className={inputCls} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. Math" />
            <p className="mt-1 text-xs text-slate-400">Optional abbreviation used in reports.</p>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Upload modal */}
      <Modal open={modal === 'upload'} onClose={() => setModal(null)} title="Upload Subjects from Excel" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-700">Expected columns (row 1 = optional header):</p>
            <p>
              <code className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs">A</code>
              {' '}Subject Name &nbsp;·&nbsp;{' '}
              <code className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs">B</code>
              {' '}Code <span className="text-slate-400">(optional)</span>
            </p>
            <p className="text-xs text-slate-400">Existing subjects are updated. New subjects are added. Blank rows are skipped.</p>
          </div>
          <button onClick={downloadTemplate} className="text-sm font-semibold text-green-700 hover:underline">
            ↓ Download template CSV
          </button>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">
              Select file (.xlsx, .xls, .csv)
            </label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
              className="w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-green-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-green-700 cursor-pointer" />
          </div>
          {uploadErr && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{uploadErr}</p>}
          {result && (
            <div className="space-y-2">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                <span className="font-semibold">{result.inserted}</span> new &nbsp;·&nbsp;
                <span className="font-semibold">{result.updated}</span> updated &nbsp;·&nbsp;
                <span className="font-semibold">{result.skipped}</span> skipped
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                  <p className="font-semibold">{result.errors.length} row error{result.errors.length !== 1 ? 's' : ''}:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs">Row {e.row}: {e.message}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
            <Button onClick={handleUpload} loading={uploading}>Import</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── Classes tab ── */
function ClassesTab() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<'create' | 'edit' | null>(null);
  const [name,    setName]    = useState('');
  const [editId,  setEditId]  = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<ClassItem[]>('/api/classes');
      setClasses(data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() { setName(''); setError(''); setEditId(null); setModal('create'); }
  function openEdit(c: ClassItem) { setName(c.name); setEditId(c.id); setError(''); setModal('edit'); }

  async function save() {
    if (!name.trim()) { setError('Class name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'create') await api.post('/api/classes', { name: name.trim() });
      else                    await api.put(`/api/classes/${editId}`, { name: name.trim() });
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string, n: string) {
    if (!confirm(`Delete class "${n}"?`)) return;
    try { await api.delete(`/api/classes/${id}`); await load(); }
    catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Failed to delete.');
    }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="space-y-4 max-w-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: '#94A3B8' }}>{classes.length} class{classes.length !== 1 ? 'es' : ''} defined</p>
        <Button onClick={openCreate}>+ Add Class</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <table className="w-full text-sm">
            <thead style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
              <tr>
                {['Class Name', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classes.map((c, i) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors"
                  style={{ borderBottom: i < classes.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#0F172A' }}>{c.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => del(c.id, c.name)}>Del</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {classes.length === 0 && (
                <tr><td colSpan={2} className="px-4 py-8 text-center text-sm" style={{ color: '#94A3B8' }}>No classes yet. Add your first class (e.g. Form 1, Form 2).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Class' : 'Edit Class'} maxWidth="max-w-xs">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Class Name *</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Form 1" maxLength={20} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── Programs tab ── */
function ProgramsTab() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<'create' | 'edit' | null>(null);
  const [form,     setForm]     = useState({ name: '', notes: '' });
  const [editId,   setEditId]   = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Program[]>('/api/programs');
      setPrograms(data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() { setForm({ name: '', notes: '' }); setError(''); setEditId(null); setModal('create'); }
  function openEdit(p: Program) { setForm({ name: p.name, notes: p.notes ?? '' }); setEditId(p.id); setError(''); setModal('edit'); }

  async function save() {
    if (!form.name.trim()) { setError('Program name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'create') await api.post('/api/programs', form);
      else                    await api.put(`/api/programs/${editId}`, form);
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete program "${name}"? Students assigned to it will have no program.`)) return;
    try { await api.delete(`/api/programs/${id}`); await load(); }
    catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Failed to delete.');
    }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm" style={{ color: '#94A3B8' }}>{programs.length} program{programs.length !== 1 ? 's' : ''} defined</p>
        <Button onClick={openCreate}>+ Add Program</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <table className="w-full text-sm">
            <thead style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
              <tr>
                {['Program Name', 'Active Students', 'Notes', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {programs.map((p, i) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors"
                  style={{ borderBottom: i < programs.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#0F172A' }}>{p.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
                      {p.student_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{p.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => del(p.id, p.name)}>Del</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {programs.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: '#94A3B8' }}>No programs yet. Add one (e.g. Science, General Arts, Business).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Program' : 'Edit Program'} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Program Name *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Science, General Arts" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</label>
            <input className={inputCls} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional description" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── Page ── */
export default function CurriculumPage() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const initialTab: Tab = rawTab === 'classes' ? 'classes' : rawTab === 'programs' ? 'programs' : 'subjects';
  const [tab,           setTab]           = useState<Tab>(initialTab);
  const [subjectCount,  setSubjectCount]  = useState(0);
  const [classCount,    setClassCount]    = useState(0);
  const [programCount,  setProgramCount]  = useState(0);

  useEffect(() => {
    Promise.allSettled([
      api.get<Subject[]>('/api/subjects'),
      api.get<ClassItem[]>('/api/classes'),
      api.get<Program[]>('/api/programs'),
    ]).then(([s, c, p]) => {
      if (s.status === 'fulfilled') setSubjectCount(s.value.data.length);
      if (c.status === 'fulfilled') setClassCount(c.value.data.length);
      if (p.status === 'fulfilled') setProgramCount(p.value.data.length);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Curriculum</h1>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>Manage subjects, class groups, and academic programs</p>
      </div>

      <TabBar active={tab} onSelect={setTab} subjectCount={subjectCount} classCount={classCount} programCount={programCount} />

      {tab === 'subjects' && <SubjectsTab />}
      {tab === 'classes'  && <ClassesTab  />}
      {tab === 'programs' && <ProgramsTab />}
    </div>
  );
}
