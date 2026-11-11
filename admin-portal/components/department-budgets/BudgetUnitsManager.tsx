'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import type { BudgetTrack } from '@/types/api';
import { TRACK_LABEL, describeApiError, inputCls, labelCls, cardCls, btnGhost, btnPrimary } from './shared';

interface Unit {
  id: string; name: string; track: BudgetTrack; is_active: boolean;
  head_teacher_id: string | null; head_school_staff_id: string | null;
  head_name: string | null; head_kind: 'teacher' | 'staff' | null; budget_count: number;
}
interface Person { id: string; name: string; code?: string }

const emptyForm = { name: '', track: 'administration' as BudgetTrack, headKind: '' as '' | 'teacher' | 'staff', headId: '', isActive: true };

// Admin setup for budget units: offices and non-academic units (housemasters,
// nurse, stores, sports...) that draft their own budget. Academic
// departments come from the Departments page and need no setup here.
export default function BudgetUnitsManager({ apiClient }: { apiClient: AxiosInstance }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [teachers, setTeachers] = useState<Person[]>([]);
  const [staff, setStaff] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [u, t, s] = await Promise.all([
        apiClient.get<Unit[]>('/api/department-budgets/units'),
        apiClient.get<{ id: string; name: string; teacher_code: string; status: string }[]>('/api/teachers'),
        apiClient.get<{ id: string; name: string; email: string; is_active: boolean }[]>('/api/school-staff').catch(() => ({ data: [] })),
      ]);
      setUnits(u.data);
      setTeachers(t.data.filter(x => x.status === 'Active').map(x => ({ id: x.id, name: x.name, code: x.teacher_code })));
      setStaff(s.data.filter(x => x.is_active).map(x => ({ id: x.id, name: x.name, code: x.email })));
    } catch (e) {
      setError(describeApiError(e, 'Could not load budget units. Check your connection and try again.'));
    } finally { setLoading(false); }
  }, [apiClient]);
  useEffect(() => { load(); }, [load]);

  function openNew() { setEditingId('new'); setForm(emptyForm); setError(''); }
  function openEdit(u: Unit) {
    setEditingId(u.id); setError('');
    setForm({
      name: u.name, track: u.track, isActive: u.is_active,
      headKind: u.head_kind ?? '', headId: u.head_teacher_id ?? u.head_school_staff_id ?? '',
    });
  }

  async function save() {
    if (!form.name.trim()) { setError('Enter a name for the unit.'); return; }
    if (form.headKind && !form.headId) { setError(`Choose the ${form.headKind === 'teacher' ? 'teacher' : 'staff account'} who heads this unit.`); return; }
    setSaving(true); setError('');
    const body = {
      name: form.name.trim(), track: form.track, is_active: form.isActive,
      head_teacher_id: form.headKind === 'teacher' ? form.headId : null,
      head_school_staff_id: form.headKind === 'staff' ? form.headId : null,
    };
    try {
      if (editingId === 'new') await apiClient.post('/api/department-budgets/units', body);
      else await apiClient.put(`/api/department-budgets/units/${editingId}`, body);
      setEditingId(null);
      load();
    } catch (e) {
      setError(describeApiError(e, 'Could not save the unit. Check your connection and try again.'));
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    setSaving(true); setError('');
    try {
      await apiClient.delete(`/api/department-budgets/units/${id}`);
      setConfirmRemove(null);
      load();
    } catch (e) {
      setError(describeApiError(e, 'Could not remove the unit.'));
      setConfirmRemove(null);
    } finally { setSaving(false); }
  }

  const people = form.headKind === 'teacher' ? teachers : form.headKind === 'staff' ? staff : [];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Budget units</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Units and offices outside the academic departments, such as housemasters, the nurse, stores or sports. Each head drafts the unit&apos;s budget from their own portal.
          </p>
        </div>
        {editingId === null && <button onClick={openNew} className={btnPrimary}>Add unit</button>}
      </div>

      {error && <p className="text-sm text-[#B83232]">{error}</p>}

      {editingId !== null && (
        <div className={`${cardCls} p-5 space-y-3`}>
          <p className="text-sm font-bold text-slate-800 dark:text-white">{editingId === 'new' ? 'Add unit' : 'Edit unit'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={form.name} placeholder="e.g. Senior Housemaster" onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Budget goes to</label>
              <select className={inputCls} value={form.track} onChange={e => setForm(f => ({ ...f, track: e.target.value as BudgetTrack }))}>
                <option value="administration">Assistant Head (Administration)</option>
                <option value="academic">Assistant Head (Academic)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Head of unit</label>
              <select className={inputCls} value={form.headKind} onChange={e => setForm(f => ({ ...f, headKind: e.target.value as '' | 'teacher' | 'staff', headId: '' }))}>
                <option value="">No head yet</option>
                <option value="teacher">A teacher</option>
                <option value="staff">A staff-portal account</option>
              </select>
            </div>
            {form.headKind && (
              <div>
                <label className={labelCls}>{form.headKind === 'teacher' ? 'Teacher' : 'Staff account'}</label>
                <select className={inputCls} value={form.headId} onChange={e => setForm(f => ({ ...f, headId: e.target.value }))}>
                  <option value="">Choose…</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
                </select>
                {form.headKind === 'staff' && staff.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">No staff-portal accounts yet. Create one under Staff Accounts first.</p>
                )}
              </div>
            )}
          </div>
          {editingId !== 'new' && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-[#145C44]" />
              Active (inactive units can&apos;t start new budgets)
            </label>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditingId(null)} className={btnGhost}>Cancel</button>
            <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save unit'}</button>
          </div>
        </div>
      )}

      <div className={`${cardCls} overflow-hidden`}>
        {loading ? (
          <p className="px-4 py-4 text-sm text-slate-400">Loading…</p>
        ) : units.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
            No units yet. Add one for each office or non-academic unit that prepares its own budget.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {units.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${u.is_active ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                    {u.name}{!u.is_active && ' (inactive)'}
                  </p>
                  <p className="text-xs text-slate-400">
                    Goes to {TRACK_LABEL[u.track]}, head: {u.head_name ? `${u.head_name} (${u.head_kind === 'staff' ? 'staff account' : 'teacher'})` : 'not assigned'}
                    {u.budget_count ? `, ${u.budget_count} budget${u.budget_count === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <button onClick={() => openEdit(u)} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">Edit</button>
                {u.budget_count === 0 && (confirmRemove === u.id ? (
                  <>
                    <button onClick={() => remove(u.id)} disabled={saving} className="text-xs font-semibold text-[#B83232]">Confirm remove</button>
                    <button onClick={() => setConfirmRemove(null)} className="text-xs font-semibold text-slate-500">Keep</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmRemove(u.id)} className="text-xs font-semibold text-[#B83232] hover:underline">Remove</button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
