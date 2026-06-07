'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { validateStudentForm } from '@/lib/validations';
import { Button } from '@/components/ui/Button';
import type { Student, StudentProfile, Program, ClassItem, House } from '@/types/api';

interface UploadResult { inserted: number; errors: { row: number; message: string }[]; }
interface UpdateResult { updated: number; notFound: { row: number; code: string }[]; errors: { row: number; message: string }[]; }
type ModalMode = 'add' | 'edit' | 'upload' | 'update' | 'promote' | 'graduate' | null;

type StudentForm = {
  student_code: string; name: string; class_name: string; status: string; program_id: string; notes: string;
  gender: string; date_of_birth: string; hometown: string; residential_address: string;
  ghana_card_number: string; nhia_number: string; mobile_number: string; aggregate: string;
  house: string; residential_status: string; jhs_index_number: string;
  religion: string; religious_denomination: string;
  guardian_name: string; guardian_occupation: string; guardian_mobile: string;
};

const STUDENT_EMPTY: StudentForm = {
  student_code: '', name: '', class_name: '', status: 'Active', program_id: '', notes: '',
  gender: '', date_of_birth: '', hometown: '', residential_address: '', ghana_card_number: '',
  nhia_number: '', mobile_number: '', aggregate: '', house: '', residential_status: '',
  jhs_index_number: '', religion: '', religious_denomination: '',
  guardian_name: '', guardian_occupation: '', guardian_mobile: '',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Active:    { bg: '#DCFCE7', color: '#15803D' },
  Graduated: { bg: '#E0F2FE', color: '#0369A1' },
  Inactive:  { bg: '#F1F5F9', color: '#64748B' },
};

