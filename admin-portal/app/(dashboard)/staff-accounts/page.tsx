'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface Staff {
  id: string; name: string; email: string; is_active: boolean;
  created_at: string; roles: string[];
}

const ROLE_LABELS: Record<string, string> = { clearance: 'Clearance', library: 'Library' };
const ROLE_COLORS: Record<string, string> = {
  clearance: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  library:   'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const emptyForm = { id: '', name: '', email: '', password: '', roles: [] as string[] };

export default function SupportStaffPage() {
  const [staff,   setStaff]   = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<'none' | 'add' | 'edit'>('none');
  const [form,    setForm]    = useState(emptyForm);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get<Staff[]>('/api/school-staff')
      .then(r => setStaff(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function openAdd() { setForm(emptyForm); setError(''); setModal('add'); }
  function openEdit(s: Staff) {
    setForm({ id: s.id, name: s.name, email: s.email, password: '', roles: [...s.roles] });
    setError(''); setModal('edit');
  }

  function toggleRole(role: string) {
    setForm(p => ({
      ...p,
      roles: p.roles.includes(role) ? p.roles.filter(r => r !== role) : [...p.roles, role],
    }));
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required'); return; }
    if (modal === 'add' && !form.password) { setError('Password is required'); return; }
    if (!form.roles.length) { setError('Select at least one role'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'add') {
        const r = await api.post<Staff>('/api/school-staff', form);
        setStaff(prev => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const payload: any = { name: form.name, email: form.email, roles: form.roles };
        if (form.password) payload.password = form.password;
        const r = await api.put<Staff>(`/api/school-staff/${form.id}`, payload);
        setStaff(prev => prev.map(s => s.id === form.id ? r.data : s));
      }
      setModal('none');
    } catch (e: any) { setError(e.response?.data?.error ?? 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function toggleActive(s: Staff) {
    try {
      const r = await api.put<Staff>(`/api/school-staff/${s.id}`, { is_active: !s.is_active });
      setStaff(prev => prev.map(x => x.id === s.id ? r.data : x));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to update'); }
  }

  async function deleteStaff(id: string) {
    if (!confirm('Delete this staff account? This cannot be undone.')) return;
    try {
      await api.delete(`/api/school-staff/${id}`);
      setStaff(prev => prev.filter(s => s.id !== id));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to delete'); }
  }

  async function resendCredentials(id: string, name: string) {
    if (!confirm(`Reset password and send new login credentials to ${name}?`)) return;
    try {
      const r = await api.post(`/api/school-staff/${id}/resend-credentials`);
      alert((r.data as { message: string }).message);
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to send credentials'); }
  }

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(staff as unknown);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Support Staff</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Non-teaching staff who log in via the Staff Portal (clearance officers, librarians)
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>+ Add Staff</Button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No support staff accounts yet. Add one to get started.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <Th label="Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <Th label="Email" sortKey="email" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Roles</th>
                <Th label="Status" sortKey="is_active" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <Th label="Created" sortKey="created_at" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {(displayRows as unknown as Staff[]).map(s => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{s.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {s.roles.map(r => (
                        <span key={r} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[r] ?? 'bg-slate-100 text-slate-600'}`}>
                          {ROLE_LABELS[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(s)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => openEdit(s)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                      <button onClick={() => resendCredentials(s.id, s.name)} className="text-xs text-green-700 dark:text-green-400 hover:underline whitespace-nowrap">Send Login</button>
                      <button onClick={() => deleteStaff(s.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(p) => { setPageSize(p); setPage(1); }} />

      <Modal open={modal !== 'none'} onClose={() => setModal('none')} title={modal === 'add' ? 'Add Support Staff' : 'Edit Support Staff'} maxWidth="max-w-md">
        <div className="space-y-4">
          <Input label="Full Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="Email *" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <Input
            label={modal === 'add' ? 'Password *' : 'New Password (leave blank to keep)'}
            type="password" value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
          />
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-2">Roles *</label>
            <div className="flex gap-3">
              {(['clearance', 'library'] as const).map(role => (
                <label key={role} className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.roles.includes(role)}
                    onChange={() => toggleRole(role)}
                    className="w-4 h-4 accent-green-600 rounded" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{ROLE_LABELS[role]}</span>
                </label>
              ))}
            </div>
          </div>
          {modal === 'add' && (
            <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2">
              Login credentials will be emailed to the staff member automatically on account creation.
            </p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModal('none')}>Cancel</Button>
            <Button loading={saving} onClick={save}>{modal === 'add' ? 'Create Account' : 'Save Changes'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
