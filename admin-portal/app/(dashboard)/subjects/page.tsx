'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Subject } from '@/types/api';

const EMPTY = { name: '', code: '' };

interface UploadResult { inserted: number; updated: number; skipped: number; errors: { row: number; message: string }[] }

function downloadTemplate() {
  const csv = 'Subject Name,Code\nMATHEMATICS,Math\nENGLISH LANGUAGE,Eng\nBIOLOGY,Bio\nPHYSICS,Phy\nCHEMISTRY,Chem\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'subjects_template.csv'; a.click();
}

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<'create' | 'edit' | 'upload' | null>(null);
  const [form,     setForm]     = useState(EMPTY);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const fileRef                 = useRef<HTMLInputElement>(null);
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

  function openCreate() { setForm(EMPTY); setError(''); setEditId(null); setModal('create'); }
  function openEdit(s: Subject) {
    setForm({ name: s.name, code: s.code ?? '' });
    setEditId(s.id); setError(''); setModal('edit');
  }
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
    try {
      await api.delete(`/api/subjects/${id}`); await load();
    } catch (err: unknown) {
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
        <p className="text-sm text-slate-500">{subjects.length} subject{subjects.length !== 1 ? 's' : ''} defined</p>
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Subject Name', 'Code', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subjects.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.code ?? '—'}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => del(s.id, s.name)}>Del</Button>
                  </td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No subjects yet. Add one or upload an Excel file.</td></tr>
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
            <p className="text-xs text-slate-400">Existing subjects are updated (code refreshed). New subjects are added. Blank rows are skipped.</p>
          </div>

          <button onClick={downloadTemplate}
            className="text-sm font-semibold text-green-700 hover:underline">
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
