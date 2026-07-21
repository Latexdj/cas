'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { validateTeacherForm } from '@/lib/validations';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import type { Teacher, TeacherProfile } from '@/types/api';

const GES_RANKS = ['Pupil Teacher','Teacher II','Teacher I','Senior Teacher II','Senior Teacher I','Assistant Superintendent II','Assistant Superintendent I','Superintendent','Senior Superintendent','Principal Superintendent','Assistant Director II','Assistant Director I','Deputy Director','Director'];

type TeacherForm = Partial<TeacherProfile & { password: string }>;

const EMPTY: TeacherForm = {
  teacher_code: '', name: '', email: '', phone: '', department: '', status: 'Active', is_admin: false, notes: '', password: '',
  gov_staff_id: '', gender: '', date_of_birth: '', rank: '', registered_number: '', ntc_number: '', ssf_number: '',
  academic_qualification: '', professional_qualification: '', additional_responsibility: '', bank: '', bank_branch: '',
  account_number: '', religion: '', religious_denomination: '', hometown: '', residential_address: '', association: '',
  ghana_card_number: '', emergency_contact_name: '', emergency_contact_phone: '',
};

interface UploadResult { inserted: number; errors: { row: number; message: string }[] }
interface SendResult   { sent: number; failed: number; skipped: number; errors: { name: string; error: string }[] }
interface UpdateResult { updated: number; notFound: { row: number; code: string }[]; errors: { row: number; message: string }[] }

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDept,   setFilterDept]   = useState('');
  const [filterRole,   setFilterRole]   = useState('');
  const [modal,       setModal]       = useState<'create' | 'edit' | 'upload' | 'update' | null>(null);
  const [form,        setForm]        = useState<TeacherForm>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [editId,   setEditId]   = useState<string | null>(null);

  // Upload state
  const fileRef                      = useRef<HTMLInputElement>(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadErr,    setUploadErr]    = useState('');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // Update Records state
  const updateFileRef                       = useRef<HTMLInputElement>(null);
  const [updating,      setUpdating]        = useState(false);
  const [updateErr,     setUpdateErr]       = useState('');
  const [updateResult,  setUpdateResult]    = useState<UpdateResult | null>(null);

  // Responsibilities
  const [availableResp,    setAvailableResp]    = useState<{ id: string; name: string; module_key: string | null }[]>([]);
  const [selectedRespIds,  setSelectedRespIds]  = useState<string[]>([]);

  // Reset PIN state
  const [pinTarget,    setPinTarget]    = useState<Teacher | null>(null);
  const [pinInput,     setPinInput]     = useState('');
  const [pinResetting, setPinResetting] = useState(false);
  const [pinError,     setPinError]     = useState('');
  const [pinConfirmed, setPinConfirmed] = useState<string | null>(null);
  const [pinEmailSent, setPinEmailSent] = useState(false);
  const [pinEmailing,  setPinEmailing]  = useState(false);

  // Send credentials state
  const [sendTarget,   setSendTarget]   = useState<Teacher | null>(null);
  const [sending,      setSending]      = useState(false);
  const [sendResult,   setSendResult]   = useState<{ pin: string; email: string } | null>(null);
  const [sendError,    setSendError]    = useState('');
  const [bulkSending,  setBulkSending]  = useState(false);
  const [bulkResult,   setBulkResult]   = useState<SendResult | null>(null);

  // Template download modal
  const [tmplOpen,    setTmplOpen]    = useState(false);
  const [tmplMode,    setTmplMode]    = useState<'empty' | 'populated'>('empty');
  const [tmplStatus,  setTmplStatus]  = useState('Active');
  const [tmplLoading, setTmplLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Teacher[]>('/api/teachers');
      setTeachers(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openUpload() { setUploadErr(''); setUploadResult(null); setModal('upload'); }

  function openTemplateModal() {
    setTmplMode('empty'); setTmplStatus('Active'); setTmplOpen(true);
  }

  async function doTemplateDownload() {
    setTmplLoading(true);
    try {
      const params = new URLSearchParams({ mode: tmplMode });
      if (tmplMode === 'populated') params.set('status', tmplStatus);
      const { data } = await api.get(`/api/teachers/upload/template?${params}`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data as Blob);
      a.download = tmplMode === 'populated' ? `teachers_${tmplStatus}.xlsx` : 'teachers_template.xlsx';
      a.click();
      setTmplOpen(false);
    } catch { alert('Could not download template.'); }
    finally { setTmplLoading(false); }
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setUploadErr('Please select a file.'); return; }
    setUploading(true); setUploadErr(''); setUploadResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post<UploadResult>('/api/teachers/upload', fd);
      setUploadResult(data);
      await load();
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setUploadErr(msg ?? 'Upload failed.');
    } finally { setUploading(false); }
  }

  function openUpdate() { setUpdateErr(''); setUpdateResult(null); setModal('update'); }

  async function handleBulkUpdate() {
    const file = updateFileRef.current?.files?.[0];
    if (!file) { setUpdateErr('Please select a file.'); return; }
    setUpdating(true); setUpdateErr(''); setUpdateResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post<UpdateResult>('/api/teachers/bulk-update', fd, { timeout: 120000 });
      setUpdateResult(data);
      await load();
      if (updateFileRef.current) updateFileRef.current.value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setUpdateErr(msg ?? 'Update failed.');
    } finally { setUpdating(false); }
  }

  function openCreate() {
    setForm(EMPTY); setError(''); setFieldErrors({}); setEditId(null);
    setSelectedRespIds([]);
    api.get<{ id: string; name: string; module_key: string | null }[]>('/api/responsibilities')
      .then(r => setAvailableResp(r.data)).catch(() => {});
    setModal('create');
  }
  async function openEdit(t: Teacher) {
    setEditId(t.id); setError(''); setFieldErrors({});
    setSelectedRespIds([]);
    api.get<{ id: string; name: string; module_key: string | null }[]>('/api/responsibilities')
      .then(r => setAvailableResp(r.data)).catch(() => {});
    try {
      const { data } = await api.get<TeacherProfile & { responsibilities?: { id: string }[] }>(`/api/teachers/${t.id}`);
      setForm({
        teacher_code: data.teacher_code, name: data.name, email: data.email ?? '', phone: data.phone ?? '',
        department: data.department ?? '', status: data.status, is_admin: data.is_admin, notes: data.notes ?? '', password: '',
        gov_staff_id: data.gov_staff_id ?? '', gender: data.gender ?? '', date_of_birth: data.date_of_birth ?? '',
        rank: data.rank ?? '', registered_number: data.registered_number ?? '', ntc_number: data.ntc_number ?? '',
        ssf_number: data.ssf_number ?? '', academic_qualification: data.academic_qualification ?? '',
        professional_qualification: data.professional_qualification ?? '',
        additional_responsibility: data.additional_responsibility ?? '', bank: data.bank ?? '',
        bank_branch: data.bank_branch ?? '', account_number: data.account_number ?? '',
        religion: data.religion ?? '', religious_denomination: data.religious_denomination ?? '',
        hometown: data.hometown ?? '', residential_address: data.residential_address ?? '',
        association: data.association ?? '', ghana_card_number: data.ghana_card_number ?? '',
        emergency_contact_name: data.emergency_contact_name ?? '', emergency_contact_phone: data.emergency_contact_phone ?? '',
      });
      setSelectedRespIds((data.responsibilities ?? []).map((r) => r.id));
    } catch {
      setForm({ ...EMPTY, teacher_code: t.teacher_code, name: t.name, email: t.email ?? '',
        phone: t.phone ?? '', department: t.department ?? '', status: t.status, is_admin: t.is_admin, notes: t.notes ?? '' });
    }
    setModal('edit');
  }

  async function save() {
    const errs = validateTeacherForm(form as Record<string, string>);
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); setError('Please fix the errors below.'); return; }
    setFieldErrors({});
    setSaving(true); setError('');
    try {
      const body: Record<string, unknown> = { ...form };
      if (!body.password) delete body.password;
      for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
      body.responsibility_ids = selectedRespIds;
      if (modal === 'create') await api.post('/api/teachers', body);
      else await api.put(`/api/teachers/${editId}`, body);
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save teacher.');
    } finally { setSaving(false); }
  }

  async function deleteTeacher(id: string, name: string) {
    if (!confirm(`Delete teacher "${name}"? This cannot be undone.`)) return;
    await api.delete(`/api/teachers/${id}`);
    await load();
  }

  /* ── Reset PIN ── */
  function openResetPin(t: Teacher) {
    setPinTarget(t); setPinInput(''); setPinError(''); setPinConfirmed(null); setPinEmailSent(false);
  }

  async function doResetPin() {
    if (!pinTarget) return;
    if (pinInput && !/^\d{4,8}$/.test(pinInput)) { setPinError('PIN must be 4–8 digits.'); return; }
    setPinResetting(true); setPinError('');
    try {
      const { data } = await api.patch<{ pin: string }>(`/api/admin/teachers/${pinTarget.id}/reset-pin`, pinInput ? { pin: pinInput } : {});
      setPinConfirmed(data.pin);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPinError(msg ?? 'Failed to reset PIN.');
    } finally { setPinResetting(false); }
  }

  async function emailPinToTeacher() {
    if (!pinTarget || !pinConfirmed) return;
    setPinEmailing(true);
    try {
      await api.post(`/api/admin/teachers/${pinTarget.id}/send-credentials`);
      setPinEmailSent(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPinError(msg ?? 'Failed to send email.');
    } finally { setPinEmailing(false); }
  }

  /* ── Send Credentials ── */
  function openSendCredentials(t: Teacher) {
    setSendTarget(t); setSendResult(null); setSendError('');
  }

  async function doSendCredentials() {
    if (!sendTarget) return;
    setSending(true); setSendError('');
    try {
      const { data } = await api.post<{ pin: string; email: string }>(`/api/admin/teachers/${sendTarget.id}/send-credentials`);
      setSendResult(data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown }; message?: string };
      const body = e.response?.data;
      const msg = (typeof body === 'object' && body !== null)
        ? (body as { error?: string }).error
        : undefined;
      setSendError(msg ?? e.message ?? 'Request failed with no response.');
    } finally { setSending(false); }
  }

  async function doBulkSend() {
    if (!confirm('This will generate new PINs and email all active teachers who have email addresses. Continue?')) return;
    setBulkSending(true); setBulkResult(null);
    try {
      const { data } = await api.post<SendResult>('/api/admin/teachers/send-credentials-bulk');
      setBulkResult(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Bulk send failed.');
    } finally { setBulkSending(false); }
  }

  const departments = Array.from(new Set(teachers.map(t => t.department).filter(Boolean))).sort() as string[];

  const filtered = teachers.filter(t => {
    if (search && !(
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.teacher_code.toLowerCase().includes(search.toLowerCase()) ||
      (t.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (t.department ?? '').toLowerCase().includes(search.toLowerCase())
    )) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterDept   && t.department !== filterDept) return false;
    if (filterRole === 'admin'   && !t.is_admin) return false;
    if (filterRole === 'teacher' &&  t.is_admin) return false;
    return true;
  });

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(filtered as Record<string, unknown>[]);

  function printTeachers() {
    const activeFilters: string[] = [];
    if (filterStatus) activeFilters.push(`Status: ${filterStatus}`);
    if (filterDept)   activeFilters.push(`Department: ${filterDept}`);
    if (filterRole)   activeFilters.push(`Role: ${filterRole === 'admin' ? 'Admin' : 'Teacher'}`);
    if (search)       activeFilters.push(`Search: "${search}"`);
    const filterLine = activeFilters.length ? activeFilters.join(' · ') : 'All teachers';
    const rows = filtered.map(t => `
      <tr>
        <td>${t.teacher_code}</td>
        <td>${t.name}</td>
        <td>${t.email ?? '—'}</td>
        <td>${t.phone ?? '—'}</td>
        <td>${t.department ?? '—'}</td>
        <td>${t.total_periods ?? 0}</td>
        <td>${t.is_admin ? 'Admin' : 'Teacher'}</td>
        <td>${t.status}</td>
      </tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Teacher List</title><style>
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
      <h1>Teacher List</h1>
      <p class="sub">${filterLine} &nbsp;·&nbsp; ${filtered.length} record${filtered.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString('en-GB', { day:'numeric',month:'long',year:'numeric' })}</p>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Department</th><th>Periods</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="footer">Generated by CAS School Management System</p>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  function field(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  const teachersWithEmail = teachers.filter(t => t.email && t.status === 'Active').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Search + filters row */}
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          <Input placeholder="Search by name, ID, email…" value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:max-w-xs" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Roles</option>
            <option value="teacher">Teacher</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {/* Action buttons row */}
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          {/* Bulk email credentials */}
          <button
            onClick={doBulkSend}
            disabled={bulkSending || teachersWithEmail === 0}
            title={teachersWithEmail === 0 ? 'No active teachers have email addresses' : `Send credentials to ${teachersWithEmail} teachers`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: '#3B82F6', color: '#1D4ED8', background: '#EFF6FF' }}
          >
            {bulkSending ? (
              <span className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin inline-block" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            )}
            {bulkSending ? 'Sending…' : `Email All (${teachersWithEmail})`}
          </button>

          <Button variant="secondary" onClick={printTeachers}>⎙ Print List</Button>
          <Button variant="secondary" onClick={openUpload}>↑ Upload Excel</Button>
          <Button variant="secondary" onClick={openUpdate}>✎ Update Records</Button>
          <Button onClick={openCreate}>+ Add Teacher</Button>
        </div>
      </div>


      {/* Bulk send result banner */}
      {bulkResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-start justify-between gap-3 ${bulkResult.failed > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
          <div>
            <p className="font-semibold">
              ✓ Emails sent to {bulkResult.sent} teacher{bulkResult.sent !== 1 ? 's' : ''}.
              {bulkResult.skipped > 0 && ` ${bulkResult.skipped} skipped (no email).`}
              {bulkResult.failed > 0 && ` ${bulkResult.failed} failed.`}
            </p>
            {bulkResult.errors.length > 0 && (
              <ul className="mt-1 text-xs space-y-0.5 opacity-80">
                {bulkResult.errors.map((e, i) => <li key={i}>• {e.name}: {e.error}</li>)}
              </ul>
            )}
          </div>
          <button onClick={() => setBulkResult(null)} className="text-lg leading-none opacity-50 hover:opacity-100">×</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10"></th>
                <Th label="ID" sortKey="teacher_code" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                <Th label="Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <Th label="Dept" sortKey="department" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Periods</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Role</th>
                <Th label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(displayRows as Teacher[]).map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                      {t.photo_url
                        ? <Image src={t.photo_url} alt={t.name} width={32} height={32} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">{t.name.charAt(0).toUpperCase()}</div>
                      }
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono font-bold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 text-xs">{t.teacher_code}</span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{t.name}</td>
                  <td className="px-3 py-2.5 text-gray-600">{t.email ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{t.department ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600 hidden md:table-cell">{t.total_periods}</td>
                  <td className="px-3 py-2.5 text-gray-600 hidden md:table-cell">{t.is_admin ? 'Admin' : 'Teacher'}</td>
                  <td className="px-3 py-2.5"><Badge status={t.status} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex gap-1.5 items-center">
                      <Link href={`/teachers/${t.id}`}
                        className="flex items-center gap-0.5 px-2 py-1 rounded text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:bg-gray-50">
                        Profile
                      </Link>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => openResetPin(t)} title="Reset PIN">🔑 PIN</Button>
                      <button
                        onClick={() => t.email ? openSendCredentials(t) : undefined}
                        title={t.email ? `Send credentials to ${t.email}` : 'No email address on file'}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border transition-colors ${t.email ? 'border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 cursor-pointer' : 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed'}`}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        Login
                      </button>
                      <Button variant="danger" size="sm" onClick={() => deleteTeacher(t.id, t.name)}>Del</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">No teachers found.</td></tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} total={total}
            onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} />
        </div>
      )}

      {/* ── Upload modal ── */}
      <Modal open={modal === 'upload'} onClose={() => setModal(null)} title="Bulk Upload Teachers" maxWidth="max-w-lg">
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600 space-y-2">
            <p className="font-semibold text-slate-700">Expected columns (row 1 = optional header):</p>
            <div className="grid grid-cols-7 gap-1 text-xs font-mono">
              {['A: ID', 'B: Name*', 'C: Email', 'D: Phone', 'E: Dept', 'F: Admin?', 'G: Notes'].map(c => (
                <span key={c} className="bg-white border border-slate-200 rounded px-1 py-0.5 text-center leading-tight">{c}</span>
              ))}
            </div>
            <ul className="text-xs text-slate-400 space-y-0.5">
              <li>• <strong className="text-slate-600">Teacher ID</strong> (Column A): leave blank to auto-generate T001, T002…</li>
              <li>• <strong className="text-slate-600">Name</strong> (Column B): required</li>
              <li>• <strong className="text-slate-600">Is Admin</strong> (Column F): Yes / No (default No)</li>
              <li>• All new teachers get the school default PIN — share their Teacher ID + PIN with them</li>
              <li>• Existing Teacher IDs are skipped with an error — edit those individually</li>
            </ul>
          </div>
          <button onClick={openTemplateModal} className="text-sm font-semibold text-green-700 hover:underline">
            ↓ Download template (.xlsx)
          </button>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">
              Select file (.xlsx, .xls, .csv)
            </label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
              className="w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-green-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-green-700 cursor-pointer" />
          </div>
          {uploadErr && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{uploadErr}</p>}
          {uploadResult && (
            <div className="space-y-2">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                <span className="font-semibold">{uploadResult.inserted}</span> teacher{uploadResult.inserted !== 1 ? 's' : ''} added successfully
              </div>
              {uploadResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1 max-h-48 overflow-y-auto">
                  <p className="font-semibold">{uploadResult.errors.length} row{uploadResult.errors.length !== 1 ? 's' : ''} skipped:</p>
                  {uploadResult.errors.map((e, i) => <p key={i} className="text-xs">Row {e.row}: {e.message}</p>)}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
            <Button onClick={handleUpload} loading={uploading}>Import</Button>
          </div>
        </div>
      </Modal>

      {/* ── Update Records modal ── */}
      <Modal open={modal === 'update'} onClose={() => setModal(null)} title="Update Teacher Records" maxWidth="max-w-lg">
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1">
            <p className="font-semibold">How it works:</p>
            <ul className="text-xs space-y-0.5">
              <li>• Column A must be the <strong>Teacher ID</strong> (e.g. T001) — used to identify each record</li>
              <li>• Leave any other cell <strong>blank</strong> to keep the existing value</li>
              <li>• Only non-blank cells are updated — nothing is deleted or overwritten unintentionally</li>
              <li>• <strong>Tip:</strong> Download a populated template first, edit what you need, then upload</li>
            </ul>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-2 text-xs font-mono text-slate-500 overflow-x-auto whitespace-nowrap">
            A: Teacher ID* · B: Name · C: Email · D: Phone · E: Dept · F: Rank · G: Staff ID · H: Gender · I: DOB · J: Reg No · K: NTC · L: SSF · M: Qualification · N: Prof Qual · O: Addl Resp · P: Bank · Q: Branch · R: Account · S: Religion · T: Denomination · U: Hometown · V: Address · W: Association · X: Ghana Card · Y: Emg Name · Z: Emg Phone · AA: Is Admin · AB: Notes · AC: Status
          </div>
          <button
            onClick={openTemplateModal}
            className="text-sm font-semibold text-green-700 hover:underline"
          >
            ↓ Download populated template (.xlsx)
          </button>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-2">Select file (.xlsx, .xls, .csv)</label>
            <div
              onClick={() => updateFileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl px-6 py-6 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors"
            >
              <p className="text-sm text-slate-500">
                {updateFileRef.current?.files?.[0]?.name ?? 'Click to choose file or drag & drop'}
              </p>
              <p className="text-xs text-slate-400 mt-1">.xlsx, .xls or .csv</p>
            </div>
            <input ref={updateFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={() => setUpdateErr('')} />
          </div>
          {updateErr && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{updateErr}</p>}
          {updateResult && (
            <div className="space-y-2">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                <span className="font-semibold">{updateResult.updated}</span> teacher record{updateResult.updated !== 1 ? 's' : ''} updated successfully
              </div>
              {updateResult.notFound.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1 max-h-36 overflow-y-auto">
                  <p className="font-semibold">{updateResult.notFound.length} Teacher ID{updateResult.notFound.length !== 1 ? 's' : ''} not found:</p>
                  {updateResult.notFound.map((n, i) => <p key={i} className="text-xs">Row {n.row}: "{n.code}" — not in your school</p>)}
                </div>
              )}
              {updateResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1 max-h-36 overflow-y-auto">
                  <p className="font-semibold">{updateResult.errors.length} row{updateResult.errors.length !== 1 ? 's' : ''} with errors:</p>
                  {updateResult.errors.map((e, i) => <p key={i} className="text-xs">Row {e.row}: {e.message}</p>)}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
            <Button onClick={handleBulkUpdate} loading={updating}>Update Records</Button>
          </div>
        </div>
      </Modal>

      {/* ── Reset PIN modal ── */}
      <Modal open={pinTarget !== null} onClose={() => setPinTarget(null)} title="Reset Teacher PIN" maxWidth="max-w-sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Resetting PIN for <span className="font-semibold text-slate-900">{pinTarget?.name}</span>.
          </p>

          {pinConfirmed ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-center">
                <p className="text-sm text-green-700 mb-2">PIN has been reset. New PIN:</p>
                <p className="text-4xl font-bold tracking-widest text-green-800 font-mono">{pinConfirmed}</p>
                <p className="text-xs text-green-600 mt-2">The teacher can now log in with this PIN.</p>
              </div>

              {/* Email PIN button — only if teacher has email */}
              {pinTarget?.email && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                  {pinEmailSent ? (
                    <p className="text-sm text-blue-800 font-semibold text-center">
                      ✓ Credentials emailed to {pinTarget.email}
                    </p>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-blue-700">
                        Also send to <span className="font-semibold">{pinTarget.email}</span>?
                      </p>
                      <button
                        onClick={emailPinToTeacher}
                        disabled={pinEmailing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: '#1D4ED8' }}
                      >
                        {pinEmailing ? (
                          <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                        )}
                        {pinEmailing ? 'Sending…' : 'Send Email'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {pinError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{pinError}</p>}
              <div className="flex justify-end">
                <Button onClick={() => setPinTarget(null)}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  New PIN <span className="text-slate-400 font-normal">(leave blank to use default)</span>
                </label>
                <input
                  type="text" inputMode="numeric" maxLength={8}
                  placeholder="e.g. 5678  —  or leave blank for default"
                  value={pinInput}
                  onChange={e => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono tracking-widest"
                />
                <p className="mt-1 text-xs text-slate-400">4–8 digits. Blank resets to the school default PIN.</p>
              </div>
              {pinError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{pinError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={() => setPinTarget(null)}>Cancel</Button>
                <Button onClick={doResetPin} loading={pinResetting}>Reset PIN</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Send Credentials modal ── */}
      <Modal open={sendTarget !== null} onClose={() => { setSendTarget(null); setSendResult(null); setSendError(''); }} title="Send Login Credentials" maxWidth="max-w-sm">
        <div className="space-y-4">
          {sendResult ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-center space-y-2">
                <p className="text-2xl">✉️</p>
                <p className="text-sm font-semibold text-green-800">PIN reset — email on its way!</p>
                <p className="text-xs text-green-700">Login details being sent to <strong>{sendResult.email}</strong></p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                <p className="text-xs text-slate-500 mb-1">New PIN (keep as backup)</p>
                <p className="text-2xl font-bold tracking-widest text-slate-800 font-mono">{sendResult.pin}</p>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => { setSendTarget(null); setSendResult(null); setSendError(''); }}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                This will generate a <strong>new PIN</strong> for{' '}
                <span className="font-semibold text-slate-900">{sendTarget?.name}</span> and email their full
                login details to:
              </p>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 text-center">
                {sendTarget?.email}
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                ⚠ The teacher's current PIN will be replaced. They will need to use the new PIN after this.
              </div>
              {sendError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{sendError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={() => setSendTarget(null)}>Cancel</Button>
                <Button onClick={doSendCredentials} loading={sending}>Send Credentials</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Create / Edit modal ── */}
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Teacher' : 'Edit Teacher'} maxWidth="max-w-2xl">
        <div className="max-h-[75vh] overflow-y-auto pr-1 space-y-5">

          {/* Account */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Account</p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Teacher ID {modal === 'create' && <span className="font-normal text-slate-400">(auto if blank)</span>}</label>
                  <input className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-bold text-green-700 uppercase focus:outline-none focus:ring-2 focus:ring-green-600"
                    value={form.teacher_code ?? ''} onChange={e => setForm(f => ({ ...f, teacher_code: e.target.value.toUpperCase() }))} placeholder="e.g. T001" maxLength={10} />
                </div>
                <div className="col-span-2"><Input label="Full Name *" value={form.name ?? ''} onChange={field('name')} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Email" type="email" value={form.email ?? ''} onChange={field('email')} />
                <div>
                  <Input label="Phone" value={form.phone ?? ''} onChange={field('phone')} />
                  {fieldErrors.phone && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.phone}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Department" value={form.department ?? ''} onChange={field('department')} />
                <Input label={modal === 'create' ? 'Password *' : 'New Password (leave blank to keep)'} type="password" value={form.password ?? ''} onChange={field('password')} />
              </div>
              <div className="flex gap-4 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <select value={form.status ?? 'Active'} onChange={field('status')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                  Status
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.is_admin} onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))} />
                  Admin role
                </label>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Personal Information */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Personal Information</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Gender</label>
                  <select value={form.gender ?? ''} onChange={field('gender')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600">
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <Input label="Date of Birth" type="date" value={form.date_of_birth ?? ''} onChange={field('date_of_birth')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Hometown" value={form.hometown ?? ''} onChange={field('hometown')} />
                <Input label="Residential Address" value={form.residential_address ?? ''} onChange={field('residential_address')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Religion" value={form.religion ?? ''} onChange={field('religion')} />
                <Input label="Religious Denomination" value={form.religious_denomination ?? ''} onChange={field('religious_denomination')} />
              </div>
              <div>
                <Input label="Ghana Card No." value={form.ghana_card_number ?? ''} onChange={field('ghana_card_number')} placeholder="GHA-XXXXXXXXX-X" />
                {fieldErrors.ghana_card_number && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.ghana_card_number}</p>}
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Professional Information */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Professional Information</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Gov Staff ID" value={form.gov_staff_id ?? ''} onChange={field('gov_staff_id')} />
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">GES Rank</label>
                  <select value={form.rank ?? ''} onChange={field('rank')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600">
                    <option value="">Select rank…</option>
                    {GES_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Registered Number" value={form.registered_number ?? ''} onChange={field('registered_number')} />
                <div>
                  <Input label="NTC Number" value={form.ntc_number ?? ''} onChange={field('ntc_number')} placeholder="PT/XXXXXX/XXXX" />
                  {fieldErrors.ntc_number && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.ntc_number}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input label="SSF Number" value={form.ssf_number ?? ''} onChange={field('ssf_number')} placeholder="e.g. KO18602160034" />
                  {fieldErrors.ssf_number && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.ssf_number}</p>}
                </div>
                <Input label="Association (GNAT/NAGRAT/CCT…)" value={form.association ?? ''} onChange={field('association')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Academic Qualification" value={form.academic_qualification ?? ''} onChange={field('academic_qualification')} />
                <Input label="Professional Qualification" value={form.professional_qualification ?? ''} onChange={field('professional_qualification')} />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Banking */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Banking</p>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Bank" value={form.bank ?? ''} onChange={field('bank')} />
              <Input label="Branch" value={form.bank_branch ?? ''} onChange={field('bank_branch')} />
              <Input label="Account No." value={form.account_number ?? ''} onChange={field('account_number')} />
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Emergency Contact */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Emergency Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Contact Name" value={form.emergency_contact_name ?? ''} onChange={field('emergency_contact_name')} />
              <div>
                <Input label="Contact Phone" value={form.emergency_contact_phone ?? ''} onChange={field('emergency_contact_phone')} />
                {fieldErrors.emergency_contact_phone && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.emergency_contact_phone}</p>}
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</label>
            <textarea value={form.notes ?? ''} onChange={field('notes')} rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600" />
          </div>

          <hr className="border-slate-100" />

          {/* Responsibilities */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Responsibilities</p>
            {availableResp.length === 0 ? (
              <p className="text-sm text-slate-400 italic">
                No responsibilities defined.{' '}
                <a href="/responsibilities" className="text-green-700 hover:underline font-medium">Add them in Setup → Responsibilities</a>
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {availableResp.map(r => (
                  <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-slate-100 select-none">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedRespIds.includes(r.id)}
                      onChange={e => setSelectedRespIds(prev =>
                        e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id)
                      )}
                    />
                    <span className="font-medium text-slate-700 flex-1 truncate">{r.name}</span>
                    {r.module_key && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 flex-shrink-0">
                        {r.module_key}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </div>
      </Modal>

      {/* Template download modal */}
      {tmplOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" style={{ border: '1px solid #E2D9CC' }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: '#0F172A' }}>Download Template</h2>
            <p className="text-sm mb-5" style={{ color: '#64748B' }}>Download a blank template or one pre-filled with existing teachers for editing and re-upload.</p>

            <div className="flex rounded-xl overflow-hidden border border-slate-200 mb-5 text-sm">
              {(['empty', 'populated'] as const).map(m => (
                <button key={m} onClick={() => setTmplMode(m)}
                  className="flex-1 py-2.5 font-semibold transition-colors"
                  style={{ backgroundColor: tmplMode === m ? '#15803D' : '#F8FAFC', color: tmplMode === m ? '#FFFFFF' : '#64748B' }}>
                  {m === 'empty' ? 'Empty template' : 'Pre-filled with teachers'}
                </button>
              ))}
            </div>

            {tmplMode === 'populated' && (
              <div className="mb-5">
                <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>Status</label>
                <select value={tmplStatus} onChange={e => setTmplStatus(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="all">All statuses</option>
                </select>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setTmplOpen(false)}>Cancel</Button>
              <Button className="flex-1" loading={tmplLoading} onClick={doTemplateDownload}
                style={{ backgroundColor: '#15803D' }}>
                Download
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
