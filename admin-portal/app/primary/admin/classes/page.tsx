'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClassItem {
  id: string; class_name: string; sort_order: number;
  assignment_id: string | null; teacher_id: string | null; teacher_name: string | null;
  student_count: number;
}
interface AcademicYear { id: string; name: string; is_current: boolean; }
interface Teacher      { id: string; name: string; }
interface Student {
  id: string; surname: string; other_names: string | null;
  admission_number: string; class_name: string; status: string;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin mx-auto"
      style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
  );
}

function Btn({ onClick, disabled, variant = 'primary', small, children }: {
  onClick?: () => void; disabled?: boolean; variant?: 'primary'|'secondary'|'danger'|'ghost';
  small?: boolean; children: React.ReactNode;
}) {
  const base = `font-semibold rounded-lg transition-colors ${small ? 'text-xs px-2.5 py-1' : 'text-sm px-4 py-2'}`;
  const styles: Record<string, string> = {
    primary:   'text-white disabled:opacity-50',
    secondary: 'bg-white border border-gray-200 text-slate-700 hover:bg-gray-50',
    danger:    'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100',
    ghost:     'bg-transparent text-slate-500 hover:text-slate-700 hover:bg-gray-100',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${base} ${styles[variant]}`}
      style={variant === 'primary' ? { backgroundColor: '#15803D' } : {}}>
      {children}
    </button>
  );
}

// ── Create / Rename modal ─────────────────────────────────────────────────────

function ClassModal({ editing, onClose, onSaved }: {
  editing: ClassItem | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]     = useState(editing?.class_name ?? '');
  const [order, setOrder]   = useState(String(editing?.sort_order ?? 0));
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  async function save() {
    if (!name.trim()) return setErr('Class name is required.');
    setSaving(true); setErr('');
    try {
      if (editing) {
        await api.put(`/api/primary/classes/${editing.id}`, { class_name: name.trim(), sort_order: parseInt(order) || 0 });
      } else {
        await api.post('/api/primary/classes', { class_name: name.trim(), sort_order: parseInt(order) || 0 });
      }
      onSaved(); onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErr(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h2 className="font-bold text-slate-900">{editing ? 'Rename Class' : 'New Class'}</h2>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Class Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder="e.g. Basic 1, KG 2, JHS 1"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Sort Order</label>
          <input type="number" value={order} onChange={e => setOrder(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          <p className="text-xs text-slate-400 mt-1">Lower numbers appear first in the list.</p>
        </div>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Class'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Add Students modal ────────────────────────────────────────────────────────

function AddStudentsModal({ targetClass, allStudents, onClose, onSaved }: {
  targetClass: string; allStudents: Student[]; onClose: () => void; onSaved: () => void;
}) {
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState<'other'|'all'>('other');
  const [sel,     setSel]     = useState<Set<string>>(new Set());
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  const candidates = allStudents.filter(s => {
    const inOtherClass = s.class_name.toLowerCase() !== targetClass.toLowerCase();
    if (filter === 'other' && !inOtherClass) return false;
    if (search) {
      const q = search.toLowerCase();
      return (s.surname + ' ' + (s.other_names ?? '')).toLowerCase().includes(q)
          || s.admission_number.toLowerCase().includes(q);
    }
    return true;
  });

  function toggle(id: string) {
    setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (sel.size === candidates.length) setSel(new Set());
    else setSel(new Set(candidates.map(s => s.id)));
  }

  async function assign() {
    if (!sel.size) return;
    setSaving(true); setErr('');
    try {
      await api.post('/api/primary/assign-students', { class_name: targetClass, student_ids: [...sel] });
      onSaved(); onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErr(msg ?? 'Failed to assign students.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">Add Students to {targetClass}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Select students to assign — they will be moved into this class.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 space-y-2 flex-shrink-0">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or admission number…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          <div className="flex gap-1.5">
            {(['other','all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-md font-semibold transition-colors ${filter === f ? 'text-white' : 'bg-gray-100 text-slate-600 hover:bg-gray-200'}`}
                style={filter === f ? { backgroundColor: '#15803D' } : {}}>
                {f === 'other' ? 'From other classes' : 'All students'}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-500 self-center">{sel.size} selected</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-10">No students found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 w-10">
                    <input type="checkbox" checked={sel.size === candidates.length && candidates.length > 0}
                      onChange={toggleAll} className="rounded" />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Student</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Current Class</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {candidates.map(s => (
                  <tr key={s.id} onClick={() => toggle(s.id)}
                    className={`cursor-pointer transition-colors ${sel.has(s.id) ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-2.5">
                      <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} className="rounded" onClick={e => e.stopPropagation()} />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-900">{s.surname}{s.other_names ? ` ${s.other_names}` : ''}</p>
                      <p className="text-xs text-slate-400">{s.admission_number}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {s.class_name || <span className="italic text-slate-300">Unassigned</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2 ml-auto">
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn onClick={assign} disabled={saving || sel.size === 0}>
              {saving ? 'Assigning…' : `Assign ${sel.size > 0 ? `(${sel.size})` : ''}`}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Move Student modal ────────────────────────────────────────────────────────

function MoveStudentModal({ student, classes, onClose, onSaved }: {
  student: Student; classes: ClassItem[]; onClose: () => void; onSaved: () => void;
}) {
  const [dest,    setDest]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  async function move() {
    if (!dest) return setErr('Select a destination class.');
    setSaving(true); setErr('');
    try {
      await api.put(`/api/primary/students/${student.id}/move-class`, { class_name: dest });
      onSaved(); onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErr(msg ?? 'Move failed.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h2 className="font-bold text-slate-900">Move Student</h2>
        <p className="text-sm text-slate-600">
          Move <strong>{student.surname}{student.other_names ? ` ${student.other_names}` : ''}</strong> to a different class.
        </p>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Destination Class *</label>
          <select value={dest} onChange={e => setDest(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">Select class…</option>
            {classes.filter(c => c.class_name.toLowerCase() !== student.class_name.toLowerCase()).map(c => (
              <option key={c.id} value={c.class_name}>{c.class_name} ({c.student_count} students)</option>
            ))}
          </select>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={move} disabled={saving || !dest}>{saving ? 'Moving…' : 'Move Student'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Assign Teacher modal ──────────────────────────────────────────────────────

function AssignTeacherModal({ cls, yearId, teachers, onClose, onSaved }: {
  cls: ClassItem; yearId: string; teachers: Teacher[]; onClose: () => void; onSaved: () => void;
}) {
  const [teacherId, setTeacherId] = useState(cls.teacher_id ?? '');
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');

  async function save() {
    if (!teacherId) return setErr('Select a teacher.');
    if (!yearId) return setErr('No academic year selected.');
    setSaving(true); setErr('');
    try {
      await api.post('/api/primary/class-teachers', { teacher_id: teacherId, class_name: cls.class_name, academic_year_id: yearId });
      onSaved(); onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErr(msg ?? 'Failed to assign teacher.');
    } finally { setSaving(false); }
  }

  async function removeTeacher() {
    if (!cls.assignment_id) return;
    setSaving(true);
    try {
      await api.delete(`/api/primary/class-teachers/${cls.assignment_id}`);
      onSaved(); onClose();
    } catch { setErr('Failed to remove teacher.'); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h2 className="font-bold text-slate-900">Assign Class Teacher — {cls.class_name}</h2>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Teacher *</label>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">Select teacher…</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex items-center justify-between pt-1">
          {cls.assignment_id ? (
            <Btn variant="danger" small onClick={removeTeacher} disabled={saving}>Remove Teacher</Btn>
          ) : <span />}
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn onClick={save} disabled={saving || !teacherId}>{saving ? 'Saving…' : 'Assign'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PrimaryClassesPage() {
  const [years,       setYears]       = useState<AcademicYear[]>([]);
  const [yearId,      setYearId]      = useState('');
  const [classes,     setClasses]     = useState<ClassItem[]>([]);
  const [teachers,    setTeachers]    = useState<Teacher[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const [selected,    setSelected]    = useState<ClassItem | null>(null);
  const [roster,      setRoster]      = useState<Student[]>([]);
  const [rosterLoad,  setRosterLoad]  = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [mobileDetail, setMobileDetail] = useState(false);

  // Modals
  const [classModal,   setClassModal]   = useState<'create'|'edit'|null>(null);
  const [addStudModal, setAddStudModal] = useState(false);
  const [moveStud,     setMoveStud]     = useState<Student | null>(null);
  const [teacherModal, setTeacherModal] = useState(false);

  // Load years + teachers once
  useEffect(() => {
    Promise.all([
      api.get<AcademicYear[]>('/api/academic-years'),
      api.get<Teacher[]>('/api/teachers'),
    ]).then(([yr, tch]) => {
      setYears(yr.data); setTeachers(tch.data);
      const cur = yr.data.find(y => y.is_current);
      if (cur) setYearId(cur.id);
    }).catch(() => {});
  }, []);

  const loadClasses = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = yearId ? `?academic_year_id=${yearId}` : '';
      const { data } = await api.get<ClassItem[]>(`/api/primary/classes${params}`);
      setClasses(data);
      // Keep selected in sync
      if (selected) {
        const updated = data.find(c => c.id === selected.id);
        setSelected(updated ?? null);
      }
    } catch { setError('Failed to load classes.'); }
    finally { setLoading(false); }
  }, [yearId, selected]);

  useEffect(() => { loadClasses(); }, [yearId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAllStudents = useCallback(async () => {
    try {
      const { data } = await api.get<Student[]>('/api/primary/students?status=Active');
      setAllStudents(data);
    } catch {}
  }, []);

  useEffect(() => { loadAllStudents(); }, [loadAllStudents]);

  const loadRoster = useCallback(async (cls: ClassItem) => {
    setRosterLoad(true); setRosterSearch('');
    try {
      const { data } = await api.get<Student[]>(`/api/primary/students?class_name=${encodeURIComponent(cls.class_name)}&status=Active`);
      setRoster(data);
    } catch { setRoster([]); }
    finally { setRosterLoad(false); }
  }, []);

  function selectClass(cls: ClassItem) {
    setSelected(cls);
    loadRoster(cls);
    setMobileDetail(true);
  }

  async function deleteClass(cls: ClassItem) {
    if (!confirm(`Delete class "${cls.class_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/primary/classes/${cls.id}`);
      if (selected?.id === cls.id) setSelected(null);
      loadClasses();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Delete failed.');
    }
  }

  function afterSave() {
    loadClasses();
    loadAllStudents();
    if (selected) loadRoster(selected);
  }

  const { displayRows: classRows, total: classTotal, page: classPage, setPage: setClassPage, pageSize: classPageSize, setPageSize: setClassPageSize } = useTableControls(classes);

  const filteredRoster = roster.filter(s => {
    if (!rosterSearch) return true;
    const q = rosterSearch.toLowerCase();
    return (s.surname + ' ' + (s.other_names ?? '')).toLowerCase().includes(q)
        || s.admission_number.toLowerCase().includes(q);
  });

  return (
    <div className="-m-6 flex flex-col md:flex-row gap-0 overflow-hidden" style={{ minHeight: 'calc(100vh - 112px)' }}>
      {/* ── Left: Class list ── */}
      <aside className={`${mobileDetail ? 'hidden' : 'flex'} md:flex flex-col flex-shrink-0 bg-white border-r border-gray-100 overflow-hidden w-full md:w-64`}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold text-slate-900">Classes</h1>
            <p className="text-xs text-slate-400 mt-0.5">{classes.length} class{classes.length !== 1 ? 'es' : ''}</p>
          </div>
          <button onClick={() => setClassModal('create')}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-lg leading-none hover:opacity-90"
            style={{ backgroundColor: '#15803D' }} title="New Class">+</button>
        </div>

        {/* Year filter */}
        <div className="px-3 py-2 border-b border-gray-100">
          <select value={yearId} onChange={e => setYearId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-700">
            <option value="">All years</option>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
          </select>
        </div>

        {error && <p className="text-xs text-red-600 px-4 py-2">{error}</p>}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10"><Spinner /></div>
          ) : classes.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="text-xs text-slate-400">No classes yet.</p>
              <button onClick={() => setClassModal('create')} className="text-xs font-semibold mt-2 hover:underline" style={{ color: '#15803D' }}>
                + Create first class
              </button>
            </div>
          ) : (
            (classRows as typeof classes).map(cls => {
              const active = selected?.id === cls.id;
              return (
                <div key={cls.id} onClick={() => selectClass(cls)}
                  className={`group px-3 py-2.5 cursor-pointer border-l-2 transition-all ${active ? 'border-green-500 bg-green-50' : 'border-transparent hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-sm font-semibold truncate ${active ? 'text-green-700' : 'text-slate-800'}`}>{cls.class_name}</p>
                    {/* Visible on mobile; hover-reveal on desktop */}
                    <div className="flex gap-0.5 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={e => { e.stopPropagation(); setSelected(cls); setClassModal('edit'); }}
                        className="p-1 rounded hover:bg-gray-200 text-slate-400 hover:text-slate-600" title="Rename">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                          <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteClass(cls); }}
                        className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">{cls.student_count} student{cls.student_count !== 1 ? 's' : ''}</span>
                    {cls.teacher_name && (
                      <span className="text-xs truncate" style={{ color: '#15803D' }}>· {cls.teacher_name.split(' ')[0]}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <Pagination page={classPage} pageSize={classPageSize} total={classTotal} onPage={setClassPage} onPageSize={(s) => { setClassPageSize(s); setClassPage(1); }} />
        </div>
      </aside>

      {/* ── Right: Class detail ── */}
      <main className={`${mobileDetail ? 'flex' : 'hidden'} md:flex flex-col flex-1 overflow-y-auto bg-gray-50/50 min-w-0`}>
        {/* Back button — mobile only */}
        {mobileDetail && (
          <div className="md:hidden px-4 py-2.5 border-b border-gray-100 bg-white flex-shrink-0">
            <button onClick={() => { setMobileDetail(false); setSelected(null); }}
              className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#15803D' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M15 19l-7-7 7-7" />
              </svg>
              All Classes
            </button>
          </div>
        )}
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-20">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#F0FDF4' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-700">Select a class</p>
            <p className="text-xs text-slate-400 mt-1">Click any class on the left to manage its teacher and students.</p>
            {classes.length === 0 && (
              <button onClick={() => setClassModal('create')}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: '#15803D' }}>
                + Create First Class
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
            {/* Header */}
            <div className="flex flex-wrap items-start gap-3 justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{selected.class_name}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{selected.student_count} active student{selected.student_count !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Btn variant="secondary" small onClick={() => setClassModal('edit')}>Rename</Btn>
                <Btn variant="danger" small onClick={() => deleteClass(selected)}>Delete Class</Btn>
              </div>
            </div>

            {/* Class Teacher */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700">Class Teacher</h3>
                <Btn small onClick={() => setTeacherModal(true)}>
                  {selected.teacher_id ? 'Change Teacher' : 'Assign Teacher'}
                </Btn>
              </div>
              {selected.teacher_name ? (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: '#15803D' }}>
                    {selected.teacher_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{selected.teacher_name}</p>
                    {yearId && <p className="text-xs text-slate-400">{years.find(y => y.id === yearId)?.name}</p>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">No teacher assigned for the selected year.</p>
              )}
              {!yearId && <p className="text-xs text-amber-600 mt-2">Select an academic year above to assign a teacher.</p>}
            </div>

            {/* Students */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-700 flex-1 min-w-0">
                  Students <span className="text-slate-400 font-normal">({roster.length})</span>
                </h3>
                <input value={rosterSearch} onChange={e => setRosterSearch(e.target.value)}
                  placeholder="Search…"
                  className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs w-full sm:w-36 focus:outline-none focus:ring-1 focus:ring-green-500" />
                <Btn small onClick={() => setAddStudModal(true)}>+ Add Students</Btn>
              </div>

              {rosterLoad ? (
                <div className="py-10"><Spinner /></div>
              ) : filteredRoster.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-slate-400">{rosterSearch ? 'No students match your search.' : 'No students in this class yet.'}</p>
                  {!rosterSearch && (
                    <button onClick={() => setAddStudModal(true)} className="text-xs font-semibold mt-2 hover:underline" style={{ color: '#15803D' }}>
                      + Add Students
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase w-10">#</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Student</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Adm. No.</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredRoster.map((s, i) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-xs text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-slate-900">{s.surname}{s.other_names ? ` ${s.other_names}` : ''}</p>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{s.admission_number}</td>
                          <td className="px-3 py-2.5 text-right">
                            <Btn variant="ghost" small onClick={() => setMoveStud(s)}>Move to Class</Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      {classModal && (
        <ClassModal
          editing={classModal === 'edit' ? selected : null}
          onClose={() => setClassModal(null)}
          onSaved={() => { loadClasses(); loadAllStudents(); }}
        />
      )}

      {addStudModal && selected && (
        <AddStudentsModal
          targetClass={selected.class_name}
          allStudents={allStudents}
          onClose={() => setAddStudModal(false)}
          onSaved={afterSave}
        />
      )}

      {moveStud && selected && (
        <MoveStudentModal
          student={moveStud}
          classes={classes}
          onClose={() => setMoveStud(null)}
          onSaved={afterSave}
        />
      )}

      {teacherModal && selected && yearId && (
        <AssignTeacherModal
          cls={selected} yearId={yearId} teachers={teachers}
          onClose={() => setTeacherModal(false)}
          onSaved={() => { loadClasses(); }}
        />
      )}
    </div>
  );
}
