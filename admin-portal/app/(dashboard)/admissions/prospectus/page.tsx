'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface Program { id: string; name: string; }
interface ProspectusRow {
  id: string; program_id: string | null; program_name: string | null;
  gender: string; residential_status: string; file_url: string; file_name: string; uploaded_at: string;
}

const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function ProspectusPage() {
  const [rows,      setRows]      = useState<ProspectusRow[]>([]);
  const [programs,  setPrograms]  = useState<Program[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const fileRef   = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    program_id: '', gender: 'All', residential_status: 'All', file_name: '',
  });
  const [fileB64, setFileB64] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, pg] = await Promise.all([
        api.get('/api/admin/admissions/prospectus'),
        api.get('/api/admin/settings/programs').catch(() => api.get('/api/admin/curriculum/programs')),
      ]);
      setRows(pr.data);
      setPrograms(pg.data?.programs ?? pg.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!fileB64 || !form.file_name) { setError('Please select a file.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/admin/admissions/prospectus', {
        program_id: form.program_id || null,
        gender: form.gender,
        residential_status: form.residential_status,
        file_data: fileB64,
        file_name: form.file_name,
      });
      setForm({ program_id: '', gender: 'All', residential_status: 'All', file_name: '' });
      setFileB64('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed');
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this prospectus file?')) return;
    await api.delete(`/api/admin/admissions/prospectus/${id}`);
    load();
  }

  function fmtLabel(row: ProspectusRow) {
    const parts = [];
    if (row.program_name) parts.push(row.program_name); else parts.push('All Programs');
    parts.push(row.gender === 'All' ? 'All Genders' : row.gender);
    parts.push(row.residential_status === 'All' ? 'All Residential' : row.residential_status);
    return parts.join(' · ');
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Prospectus Files</h1>
        <p className="text-sm text-slate-400 mt-0.5">Upload prospectus PDFs by program, gender, and residential status. Students will be matched to the most specific prospectus available.</p>
      </div>

      {/* Upload form */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Upload New Prospectus</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Program</label>
            <select value={form.program_id} onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))} className={inputCls}>
              <option value="">All Programs</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</label>
            <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className={inputCls}>
              <option value="All">All</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Residential Status</label>
            <select value={form.residential_status} onChange={e => setForm(f => ({ ...f, residential_status: e.target.value }))} className={inputCls}>
              <option value="All">All</option>
              <option value="Boarding">Boarding</option>
              <option value="Day">Day</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">PDF File</label>
          <input ref={fileRef} type="file" accept=".pdf" className="mt-1 text-xs text-slate-600 w-full"
            onChange={async e => {
              const f = e.target.files?.[0];
              if (f) { setForm(fm => ({ ...fm, file_name: f.name })); setFileB64(await fileToBase64(f)); }
            }} />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end">
          <Button onClick={submit} loading={saving}>Upload Prospectus</Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>{['Applies To','File Name','Uploaded',''].map(h =>
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
            )}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center">
                <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin mx-auto" />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">No prospectus files uploaded yet.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{fmtLabel(r)}</td>
                <td className="px-4 py-3 text-slate-600 text-xs font-mono">
                  <a href={r.file_url} target="_blank" className="text-green-700 underline">{r.file_name}</a>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(r.uploaded_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                </td>
                <td className="px-4 py-3">
                  <Button variant="danger" size="sm" onClick={() => del(r.id)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500">
        <strong>Prospectus fallback order:</strong> When a student requests their prospectus, the system finds the best match in this order:
        exact program + gender + residential → program + gender + All → program + All + All → All Programs + All + All.
      </div>
    </div>
  );
}
