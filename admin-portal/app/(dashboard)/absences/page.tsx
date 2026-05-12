'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { AbsenceRecord, RemedialLesson, Teacher } from '@/types/api';

type Tab = 'absences' | 'remedials';

// ── shared tab bar ─────────────────────────────────────────────
function TabBar({ active, onChange, absCount, remCount }: {
  active: Tab; onChange: (t: Tab) => void; absCount: number; remCount: number;
}) {
  return (
    <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: '#F1F5F9' }}>
      {([['absences', 'Absences', absCount], ['remedials', 'Remedials', remCount]] as const).map(([key, label, count]) => (
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
            {['Absent','Remedial Scheduled','Completed','Verified','Made Up','Cleared'].map(s => (
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
            <table className="w-full text-sm">
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
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#475569' }}>{r.date}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>{r.teacher_name}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{r.subject}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{r.class_name}</td>
                    <td className="px-4 py-3"><Badge status={r.status} /></td>
                    <td className="px-4 py-3 max-w-48 truncate text-xs" style={{ color: '#64748B' }}>{r.reason ?? <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{r.is_auto_generated ? 'Auto' : 'Manual'}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => { setReason(r.reason ?? ''); setReasonModal(r); }}>Reason</Button>
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
              <strong style={{ color: '#0F172A' }}>{reasonModal.teacher_name}</strong> — {reasonModal.subject} / {reasonModal.class_name} on {reasonModal.date}
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

// ── Remedials tab ──────────────────────────────────────────────
function RemedialsTab({ teachers }: { teachers: Teacher[] }) {
  const [items,       setItems]       = useState<RemedialLesson[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [teacherId,   setTeacherId]   = useState('');
  const [status,      setStatus]      = useState('');
  const [notesModal,  setNotesModal]  = useState<RemedialLesson | null>(null);
  const [notes,       setNotes]       = useState('');
  const [saving,      setSaving]      = useState(false);

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
        <Button type="button" variant="secondary" onClick={() => { setTeacherId(''); setStatus(''); }}>Clear</Button>
      </form>

      <p className="text-sm" style={{ color: '#64748B' }}>{items.length} remedial{items.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  {['Absence Date','Remedial Date','Teacher','Subject','Class','Location','Duration','Status',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors"
                    style={{ borderBottom: i < items.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#64748B' }}>{r.original_absence_date}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#0F172A' }}>
                      {r.remedial_date} <span style={{ color: '#94A3B8' }}>{r.remedial_time}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>{r.teacher_name}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{r.subject}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{r.class_name}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#64748B' }}>{r.location_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#64748B' }}>{r.duration_periods ? `${r.duration_periods}p` : '—'}</td>
                    <td className="px-4 py-3"><Badge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {r.status === 'Completed' && (
                          <Button variant="ghost" size="sm" onClick={() => { setNotes(r.notes ?? ''); setNotesModal(r); }}>Verify</Button>
                        )}
                        {r.status === 'Scheduled' && (
                          <Button variant="danger" size="sm" onClick={() => cancel(r.id)}>Cancel</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>No remedial lessons found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!notesModal} onClose={() => setNotesModal(null)} title="Verify Remedial Lesson">
        {notesModal && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: '#475569' }}>
              <strong style={{ color: '#0F172A' }}>{notesModal.teacher_name}</strong> — {notesModal.subject} / {notesModal.class_name}<br />
              Scheduled: {notesModal.remedial_date} at {notesModal.remedial_time}
            </p>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Verification Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }}
                placeholder="Add verification notes…" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setNotesModal(null)}>Cancel</Button>
              <Button onClick={saveVerify} loading={saving}>Mark Verified</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function AbsencesPage() {
  const searchParams = useSearchParams();
  const initialTab   = searchParams.get('tab') === 'remedials' ? 'remedials' : 'absences';
  const [tab,      setTab]      = useState<Tab>(initialTab);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  useEffect(() => {
    api.get<Teacher[]>('/api/teachers').then(r => setTeachers(r.data)).catch(() => {});
  }, []);

  // Keep counts by loading both — counts shown in tab bar are approximate from the child state
  // We pass teachers down so both tabs don't independently fetch them
  const [absCt, setAbsCt] = useState(0);
  const [remCt, setRemCt] = useState(0);

  useEffect(() => {
    api.get<unknown[]>('/api/absences').then(r => setAbsCt(r.data.length)).catch(() => {});
    api.get<unknown[]>('/api/remedial').then(r => setRemCt(r.data.length)).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Absences & Remedials</h1>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>Track teacher absences and their remedial lessons</p>
      </div>

      <TabBar active={tab} onChange={setTab} absCount={absCt} remCount={remCt} />

      {tab === 'absences'  && <AbsencesTab  teachers={teachers} />}
      {tab === 'remedials' && <RemedialsTab teachers={teachers} />}
    </div>
  );
}
