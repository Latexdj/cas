'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { AbsenceRecord, RemedialLesson, Teacher, TeacherExcuse } from '@/types/api';

type Tab = 'absences' | 'remedials' | 'excuses';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── shared tab bar ─────────────────────────────────────────────
function TabBar({ active, onChange, absCount, remCount, excCount }: {
  active: Tab; onChange: (t: Tab) => void;
  absCount: number; remCount: number; excCount: number;
}) {
  const tabs: [Tab, string, number][] = [
    ['absences',  'Absences',  absCount],
    ['remedials', 'Remedials', remCount],
    ['excuses',   'Excuses',   excCount],
  ];
  return (
    <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: '#F1F5F9' }}>
      {tabs.map(([key, label, count]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            backgroundColor: active === key ? '#FFFFFF' : 'transparent',
            color: active === key ? '#0F172A' : '#64748B',
            boxShadow: active === key ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
          }}
        >
          {label}
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: active === key ? '#F1F5F9' : 'transparent', color: '#64748B' }}
          >
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Absences tab ───────────────────────────────────────────────
function AbsencesTab({ teachers }: { teachers: Teacher[] }) {
  const [records,     setRecords]     = useState<AbsenceRecord[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [teacherId,   setTeacherId]   = useState('');
  const [status,      setStatus]      = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [reasonModal, setReasonModal] = useState<AbsenceRecord | null>(null);
  const [reason,      setReason]      = useState('');
  const [saving,      setSaving]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (teacherId) params.teacherId = teacherId;
      if (status)    params.status    = status;
      if (dateFrom)  params.from      = dateFrom;
      if (dateTo)    params.to        = dateTo;
      const { data } = await api.get<AbsenceRecord[]>('/api/absences', { params });
      setRecords(data);
    } finally { setLoading(false); }
  }, [teacherId, status, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  async function saveReason() {
    if (!reasonModal) return;
    setSaving(true);
    try {
      await api.patch(`/api/absences/${reasonModal.id}/reason`, { reason });
      setReasonModal(null); await load();
    } finally { setSaving(false); }
  }

  async function deleteAbsence(id: string) {
    if (!confirm('Delete this absence record? This will allow the teacher to resubmit attendance.')) return;
    try { await api.delete(`/api/absences/${id}`); await load(); }
    catch { alert('Failed to delete absence.'); }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <form onSubmit={e => { e.preventDefault(); load(); }} className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Teacher</label>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
            className="mt-1 w-44 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }}>
            <option value="">All</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="mt-1 w-44 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }}>
            <option value="">All</option>
            {['Absent','Excused','Remedial Scheduled','Completed','Verified','Made Up','Cleared'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <Input label="From" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
        <Input label="To"   type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="w-40" />
        <Button type="submit">Filter</Button>
        <Button type="button" variant="secondary" onClick={() => { setTeacherId(''); setStatus(''); setDateFrom(''); setDateTo(''); }}>Clear</Button>
      </form>

      <p className="text-sm" style={{ color: '#64748B' }}>{records.length} absence{records.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  {['Date','Teacher','Subject','Class','Status','Reason','Source',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors"
                    style={{ borderBottom: i < records.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td className="px-4 py-3 text-xs" style={{ color: '#475569' }}>{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>{r.teacher_name}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{r.subject}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{r.class_name}</td>
                    <td className="px-4 py-3"><Badge status={r.status} /></td>
                    <td className="px-4 py-3 max-w-48 truncate text-xs" style={{ color: '#64748B' }}>{r.reason ?? <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{r.is_auto_generated ? 'Auto' : 'Manual'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-2 items-center">
                        <Button variant="ghost" size="sm" onClick={() => { setReason(r.reason ?? ''); setReasonModal(r); }}>Reason</Button>
                        <Button variant="danger" size="sm" onClick={() => deleteAbsence(r.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>No absences found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!reasonModal} onClose={() => setReasonModal(null)} title="Edit Absence Reason">
        {reasonModal && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: '#475569' }}>
              <strong style={{ color: '#0F172A' }}>{reasonModal.teacher_name}</strong> — {reasonModal.subject} / {reasonModal.class_name} on {fmtDate(reasonModal.date)}
            </p>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Reason</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }}
                placeholder="Enter reason for absence…" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setReasonModal(null)}>Cancel</Button>
              <Button onClick={saveReason} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Admin Register Modal ────────────────────────────────────────
interface StudentRec { id: string; student_code: string; name: string; class_name: string; status: 'Present' | 'Absent' | 'Late' | null; }

function AdminRegisterModal({ remedial, onClose, onSuccess }: { remedial: RemedialLesson; onClose: () => void; onSuccess: () => void }) {
  const [students,   setStudents]   = useState<StudentRec[]>([]);
  const isMerged = new Set(students.map(s => s.class_name)).size > 1;
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [statuses,   setStatuses]   = useState<Record<string, 'Present' | 'Absent' | 'Late'>>({});

  useEffect(() => {
    api.get<{ students: StudentRec[] }>(`/api/remedial/${remedial.id}/register`)
      .then(res => {
        setStudents(res.data.students);
        const init: Record<string, 'Present' | 'Absent' | 'Late'> = {};
        res.data.students.forEach(s => { init[s.id] = (s.status as 'Present' | 'Absent' | 'Late') || 'Present'; });
        setStatuses(init);
      })
      .catch(() => setError('Failed to load student list.'))
      .finally(() => setLoading(false));
  }, [remedial.id]);

  function toggle(id: string) {
    setStatuses(prev => {
      const cur = prev[id] || 'Present';
      return { ...prev, [id]: cur === 'Present' ? 'Absent' : cur === 'Absent' ? 'Late' : 'Present' };
    });
  }

  function markAll(s: 'Present' | 'Absent') {
    setStatuses(prev => { const n = { ...prev }; students.forEach(st => { n[st.id] = s; }); return n; });
  }

  async function save() {
    setSaving(true); setError('');
    try {
      await api.post(`/api/remedial/${remedial.id}/register`, {
        records: students.map(s => ({ studentId: s.id, status: statuses[s.id] || 'Present' })),
      });
      onSuccess();
    } catch { setError('Failed to save register.'); }
    finally { setSaving(false); }
  }

  const present = students.filter(s => (statuses[s.id] || 'Present') === 'Present').length;
  const absent  = students.filter(s => statuses[s.id] === 'Absent').length;
  const late    = students.filter(s => statuses[s.id] === 'Late').length;

  return (
    <Modal open onClose={onClose} title={`Mark Register — ${remedial.subject} ${remedial.class_name}`}>
      <div className="space-y-3">
        <p className="text-xs" style={{ color: '#64748B' }}>
          {remedial.teacher_name} · {fmtDate(remedial.remedial_date)}
        </p>

        {/* Quick-mark */}
        <div className="flex gap-2">
          <button onClick={() => markAll('Present')}
            className="flex-1 text-xs font-semibold py-1.5 rounded-lg border"
            style={{ background: '#F0FDF4', color: '#15803D', borderColor: '#BBF7D0' }}>
            All Present
          </button>
          <button onClick={() => markAll('Absent')}
            className="flex-1 text-xs font-semibold py-1.5 rounded-lg border"
            style={{ background: '#FEF2F2', color: '#B91C1C', borderColor: '#FECACA' }}>
            All Absent
          </button>
        </div>

        {/* Student list */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
          </div>
        ) : students.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: '#94A3B8' }}>No students found in {remedial.class_name}</p>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-1 rounded-xl border" style={{ borderColor: '#F1F5F9' }}>
            {students.map(s => {
              const st = statuses[s.id] || 'Present';
              const style = st === 'Present'
                ? { bg: '#F0FDF4', color: '#15803D', label: 'P' }
                : st === 'Absent'
                  ? { bg: '#FEF2F2', color: '#B91C1C', label: 'A' }
                  : { bg: '#FEFCE8', color: '#92400E', label: 'L' };
              return (
                <div key={s.id} className="flex items-center justify-between px-3 py-2.5"
                  style={{ borderBottom: '1px solid #F8FAFC' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{s.name}</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>{s.student_code}{isMerged ? ` · ${s.class_name}` : ''}</p>
                  </div>
                  <button onClick={() => toggle(s.id)}
                    className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center"
                    style={{ background: style.bg, color: style.color }}>
                    {style.label}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        {students.length > 0 && (
          <p className="text-xs font-semibold" style={{ color: '#475569' }}>
            Present: {present} &nbsp;·&nbsp; Absent: {absent} &nbsp;·&nbsp; Late: {late}
          </p>
        )}

        {error && <p className="text-sm" style={{ color: '#B91C1C' }}>{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={loading || students.length === 0}>
            {remedial.has_register ? 'Update Register' : 'Save Register'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Remedials tab ──────────────────────────────────────────────
function RemedialsTab({ teachers }: { teachers: Teacher[] }) {
  const [items,         setItems]         = useState<RemedialLesson[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [teacherId,     setTeacherId]     = useState('');
  const [status,        setStatus]        = useState('');
  const [missingOnly,   setMissingOnly]   = useState(false);
  const [notesModal,    setNotesModal]    = useState<RemedialLesson | null>(null);
  const [registerModal, setRegisterModal] = useState<RemedialLesson | null>(null);
  const [notes,         setNotes]         = useState('');
  const [saving,        setSaving]        = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (teacherId) params.teacherId = teacherId;
      if (status)    params.status    = status;
      const { data } = await api.get<RemedialLesson[]>('/api/remedial', { params });
      setItems(data);
    } finally { setLoading(false); }
  }, [teacherId, status]);

  useEffect(() => { load(); }, [load]);

  const displayed = missingOnly
    ? items.filter(r => !r.has_register && r.status !== 'Cancelled')
    : items;

  async function cancel(id: string) {
    if (!confirm('Cancel this remedial lesson?')) return;
    await api.patch(`/api/remedial/${id}/cancel`);
    await load();
  }

  async function saveVerify() {
    if (!notesModal) return;
    setSaving(true);
    try {
      await api.patch(`/api/remedial/${notesModal.id}/verify`, { notes });
      setNotesModal(null); await load();
    } finally { setSaving(false); }
  }

  const missingCount = items.filter(r => !r.has_register && r.status !== 'Cancelled').length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <form onSubmit={e => { e.preventDefault(); load(); }} className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Teacher</label>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
            className="mt-1 w-44 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }}>
            <option value="">All</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="mt-1 w-44 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }}>
            <option value="">All</option>
            {['Scheduled','Completed','Verified','Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <Button type="submit">Filter</Button>
        <Button type="button" variant="secondary" onClick={() => { setTeacherId(''); setStatus(''); setMissingOnly(false); }}>Clear</Button>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: missingCount > 0 ? '#B45309' : '#64748B' }}>
          <input type="checkbox" checked={missingOnly} onChange={e => setMissingOnly(e.target.checked)} className="rounded" />
          Missing register
          {missingCount > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#FEF9C3', color: '#92400E' }}>
              {missingCount}
            </span>
          )}
        </label>
      </form>

      <p className="text-sm" style={{ color: '#64748B' }}>{displayed.length} remedial{displayed.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  {['Absence Date','Remedial Date','Teacher','Subject','Class','Location','Duration','Status','Register',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors"
                    style={{ borderBottom: i < displayed.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td className="px-4 py-3 text-xs" style={{ color: '#64748B' }}>{fmtDate(r.original_absence_date)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#0F172A' }}>
                      {fmtDate(r.remedial_date)} <span style={{ color: '#94A3B8' }}>{r.remedial_time}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>{r.teacher_name}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{r.subject}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{r.class_name}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#64748B' }}>{r.location_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#64748B' }}>{r.duration_periods ? `${r.duration_periods}p` : '—'}</td>
                    <td className="px-4 py-3"><Badge status={r.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.status === 'Cancelled' ? (
                        <span className="text-xs" style={{ color: '#CBD5E1' }}>—</span>
                      ) : r.has_register ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: '#F0FDF4', color: '#15803D' }}>✓ Taken</span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: '#FEF9C3', color: '#92400E' }}>Missing</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-2">
                        {r.status === 'Completed' && (
                          <Button variant="ghost" size="sm" onClick={() => { setNotes(r.notes ?? ''); setNotesModal(r); }}>Verify</Button>
                        )}
                        {r.status !== 'Cancelled' && (
                          <Button variant="ghost" size="sm" onClick={() => setRegisterModal(r)}>
                            {r.has_register ? 'Register' : 'Mark Register'}
                          </Button>
                        )}
                        {r.status === 'Scheduled' && (
                          <Button variant="danger" size="sm" onClick={() => cancel(r.id)}>Cancel</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {displayed.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>No remedial lessons found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {registerModal && (
        <AdminRegisterModal
          remedial={registerModal}
          onClose={() => setRegisterModal(null)}
          onSuccess={() => { setRegisterModal(null); load(); }}
        />
      )}

      <Modal open={!!notesModal} onClose={() => setNotesModal(null)} title="Verify Remedial Lesson">
        {notesModal && (
          <div className="space-y-4">

            {/* Proof photo */}
            {notesModal.photo_url ? (
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#E2E8F0' }}>
                <img
                  src={notesModal.photo_url}
                  alt="Proof of attendance"
                  className="w-full object-cover max-h-64"
                />
              </div>
            ) : (
              <div className="rounded-xl flex items-center justify-center h-32 text-sm" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', color: '#94A3B8' }}>
                No photo submitted
              </div>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { label: 'Teacher',      value: notesModal.teacher_name },
                { label: 'Subject',      value: `${notesModal.subject} — ${notesModal.class_name}` },
                { label: 'Absence date', value: fmtDate(notesModal.original_absence_date) },
                { label: 'Remedial date', value: fmtDate(notesModal.remedial_date) },
                {
                  label: 'Time',
                  value: notesModal.remedial_end_time
                    ? `${notesModal.remedial_time?.slice(0,5)} – ${notesModal.remedial_end_time?.slice(0,5)}`
                    : notesModal.remedial_time?.slice(0,5) ?? '—',
                },
                { label: 'Periods covered', value: notesModal.duration_periods ? `${notesModal.duration_periods}` : '—' },
                { label: 'Location',     value: notesModal.location_name ?? '—' },
                { label: 'Topic',        value: notesModal.topic ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg p-2.5" style={{ backgroundColor: '#F8FAFC' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#94A3B8' }}>{label}</p>
                  <p className="font-medium" style={{ color: '#0F172A' }}>{value}</p>
                </div>
              ))}
            </div>

            {/* GPS */}
            {notesModal.gps_coordinates && (
              <a
                href={`https://www.google.com/maps?q=${notesModal.gps_coordinates}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2.5"
                style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                  <circle cx="12" cy="9" r="2.5"/>
                </svg>
                View on map — {notesModal.gps_coordinates}
              </a>
            )}

            {/* Verification notes */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Verification Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }}
                placeholder="Add verification notes…" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setNotesModal(null)}>Cancel</Button>
              <Button onClick={saveVerify} loading={saving}>Mark Verified</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Excuses tab ────────────────────────────────────────────────
const EXCUSE_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Pending:  { bg: '#FFFBEB', color: '#D97706' },
  Approved: { bg: '#DCFCE7', color: '#15803D' },
  Rejected: { bg: '#FEF2F2', color: '#DC2626' },
};

function ExcusesTab({ teachers }: { teachers: Teacher[] }) {
  const [excuses,    setExcuses]    = useState<TeacherExcuse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [acting,     setActing]     = useState<string | null>(null);
  const [addOpen,    setAddOpen]    = useState(false);
  const [form,       setForm]       = useState({ teacherId: '', dateFrom: '', dateTo: '', type: 'Official Duty', reason: '' });
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTeacher) params.set('teacherId', filterTeacher);
      if (filterStatus)  params.set('status', filterStatus);
      const { data } = await api.get<TeacherExcuse[]>(`/api/teacher-excuses?${params}`);
      setExcuses(data);
    } finally { setLoading(false); }
  }, [filterTeacher, filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string) {
    setActing(id);
    try { await api.patch(`/api/teacher-excuses/${id}/approve`); await load(); }
    catch { alert('Failed to approve.'); }
    finally { setActing(null); }
  }

  async function reject(id: string) {
    if (!confirm('Reject this excuse?')) return;
    setActing(id);
    try { await api.patch(`/api/teacher-excuses/${id}/reject`); await load(); }
    catch { alert('Failed to reject.'); }
    finally { setActing(null); }
  }

  async function del(id: string) {
    if (!confirm('Delete this excuse record?')) return;
    try { await api.delete(`/api/teacher-excuses/${id}`); await load(); }
    catch { alert('Failed to delete.'); }
  }

  async function saveExcuse() {
    if (!form.teacherId || !form.dateFrom || !form.dateTo || !form.reason.trim()) {
      setFormError('All fields are required.'); return;
    }
    setSaving(true); setFormError('');
    try {
      await api.post('/api/teacher-excuses', {
        teacherId: form.teacherId,
        dateFrom:  form.dateFrom,
        dateTo:    form.dateTo,
        type:      form.type,
        reason:    form.reason,
      });
      setAddOpen(false);
      setForm({ teacherId: '', dateFrom: '', dateTo: '', type: 'Official Duty', reason: '' });
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } | string }; message?: string };
      const serverMsg = typeof e.response?.data === 'object' ? e.response?.data?.error : e.response?.data as string;
      setFormError(serverMsg ?? e.message ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  const selectCls = 'border rounded-lg px-3 py-2 text-sm' + ' border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';
  const inputCls  = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-3">
          <select className={selectCls} value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
            <option value="">All Teachers</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className={selectCls} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <button
          onClick={() => { setAddOpen(o => !o); setFormError(''); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: addOpen ? '#64748B' : '#15803D' }}>
          {addOpen ? 'Cancel' : '+ Add Excuse'}
        </button>
      </div>

      {/* Add form */}
      {addOpen && (
        <div className="bg-white rounded-xl p-5 space-y-4" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <p className="text-sm font-bold" style={{ color: '#0F172A' }}>
            New Excuse <span className="font-normal text-xs" style={{ color: '#94A3B8' }}>(admin-created excuses are automatically approved)</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Teacher *</label>
              <select className={inputCls} value={form.teacherId} onChange={e => setForm(f => ({ ...f, teacherId: e.target.value }))}>
                <option value="">Select teacher…</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Type *</label>
              <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {['Official Duty', 'Permission', 'Sick Leave', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Date From *</label>
              <input type="date" className={inputCls} value={form.dateFrom} onChange={e => setForm(f => ({ ...f, dateFrom: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Date To *</label>
              <input type="date" className={inputCls} value={form.dateTo} onChange={e => setForm(f => ({ ...f, dateTo: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Reason *</label>
              <input className={inputCls} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Regional workshop, medical appointment…" />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
          <div className="flex justify-end">
            <button onClick={saveExcuse} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#15803D' }}>
              {saving ? 'Saving…' : 'Save Excuse'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
          </div>
        ) : excuses.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>No excuse records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-sm">
              <thead style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                <tr>
                  {['Teacher', 'Type', 'Period', 'Reason', 'Document', 'Status', 'Approved By', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {excuses.map((ex, i) => {
                  const ss = EXCUSE_STATUS_STYLE[ex.status] ?? { bg: '#F1F5F9', color: '#64748B' };
                  const period = ex.date_from === ex.date_to ? fmtDate(ex.date_from) : `${fmtDate(ex.date_from)} – ${fmtDate(ex.date_to)}`;
                  return (
                    <tr key={ex.id} className="hover:bg-slate-50 transition-colors"
                      style={{ borderBottom: i < excuses.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                      <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>{ex.teacher_name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#475569' }}>{ex.type}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: '#64748B' }}>{period}</td>
                      <td className="px-4 py-3 max-w-xs truncate" style={{ color: '#475569' }} title={ex.reason}>{ex.reason}</td>
                      <td className="px-4 py-3">
                        {ex.document_url ? (
                          <a href={ex.document_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            View
                          </a>
                        ) : (
                          <span className="text-xs" style={{ color: ex.type === 'Official Duty' ? '#94A3B8' : '#F59E0B' }}>
                            {ex.type === 'Official Duty' ? '—' : 'Missing'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: ss.bg, color: ss.color }}>{ex.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{ex.approved_by_name ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-2 items-center">
                          {ex.status === 'Pending' && (() => {
                            const docRequired = ex.type !== 'Official Duty' && !ex.document_url;
                            return (
                              <>
                                <button
                                  disabled={acting === ex.id || docRequired}
                                  onClick={() => approve(ex.id)}
                                  title={docRequired ? 'Supporting document required before approval' : ''}
                                  className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
                                  {acting === ex.id ? '…' : 'Approve'}
                                </button>
                                <button disabled={acting === ex.id}
                                  onClick={() => reject(ex.id)}
                                  className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                                  style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                                  Reject
                                </button>
                              </>
                            );
                          })()}
                          <button onClick={() => del(ex.id)}
                            className="text-xs font-semibold" style={{ color: '#94A3B8' }}>
                            Del
                          </button>
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
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function AbsencesPage() {
  const searchParams = useSearchParams();
  const raw = searchParams.get('tab');
  const initialTab = raw === 'remedials' ? 'remedials' : raw === 'excuses' ? 'excuses' : 'absences';
  const [tab,      setTab]      = useState<Tab>(initialTab);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [absCt,    setAbsCt]    = useState(0);
  const [remCt,    setRemCt]    = useState(0);
  const [excCt,    setExcCt]    = useState(0);

  useEffect(() => {
    api.get<Teacher[]>('/api/teachers').then(r => setTeachers(r.data)).catch(() => {});
    api.get<unknown[]>('/api/absences').then(r => setAbsCt(r.data.length)).catch(() => {});
    api.get<unknown[]>('/api/remedial').then(r => setRemCt(r.data.length)).catch(() => {});
    api.get<unknown[]>('/api/teacher-excuses').then(r => setExcCt(r.data.length)).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Absences & Remedials</h1>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>Track teacher absences, remedial lessons, and approved excuses</p>
      </div>

      <TabBar active={tab} onChange={setTab} absCount={absCt} remCount={remCt} excCount={excCt} />

      {tab === 'absences'  && <AbsencesTab  teachers={teachers} />}
      {tab === 'remedials' && <RemedialsTab teachers={teachers} />}
      {tab === 'excuses'   && <ExcusesTab   teachers={teachers} />}
    </div>
  );
}
