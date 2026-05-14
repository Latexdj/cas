'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import type { Student, Program } from '@/types/api';

interface UploadResult { inserted: number; errors: { row: number; message: string }[]; }
type ModalMode = 'add' | 'edit' | 'upload' | 'promote' | 'graduate' | null;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Active:    { bg: '#DCFCE7', color: '#15803D' },
  Graduated: { bg: '#E0F2FE', color: '#0369A1' },
  Inactive:  { bg: '#F1F5F9', color: '#64748B' },
};

export default function StudentsPage() {
  const [students,       setStudents]       = useState<Student[]>([]);
  const [classes,        setClasses]        = useState<string[]>([]);
  const [programs,       setPrograms]       = useState<Program[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filterClass,    setFilterClass]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState('Active');
  const [filterProgram,  setFilterProgram]  = useState('');
  const [search,       setSearch]       = useState('');
  const [modal,        setModal]        = useState<ModalMode>(null);
  const [editing,      setEditing]      = useState<Student | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [fCode,      setFCode]      = useState('');
  const [fName,      setFName]      = useState('');
  const [fClass,     setFClass]     = useState('');
  const [fStatus,    setFStatus]    = useState('Active');
  const [fNotes,     setFNotes]     = useState('');
  const [fProgram,   setFProgram]   = useState('');

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
      const [stuRes, clsRes, progRes] = await Promise.allSettled([
        api.get<Student[]>(`/api/students?${params}`),
        api.get<string[]>('/api/students/classes'),
        api.get<Program[]>('/api/programs'),
      ]);
      if (stuRes.status  === 'fulfilled') setStudents(stuRes.value.data);
      if (clsRes.status  === 'fulfilled') setClasses(clsRes.value.data);
      if (progRes.status === 'fulfilled') setPrograms(progRes.value.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterClass, filterStatus, filterProgram]);

  function openAdd() {
    setEditing(null); setFCode(''); setFName(''); setFClass(''); setFStatus('Active'); setFNotes(''); setFProgram('');
    setError(''); setModal('add');
  }
  function openEdit(s: Student) {
    setEditing(s); setFCode(s.student_code); setFName(s.name);
    setFClass(s.class_name); setFStatus(s.status); setFNotes(s.notes || ''); setFProgram(s.program_id || '');
    setError(''); setModal('edit');
  }

  async function handleSave() {
    if (!fName.trim()) { setError('Name is required'); return; }
    if (!fClass.trim()) { setError('Class is required'); return; }
    setSaving(true); setError('');
    try {
      const body = { name: fName.trim(), class_name: fClass.trim(), student_code: fCode.trim() || undefined, status: fStatus, notes: fNotes.trim() || null, program_id: fProgram || null };
      if (editing) {
        await api.put(`/api/students/${editing.id}`, body);
      } else {
        await api.post('/api/students', body);
      }
      setModal(null); await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Save failed');
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
      const res = await api.post<UploadResult>('/api/students/upload', fd);
      setUploadResult(res.data); await load();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Upload failed';
      setUploadResult({ inserted: 0, errors: [{ row: 0, message: msg }] });
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Students</h1>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>{filtered.length} student{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setFromClass(''); setToClass(''); setActionResult(''); setModal('graduate'); }}>Graduate Class</Button>
          <Button variant="secondary" size="sm" onClick={() => { setFromClass(''); setToClass(''); setActionResult(''); setModal('promote'); }}>Promote Class</Button>
          <Button variant="secondary" size="sm" onClick={() => { setUploadResult(null); setModal('upload'); }}>↑ Upload Excel</Button>
          <Button size="sm" onClick={openAdd}>+ Add Student</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          className="border rounded-lg px-3 py-2 text-sm"
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
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  {['ID', 'Name', 'Class', 'Program', 'Status', 'Notes', ''].map(h => (
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
                        <div className="flex gap-3 justify-end">
                          <button className="text-xs font-semibold" style={{ color: '#2563EB' }} onClick={() => openEdit(s)}>Edit</button>
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" style={{ border: '1px solid #E2D9CC' }}>
            <h2 className="text-lg font-bold mb-5" style={{ color: '#0F172A' }}>{modal === 'add' ? 'Add Student' : 'Edit Student'}</h2>
            {error && <p className="text-sm mb-3 p-2 rounded" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>{error}</p>}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Student ID <span style={{ color: '#94A3B8' }}>(leave blank to auto-generate)</span></label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={fCode} onChange={e => setFCode(e.target.value)} placeholder="e.g. 2024001" />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Name *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={fName} onChange={e => setFName(e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Class *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={fClass} onChange={e => setFClass(e.target.value)} placeholder="e.g. Form 1A" list="class-list" />
                <datalist id="class-list">{classes.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Status</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
                  <option>Active</option><option>Graduated</option><option>Inactive</option>
                </select>
              </div>
              {programs.length > 0 && (
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Program</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={fProgram} onChange={e => setFProgram(e.target.value)}>
                    <option value="">No program assigned</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Notes</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
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
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="block w-full text-sm mb-4" onChange={handleUpload} disabled={uploading} />
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
