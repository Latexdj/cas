'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Subject, ClassItem, Program, House, AssessmentMode } from '@/types/api';

/* ── Tab bar ── */
type Tab = 'subjects' | 'classes' | 'programs' | 'houses' | 'assessment-modes' | 'allocations';

function TabBar({ active, onSelect, subjectCount, classCount, programCount, houseCount, modeCount, gapCount }: {
  active: Tab; onSelect: (t: Tab) => void;
  subjectCount: number; classCount: number; programCount: number; houseCount: number; modeCount: number; gapCount: number;
}) {
  const tabs: { id: Tab; label: string; count: number; alert?: boolean }[] = [
    { id: 'subjects',          label: 'Subjects',     count: subjectCount },
    { id: 'classes',           label: 'Classes',      count: classCount   },
    { id: 'programs',          label: 'Programs',     count: programCount },
    { id: 'houses',            label: 'Houses',       count: houseCount   },
    { id: 'assessment-modes',  label: 'CA Modes',     count: modeCount    },
    { id: 'allocations',       label: 'Allocations',  count: gapCount, alert: gapCount > 0 },
  ];
  return (
    <div className="flex flex-wrap gap-1 p-1 rounded-xl" style={{ backgroundColor: '#F1F5F9' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            backgroundColor: active === t.id ? '#FFFFFF' : 'transparent',
            color: active === t.id ? '#0F172A' : '#64748B',
            boxShadow: active === t.id ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
          }}
        >
          {t.label}
          <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
            style={{
              backgroundColor: t.alert ? '#FEF2F2' : active === t.id ? '#F1F5F9' : '#E2E8F0',
              color: t.alert ? '#DC2626' : '#64748B',
            }}>
            {t.count}
          </span>
        </button>
      ))}
    </div>
  );
}

const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

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
          <div className="overflow-x-auto">
          <table className="min-w-[450px] w-full text-sm">
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
        </div>
      )}

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
          <div className="overflow-x-auto">
          <table className="min-w-[350px] w-full text-sm">
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
const EXAM_BODIES = ['WAEC', 'CTVET', 'Both'] as const;
type ExamBody = typeof EXAM_BODIES[number];

