'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Office {
  id: string; name: string; office_type: string;
  linked_programme_id: string | null; linked_programme_name: string | null;
  linked_house: string | null; sort_order: number; is_active: boolean; staff_count: number;
}
interface OfficeStaff {
  id: string; teacher_id: string | null; school_staff_id: string | null;
  teacher_name: string | null; teacher_code: string | null;
  school_staff_name: string | null; school_staff_email: string | null;
}
interface ClearanceStaff { id: string; name: string; email: string; is_active: boolean; offices: string[] | null; }
interface Program { id: string; name: string; }
interface House   { id: string; name: string; }

const TYPE_LABELS: Record<string, string> = { general: 'General', hod: 'HOD', housemaster: 'Housemaster' };

export default function OfficesPage() {
  const [offices,  setOffices]  = useState<Office[]>([]);
  const [staff,    setStaff]    = useState<ClearanceStaff[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [houses,   setHouses]   = useState<House[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Office form
  const [officeForm, setOfficeForm] = useState<Partial<Office> & { _mode: 'none' | 'add' | 'edit' }>({ _mode: 'none' });
  const [ofSaving,   setOfSaving]   = useState(false);
  const [ofError,    setOfError]    = useState('');

  // Staff panel
  const [selectedOffice, setSelectedOffice] = useState<Office | null>(null);
  const [officeStaff,    setOfficeStaff]    = useState<OfficeStaff[]>([]);
  const [osLoading,      setOsLoading]      = useState(false);
  const [assignQuery,    setAssignQuery]    = useState('');

  // Staff accounts modal
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState({ id: '', name: '', email: '', password: '' });
  const [sfSaving,  setSfSaving]  = useState(false);
  const [sfError,   setSfError]   = useState('');

  // Teachers for assignment
  const [teachers,  setTeachers]  = useState<{ id: string; name: string; teacher_code: string }[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<Office[]>('/api/clearance-admin/offices'),
      api.get<ClearanceStaff[]>('/api/clearance-admin/staff'),
      api.get<Program[]>('/api/programs'),
      api.get<{ id: string; name: string; teacher_code: string }[]>('/api/teachers'),
      api.get<House[]>('/api/houses'),
    ]).then(([o, s, p, t, h]) => {
      setOffices(o.data); setStaff(s.data); setPrograms(p.data); setTeachers(t.data); setHouses(h.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function loadOfficeStaff(office: Office) {
    setSelectedOffice(office); setOsLoading(true);
    try {
      const r = await api.get<OfficeStaff[]>(`/api/clearance-admin/offices/${office.id}/staff`);
      setOfficeStaff(r.data);
    } catch { } finally { setOsLoading(false); }
  }

  async function saveOffice() {
    if (!officeForm.name?.trim()) { setOfError('Name is required'); return; }
    setOfSaving(true); setOfError('');
    try {
      if (officeForm._mode === 'add') {
        const r = await api.post<Office>('/api/clearance-admin/offices', {
          name: officeForm.name, office_type: officeForm.office_type || 'general',
          linked_programme_id: officeForm.linked_programme_id || null,
          linked_house: officeForm.linked_house || null,
          sort_order: officeForm.sort_order ?? 0,
        });
        setOffices(prev => [...prev, r.data]);
      } else {
        const r = await api.put<Office>(`/api/clearance-admin/offices/${officeForm.id}`, {
          name: officeForm.name, office_type: officeForm.office_type,
          linked_programme_id: officeForm.linked_programme_id || null,
          linked_house: officeForm.linked_house || null,
          sort_order: officeForm.sort_order ?? 0,
          is_active: officeForm.is_active,
        });
        setOffices(prev => prev.map(o => o.id === r.data.id ? r.data : o));
      }
      setOfficeForm({ _mode: 'none' });
    } catch (err: unknown) {
      setOfError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setOfSaving(false); }
  }

  async function deleteOffice(id: string) {
    if (!confirm('Delete this office? This cannot be undone.')) return;
    try {
      await api.delete(`/api/clearance-admin/offices/${id}`);
      setOffices(prev => prev.filter(o => o.id !== id));
      if (selectedOffice?.id === id) setSelectedOffice(null);
    } catch { }
  }

  async function assignStaff(type: 'teacher' | 'school_staff', staffId: string) {
    if (!selectedOffice) return;
    try {
      await api.post(`/api/clearance-admin/offices/${selectedOffice.id}/staff`, {
        [type === 'teacher' ? 'teacher_id' : 'school_staff_id']: staffId,
      });
      await loadOfficeStaff(selectedOffice);
      setOffices(prev => prev.map(o => o.id === selectedOffice.id ? { ...o, staff_count: o.staff_count + 1 } : o));
    } catch { }
  }

  async function removeAssignment(assignmentId: string) {
    if (!selectedOffice) return;
    try {
      await api.delete(`/api/clearance-admin/offices/${selectedOffice.id}/staff/${assignmentId}`);
      setOfficeStaff(prev => prev.filter(s => s.id !== assignmentId));
      setOffices(prev => prev.map(o => o.id === selectedOffice.id ? { ...o, staff_count: Math.max(0, o.staff_count - 1) } : o));
    } catch { }
  }

  async function saveStaffAccount() {
    if (!staffForm.name.trim() || !staffForm.email.trim()) { setSfError('Name and email required'); return; }
    if (!staffForm.id && !staffForm.password) { setSfError('Password required for new accounts'); return; }
    setSfSaving(true); setSfError('');
    try {
      if (staffForm.id) {
        const r = await api.put<ClearanceStaff>(`/api/clearance-admin/staff/${staffForm.id}`, staffForm);
        setStaff(prev => prev.map(s => s.id === r.data.id ? r.data : s));
      } else {
        const r = await api.post<ClearanceStaff>('/api/clearance-admin/staff', staffForm);
        setStaff(prev => [...prev, r.data]);
      }
      setShowStaffModal(false); setStaffForm({ id: '', name: '', email: '', password: '' });
    } catch (err: unknown) {
      setSfError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSfSaving(false); }
  }

  async function deleteStaff(id: string) {
    if (!confirm('Delete this staff account?')) return;
    try {
      await api.delete(`/api/clearance-admin/staff/${id}`);
      setStaff(prev => prev.filter(s => s.id !== id));
    } catch { }
  }

  const sel = 'border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500';
  const inp = `${sel} w-full`;

  const assignable = {
    teachers: teachers.filter(t =>
      !officeStaff.some(s => s.teacher_id === t.id) &&
      (t.name.toLowerCase().includes(assignQuery.toLowerCase()) || t.teacher_code.toLowerCase().includes(assignQuery.toLowerCase()))
    ),
    cstaff: staff.filter(s =>
      !officeStaff.some(os => os.school_staff_id === s.id) &&
      (s.name.toLowerCase().includes(assignQuery.toLowerCase()) || s.email.toLowerCase().includes(assignQuery.toLowerCase()))
    ),
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-7 h-7 rounded-full border-2 border-green-600 border-t-transparent animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Offices &amp; Staff</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure clearance offices and assign responsible staff</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowStaffModal(true); setStaffForm({ id: '', name: '', email: '', password: '' }); setSfError(''); }}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
            + Add Staff Account
          </button>
          <button onClick={() => setOfficeForm({ _mode: 'add', office_type: 'general', sort_order: offices.length })}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700">
            + New Office
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Offices list */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Clearance Offices</p>
          {offices.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No offices yet. Create one to get started.</p>}
          {offices.map(o => (
            <div key={o.id} className={`bg-white rounded-xl border p-4 cursor-pointer transition-colors ${selectedOffice?.id === o.id ? 'border-green-400 ring-1 ring-green-400' : 'border-slate-200 hover:border-slate-300'}`}
              onClick={() => loadOfficeStaff(o)}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-800 truncate">{o.name}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {o.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{TYPE_LABELS[o.office_type] ?? o.office_type}</span>
                  </div>
                  {(o.linked_programme_name || o.linked_house) && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {o.linked_programme_name ? `Programme: ${o.linked_programme_name}` : `House: ${o.linked_house}`}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">{o.staff_count} staff assigned</p>
                </div>
                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setOfficeForm({ ...o, _mode: 'edit' })}
                    className="text-xs px-2 py-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100">Edit</button>
                  <button onClick={() => deleteOffice(o.id)}
                    className="text-xs px-2 py-1 rounded text-red-400 hover:text-red-700 hover:bg-red-50">Del</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right panel: staff assignments OR office form */}
        <div>
          {officeForm._mode !== 'none' ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <p className="font-bold text-slate-800">{officeForm._mode === 'add' ? 'New Office' : 'Edit Office'}</p>
              {ofError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{ofError}</p>}
              <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Office Name <span className="text-red-500">*</span></label>
                <input value={officeForm.name ?? ''} onChange={e => setOfficeForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Library, Accounts Office" className={inp} /></div>
              <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Type</label>
                <select value={officeForm.office_type ?? 'general'} onChange={e => setOfficeForm(p => ({ ...p, office_type: e.target.value, linked_programme_id: null, linked_house: null }))} className={inp}>
                  <option value="general">General (applies to all students)</option>
                  <option value="hod">HOD (applies by programme)</option>
                  <option value="housemaster">Housemaster (applies by house)</option>
                </select>
              </div>
              {officeForm.office_type === 'hod' && (
                <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Link to Programme (optional)</label>
                  <select value={officeForm.linked_programme_id ?? ''} onChange={e => setOfficeForm(p => ({ ...p, linked_programme_id: e.target.value || null }))} className={inp}>
                    <option value="">All programmes</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              {officeForm.office_type === 'housemaster' && (
                <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Link to House (optional)</label>
                  <select value={officeForm.linked_house ?? ''} onChange={e => setOfficeForm(p => ({ ...p, linked_house: e.target.value || null }))} className={inp}>
                    <option value="">All houses</option>
                    {houses.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                  </select>
                </div>
              )}
              <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Sort Order</label>
                <input type="number" value={officeForm.sort_order ?? 0} onChange={e => setOfficeForm(p => ({ ...p, sort_order: parseInt(e.target.value) }))} className={inp} /></div>
              {officeForm._mode === 'edit' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={officeForm.is_active ?? true} onChange={e => setOfficeForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 accent-green-600" />
                  <span className="text-sm text-slate-700">Active</span>
                </label>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setOfficeForm({ _mode: 'none' })} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={saveOffice} disabled={ofSaving} className="flex-1 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                  {ofSaving ? 'Saving…' : 'Save Office'}
                </button>
              </div>
            </div>
          ) : selectedOffice ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="font-bold text-slate-800">{selectedOffice.name} — Staff</p>
                <button onClick={() => setSelectedOffice(null)} className="text-slate-400 hover:text-slate-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              {osLoading ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 rounded-full border-2 border-green-600 border-t-transparent animate-spin" /></div>
              ) : (
                <div className="p-4 space-y-4">
                  {/* Assigned staff */}
                  {officeStaff.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Assigned</p>
                      {officeStaff.map(s => (
                        <div key={s.id} className="flex items-center justify-between gap-2 bg-green-50 rounded-lg px-3 py-2.5">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{s.teacher_name ?? s.school_staff_name}</p>
                            <p className="text-xs text-slate-400">{s.teacher_code ?? s.school_staff_email} · {s.teacher_id ? 'Teacher' : 'Staff'}</p>
                          </div>
                          <button onClick={() => removeAssignment(s.id)} className="text-xs text-red-500 hover:text-red-700 font-semibold">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add staff */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Add Staff</p>
                    <input value={assignQuery} onChange={e => setAssignQuery(e.target.value)} placeholder="Search teachers or clearance staff…" className={inp} />
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {assignable.teachers.slice(0, 10).map(t => (
                        <button key={t.id} onClick={() => assignStaff('teacher', t.id)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                          <p className="text-sm font-medium text-slate-700">{t.name}</p>
                          <p className="text-xs text-slate-400">{t.teacher_code} · Teacher</p>
                        </button>
                      ))}
                      {assignable.cstaff.slice(0, 10).map(s => (
                        <button key={s.id} onClick={() => assignStaff('school_staff', s.id)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                          <p className="text-sm font-medium text-slate-700">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.email} · Clearance Staff</p>
                        </button>
                      ))}
                      {assignable.teachers.length === 0 && assignable.cstaff.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-3">No more staff to assign</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-4">Non-Teaching Clearance Staff</p>
              {staff.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No clearance staff accounts yet.</p>
              ) : (
                <div className="space-y-2">
                  {staff.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.email}</p>
                        {s.offices?.length ? <p className="text-[10px] text-slate-400">{s.offices.join(', ')}</p> : null}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setStaffForm({ id: s.id, name: s.name, email: s.email, password: '' }); setShowStaffModal(true); setSfError(''); }}
                          className="text-xs px-2 py-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100">Edit</button>
                        <button onClick={() => deleteStaff(s.id)}
                          className="text-xs px-2 py-1 rounded text-red-400 hover:text-red-700 hover:bg-red-50">Del</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-4 text-center">Click an office to manage its assigned staff</p>
            </div>
          )}
        </div>
      </div>

      {/* Staff Account Modal */}
      {showStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <p className="font-bold text-slate-800">{staffForm.id ? 'Edit' : 'New'} Staff Account</p>
              <button onClick={() => setShowStaffModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {sfError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{sfError}</p>}
              <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Full Name *</label>
                <input value={staffForm.name} onChange={e => setStaffForm(p => ({ ...p, name: e.target.value }))} className={inp} /></div>
              <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Email *</label>
                <input type="email" value={staffForm.email} onChange={e => setStaffForm(p => ({ ...p, email: e.target.value }))} className={inp} /></div>
              <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Password {staffForm.id ? '(leave blank to keep current)' : '*'}</label>
                <input type="password" value={staffForm.password} onChange={e => setStaffForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 6 characters" className={inp} /></div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowStaffModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={saveStaffAccount} disabled={sfSaving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                  {sfSaving ? 'Saving…' : 'Save Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
