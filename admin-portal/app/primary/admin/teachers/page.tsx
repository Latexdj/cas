'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface Teacher {
  id: string; name: string; teacher_code: string; email: string | null;
  phone: string | null; gender: string | null; status: string;
  is_admin: boolean; gov_staff_id: string | null; rank: string | null;
  department: string | null; date_of_birth: string | null;
}

const EMPTY_FORM = {
  teacher_code: '', name: '', email: '', phone: '', gender: '', status: 'Active',
  is_admin: false, password: '', gov_staff_id: '', rank: '', department: '',
  date_of_birth: '', ghana_card_number: '', residential_address: '',
  emergency_contact_name: '', emergency_contact_phone: '',
};
type Form = typeof EMPTY_FORM;

const GES_RANKS = ['Pupil Teacher','Teacher II','Teacher I','Senior Teacher II','Senior Teacher I','Assistant Superintendent II','Assistant Superintendent I','Superintendent','Senior Superintendent','Principal Superintendent','Assistant Director II','Assistant Director I','Deputy Director','Director'];

const STATUS_COLORS: Record<string, string> = {
  Active:  'text-green-700 bg-green-50 border-green-200',
  Inactive:'text-slate-500 bg-slate-100 border-slate-200',
};

export default function PrimaryTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('');
  const [modal,    setModal]    = useState<'create'|'edit'|'pin'|null>(null);
  const [form,     setForm]     = useState<Form>(EMPTY_FORM);
  const [editId,   setEditId]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [pinTarget, setPinTarget] = useState<Teacher|null>(null);
  const [pinInput,  setPinInput]  = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError,  setPinError]  = useState('');

  // Import / Update modal state
  const [impModal,   setImpModal]   = useState<'import'|'update'|null>(null);
  const [impFile,    setImpFile]    = useState<File | null>(null);
  const [impLoading, setImpLoading] = useState(false);
  const [impResult,  setImpResult]  = useState<{ inserted?: number; errors: Array<{ row: number; message: string }> } | null>(null);
  const impFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filter) params.status = filter;
      const { data } = await api.get<Teacher[]>('/api/teachers', { params });
      setTeachers(data);
    } catch { setError('Failed to load teachers.'); }
    finally { setLoading(false); }
  }, [search, filter]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(''); setForm(EMPTY_FORM); setError(''); setModal('create');
  }
  function openEdit(t: Teacher) {
    setEditId(t.id);
    setForm({ ...EMPTY_FORM, teacher_code: t.teacher_code, name: t.name, email: t.email ?? '', phone: t.phone ?? '', gender: t.gender ?? '', status: t.status, is_admin: t.is_admin, gov_staff_id: t.gov_staff_id ?? '', rank: t.rank ?? '', department: t.department ?? '', date_of_birth: t.date_of_birth?.slice(0,10) ?? '', ghana_card_number: '', residential_address: '', emergency_contact_name: '', emergency_contact_phone: '' });
    setError(''); setModal('edit');
  }
  function openPin(t: Teacher) { setPinTarget(t); setPinInput(''); setPinError(''); setModal('pin'); }

  async function save() {
    if (!form.teacher_code.trim() || !form.name.trim())
      return setError('Teacher ID and name are required.');
    setSaving(true); setError('');
    try {
      if (editId) {
        await api.put(`/api/teachers/${editId}`, form);
      } else {
        if (!form.password.trim()) return setError('Password is required for new teachers.');
        await api.post('/api/teachers', form);
      }
      setModal(null); load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  async function savePin() {
    if (!pinInput.trim() || pinInput.length < 4) return setPinError('PIN must be at least 4 characters.');
    setPinSaving(true); setPinError('');
    try {
      await api.post(`/api/teachers/${pinTarget!.id}/reset-pin`, { new_pin: pinInput });
      setModal(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPinError(msg ?? 'Reset failed.');
    } finally { setPinSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this teacher? This cannot be undone.')) return;
    try { await api.delete(`/api/teachers/${id}`); load(); }
    catch { setError('Delete failed.'); }
  }

  async function downloadTeacherTemplate(mode: 'empty' | 'populated') {
    try {
      const res = await api.get(`/api/teachers/upload/template?mode=${mode}&school_level=primary`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href    = url;
      a.download = `teachers_${mode}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Failed to download template.'); }
  }

  async function submitTeacherUpload() {
    if (!impFile) return;
    setImpLoading(true); setImpResult(null);
    try {
      const fd = new FormData();
      fd.append('file', impFile);
      const { data } = await api.post('/api/teachers/upload?school_level=primary', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImpResult({ inserted: data.inserted, errors: data.errors ?? [] });
      if (!data.errors?.length) load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setImpResult({ errors: [{ row: 0, message: msg ?? 'Upload failed.' }] });
    } finally { setImpLoading(false); }
  }

  const F = (label: string, field: keyof Form, type = 'text', opts?: string[]) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {opts ? (
        <select value={String(form[field])} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': '#15803D' } as React.CSSProperties}>
          <option value="">Select…</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={String(form[field])} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': '#15803D' } as React.CSSProperties} />
      )}
    </div>
  );

  const filtered = teachers.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.teacher_code.toLowerCase().includes(q) || (t.email ?? '').toLowerCase().includes(q);
  });

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(filtered);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Teachers</h1>
          <p className="text-sm text-slate-500 mt-0.5">{teachers.length} staff member{teachers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setImpResult(null); setImpFile(null); setImpModal('import'); }}
            className="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
            Import Teachers
          </button>
          <button onClick={openCreate}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#15803D' }}>
            + Add Teacher
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or ID…"
          onKeyDown={e => e.key === 'Enter' && load()}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': '#15803D' } as React.CSSProperties} />
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700">
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button onClick={load} className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#15803D' }}>Search</button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Teacher ID</th>
                <Th label="Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                <Th label="Gender" sortKey="gender" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Phone</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Email</th>
                <Th label="Role" sortKey="is_admin" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                <Th label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12">
                  <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin mx-auto" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                </td></tr>
              ) : (displayRows as Teacher[]).map(t => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5">
                    <span className="font-mono font-bold text-xs px-2 py-0.5 rounded border" style={{ color: '#15803D', backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }}>{t.teacher_code}</span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{t.name}</td>
                  <td className="px-3 py-2.5 text-slate-600">{t.gender ?? '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{t.phone ?? '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[160px] truncate">{t.email ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    {t.is_admin ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-blue-700 bg-blue-50 border border-blue-200">Admin</span>
                    ) : (
                      <span className="text-xs text-slate-400">Teacher</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[t.status] ?? ''}`}>{t.status}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(t)} className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-slate-700 hover:bg-gray-100">Edit</button>
                      <button onClick={() => openPin(t)} className="text-xs px-2.5 py-1 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50">PIN</button>
                      <button onClick={() => del(t.id)} className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400 text-sm">No teachers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} className="px-4" />
      </div>

      {/* Create/Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-auto">
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 py-4 border-b border-gray-100 flex items-center justify-between z-10">
              <h2 className="font-bold text-slate-900">{editId ? 'Edit Teacher' : 'Add Teacher'}</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              {F('Teacher ID *', 'teacher_code')}
              {F('Full Name *', 'name')}
              {!editId && F('Password *', 'password', 'password')}
              {F('Email', 'email', 'email')}
              {F('Phone', 'phone', 'tel')}
              {F('Gender', 'gender', 'text', ['Male','Female'])}
              {F('GES Rank', 'rank', 'text', GES_RANKS)}
              {F('Gov. Staff ID', 'gov_staff_id')}
              {F('Date of Birth', 'date_of_birth', 'date')}
              {F('Ghana Card No.', 'ghana_card_number')}
              {F('Status', 'status', 'text', ['Active','Inactive'])}
              <div className="col-span-full flex items-center gap-2">
                <input type="checkbox" id="is_admin" checked={form.is_admin} onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))} className="rounded border-gray-300" />
                <label htmlFor="is_admin" className="text-sm text-slate-700 cursor-pointer">Grant admin portal access</label>
              </div>
              <div className="col-span-full">{F('Residential Address', 'residential_address')}</div>
              {F('Emergency Contact Name', 'emergency_contact_name')}
              {F('Emergency Contact Phone', 'emergency_contact_phone', 'tel')}
            </div>
            {error && <p className="mx-6 mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
                {saving ? 'Saving…' : 'Save Teacher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Reset Modal */}
      {modal === 'pin' && pinTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-slate-900">Reset PIN — {pinTarget.name}</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">New Password / PIN</label>
              <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Min. 4 characters" />
            </div>
            {pinError && <p className="text-sm text-red-600">{pinError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={savePin} disabled={pinSaving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
                {pinSaving ? 'Resetting…' : 'Reset PIN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Teachers Modal */}
      {impModal === 'import' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Import Teachers</h2>
              <button onClick={() => setImpModal(null)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600 space-y-2">
                <p className="font-semibold text-slate-700">Step 1 — Download the template</p>
                <button onClick={() => downloadTeacherTemplate('empty')} className="text-green-700 font-semibold hover:underline text-sm block">
                  Download blank template (.xlsx)
                </button>
                <button onClick={() => downloadTeacherTemplate('populated')} className="text-green-700 font-semibold hover:underline text-sm block">
                  Download populated template (existing teachers)
                </button>
                <p className="text-xs text-slate-400">Fill in one teacher per row. Rows with a blank Teacher ID will be auto-assigned. Duplicate names/emails will be skipped.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Step 2 — Upload filled template</label>
                <input ref={impFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setImpFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => impFileRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-500 hover:border-green-400 hover:text-green-700 text-center transition-colors">
                  {impFile ? impFile.name : 'Click to choose Excel file…'}
                </button>
              </div>
              {impResult && (
                <div className={`rounded-lg px-4 py-3 text-sm ${impResult.errors.length && !impResult.inserted ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
                  {impResult.inserted != null && <p className="font-semibold">{impResult.inserted} teacher(s) imported.</p>}
                  {impResult.errors.map((e, i) => <p key={i} className="text-xs mt-0.5">Row {e.row}: {e.message}</p>)}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setImpModal(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">Close</button>
              <button onClick={submitTeacherUpload} disabled={!impFile || impLoading}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
                {impLoading ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
