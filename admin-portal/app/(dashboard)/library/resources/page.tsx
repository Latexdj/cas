'use client';
import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Resource {
  id: string; title: string; subject: string | null; resource_type: string;
  academic_year: string | null; level: string | null;
  file_url: string; file_name: string; file_size_kb: number | null;
  download_count: number; created_at: string; uploaded_by_name: string | null;
}

const RESOURCE_TYPES = ['ebook', 'past_question', 'notes', 'other'];
const TYPE_LABELS: Record<string, string> = { ebook: 'E-Book', past_question: 'Past Question', notes: 'Notes', other: 'Other' };

const emptyForm = { title: '', subject: '', resource_type: 'past_question', academic_year: '', level: '' };

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filterType, setFilterType] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState(emptyForm);
  const [fileData,  setFileData]  = useState('');
  const [fileName,  setFileName]  = useState('');
  const [fileSizeKb, setFileSizeKb] = useState<number>(0);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    api.get<Resource[]>('/api/library-admin/resources', { params: { resource_type: filterType || undefined } })
      .then(r => setResources(r.data)).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { setLoading(true); load(); }, [filterType]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileSizeKb(Math.round(file.size / 1024));
    const reader = new FileReader();
    reader.onload = () => setFileData(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function uploadResource() {
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (!fileData || !fileName) { setError('Please select a file'); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post<Resource>('/api/library-admin/resources', {
        ...form,
        file_data: fileData,
        file_name: fileName,
        file_size_kb: fileSizeKb,
      });
      setResources(prev => [r.data, ...prev]);
      setShowModal(false);
      setForm(emptyForm); setFileData(''); setFileName('');
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Upload failed');
    } finally { setSaving(false); }
  }

  async function deleteResource(id: string) {
    if (!confirm('Delete this resource?')) return;
    try {
      await api.delete(`/api/library-admin/resources/${id}`);
      setResources(prev => prev.filter(r => r.id !== id));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to delete'); }
  }

  function formatSize(kb: number | null) {
    if (!kb) return '';
    if (kb < 1024) return `${kb} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  const filtered = resources.filter(r => !filterType || r.resource_type === filterType);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Digital Resources</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">E-books, past questions, and notes</p>
        </div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setFileData(''); setFileName(''); setError(''); setShowModal(true); }}>
          + Upload Resource
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[{ value: '', label: 'All' }, ...RESOURCE_TYPES.map(t => ({ value: t, label: TYPE_LABELS[t] }))].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilterType(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${filterType === value ? 'bg-green-700 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No resources found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                {['Title','Type','Subject','Year','Level','Size','Downloads',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{r.title}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-semibold">
                      {TYPE_LABELS[r.resource_type] ?? r.resource_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.subject ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.academic_year ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.level ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatSize(r.file_size_kb)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.download_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">View</a>
                      <button onClick={() => deleteResource(r.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Upload Resource" maxWidth="max-w-lg">
        <div className="space-y-4">
          <Input label="Title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</label>
              <select
                className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                value={form.resource_type}
                onChange={e => setForm(p => ({ ...p, resource_type: e.target.value }))}
              >
                {RESOURCE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Academic Year" placeholder="e.g. 2024" value={form.academic_year} onChange={e => setForm(p => ({ ...p, academic_year: e.target.value }))} />
            <Input label="Level / Class" value={form.level} onChange={e => setForm(p => ({ ...p, level: e.target.value }))} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">File (PDF)</label>
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleFile} className="text-sm text-slate-700 dark:text-slate-300" />
            {fileName && <p className="text-xs text-slate-500">{fileName} ({formatSize(fileSizeKb)})</p>}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button loading={saving} onClick={uploadResource}>Upload</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
