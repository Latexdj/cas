'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import type { Teacher } from '@/types/api';

const EMPTY: Partial<Teacher & { password: string }> = {
  teacher_code: '', name: '', email: '', phone: '', department: '', status: 'Active', is_admin: false, notes: '', password: '',
};

interface UploadResult { inserted: number; errors: { row: number; message: string }[] }

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [modal, setModal]       = useState<'create' | 'edit' | 'upload' | null>(null);
  const [form, setForm]         = useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving]     = useState(false);

  // Upload state
  const fileRef                       = useRef<HTMLInputElement>(null);
  const [uploading,     setUploading]     = useState(false);
  const [uploadErr,     setUploadErr]     = useState('');
  const [uploadResult,  setUploadResult]  = useState<UploadResult | null>(null);
  const [error, setError]       = useState('');
  const [editId, setEditId]     = useState<string | null>(null);

  // Reset PIN state
  const [pinTarget,    setPinTarget]    = useState<Teacher | null>(null);
  const [pinInput,     setPinInput]     = useState('');
  const [pinResetting, setPinResetting] = useState(false);
  const [pinError,     setPinError]     = useState('');
  const [pinConfirmed, setPinConfirmed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Teacher[]>('/api/teachers');
      setTeachers(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openUpload() { setUploadErr(''); setUploadResult(null); setModal('upload'); }

  async function downloadTemplate() {
    try {
      const { data } = await api.get('/api/teachers/upload/template', { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data as Blob);
      a.download = 'teachers_template.csv'; a.click();
    } catch { alert('Could not download template.'); }
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setUploadErr('Please select a file.'); return; }
    setUploading(true); setUploadErr(''); setUploadResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post<UploadResult>('/api/teachers/upload', fd);
      setUploadResult(data);
      await load();
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setUploadErr(msg ?? 'Upload failed.');
    } finally { setUploading(false); }
  }

  function openCreate() {
    setForm(EMPTY); setError(''); setEditId(null); setModal('create');
  }
  function openEdit(t: Teacher) {
    setForm({ teacher_code: t.teacher_code, name: t.name, email: t.email ?? '', phone: t.phone ?? '',
      department: t.department ?? '', status: t.status, is_admin: t.is_admin, notes: t.notes ?? '', password: '' });
    setEditId(t.id); setError(''); setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const body: Record<string, unknown> = { ...form };
      if (!body.password) delete body.password;
      if (modal === 'create') {
        await api.post('/api/teachers', body);
      } else {
        await api.put(`/api/teachers/${editId}`, body);
      }
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save teacher.');
    } finally { setSaving(false); }
  }

  async function deleteTeacher(id: string, name: string) {
    if (!confirm(`Delete teacher "${name}"? This cannot be undone.`)) return;
    await api.delete(`/api/teachers/${id}`);
    await load();
  }

  function openResetPin(t: Teacher) {
    setPinTarget(t); setPinInput(''); setPinError(''); setPinConfirmed(null);
  }

  async function doResetPin() {
    if (!pinTarget) return;
    if (pinInput && !/^\d{4,8}$/.test(pinInput)) {
      setPinError('PIN must be 4–8 digits (numbers only).'); return;
    }
    setPinResetting(true); setPinError('');
    try {
      const { data } = await api.patch<{ pin: string }>(
        `/api/admin/teachers/${pinTarget.id}/reset-pin`,
        pinInput ? { pin: pinInput } : {}
      );
      setPinConfirmed(data.pin);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPinError(msg ?? 'Failed to reset PIN.');
    } finally {
      setPinResetting(false);
    }
  }

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.teacher_code.toLowerCase().includes(search.toLowerCase()) ||
    (t.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (t.department ?? '').toLowerCase().includes(search.toLowerCase())
  );

  function field(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Search by name, ID, email…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={openUpload}>↑ Upload Excel</Button>
          <Button onClick={openCreate}>+ Add Teacher</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['ID','Name','Email','Dept','Periods','Role','Status',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 text-xs">{t.teacher_code}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3 text-gray-600">{t.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.department ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.total_periods}</td>
                  <td className="px-4 py-3 text-gray-600">{t.is_admin ? 'Admin' : 'Teacher'}</td>
                  <td className="px-4 py-3"><Badge status={t.status} /></td>
                  <td className="px-4 py-3 flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => openResetPin(t)} title="Reset PIN">🔑 PIN</Button>
                    <Button variant="danger" size="sm" onClick={() => deleteTeacher(t.id, t.name)}>Del</Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No teachers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Upload modal ── */}
      <Modal open={modal === 'upload'} onClose={() => setModal(null)} title="Bulk Upload Teachers" maxWidth="max-w-lg">
        <div className="space-y-4">

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600 space-y-2">
            <p className="font-semibold text-slate-700">Expected columns (row 1 = optional header):</p>
            <div className="grid grid-cols-7 gap-1 text-xs font-mono">
              {['A: ID', 'B: Name*', 'C: Email', 'D: Phone', 'E: Dept', 'F: Admin?', 'G: Notes'].map(c => (
                <span key={c} className="bg-white border border-slate-200 rounded px-1 py-0.5 text-center leading-tight">{c}</span>
              ))}
            </div>
            <ul className="text-xs text-slate-400 space-y-0.5">
              <li>• <strong className="text-slate-600">Teacher ID</strong> (Column A): leave blank to auto-generate T001, T002…</li>
              <li>• <strong className="text-slate-600">Name</strong> (Column B): required</li>
              <li>• <strong className="text-slate-600">Is Admin</strong> (Column F): Yes / No (default No)</li>
              <li>• All new teachers get the school default PIN — share their Teacher ID + PIN with them</li>
              <li>• Existing Teacher IDs are skipped with an error — edit those individually</li>
            </ul>
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

          {uploadResult && (
            <div className="space-y-2">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                <span className="font-semibold">{uploadResult.inserted}</span> teacher{uploadResult.inserted !== 1 ? 's' : ''} added successfully
              </div>
              {uploadResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1 max-h-48 overflow-y-auto">
                  <p className="font-semibold">{uploadResult.errors.length} row{uploadResult.errors.length !== 1 ? 's' : ''} skipped:</p>
                  {uploadResult.errors.map((e, i) => (
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

      {/* ── Reset PIN modal ── */}
      <Modal open={pinTarget !== null} onClose={() => setPinTarget(null)} title="Reset Teacher PIN" maxWidth="max-w-sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Resetting PIN for <span className="font-semibold text-slate-900">{pinTarget?.name}</span>.
          </p>

          {pinConfirmed ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-center">
              <p className="text-sm text-green-700 mb-2">PIN has been reset. Give this PIN to the teacher:</p>
              <p className="text-4xl font-bold tracking-widest text-green-800 font-mono">{pinConfirmed}</p>
              <p className="text-xs text-green-600 mt-2">The teacher can now log in with this PIN.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  New PIN <span className="text-slate-400 font-normal">(leave blank to use default)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="e.g. 5678  —  or leave blank for default"
                  value={pinInput}
                  onChange={e => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono tracking-widest"
                />
                <p className="mt-1 text-xs text-slate-400">4–8 digits. Blank resets to the school default PIN.</p>
              </div>
              {pinError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{pinError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={() => setPinTarget(null)}>Cancel</Button>
                <Button onClick={doResetPin} loading={pinResetting}>Reset PIN</Button>
              </div>
            </>
          )}

          {pinConfirmed && (
            <div className="flex justify-end">
              <Button onClick={() => setPinTarget(null)}>Done</Button>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Teacher' : 'Edit Teacher'} maxWidth="max-w-lg">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Teacher ID {modal === 'create' && <span className="text-slate-400 font-normal">(auto if blank)</span>}
              </label>
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-bold text-green-700 uppercase focus:outline-none focus:ring-2 focus:ring-green-600"
                value={form.teacher_code ?? ''}
                onChange={e => setForm(f => ({ ...f, teacher_code: e.target.value.toUpperCase() }))}
                placeholder="e.g. T001"
                maxLength={10}
              />
              <p className="mt-1 text-xs text-slate-400">Used to log in to the teacher app.</p>
            </div>
            <div className="col-span-2">
              <Input label="Full Name *" value={form.name ?? ''} onChange={field('name')} required />
            </div>
          </div>
          <Input label="Email" type="email" value={form.email ?? ''} onChange={field('email')} />
          <Input label="Phone" value={form.phone ?? ''} onChange={field('phone')} />
          <Input label="Department" value={form.department ?? ''} onChange={field('department')} />
          <Input label={modal === 'create' ? 'Password *' : 'New Password (leave blank to keep)'} type="password" value={form.password ?? ''} onChange={field('password')} />
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <select value={form.status} onChange={field('status')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              Status
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.is_admin}
                onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))} />
              Admin role
            </label>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</label>
            <textarea value={form.notes ?? ''} onChange={field('notes')} rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600" />
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
