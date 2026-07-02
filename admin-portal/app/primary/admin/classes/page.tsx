'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AcademicYear { id: string; name: string; is_current: boolean; }
interface Teacher      { id: string; name: string; }
interface Assignment   { id: string; class_name: string; teacher_id: string; teacher_name: string; academic_year_id: string; academic_year_name: string; student_count: number; }

const CLASSES = ['Nursery 1','Nursery 2','KG 1','KG 2','Basic 1','Basic 2','Basic 3','Basic 4','Basic 5','Basic 6','JHS 1','JHS 2','JHS 3'];

export default function PrimaryClassesPage() {
  const [years,       setYears]       = useState<AcademicYear[]>([]);
  const [teachers,    setTeachers]    = useState<Teacher[]>([]);
  const [yearId,      setYearId]      = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ class_name: '', teacher_id: '' });
  const [saving,      setSaving]      = useState(false);

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

  const load = useCallback(async () => {
    if (!yearId) return;
    setLoading(true); setError('');
    try {
      const { data } = await api.get<Assignment[]>(`/api/primary/class-teachers?academic_year_id=${yearId}`);
      setAssignments(data);
    } catch { setError('Failed to load class assignments.'); }
    finally { setLoading(false); }
  }, [yearId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.class_name || !form.teacher_id || !yearId) return;
    setSaving(true);
    try {
      await api.post('/api/primary/class-teachers', { ...form, academic_year_id: yearId });
      setShowForm(false); load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Remove this class teacher assignment?')) return;
    try { await api.delete(`/api/primary/class-teachers/${id}`); load(); }
    catch { setError('Delete failed.'); }
  }

  const assignedClasses = new Set(assignments.map(a => a.class_name));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Class Setup</h1>
          <p className="text-sm text-slate-500 mt-0.5">Assign a class teacher to each class for the academic year.</p>
        </div>
        <button onClick={() => { setForm({ class_name: '', teacher_id: '' }); setShowForm(true); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#15803D' }}>
          + Assign Teacher
        </button>
      </div>

      <div className="flex gap-3">
        <select value={yearId} onChange={e => setYearId(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Select year…</option>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignments.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-slate-900">{a.class_name}</p>
                  <p className="text-sm text-slate-600 mt-0.5">{a.teacher_name}</p>
                  <p className="text-xs text-slate-400 mt-1">{a.student_count} student{a.student_count !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => del(a.id)} className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50">
                  Remove
                </button>
              </div>
            </div>
          ))}
          {assignments.length === 0 && !loading && (
            <div className="col-span-3 text-center py-12 text-slate-400 text-sm">No class assignments yet.</div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-slate-900">Assign Class Teacher</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Class</label>
              <select value={form.class_name} onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select class…</option>
                {CLASSES.map(c => <option key={c} value={c}>{c}{assignedClasses.has(c) ? ' (assigned)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Class Teacher</label>
              <select value={form.teacher_id} onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Select teacher…</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button onClick={save} disabled={saving || !form.class_name || !form.teacher_id}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
                {saving ? 'Saving…' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
