'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { AcademicYear, FormTeacherAssignment, Teacher } from '@/types/api';

interface AssignModalProps {
  className: string;
  yearId: string;
  teachers: Teacher[];
  existing: FormTeacherAssignment | null;
  onSave: (assignment: FormTeacherAssignment) => void;
  onDelete: () => void;
  onClose: () => void;
}

function AssignModal({ className, yearId, teachers, existing, onSave, onDelete, onClose }: AssignModalProps) {
  const [teacherId, setTeacherId] = useState(existing?.teacher_id ?? '');
  const [search,    setSearch]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return teachers.filter(t =>
      t.name.toLowerCase().includes(q) || t.teacher_code.toLowerCase().includes(q)
    );
  }, [teachers, search]);

  async function handleSave() {
    if (!teacherId) return;
    setSaving(true);
    try {
      const { data } = await api.post('/api/form-teacher/admin/assignments', {
        teacher_id: teacherId, class_name: className, academic_year_id: yearId,
      });
      onSave(data);
    } catch { /* toast would go here */ }
    setSaving(false);
  }

  async function handleDelete() {
    if (!existing) return;
    setDeleting(true);
    try {
      await api.delete(`/api/form-teacher/admin/assignments/${existing.id}`);
      onDelete();
    } catch { /* ignore */ }
    setDeleting(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-800">Assign Form Teacher</p>
            <p className="text-sm text-slate-500 mt-0.5">Class: <span className="font-semibold">{className}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {existing && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
              <span className="text-green-700 font-medium">Currently assigned: </span>
              <span className="text-green-900 font-bold">{existing.teacher_name}</span>
              <span className="text-green-600"> ({existing.teacher_code})</span>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
              {existing ? 'Change to' : 'Select Teacher'}
            </label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or code…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              {filtered.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTeacherId(t.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-green-50 transition-colors border-b border-slate-50 last:border-0 ${teacherId === t.id ? 'bg-green-50' : ''}`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${teacherId === t.id ? 'border-green-600 bg-green-600' : 'border-slate-300'}`}>
                    {teacherId === t.id && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-3 h-3"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.teacher_code}{t.department ? ` · ${t.department}` : ''}</p>
                  </div>
                </button>
              ))}
              {!filtered.length && <p className="text-center text-slate-400 text-sm py-4">No teachers found</p>}
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex items-center gap-3">
          {existing && (
            <button onClick={handleDelete} disabled={deleting}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50">
              {deleting ? 'Removing…' : 'Remove'}
            </button>
          )}
          <button onClick={onClose} className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
          <button onClick={handleSave} disabled={!teacherId || saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FormTeachersPage() {
  const [years,       setYears]       = useState<AcademicYear[]>([]);
  const [yearId,      setYearId]      = useState('');
  const [classes,     setClasses]     = useState<string[]>([]);
  const [teachers,    setTeachers]    = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<FormTeacherAssignment[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [modal,       setModal]       = useState<string | null>(null); // class_name being assigned

  useEffect(() => {
    Promise.all([
      api.get('/api/academic-years').then(r => {
        setYears(r.data);
        const cur = r.data.find((y: AcademicYear) => y.is_current) ?? r.data[0];
        if (cur) setYearId(cur.id);
      }),
      api.get('/api/students/classes').then(r => setClasses(r.data)),
      api.get('/api/teachers').then(r => setTeachers(r.data.filter((t: Teacher) => t.status === 'Active'))),
    ]).catch(() => {});
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    api.get(`/api/form-teacher/admin/assignments?academic_year_id=${yearId}`)
      .then(r => setAssignments(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [yearId]);

  const assignmentMap = useMemo(() => {
    const m: Record<string, FormTeacherAssignment> = {};
    for (const a of assignments) m[a.class_name] = a;
    return m;
  }, [assignments]);

  const selectedYear = years.find(y => y.id === yearId);
  const modalClass   = modal ?? '';
  const modalExisting = modal ? assignmentMap[modal] ?? null : null;

  const assigned   = classes.filter(c => assignmentMap[c]);
  const unassigned = classes.filter(c => !assignmentMap[c]);

  return (
    <div className="space-y-5 max-w-4xl mx-auto">

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Academic Year</label>
          <select value={yearId} onChange={e => setYearId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
            {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>)}
          </select>
        </div>
        <div className="ml-auto text-sm text-slate-500">
          <span className="font-semibold text-green-700">{assigned.length}</span> of{' '}
          <span className="font-semibold text-slate-700">{classes.length}</span> classes assigned
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Classes', value: classes.length, color: 'text-slate-700' },
          { label: 'Assigned',      value: assigned.length, color: 'text-green-700' },
          { label: 'Unassigned',    value: unassigned.length, color: unassigned.length > 0 ? 'text-amber-600' : 'text-slate-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-semibold text-slate-700">Class Assignments — {selectedYear?.name}</p>
            <p className="text-xs text-slate-400">{classes.length} classes</p>
          </div>
          {classes.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              No classes found. Add students with class names to see them here.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-5 py-3 text-left">Class</th>
                  <th className="px-5 py-3 text-left">Form Teacher</th>
                  <th className="px-5 py-3 text-left">Teacher Code</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {classes.map(cls => {
                  const a = assignmentMap[cls];
                  return (
                    <tr key={cls} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5 font-semibold text-slate-800">{cls}</td>
                      <td className="px-5 py-3.5">
                        {a ? (
                          <span className="font-medium text-slate-700">{a.teacher_name}</span>
                        ) : (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">Not assigned</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs font-mono">
                        {a?.teacher_code ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => setModal(cls)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${a ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                          {a ? 'Change' : 'Assign'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Assign modal */}
      {modal && (
        <AssignModal
          className={modalClass}
          yearId={yearId}
          teachers={teachers}
          existing={modalExisting}
          onSave={assignment => {
            setAssignments(prev => {
              const filtered = prev.filter(a => a.class_name !== assignment.class_name || a.academic_year_id !== assignment.academic_year_id);
              // Enrich with teacher info from local list
              const t = teachers.find(t => t.id === assignment.teacher_id);
              return [...filtered, { ...assignment, teacher_name: t?.name, teacher_code: t?.teacher_code, academic_year: selectedYear?.name ?? '' }];
            });
            setModal(null);
          }}
          onDelete={() => {
            setAssignments(prev => prev.filter(a => !(a.class_name === modalClass && a.academic_year_id === yearId)));
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
