'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface LibraryStaff {
  id: string; name: string; email: string; is_active: boolean; created_at: string;
}
interface LibraryTeacher {
  id: string; teacher_id: string; teacher_name: string; teacher_code: string; created_at: string;
}
interface Teacher { id: string; name: string; teacher_code: string; }

const emptyForm = { name: '', email: '', password: '' };

export default function LibraryStaffPage() {
  const [staff,       setStaff]       = useState<LibraryStaff[]>([]);
  const [libTeachers, setLibTeachers] = useState<LibraryTeacher[]>([]);
  const [teachers,    setTeachers]    = useState<Teacher[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [showAdd,  setShowAdd]  = useState(false);
  const [form,     setForm]     = useState(emptyForm);
  const [formErr,  setFormErr]  = useState('');
  const [saving,   setSaving]   = useState(false);

  const [editId,   setEditId]   = useState('');
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '', is_active: true });
  const [editErr,  setEditErr]  = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [tSearch,  setTSearch]  = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<LibraryStaff[]>('/api/library-admin/staff'),
      api.get<LibraryTeacher[]>('/api/school-staff/library-teachers'),
      api.get<Teacher[]>('/api/teachers'),
    ]).then(([s, lt, t]) => {
      setStaff(s.data);
      setLibTeachers(lt.data);
      setTeachers(t.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function createStaff() {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setFormErr('Name, email and password are required.'); return;
    }
    setSaving(true); setFormErr('');
    try {
      const r = await api.post<LibraryStaff>('/api/library-admin/staff', form);
      setStaff(prev => [...prev, r.data]);
      setForm(emptyForm); setShowAdd(false);
    } catch (e: any) { setFormErr(e.response?.data?.error ?? 'Failed to create account'); }
    finally { setSaving(false); }
  }

  function openEdit(s: LibraryStaff) {
    setEditId(s.id);
    setEditForm({ name: s.name, email: s.email, password: '', is_active: s.is_active });
    setEditErr('');
  }

  async function saveEdit() {
    setEditSaving(true); setEditErr('');
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name, email: editForm.email, is_active: editForm.is_active,
      };
      if (editForm.password) payload.password = editForm.password;
      const r = await api.put<LibraryStaff>(`/api/library-admin/staff/${editId}`, payload);
      setStaff(prev => prev.map(s => s.id === editId ? r.data : s));
      setEditId('');
    } catch (e: any) { setEditErr(e.response?.data?.error ?? 'Failed to update'); }
    finally { setEditSaving(false); }
  }

  async function deleteStaff(id: string) {
    if (!confirm('Delete this librarian account?')) return;
    try {
      await api.delete(`/api/library-admin/staff/${id}`);
      setStaff(prev => prev.filter(s => s.id !== id));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to delete'); }
  }

  async function assignTeacher(teacherId: string) {
    setAssigning(true);
    try {
      const r = await api.post<LibraryTeacher>('/api/school-staff/library-teachers', { teacher_id: teacherId });
      setLibTeachers(prev => [...prev, r.data]);
      setTSearch('');
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to assign'); }
    finally { setAssigning(false); }
  }

  async function removeTeacher(id: string) {
    if (!confirm('Remove this teacher from library duty?')) return;
    try {
      await api.delete(`/api/school-staff/library-teachers/${id}`);
      setLibTeachers(prev => prev.filter(t => t.id !== id));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to remove'); }
  }

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } = useTableControls(staff);

  const assignedTeacherIds = new Set(libTeachers.map(t => t.teacher_id));
  const filteredTeachers = teachers.filter(t =>
    !assignedTeacherIds.has(t.id) &&
    (t.name.toLowerCase().includes(tSearch.toLowerCase()) ||
     t.teacher_code.toLowerCase().includes(tSearch.toLowerCase()))
  );

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Library Staff</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage dedicated librarian accounts and teachers assigned to library duty.
        </p>
      </div>

      {/* ── Librarian Accounts ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            Librarian Accounts ({staff.length})
          </h2>
          <button
            onClick={() => { setShowAdd(true); setFormErr(''); setForm(emptyForm); }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: '#15803D' }}
          >
            + New Librarian
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          {staff.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">No librarian accounts yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <tr>
                  <Th label="Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide" />
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Email</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {(displayRows as typeof staff).map(s => (
                  <tr key={s.id}>
                    {editId === s.id ? (
                      <td colSpan={4} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Name" className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                          <input value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                            placeholder="Email" className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                          <input value={editForm.password} onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                            placeholder="New password (leave blank to keep)" type="password"
                            className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input type="checkbox" checked={editForm.is_active}
                              onChange={e => setEditForm(p => ({ ...p, is_active: e.target.checked }))} />
                            Active
                          </label>
                        </div>
                        {editErr && <p className="text-xs text-red-500 mb-2">{editErr}</p>}
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={editSaving}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                            style={{ background: '#15803D' }}>
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditId('')} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                            Cancel
                          </button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{s.name}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden md:table-cell">{s.email}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${s.is_active ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-3">
                            <button onClick={() => openEdit(s)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                            <button onClick={() => deleteStaff(s.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />

        {showAdd && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">New Librarian Account</p>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Full name" className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="Email address" className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
              <input value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Password (min 6 chars)" type="password"
                className="col-span-2 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
            </div>
            {formErr && <p className="text-xs text-red-500">{formErr}</p>}
            <div className="flex gap-2">
              <button onClick={createStaff} disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: '#15803D' }}>
                {saving ? 'Creating…' : 'Create Account'}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Library Teachers ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            Library Teachers ({libTeachers.length})
          </h2>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            {libTeachers.length === 0 ? (
              <p className="p-5 text-sm text-slate-400">No teachers assigned to library duty yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {libTeachers.map(lt => (
                  <div key={lt.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">{lt.teacher_name}</p>
                      <p className="text-xs text-slate-400">{lt.teacher_code}</p>
                    </div>
                    <button onClick={() => removeTeacher(lt.id)} className="text-xs text-red-500 hover:underline font-semibold">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Assign a Teacher</h2>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-3 space-y-2">
            <input value={tSearch} onChange={e => setTSearch(e.target.value)}
              placeholder="Search by name or teacher code…"
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filteredTeachers.slice(0, 15).map(t => (
                <button key={t.id} onClick={() => assignTeacher(t.id)} disabled={assigning}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.teacher_code}</p>
                </button>
              ))}
              {filteredTeachers.length === 0 && tSearch && (
                <p className="text-xs text-slate-400 text-center py-4">No matching teachers</p>
              )}
              {filteredTeachers.length === 0 && !tSearch && teachers.length > 0 && (
                <p className="text-xs text-slate-400 text-center py-4">All teachers already assigned</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
