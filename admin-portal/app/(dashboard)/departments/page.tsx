'use client';
import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

interface Department {
  id: string;
  name: string;
  head_teacher_id: string | null;
  head_name: string | null;
  head_code: string | null;
  head_photo: string | null;
  clearance_enabled: boolean;
  staff_count: number;
  subject_count: number;
}

interface TimetableSubject {
  subject: string;
  department_id: string | null;
  department_name: string | null;
}

interface Teacher {
  id: string;
  teacher_code: string;
  name: string;
  department: string | null;
  status: string;
  photo_url: string | null;
  is_head?: boolean;
}

type Modal =
  | { type: 'create' }
  | { type: 'rename'; dept: Department }
  | { type: 'assign-head'; dept: Department }
  | { type: 'staff'; dept: Department }
  | { type: 'subjects'; dept: Department }
  | { type: 'delete'; dept: Department }
  | null;

export default function DepartmentsPage() {
  const [departments, setDepartments]   = useState<Department[]>([]);
  const [allTeachers, setAllTeachers]   = useState<Teacher[]>([]);
  const [loading,     setLoading]       = useState(true);
  const [modal,       setModal]         = useState<Modal>(null);
  const [saving,      setSaving]        = useState(false);
  const [error,       setError]         = useState('');

  // Create / rename
  const [deptName,    setDeptName]      = useState('');

  // Assign HOD
  const [selTeacher,  setSelTeacher]    = useState('');
  const [clearanceOn, setClearanceOn]   = useState(false);

  // Staff management
  const [staffList,   setStaffList]     = useState<Teacher[]>([]);
  const [staffLoading,setStaffLoading]  = useState(false);
  const [addTeacher,  setAddTeacher]    = useState('');
  const [staffSearch, setStaffSearch]   = useState('');

  // Subject management
  const [timetableSubjects, setTimetableSubjects] = useState<TimetableSubject[]>([]);
  const [subjectsLoading,   setSubjectsLoading]   = useState(false);
  const [seedingSubjects,   setSeedingSubjects]   = useState(false);

  const load = useCallback(async () => {
    try {
      const [depts, teachers] = await Promise.all([
        api.get<Department[]>('/api/departments'),
        api.get<Teacher[]>('/api/teachers'),
      ]);
      setDepartments(depts.data);
      setAllTeachers(teachers.data.filter(t => t.status === 'Active'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadStaff(deptId: string) {
    setStaffLoading(true);
    try {
      const { data } = await api.get<Teacher[]>(`/api/departments/${deptId}/teachers`);
      setStaffList(data);
    } finally { setStaffLoading(false); }
  }

  function openCreate() { setDeptName(''); setError(''); setModal({ type: 'create' }); }
  function openRename(dept: Department) { setDeptName(dept.name); setError(''); setModal({ type: 'rename', dept }); }
  function openAssignHead(dept: Department) {
    setSelTeacher(dept.head_teacher_id ?? '');
    setClearanceOn(dept.clearance_enabled);
    setError('');
    setModal({ type: 'assign-head', dept });
  }
  function openStaff(dept: Department) {
    setAddTeacher(''); setStaffSearch(''); setError('');
    setModal({ type: 'staff', dept });
    loadStaff(dept.id);
  }
  function openDelete(dept: Department) { setModal({ type: 'delete', dept }); }
  function openSubjects(dept: Department) {
    setError('');
    setModal({ type: 'subjects', dept });
    loadTimetableSubjects();
  }
  function closeModal() { setModal(null); setError(''); }

  async function loadTimetableSubjects() {
    setSubjectsLoading(true);
    try {
      const { data } = await api.get<TimetableSubject[]>('/api/departments/subjects/timetable');
      setTimetableSubjects(data);
    } finally { setSubjectsLoading(false); }
  }

  async function handleAssignSubject(subject: string, deptId: string) {
    setError('');
    try {
      await api.post(`/api/departments/${deptId}/subjects`, { subject });
      await loadTimetableSubjects();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to assign subject');
    }
  }

  async function handleRemoveSubject(subject: string, deptId: string) {
    setError('');
    try {
      await api.delete(`/api/departments/${deptId}/subjects/${encodeURIComponent(subject)}`);
      await loadTimetableSubjects();
    } catch { /* ignore */ }
  }

  async function handleSeedSubjects() {
    setSeedingSubjects(true); setError('');
    try {
      const { data } = await api.post<{ message: string; seeded: number }>('/api/departments/subjects/seed', {});
      await loadTimetableSubjects();
      if (data.seeded === 0) setError('No new subjects seeded. All timetable subjects may already be assigned, or teachers have no department set.');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to seed subjects');
    } finally { setSeedingSubjects(false); }
  }

  async function handleCreate() {
    if (!deptName.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/departments', { name: deptName.trim() });
      await load(); closeModal();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create department');
    } finally { setSaving(false); }
  }

  async function handleRename() {
    if (modal?.type !== 'rename') return;
    if (!deptName.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      await api.put(`/api/departments/${modal.dept.id}`, { name: deptName.trim() });
      await load(); closeModal();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to rename');
    } finally { setSaving(false); }
  }

  async function handleAssignHead() {
    if (modal?.type !== 'assign-head') return;
    if (!selTeacher) { setError('Select a teacher'); return; }
    setSaving(true); setError('');
    try {
      await api.put(`/api/departments/${modal.dept.id}/head`, {
        teacher_id: selTeacher, clearance_enabled: clearanceOn,
      });
      await load(); closeModal();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to assign HOD');
    } finally { setSaving(false); }
  }

  async function handleRemoveHead() {
    if (modal?.type !== 'assign-head') return;
    if (!confirm('Remove this teacher as HOD?')) return;
    setSaving(true); setError('');
    try {
      await api.delete(`/api/departments/${modal.dept.id}/head`);
      await load(); closeModal();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed');
    } finally { setSaving(false); }
  }

  async function handleAddStaff() {
    if (modal?.type !== 'staff') return;
    if (!addTeacher) { setError('Select a teacher'); return; }
    setError('');
    try {
      await api.post(`/api/departments/${modal.dept.id}/teachers`, { teacher_id: addTeacher });
      setAddTeacher('');
      await loadStaff(modal.dept.id);
      await load();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to add teacher');
    }
  }

  async function handleRemoveStaff(teacherId: string, teacherName: string) {
    if (modal?.type !== 'staff') return;
    if (!confirm(`Remove ${teacherName} from this department?`)) return;
    try {
      await api.delete(`/api/departments/${modal.dept.id}/teachers/${teacherId}`);
      await loadStaff(modal.dept.id);
      await load();
    } catch { /* ignore */ }
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return;
    setSaving(true);
    try {
      await api.delete(`/api/departments/${modal.dept.id}`);
      await load(); closeModal();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to delete');
    } finally { setSaving(false); }
  }

  const { displayRows, total, page, setPage, pageSize, setPageSize } = useTableControls(departments);

  // Teachers not yet in staff list
  const staffIds = new Set(staffList.map(s => s.id));
  const availableToAdd = allTeachers.filter(t => !staffIds.has(t.id));
  const filteredStaff = staffList.filter(t =>
    !staffSearch || t.name.toLowerCase().includes(staffSearch.toLowerCase()) || t.teacher_code.toLowerCase().includes(staffSearch.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Departments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create departments, assign HODs, and manage staff.</p>
        </div>
        <Button onClick={openCreate}>+ Add Department</Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : departments.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-slate-200 bg-white">
          <p className="text-slate-400 text-sm">No departments yet.</p>
          <button onClick={openCreate} className="mt-3 text-sm text-green-700 font-semibold hover:underline">Add your first department</button>
        </div>
      ) : (<>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {(displayRows as typeof departments).map(dept => (
            <div key={dept.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth={2} className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{dept.name}</p>
                    <p className="text-xs text-slate-400">
                      {dept.staff_count} staff · {dept.subject_count} subject{dept.subject_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {dept.clearance_enabled && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Clearance</span>
                  )}
                  <button onClick={() => openRename(dept)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-50" title="Rename">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                    </svg>
                  </button>
                  <button onClick={() => openDelete(dept)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* HOD section */}
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Head of Department</p>
                {dept.head_teacher_id ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden shrink-0">
                        {dept.head_photo
                          ? <Image src={dept.head_photo} alt={dept.head_name!} width={32} height={32} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-slate-500">{dept.head_name!.charAt(0)}</div>
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{dept.head_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{dept.head_code}</p>
                      </div>
                    </div>
                    <button onClick={() => openAssignHead(dept)} className="text-xs text-green-700 font-semibold hover:underline shrink-0">Change</button>
                  </div>
                ) : (
                  <button onClick={() => openAssignHead(dept)} className="text-sm text-green-700 font-semibold hover:underline">
                    + Assign HOD
                  </button>
                )}
              </div>

              {/* Staff button */}
              <button
                onClick={() => openStaff(dept)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors text-left flex items-center justify-between"
              >
                <span>Manage Staff</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              {/* Subjects button */}
              <button
                onClick={() => openSubjects(dept)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors text-left flex items-center justify-between"
              >
                <span>Manage Subjects</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
      </>)}

      {/* ── Create Department ── */}
      <Modal open={modal?.type === 'create'} onClose={closeModal} title="Add Department" maxWidth="max-w-sm">
        <div className="space-y-4">
          <Input
            label="Department Name"
            value={deptName}
            onChange={e => setDeptName(e.target.value)}
            placeholder="e.g. Mathematics, Science, Languages"
            autoFocus
          />
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* ── Rename Department ── */}
      <Modal open={modal?.type === 'rename'} onClose={closeModal} title="Rename Department" maxWidth="max-w-sm">
        <div className="space-y-4">
          <Input
            label="New Name"
            value={deptName}
            onChange={e => setDeptName(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-slate-500">All teachers assigned to this department will have their department field updated automatically.</p>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleRename} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* ── Assign HOD ── */}
      <Modal open={modal?.type === 'assign-head'} onClose={closeModal}
        title={modal?.type === 'assign-head' ? `HOD — ${modal.dept.name}` : 'Assign HOD'} maxWidth="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Select Teacher *</label>
            <select
              value={selTeacher}
              onChange={e => setSelTeacher(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600"
            >
              <option value="">Select a teacher…</option>
              {allTeachers.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.teacher_code})</option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <input
              type="checkbox"
              checked={clearanceOn}
              onChange={e => setClearanceOn(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
            />
            <div>
              <p className="text-sm font-semibold text-blue-900">Enable Clearance Access</p>
              <p className="text-xs text-blue-600 mt-0.5">
                When checked, this HOD will appear in the student clearance workflow and can approve clearance requests for their department.
                A clearance office will be created automatically.
              </p>
            </div>
          </label>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            {modal?.type === 'assign-head' && modal.dept.head_teacher_id ? (
              <button onClick={handleRemoveHead} disabled={saving} className="text-sm text-red-600 hover:underline disabled:opacity-50">
                Remove HOD
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleAssignHead} loading={saving}>Save</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Manage Staff ── */}
      <Modal open={modal?.type === 'staff'} onClose={closeModal}
        title={modal?.type === 'staff' ? `Staff — ${modal.dept.name}` : 'Manage Staff'} maxWidth="max-w-lg">
        <div className="space-y-4">
          {/* Add teacher */}
          <div className="flex gap-2">
            <select
              value={addTeacher}
              onChange={e => setAddTeacher(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600"
            >
              <option value="">Add a teacher to this department…</option>
              {availableToAdd.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.teacher_code})</option>
              ))}
            </select>
            <Button onClick={handleAddStaff} disabled={!addTeacher}>Add</Button>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* Search */}
          {staffList.length > 5 && (
            <input
              type="text"
              placeholder="Search staff…"
              value={staffSearch}
              onChange={e => setStaffSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600"
            />
          )}

          {/* Staff list */}
          {staffLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
            </div>
          ) : filteredStaff.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No staff in this department yet.</p>
          ) : (
            <div className="divide-y divide-slate-50 rounded-xl border border-slate-100 max-h-64 overflow-y-auto">
              {filteredStaff.map(t => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-slate-200 overflow-hidden shrink-0">
                      {t.photo_url
                        ? <Image src={t.photo_url} alt={t.name} width={28} height={28} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">{t.name.charAt(0)}</div>
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
                        {t.name}
                        {t.is_head && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">HOD</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">{t.teacher_code}</p>
                    </div>
                  </div>
                  {!t.is_head && (
                    <button
                      onClick={() => handleRemoveStaff(t.id, t.name)}
                      className="text-xs text-red-500 hover:text-red-700 font-semibold shrink-0 ml-2"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button variant="secondary" onClick={closeModal}>Done</Button>
          </div>
        </div>
      </Modal>

      {/* ── Manage Subjects ── */}
      <Modal open={modal?.type === 'subjects'} onClose={closeModal}
        title={modal?.type === 'subjects' ? `Subjects — ${modal.dept.name}` : 'Subjects'} maxWidth="max-w-lg">
        {modal?.type === 'subjects' && (() => {
          const mySubjects    = timetableSubjects.filter(s => s.department_id === modal.dept.id);
          const otherSubjects = timetableSubjects.filter(s => s.department_id !== modal.dept.id);
          return (
            <div className="space-y-4">
              {/* Seed button */}
              <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 gap-3">
                <p className="text-xs text-amber-800">
                  <strong>Auto-assign</strong> subjects from timetable based on the most common teacher department per subject.
                  Only unassigned subjects are updated.
                </p>
                <button
                  onClick={handleSeedSubjects}
                  disabled={seedingSubjects}
                  className="text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded px-3 py-1.5 shrink-0 disabled:opacity-50 transition-colors"
                >
                  {seedingSubjects ? 'Seeding…' : 'Seed from Timetable'}
                </button>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

              {subjectsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {/* Subjects in this department */}
                  {mySubjects.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Assigned to {modal.dept.name}</p>
                      <div className="rounded-xl border border-green-200 divide-y divide-green-50 overflow-hidden">
                        {mySubjects.map(s => (
                          <div key={s.subject} className="flex items-center justify-between px-3 py-2 bg-green-50">
                            <span className="text-sm font-medium text-slate-800">{s.subject}</span>
                            <button
                              onClick={() => handleRemoveSubject(s.subject, modal.dept.id)}
                              className="text-xs text-red-500 hover:text-red-700 font-semibold"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Other timetable subjects */}
                  {otherSubjects.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Other Timetable Subjects</p>
                      <div className="rounded-xl border border-slate-200 divide-y divide-slate-50 overflow-hidden">
                        {otherSubjects.map(s => (
                          <div key={s.subject} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                            <div>
                              <span className="text-sm font-medium text-slate-800">{s.subject}</span>
                              {s.department_name && (
                                <span className="ml-2 text-xs text-slate-400">({s.department_name})</span>
                              )}
                            </div>
                            <button
                              onClick={async () => {
                                if (s.department_name && !confirm(`Move "${s.subject}" from ${s.department_name} to ${modal.dept.name}?`)) return;
                                await handleAssignSubject(s.subject, modal.dept.id);
                              }}
                              className="text-xs text-green-700 hover:text-green-900 font-semibold shrink-0 ml-2"
                            >
                              {s.department_name ? 'Move here' : 'Assign here'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {timetableSubjects.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-6">No timetable subjects found. Create a timetable first.</p>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <Button variant="secondary" onClick={closeModal}>Done</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Delete confirmation ── */}
      <Modal open={modal?.type === 'delete'} onClose={closeModal} title="Delete Department" maxWidth="max-w-sm">
        <div className="space-y-4">
          {modal?.type === 'delete' && (
            <>
              <p className="text-sm text-slate-600">
                Delete <strong>{modal.dept.name}</strong>? This will remove all staff assignments for this department.
                {modal.dept.clearance_enabled && (
                  <span className="block mt-1 text-amber-700"> The associated clearance office will also be removed.</span>
                )}
              </p>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                <Button variant="danger" onClick={handleDelete} loading={saving}>Delete</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