export default function StudentsPage() {
  const [students,       setStudents]       = useState<Student[]>([]);
  const [classes,        setClasses]        = useState<string[]>([]);
  const [allClasses,     setAllClasses]     = useState<string[]>([]);
  const [programs,       setPrograms]       = useState<Program[]>([]);
  const [houses,         setHouses]         = useState<House[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filterClass,    setFilterClass]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState('Active');
  const [filterProgram,  setFilterProgram]  = useState('');
  const [search,       setSearch]       = useState('');
  const [modal,        setModal]        = useState<ModalMode>(null);
  const [editing,      setEditing]      = useState<Student | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [fieldErrors,  setFieldErrors]  = useState<Record<string, string>>({});
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [updating,     setUpdating]     = useState(false);
  const [pinValue,     setPinValue]     = useState('');
  const [pinSaving,    setPinSaving]    = useState(false);
  const [pinMsg,       setPinMsg]       = useState('');
  const [hasPin,       setHasPin]       = useState(false);
  const [resettingId,  setResettingId]  = useState<string | null>(null);
  const fileRef       = useRef<HTMLInputElement>(null);
  const updateFileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [form, setForm] = useState<StudentForm>(STUDENT_EMPTY);
  function sf(k: keyof StudentForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  // Promote / Graduate state
  const [fromClass,  setFromClass]  = useState('');
  const [toClass,    setToClass]    = useState('');
  const [actionResult, setActionResult] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterClass)   params.set('class_name', filterClass);
      if (filterProgram) params.set('program_id', filterProgram);
      if (filterStatus)  params.set('status', filterStatus || 'all');
      const [stuRes, clsRes, allClsRes, progRes, houseRes] = await Promise.allSettled([
        api.get<Student[]>(`/api/students?${params}`),
        api.get<string[]>('/api/students/classes'),
        api.get<ClassItem[]>('/api/classes'),
        api.get<Program[]>('/api/programs'),
        api.get<House[]>('/api/houses'),
      ]);
      if (stuRes.status   === 'fulfilled') setStudents(stuRes.value.data);
      if (clsRes.status   === 'fulfilled') setClasses(clsRes.value.data);
      if (progRes.status  === 'fulfilled') setPrograms(progRes.value.data);
      if (houseRes.status === 'fulfilled') setHouses(houseRes.value.data);
      const fromStudents = clsRes.status  === 'fulfilled' ? clsRes.value.data : [];
      const fromDefined  = allClsRes.status === 'fulfilled' ? allClsRes.value.data.map(c => c.name) : [];
      const merged = Array.from(new Set([...fromDefined, ...fromStudents])).sort();
      setAllClasses(merged);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterClass, filterStatus, filterProgram]);

  function openAdd() {
    setEditing(null); setForm(STUDENT_EMPTY); setError(''); setFieldErrors({}); setModal('add');
  }
  async function openEdit(s: Student) {
    setEditing(s); setError(''); setFieldErrors({}); setPinValue(''); setPinMsg(''); setHasPin(false);
    try {
      const { data } = await api.get<StudentProfile & { has_pin?: boolean }>(`/api/students/${s.id}`);
      setHasPin(!!data.has_pin);
      setForm({
        student_code: data.student_code, name: data.name, class_name: data.class_name,
        status: data.status, program_id: data.program_id ?? '', notes: data.notes ?? '',
        gender: data.gender ?? '', date_of_birth: data.date_of_birth ?? '',
        hometown: data.hometown ?? '', residential_address: data.residential_address ?? '',
        ghana_card_number: data.ghana_card_number ?? '', nhia_number: data.nhia_number ?? '',
        mobile_number: data.mobile_number ?? '', aggregate: data.aggregate != null ? String(data.aggregate) : '',
        house: data.house ?? '', residential_status: data.residential_status ?? '',
        jhs_index_number: data.jhs_index_number ?? '', religion: data.religion ?? '',
        religious_denomination: data.religious_denomination ?? '',
        guardian_name: data.guardian_name ?? '', guardian_occupation: data.guardian_occupation ?? '',
        guardian_mobile: data.guardian_mobile ?? '',
      });
    } catch {
      setForm({ ...STUDENT_EMPTY, student_code: s.student_code, name: s.name,
        class_name: s.class_name, status: s.status, notes: s.notes ?? '', program_id: s.program_id ?? '' });
    }
    setModal('edit');
  }

  async function handleSetPin() {
    if (!editing) return;
    setPinSaving(true); setPinMsg('');
    try {
      // Empty pin_value → backend resets to default Student123
      const res = await api.post(`/api/students/${editing.id}/set-pin`, { pin: pinValue.trim() || undefined });
      setHasPin(true); setPinValue('');
      setPinMsg((res.data as { message: string }).message ?? 'PIN updated');
    } catch { setPinMsg('Failed to set PIN'); }
    setPinSaving(false);
  }

  async function handleResetPassword(studentId: string) {
    setResettingId(studentId);
    try {
      await api.post(`/api/students/${studentId}/set-pin`, {});
      // briefly show tick by keeping resettingId set, then clear
    } catch { /* ignore */ }
    setTimeout(() => setResettingId(null), 1500);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.class_name.trim()) { setError('Class is required'); return; }
    const errs = validateStudentForm(form as Record<string, string>);
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); setError('Please fix the errors below.'); return; }
    setFieldErrors({});
    setSaving(true); setError('');
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(), class_name: form.class_name.trim(),
        student_code: form.student_code.trim() || undefined,
        status: form.status, program_id: form.program_id || null,
        notes: form.notes.trim() || null,
        gender: form.gender || null, date_of_birth: form.date_of_birth || null,
        hometown: form.hometown || null, residential_address: form.residential_address || null,
        ghana_card_number: form.ghana_card_number || null, nhia_number: form.nhia_number || null,
        mobile_number: form.mobile_number || null,
        aggregate: form.aggregate ? Number(form.aggregate) : null,
        house: form.house || null, residential_status: form.residential_status || null,
        jhs_index_number: form.jhs_index_number || null,
        religion: form.religion || null, religious_denomination: form.religious_denomination || null,
        guardian_name: form.guardian_name || null, guardian_occupation: form.guardian_occupation || null,
        guardian_mobile: form.guardian_mobile || null,
      };
      if (editing) await api.put(`/api/students/${editing.id}`, body);
      else await api.post('/api/students', body);
      setModal(null); await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleDelete(s: Student) {
    if (!confirm(`Delete ${s.name}? This cannot be undone.`)) return;
    await api.delete(`/api/students/${s.id}`);
    await load();
  }

  async function downloadTemplate() {
    const res = await api.get('/api/students/upload/template', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a   = document.createElement('a'); a.href = url; a.download = 'students_template.xlsx'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setUploadResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await api.post<UploadResult>('/api/students/upload', fd, { timeout: 120000 });
      setUploadResult(res.data); await load();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Upload failed';
      setUploadResult({ inserted: 0, errors: [{ row: 0, message: msg }] });
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleBulkUpdate(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUpdating(true); setUpdateResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await api.post<UpdateResult>('/api/students/bulk-update', fd, { timeout: 120000 });
      setUpdateResult(res.data); await load();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Update failed';
      setUpdateResult({ updated: 0, notFound: [], errors: [{ row: 0, message: msg }] });
    } finally { setUpdating(false); if (updateFileRef.current) updateFileRef.current.value = ''; }
  }

  async function handlePromote() {
    if (!fromClass || !toClass) { setActionResult('Please select both classes'); return; }
    if (fromClass === toClass)  { setActionResult('Source and destination cannot be the same'); return; }
    setSaving(true); setActionResult('');
    try {
      const res = await api.post<{ promoted: number }>('/api/students/promote', { from_class: fromClass, to_class: toClass });
      setActionResult(`✓ ${res.data.promoted} student(s) moved from ${fromClass} to ${toClass}`);
      await load();
    } catch (e: any) {
      setActionResult(e?.response?.data?.error || 'Promote failed');
    } finally { setSaving(false); }
  }

  async function handleGraduate() {
    if (!fromClass) { setActionResult('Please select a class'); return; }
    if (!confirm(`Graduate all active students in ${fromClass}? They will be marked as Graduated.`)) return;
    setSaving(true); setActionResult('');
    try {
      const res = await api.post<{ graduated: number }>('/api/students/graduate', { class_name: fromClass });
      setActionResult(`✓ ${res.data.graduated} student(s) in ${fromClass} marked as Graduated`);
      await load();
    } catch (e: any) {
      setActionResult(e?.response?.data?.error || 'Graduate failed');
    } finally { setSaving(false); }
  }

  const filtered = students.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.student_code.toLowerCase().includes(search.toLowerCase())
  );

  function printStudents() {
    const activeFilters: string[] = [];
    if (filterClass)   activeFilters.push(`Class: ${filterClass}`);
    if (filterStatus)  activeFilters.push(`Status: ${filterStatus}`);
    if (filterProgram) {
      const prog = programs.find(p => p.id === filterProgram);
      if (prog) activeFilters.push(`Program: ${prog.name}`);
    }
    if (search) activeFilters.push(`Search: "${search}"`);
    const filterLine = activeFilters.length ? activeFilters.join(' · ') : 'All students';
    const rows = filtered.map((s, i) => `
      <tr style="${i % 2 === 1 ? 'background:#f8fafc' : ''}">
        <td>${s.student_code}</td>
        <td>${s.name}</td>
        <td>${s.class_name}</td>
        <td>${s.program_name ?? '—'}</td>
        <td>${s.status}</td>
        <td>${s.notes ?? '—'}</td>
      </tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Student List</title><style>
      body{font-family:Arial,sans-serif;margin:24px;color:#111}
      h1{font-size:18px;margin:0 0 2px}
      .sub{font-size:12px;color:#555;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#f1f5f9;padding:7px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e2e8f0}
      td{padding:6px 10px;border-bottom:1px solid #f1f5f9}
      tr:last-child td{border-bottom:none}
      .footer{margin-top:20px;font-size:10px;color:#94a3b8;text-align:center}
      @media print{body{margin:12px}}
    </style></head><body>
      <h1>Student List</h1>
      <p class="sub">${filterLine} &nbsp;·&nbsp; ${filtered.length} record${filtered.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString('en-GB', { day:'numeric',month:'long',year:'numeric' })}</p>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Class</th><th>Program</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="footer">Generated by CAS School Management System</p>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Students</h1>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>{filtered.length} student{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={printStudents}>⎙ Print List</Button>
          <Button variant="secondary" size="sm" onClick={() => { setFromClass(''); setToClass(''); setActionResult(''); setModal('graduate'); }}>Graduate Class</Button>
          <Button variant="secondary" size="sm" onClick={() => { setFromClass(''); setToClass(''); setActionResult(''); setModal('promote'); }}>Promote Class</Button>
          <Button variant="secondary" size="sm" onClick={() => { setUploadResult(null); setModal('upload'); }}>↑ Import Students</Button>
          <Button variant="secondary" size="sm" onClick={() => { setUpdateResult(null); setModal('update'); }}>↑ Update Records</Button>
          <Button size="sm" onClick={openAdd}>+ Add Student</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          className="border rounded-lg px-3 py-2 text-sm text-[#2C2218]"
          style={{ borderColor: '#E2D9CC', minWidth: 200 }}
          placeholder="Search name or ID…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#1C1208' }}
          value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#1C1208' }}
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="Active">Active</option>
          <option value="Graduated">Graduated</option>
          <option value="Inactive">Inactive</option>
          <option value="all">All Statuses</option>
        </select>
        {programs.length > 0 && (
          <select className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#1C1208' }}
            value={filterProgram} onChange={e => setFilterProgram(e.target.value)}>
            <option value="">All Programs</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>No students found.</div>

        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  {['', 'ID', 'Name', 'Class', 'Program', 'Status', 'Notes', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const sc = STATUS_COLORS[s.status] || STATUS_COLORS.Inactive;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors"
                      style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                      <td className="px-3 py-2">
                        <div className="w-8 h-8 rounded-full overflow-hidden border shrink-0" style={{ backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }}>
                          {s.picture_url
                            ? <Image src={s.picture_url} alt={s.name} width={32} height={32} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-sm font-bold" style={{ color: '#94A3B8' }}>{s.name.charAt(0).toUpperCase()}</div>
                          }
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#E0F2FE', color: '#0369A1' }}>{s.student_code}</span>
                      </td>
                      <td className="px-5 py-3 font-semibold" style={{ color: '#0F172A' }}>{s.name}</td>
                      <td className="px-5 py-3" style={{ color: '#475569' }}>{s.class_name}</td>
                      <td className="px-5 py-3">
                        {s.program_name
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>{s.program_name}</span>
                          : <span style={{ color: '#CBD5E1' }}>—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: sc.bg, color: sc.color }}>{s.status}</span>
                      </td>
                      <td className="px-5 py-3 text-xs" style={{ color: '#94A3B8' }}>{s.notes || '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-end items-center">
                          <Link href={`/students/${s.id}`} className="text-xs font-semibold px-2 py-1 rounded border" style={{ color: '#64748B', borderColor: '#E2E8F0' }}>Profile</Link>
                          <button className="text-xs font-semibold" style={{ color: '#2563EB' }} onClick={() => openEdit(s)}>Edit</button>
                          <button
                            title="Reset portal password to Student123"
                            disabled={resettingId === s.id}
                            onClick={() => handleResetPassword(s.id)}
                            className="text-xs font-semibold px-2 py-1 rounded border transition-colors disabled:opacity-60"
                            style={resettingId === s.id
                              ? { color: '#16a34a', borderColor: '#86efac', backgroundColor: '#f0fdf4' }
                              : { color: '#7c3aed', borderColor: '#E2E8F0' }}>
                            {resettingId === s.id ? '✓ Reset' : 'Reset Pwd'}
                          </button>
                          <button className="text-xs font-semibold" style={{ color: '#DC2626' }} onClick={() => handleDelete(s)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl" style={{ border: '1px solid #E2D9CC' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: '#0F172A' }}>{modal === 'add' ? 'Add Student' : 'Edit Student'}</h2>
            <div className="max-h-[72vh] overflow-y-auto pr-1 space-y-5">

              {/* Basic */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Basic Information</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Student ID <span style={{ color: '#94A3B8' }}>(auto if blank)</span></label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono font-bold" style={{ borderColor: '#E2D9CC', color: '#0369A1' }} value={form.student_code} onChange={sf('student_code')} placeholder="e.g. 2024001" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Name *</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.name} onChange={sf('name')} placeholder="Full name" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Class *</label>
                      <select className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: form.class_name ? '#0F172A' : '#94A3B8' }} value={form.class_name} onChange={sf('class_name')}>
                        <option value="">Select class…</option>
                        {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Status</label>
                      <select className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.status} onChange={sf('status')}>
                        <option>Active</option><option>Graduated</option><option>Inactive</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {programs.length > 0 && (
                      <div>
                        <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Program</label>
                        <select className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.program_id} onChange={sf('program_id')}>
                          <option value="">No program assigned</option>
                          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Residential Status</label>
                      <select className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.residential_status} onChange={sf('residential_status')}>
                        <option value="">Select…</option>
                        <option value="Day">Day</option>
                        <option value="Boarding">Boarding</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>House</label>
                      <select className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.house} onChange={sf('house')}>
                        <option value="">Select house…</option>
                        {houses.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Aggregate</label>
                      <input type="number" min={6} max={36} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.aggregate} onChange={sf('aggregate')} placeholder="6–36" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>JHS Index No.</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.jhs_index_number} onChange={sf('jhs_index_number')} />
                    </div>
                  </div>
                </div>
              </div>

              <hr style={{ borderColor: '#F1F5F9' }} />

              {/* Personal */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Personal Information</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Gender</label>
                      <select className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.gender} onChange={sf('gender')}>
                        <option value="">Select…</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Date of Birth</label>
                      <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.date_of_birth} onChange={sf('date_of_birth')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Mobile No.</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: fieldErrors.mobile_number ? '#F87171' : '#E2D9CC', color: '#0F172A' }} value={form.mobile_number} onChange={sf('mobile_number')} placeholder="0XXXXXXXXX" />
                      {fieldErrors.mobile_number && <p className="text-xs mt-0.5" style={{ color: '#DC2626' }}>{fieldErrors.mobile_number}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Ghana Card No.</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: fieldErrors.ghana_card_number ? '#F87171' : '#E2D9CC', color: '#0F172A' }} value={form.ghana_card_number} onChange={sf('ghana_card_number')} placeholder="GHA-XXXXXXXXX-X" />
                      {fieldErrors.ghana_card_number && <p className="text-xs mt-0.5" style={{ color: '#DC2626' }}>{fieldErrors.ghana_card_number}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>NHIA No.</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.nhia_number} onChange={sf('nhia_number')} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Hometown</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.hometown} onChange={sf('hometown')} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Residential Address</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.residential_address} onChange={sf('residential_address')} />
                  </div>
                </div>
              </div>

              <hr style={{ borderColor: '#F1F5F9' }} />

              {/* Religion */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Religion</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Religion</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.religion} onChange={sf('religion')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Religious Denomination</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.religious_denomination} onChange={sf('religious_denomination')} />
                  </div>
                </div>
              </div>

              <hr style={{ borderColor: '#F1F5F9' }} />

              {/* Guardian */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Parent / Guardian</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Guardian Name</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.guardian_name} onChange={sf('guardian_name')} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Occupation</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.guardian_occupation} onChange={sf('guardian_occupation')} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Guardian Mobile</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: fieldErrors.guardian_mobile ? '#F87171' : '#E2D9CC', color: '#0F172A' }} value={form.guardian_mobile} onChange={sf('guardian_mobile')} placeholder="0XXXXXXXXX" />
                    {fieldErrors.guardian_mobile && <p className="text-xs mt-0.5" style={{ color: '#DC2626' }}>{fieldErrors.guardian_mobile}</p>}
                  </div>
                </div>
              </div>

              <hr style={{ borderColor: '#F1F5F9' }} />

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Notes</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={form.notes} onChange={sf('notes')} placeholder="Optional" />
              </div>

            </div>
            {/* Student Portal PIN — edit mode only */}
            {modal === 'edit' && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Student Portal Access</p>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${hasPin ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-600'}`}>
                    {hasPin ? 'PIN set' : 'No PIN'}
                  </span>
                  <input
                    type="text"
                    value={pinValue}
                    onChange={e => { setPinValue(e.target.value); setPinMsg(''); }}
                    placeholder="Leave blank to use Student123"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button variant="secondary" loading={pinSaving} onClick={handleSetPin}>
                    {hasPin ? 'Reset' : 'Set PIN'}
                  </Button>
                </div>
                {pinMsg && (
                  <p className={`text-xs mt-1.5 ${pinMsg.includes('successfully') ? 'text-green-600' : 'text-red-500'}`}>{pinMsg}</p>
                )}
              </div>
            )}

            {error && <p className="text-sm mt-3 p-2 rounded" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>{error}</p>}
            <div className="flex gap-3 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setModal(null)}>Cancel</Button>
              <Button className="flex-1" loading={saving} onClick={handleSave}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {modal === 'upload' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl" style={{ border: '1px solid #E2D9CC' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: '#0F172A' }}>Upload Students (Excel / CSV)</h2>
            <div className="rounded-lg p-4 mb-4 text-sm" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2D9CC' }}>
              <p className="font-semibold mb-2" style={{ color: '#0F172A' }}>Column format:</p>
              <p style={{ color: '#475569' }}>A: Student ID (blank = auto-generate) &nbsp;·&nbsp; B: Name &nbsp;·&nbsp; C: Class &nbsp;·&nbsp; D: Program &nbsp;·&nbsp; E: Status &nbsp;·&nbsp; F: Notes</p>
              <p className="mt-1 text-xs" style={{ color: '#94A3B8' }}>Program and Status are optional. See the Reference sheet in the template for valid values.</p>
              <button className="mt-2 text-xs font-semibold underline" style={{ color: '#2563EB' }} onClick={downloadTemplate}>Download template (.xlsx)</button>
            </div>
            <div className="mb-4">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} disabled={uploading} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-4 text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ borderColor: '#D1D5DB', color: '#374151', backgroundColor: '#F9FAFB' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2563EB'; (e.currentTarget as HTMLButtonElement).style.color = '#2563EB'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EFF6FF'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#D1D5DB'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#F9FAFB'; }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                Choose file (.xlsx / .xls / .csv)
              </button>
            </div>
            {uploading && <p className="text-sm text-center mb-3" style={{ color: '#64748B' }}>Uploading…</p>}
            {uploadResult && (
              <div className="rounded-lg p-3 text-sm mb-4" style={{ backgroundColor: uploadResult.errors.length ? '#FEF9F0' : '#F0FDF4', border: `1px solid ${uploadResult.errors.length ? '#FCD34D' : '#BBF7D0'}` }}>
                <p className="font-semibold mb-1" style={{ color: '#0F172A' }}>✓ {uploadResult.inserted} student(s) imported</p>
                {uploadResult.errors.map((e, i) => <p key={i} className="text-xs" style={{ color: '#DC2626' }}>Row {e.row}: {e.message}</p>)}
              </div>
            )}
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setModal(null)}>Close</Button></div>
          </div>
        </div>
      )}

      {/* Update Records modal */}
      {modal === 'update' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl" style={{ border: '1px solid #E2D9CC' }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: '#0F172A' }}>Update Student Records</h2>
            <p className="text-sm mb-4" style={{ color: '#64748B' }}>Upload a file where column A is the Student ID. Only non-blank fields will be updated — blank cells are skipped.</p>
            <div className="rounded-lg p-4 mb-4 text-sm" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2D9CC' }}>
              <p className="font-semibold mb-1" style={{ color: '#0F172A' }}>Same column format as the import template:</p>
              <p style={{ color: '#475569' }}>A: Student ID (required) &nbsp;·&nbsp; B: Name &nbsp;·&nbsp; C: Class &nbsp;·&nbsp; D: Program &nbsp;·&nbsp; E: Status &nbsp;·&nbsp; F–V: Profile fields</p>
              <p className="mt-1 text-xs" style={{ color: '#94A3B8' }}>Leave any column blank to keep the existing value unchanged.</p>
              <button className="mt-2 text-xs font-semibold underline" style={{ color: '#2563EB' }} onClick={downloadTemplate}>Download template (.xlsx)</button>
            </div>
            <div className="mb-4">
              <input ref={updateFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkUpdate} disabled={updating} />
              <button
                type="button"
                onClick={() => updateFileRef.current?.click()}
                disabled={updating}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-4 text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ borderColor: '#D1D5DB', color: '#374151', backgroundColor: '#F9FAFB' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2563EB'; (e.currentTarget as HTMLButtonElement).style.color = '#2563EB'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EFF6FF'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#D1D5DB'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#F9FAFB'; }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                Choose file (.xlsx / .xls / .csv)
              </button>
            </div>
            {updating && <p className="text-sm text-center mb-3" style={{ color: '#64748B' }}>Processing…</p>}
            {updateResult && (
              <div className="rounded-lg p-3 text-sm mb-4 space-y-1" style={{ backgroundColor: updateResult.errors.length || updateResult.notFound.length ? '#FEF9F0' : '#F0FDF4', border: `1px solid ${updateResult.errors.length || updateResult.notFound.length ? '#FCD34D' : '#BBF7D0'}` }}>
                <p className="font-semibold" style={{ color: '#0F172A' }}>✓ {updateResult.updated} student(s) updated</p>
                {updateResult.notFound.map((e, i) => (
                  <p key={i} className="text-xs" style={{ color: '#B45309' }}>Row {e.row}: Student ID "{e.code}" not found</p>
                ))}
                {updateResult.errors.map((e, i) => (
                  <p key={i} className="text-xs" style={{ color: '#DC2626' }}>Row {e.row}: {e.message}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setModal(null)}>Close</Button></div>
          </div>
        </div>
      )}

      {/* Promote modal */}
      {modal === 'promote' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" style={{ border: '1px solid #E2D9CC' }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: '#0F172A' }}>Promote Class</h2>
            <p className="text-sm mb-5" style={{ color: '#64748B' }}>Move all active students from one class to another.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>From Class</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={fromClass} onChange={e => setFromClass(e.target.value)}>
                  <option value="">Select class…</option>
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>To Class</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={toClass} onChange={e => setToClass(e.target.value)} placeholder="e.g. Form 2A" list="class-list-to" />
                <datalist id="class-list-to">{classes.map(c => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            {actionResult && <p className="text-sm mt-3 font-medium" style={{ color: actionResult.startsWith('✓') ? '#15803D' : '#DC2626' }}>{actionResult}</p>}
            <div className="flex gap-3 mt-6">
              <Button variant="secondary" className="flex-1" onClick={() => setModal(null)}>Close</Button>
              <Button className="flex-1" loading={saving} onClick={handlePromote}>Promote</Button>
            </div>
          </div>
        </div>
      )}

      {/* Graduate modal */}
      {modal === 'graduate' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" style={{ border: '1px solid #E2D9CC' }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: '#0F172A' }}>Graduate Class</h2>
            <p className="text-sm mb-5" style={{ color: '#64748B' }}>Mark all active students in a class as Graduated. Historical attendance is preserved.</p>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Class to Graduate</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={fromClass} onChange={e => setFromClass(e.target.value)}>
                <option value="">Select class…</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {actionResult && <p className="text-sm mt-3 font-medium" style={{ color: actionResult.startsWith('✓') ? '#15803D' : '#DC2626' }}>{actionResult}</p>}
            <div className="flex gap-3 mt-6">
              <Button variant="secondary" className="flex-1" onClick={() => setModal(null)}>Close</Button>
              <Button className="flex-1" loading={saving} onClick={handleGraduate} style={{ backgroundColor: '#0369A1' }}>Graduate</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
