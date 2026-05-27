'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Staff {
  id: string; name: string; email: string; is_active: boolean;
  created_at: string; roles: string[];
}
interface Teacher { id: string; name: string; teacher_code: string; }
interface LibraryTeacher {
  id: string; teacher_id: string; teacher_name: string; teacher_code: string;
  is_active: boolean; created_at: string;
}

const ROLE_LABELS: Record<string, string> = { clearance: 'Clearance', library: 'Library' };
const ROLE_COLORS: Record<string, string> = {
  clearance: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  library:   'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const emptyForm = { id: '', name: '', email: '', password: '', roles: [] as string[] };

export default function StaffAccountsPage() {
  const [staff,           setStaff]           = useState<Staff[]>([]);
  const [libTeachers,     setLibTeachers]     = useState<LibraryTeacher[]>([]);
  const [teachers,        setTeachers]        = useState<Teacher[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [modal,           setModal]           = useState<'none' | 'add' | 'edit'>('none');
  const [form,            setForm]            = useState(emptyForm);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');
  const [teacherSearch,   setTeacherSearch]   = useState('');
  const [addingTeacher,   setAddingTeacher]   = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Staff[]>('/api/school-staff'),
      api.get<LibraryTeacher[]>('/api/school-staff/library-teachers'),
      api.get<Teacher[]>('/api/teachers'),
    ]).then(([s, lt, t]) => {
      setStaff(s.data); setLibTeachers(lt.data); setTeachers(t.data);
    }).catch(() => {}).finally(() => setLoading(false));
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

  async function addLibraryTeacher(teacherId: string) {
    setAddingTeacher(true);
    try {
      const r = await api.post<LibraryTeacher>('/api/school-staff/library-teachers', { teacher_id: teacherId });
      setLibTeachers(prev => [...prev, r.data]);
      setTeacherSearch('');
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to assign'); }
    finally { setAddingTeacher(false); }
  }

  async function removeLibraryTeacher(id: string) {
    if (!confirm('Remove this teacher from library management?')) return;
    try {
      await api.delete(`/api/school-staff/library-teachers/${id}`);
      setLibTeachers(prev => prev.filter(t => t.id !== id));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to remove'); }
  }

  const assignedTeacherIds = new Set(libTeachers.map(t => t.teacher_id));
  const filteredTeachers = teachers.filter(t =>
    !assignedTeacherIds.has(t.id) &&
    (t.name.toLowerCase().includes(teacherSearch.toLowerCase()) ||
     t.teacher_code.toLowerCase().includes(teacherSearch.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Staff Accounts</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage non-teaching staff (clearance officers, librarians) and library-assigned teachers
        </p>
      </div>

      {/* ── Dedicated Staff ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">Dedicated Staff</h2>
            <p className="text-xs text-slate-400 mt-0.5">Non-teaching staff who log in via the Staff Portal</p>
          </div>
          <Button size="sm" onClick={openAdd}>+ Add Staff</Button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          {loading ? (
            <p className="p-5 text-sm text-slate-500">Loading…</p>
          ) : staff.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No staff accounts yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  {['Name', 'Email', 'Roles', 'Status', 'Created', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {staff.map(s => (
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
                        <button onClick={() => deleteStaff(s.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Library Teachers ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">Library Teachers</h2>
          <p className="text-xs text-slate-400 mt-0.5">Teachers who can manage the library via the teacher portal</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Assigned */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Assigned ({libTeachers.length})</p>
            </div>
            {libTeachers.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">No library teachers assigned yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {libTeachers.map(lt => (
                  <div key={lt.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">{lt.teacher_name}</p>
                      <p className="text-xs text-slate-400">{lt.teacher_code}</p>
                    </div>
                    <button onClick={() => removeLibraryTeacher(lt.id)} className="text-xs text-red-500 hover:underline font-semibold">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assign from teachers */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Add Teacher</p>
            </div>
            <div className="p-3 space-y-2">
              <input
                value={teacherSearch}
                onChange={e => setTeacherSearch(e.target.value)}
                placeholder="Search by name or teacher code…"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {filteredTeachers.slice(0, 15).map(t => (
                  <button key={t.id} onClick={() => addLibraryTeacher(t.id)} disabled={addingTeacher}
                    className="w-full text-left px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.teacher_code}</p>
                  </button>
                ))}
                {filteredTeachers.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3">
                    {teachers.length === assignedTeacherIds.size ? 'All teachers already assigned' : 'No matching teachers'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Staff Modal */}
      <Modal open={modal !== 'none'} onClose={() => setModal('none')} title={modal === 'add' ? 'Add Staff Account' : 'Edit Staff Account'} maxWidth="max-w-md">
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