function ProgramsTab() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<'create' | 'edit' | null>(null);
  const [form,     setForm]     = useState({ name: '', notes: '', exam_body: 'WAEC' as ExamBody });
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

  function openCreate() { setForm({ name: '', notes: '', exam_body: 'WAEC' }); setError(''); setEditId(null); setModal('create'); }
  function openEdit(p: Program) {
    setForm({ name: p.name, notes: p.notes ?? '', exam_body: (p.exam_body as ExamBody) || 'WAEC' });
    setEditId(p.id); setError(''); setModal('edit');
  }

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

  const examBodyBadge = (eb: string) => {
    const styles: Record<string, { bg: string; color: string }> = {
      WAEC:  { bg: '#DBEAFE', color: '#1D4ED8' },
      CTVET: { bg: '#FEF3C7', color: '#B45309' },
      Both:  { bg: '#F3E8FF', color: '#7C3AED' },
    };
    const s = styles[eb] || { bg: '#F1F5F9', color: '#64748B' };
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={s}>
        {eb}
      </span>
    );
  };

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
          <div className="overflow-x-auto">
          <table className="min-w-[600px] w-full text-sm">
            <thead style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
              <tr>
                {['Program Name', 'Exam Body', 'Active Students', 'Notes', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {programs.map((p, i) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors"
                  style={{ borderBottom: i < programs.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#0F172A' }}>{p.name}</td>
                  <td className="px-4 py-3">{examBodyBadge(p.exam_body || 'WAEC')}</td>
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
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#94A3B8' }}>No programs yet. Add one (e.g. Science, General Arts, Business).</td></tr>
              )}
            </tbody>
          </table>
          </div>
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
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exam Body *</label>
            <select className={inputCls} value={form.exam_body} onChange={e => setForm(f => ({ ...f, exam_body: e.target.value as ExamBody }))}>
              {EXAM_BODIES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-400">Determines grading scale used on report cards for students in this program.</p>
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

/* ── Houses tab ── */
function HousesTab() {
  const [houses,  setHouses]  = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<'create' | 'edit' | null>(null);
  const [form,    setForm]    = useState({ name: '', notes: '' });
  const [editId,  setEditId]  = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<House[]>('/api/houses');
      setHouses(data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() { setForm({ name: '', notes: '' }); setError(''); setEditId(null); setModal('create'); }
  function openEdit(h: House) { setForm({ name: h.name, notes: h.notes ?? '' }); setEditId(h.id); setError(''); setModal('edit'); }

  async function save() {
    if (!form.name.trim()) { setError('House name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'create') await api.post('/api/houses', form);
      else                    await api.put(`/api/houses/${editId}`, form);
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete house "${name}"? Students assigned to it will retain the name but it will no longer appear in the dropdown.`)) return;
    try { await api.delete(`/api/houses/${id}`); await load(); }
    catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Failed to delete.');
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm" style={{ color: '#94A3B8' }}>{houses.length} house{houses.length !== 1 ? 's' : ''} defined</p>
        <Button onClick={openCreate}>+ Add House</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <div className="overflow-x-auto">
            <table className="min-w-[500px] w-full text-sm">
              <thead style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                <tr>
                  {['House Name', 'Active Students', 'Notes', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {houses.map((h, i) => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors"
                    style={{ borderBottom: i < houses.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: '#0F172A' }}>{h.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
                        {h.student_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{h.notes ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(h)}>Edit</Button>
                        <Button variant="danger" size="sm" onClick={() => del(h.id, h.name)}>Del</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {houses.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: '#94A3B8' }}>No houses yet. Add one (e.g. Unity, Courage, Integrity).</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add House' : 'Edit House'} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">House Name *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Unity, Courage, Integrity" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</label>
            <input className={inputCls} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional description or house colour" />
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

/* ── Assessment Modes tab ── */
function AssessmentModesTab() {
  const [modes,   setModes]   = useState<AssessmentMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<'create' | 'edit' | null>(null);
  const [form,    setForm]    = useState({ name: '', ca_contribution: '', sort_order: '' });
  const [editId,  setEditId]  = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<AssessmentMode[]>('/api/assessment-modes');
      setModes(data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() { setForm({ name: '', ca_contribution: '', sort_order: '' }); setError(''); setEditId(null); setModal('create'); }
  function openEdit(m: AssessmentMode) {
    setForm({ name: m.name, ca_contribution: String(m.ca_contribution), sort_order: String(m.sort_order) });
    setEditId(m.id); setError(''); setModal('edit');
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      const body = { name: form.name.trim(), ca_contribution: parseFloat(form.ca_contribution) || 0, sort_order: parseInt(form.sort_order) || 0 };
      if (modal === 'create') await api.post('/api/assessment-modes', body);
      else                    await api.put(`/api/assessment-modes/${editId}`, body);
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete assessment mode "${name}"? All assessments using this mode will also be deleted.`)) return;
    try { await api.delete(`/api/assessment-modes/${id}`); await load(); }
    catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Failed to delete.');
    }
  }

  const totalContribution = modes.reduce((s, m) => s + parseFloat(String(m.ca_contribution)), 0);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm" style={{ color: '#94A3B8' }}>{modes.length} CA mode{modes.length !== 1 ? 's' : ''}</p>
          {modes.length > 0 && (
            <p className="text-xs mt-0.5" style={{ color: totalContribution > 0 ? '#64748B' : '#94A3B8' }}>
              Total CA contribution: <span className="font-semibold" style={{ color: '#0F172A' }}>{totalContribution}</span> marks
              <span className="ml-1 text-slate-400">(set CA % in Settings)</span>
            </p>
          )}
        </div>
        <Button onClick={openCreate}>+ Add Mode</Button>
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        <p className="font-semibold mb-0.5">How CA Modes work</p>
        <p className="text-xs text-blue-700">Each mode (e.g. Class Test, Assignment) has a CA contribution in marks. Teachers record multiple instances per mode per subject. Scores are averaged per mode, then weighted by its contribution to calculate the final CA score.</p>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <div className="overflow-x-auto">
            <table className="min-w-[480px] w-full text-sm">
              <thead style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                <tr>
                  {['Mode Name', 'CA Contribution (marks)', 'Order', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modes.map((m, i) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors"
                    style={{ borderBottom: i < modes.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: '#0F172A' }}>{m.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                        {m.ca_contribution}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#64748B' }}>{m.sort_order}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>Edit</Button>
                        <Button variant="danger" size="sm" onClick={() => del(m.id, m.name)}>Del</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {modes.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: '#94A3B8' }}>No modes yet. Example: Class Test (20 marks), Assignment (10 marks).</td></tr>
                )}
              </tbody>
              {modes.length > 0 && (
                <tfoot style={{ borderTop: '2px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  <tr>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: '#0F172A' }}>Total</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
                        {totalContribution}
                      </span>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add CA Mode' : 'Edit CA Mode'} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mode Name *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Class Test, Assignment, Portfolio" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">CA Contribution (marks) *</label>
            <input className={inputCls} type="number" min="0" max="100" step="0.5"
              value={form.ca_contribution} onChange={e => setForm(f => ({ ...f, ca_contribution: e.target.value }))}
              placeholder="e.g. 20" />
            <p className="mt-1 text-xs text-slate-400">How many of the total CA marks this mode contributes.</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Display Order</label>
            <input className={inputCls} type="number" min="0"
              value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
              placeholder="0" />
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

/* ── Allocations tab ── */
interface ClassSubjectRow {
  id: string; class_name: string; subject_id: string;
  subject_name: string; subject_code: string | null; periods_per_week: number;
}
interface CoverageRow {
  class_subject_id: string; class_name: string; subject: string;
  expected_periods: number; periods_scheduled: number;
  periods_with_teacher: number; periods_without_teacher: number;
  status: 'covered' | 'unteachered' | 'unscheduled';
}
const STATUS_CFG = {
  covered:     { label: 'Covered',    color: '#15803D', bg: '#F0FDF4', dot: '#16A34A' },
  unteachered: { label: 'No Teacher', color: '#B45309', bg: '#FFFBEB', dot: '#D97706' },
  unscheduled: { label: 'Missing',    color: '#DC2626', bg: '#FEF2F2', dot: '#EF4444' },
};

function AllocationsTab({ onGapChange }: { onGapChange: (n: number) => void }) {
  const [classes,       setClasses]       = useState<ClassItem[]>([]);
  const [subjects,      setSubjects]      = useState<Subject[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [allocations,   setAllocations]   = useState<ClassSubjectRow[]>([]);
  const [coverage,      setCoverage]      = useState<CoverageRow[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [seeding,       setSeeding]       = useState(false);
  const [addSubjectId,  setAddSubjectId]  = useState('');
  const [addPeriods,    setAddPeriods]    = useState('1');
  const [adding,        setAdding]        = useState(false);
  const [seedMsg,       setSeedMsg]       = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<ClassItem[]>('/api/classes'),
      api.get<Subject[]>('/api/subjects'),
    ]).then(([c, s]) => {
      setClasses(c.data);
      setSubjects(s.data);
      if (c.data.length > 0) setSelectedClass(c.data[0].name);
    });
  }, []);

  const loadClass = useCallback(async (cls: string) => {
    if (!cls) return;
    setLoading(true);
    try {
      const enc = encodeURIComponent(cls);
      const [a, c] = await Promise.all([
        api.get<ClassSubjectRow[]>(`/api/timetable/class-subjects?class_name=${enc}`),
        api.get<CoverageRow[]>(`/api/timetable/coverage?class_name=${enc}`),
      ]);
      setAllocations(a.data);
      setCoverage(c.data);
      const gaps = c.data.filter(r => r.status !== 'covered').length;
      onGapChange(gaps);
    } finally { setLoading(false); }
  }, [onGapChange]);

  useEffect(() => { loadClass(selectedClass); }, [selectedClass, loadClass]);

  async function seed() {
    setSeeding(true); setSeedMsg(null);
    try {
      const { data } = await api.post<{ seeded: number }>('/api/timetable/class-subjects/seed', {});
      setSeedMsg(`✓ ${data.seeded} allocation${data.seeded !== 1 ? 's' : ''} seeded from current timetable.`);
      await loadClass(selectedClass);
    } catch { alert('Seed failed.'); }
    finally { setSeeding(false); }
  }

  async function addAllocation() {
    if (!addSubjectId || !selectedClass) return;
    setAdding(true);
    try {
      await api.post('/api/timetable/class-subjects', {
        class_name: selectedClass, subject_id: addSubjectId,
        periods_per_week: parseInt(addPeriods) || 1,
      });
      setAddSubjectId('');
      await loadClass(selectedClass);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Failed to add.');
    } finally { setAdding(false); }
  }

  async function remove(id: string) {
    if (!confirm('Remove this subject from the class curriculum?')) return;
    await api.delete(`/api/timetable/class-subjects/${id}`);
    await loadClass(selectedClass);
  }

  const covMap     = new Map(coverage.map(c => [c.subject.toLowerCase(), c]));
  const allocIds   = new Set(allocations.map(a => a.subject_id));
  const unalloc    = subjects.filter(s => !allocIds.has(s.id));
  const selectCls  = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          Map which subjects each class must offer, then see gaps against the live timetable.
        </p>
        <Button variant="secondary" loading={seeding} onClick={seed}>↺ Auto-seed from timetable</Button>
      </div>

      {seedMsg && (
        <div className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-800">
          <span>{seedMsg}</span>
          <button onClick={() => setSeedMsg(null)} className="text-green-600 font-bold ml-4">✕</button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Class</label>
        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className={selectCls}>
          {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <span className="text-xs text-slate-400">{allocations.length} subject{allocations.length !== 1 ? 's' : ''} allocated</span>
      </div>

      {loading ? (
        <div className="flex justify-center h-24 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl overflow-hidden border border-slate-100 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Subject', 'Periods/Week', 'Scheduled', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allocations.map(a => {
                  const cov = covMap.get(a.subject_name.toLowerCase());
                  const st  = cov ? STATUS_CFG[cov.status] : null;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {a.subject_name}
                        {a.subject_code && <span className="ml-1.5 text-xs text-slate-400">({a.subject_code})</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{a.periods_per_week}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {cov ? (
                          <span>
                            {cov.periods_scheduled} slot{cov.periods_scheduled !== 1 ? 's' : ''}
                            {cov.periods_without_teacher > 0 && (
                              <span className="ml-1 text-xs text-amber-600">({cov.periods_without_teacher} no teacher)</span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {st ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: st.bg, color: st.color }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
                            {st.label}
                          </span>
                        ) : <span className="text-xs text-slate-400">No timetable data</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="danger" size="sm" onClick={() => remove(a.id)}>Remove</Button>
                      </td>
                    </tr>
                  );
                })}
                {allocations.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                    No subjects allocated to {selectedClass || 'this class'} yet.{' '}
                    <button className="underline text-green-600 font-medium" onClick={seed}>Auto-seed from timetable</button>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {unalloc.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <select value={addSubjectId} onChange={e => setAddSubjectId(e.target.value)} className={selectCls}>
                <option value="">— Add subject —</option>
                {unalloc.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input type="number" min="1" max="20" value={addPeriods}
                onChange={e => setAddPeriods(e.target.value)}
                className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                title="Expected periods per week" />
              <span className="text-xs text-slate-400">periods/week</span>
              <Button onClick={addAllocation} loading={adding} disabled={!addSubjectId}>+ Add</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Page ── */
export default function CurriculumPage() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const initialTab: Tab = (
    rawTab === 'classes' ? 'classes' :
    rawTab === 'programs' ? 'programs' :
    rawTab === 'houses' ? 'houses' :
    rawTab === 'assessment-modes' ? 'assessment-modes' :
    rawTab === 'allocations' ? 'allocations' :
    'subjects'
  );
  const [tab,          setTab]          = useState<Tab>(initialTab);
  const [subjectCount, setSubjectCount] = useState(0);
  const [classCount,   setClassCount]   = useState(0);
  const [programCount, setProgramCount] = useState(0);
  const [houseCount,   setHouseCount]   = useState(0);
  const [modeCount,    setModeCount]    = useState(0);
  const [gapCount,     setGapCount]     = useState(0);

  useEffect(() => {
    Promise.allSettled([
      api.get<Subject[]>('/api/subjects'),
      api.get<ClassItem[]>('/api/classes'),
      api.get<Program[]>('/api/programs'),
      api.get<House[]>('/api/houses'),
      api.get<AssessmentMode[]>('/api/assessment-modes'),
    ]).then(([s, c, p, h, m]) => {
      if (s.status === 'fulfilled') setSubjectCount(s.value.data.length);
      if (c.status === 'fulfilled') setClassCount(c.value.data.length);
      if (p.status === 'fulfilled') setProgramCount(p.value.data.length);
      if (h.status === 'fulfilled') setHouseCount(h.value.data.length);
      if (m.status === 'fulfilled') setModeCount(m.value.data.length);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Curriculum</h1>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>Manage subjects, class groups, programs, houses, and assessment modes</p>
      </div>

      <TabBar active={tab} onSelect={setTab}
        subjectCount={subjectCount} classCount={classCount}
        programCount={programCount} houseCount={houseCount} modeCount={modeCount} gapCount={gapCount} />

      {tab === 'subjects'          && <SubjectsTab         />}
      {tab === 'classes'           && <ClassesTab          />}
      {tab === 'programs'          && <ProgramsTab         />}
      {tab === 'houses'            && <HousesTab           />}
      {tab === 'assessment-modes'  && <AssessmentModesTab  />}
      {tab === 'allocations'       && <AllocationsTab onGapChange={setGapCount} />}
    </div>
  );
}
