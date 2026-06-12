'use client';
import { useEffect, useState, useMemo } from 'react';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface ExeatSettings { max_internal: number | null; max_external: number | null; semester_start_date: string | null; }
interface Exeat {
  id: string; exeat_type: 'internal' | 'external'; status: string;
  destination: string | null; reason: string | null; parent_contact: string | null; notes: string | null;
  departure_date: string; departure_time: string;
  expected_return_date: string; expected_return_time: string;
  actual_return_date: string | null; actual_return_time: string | null;
  granted_by_name: string | null; created_at: string;
}
interface MyRequestsResponse {
  exeats: Exeat[];
  settings: ExeatSettings;
  used: { internal: number; external: number };
  guardian_mobile: string | null;
  house: string | null;
}

const STATUS_META: Record<string, { label: string; badge: string }> = {
  pending:  { label: 'Pending Approval', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  active:   { label: 'Approved — Out',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  overdue:  { label: 'Overdue',          badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  returned: { label: 'Returned',         badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  rejected: { label: 'Rejected',         badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

function fmtTime(t: string | null | undefined) { return t?.slice(0, 5) ?? '—'; }
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d.slice(0, 10) + 'T12:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function QuotaBar({ label, used, max, color }: { label: string; used: number; max: number | null; color: string }) {
  if (max === null) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-black mt-1" style={{ color }}>{used}</p>
        <p className="text-xs text-slate-400 mt-0.5">No limit set</p>
      </div>
    );
  }
  const remaining = Math.max(0, max - used);
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 100;
  const barColor = pct >= 100 ? '#ef4444' : pct >= 75 ? '#f59e0b' : color;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label} Exeat</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <p className="text-2xl font-black" style={{ color: barColor }}>{used}</p>
        <p className="text-sm text-slate-400 font-medium">/ {max} used</p>
      </div>
      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-700 mt-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      <p className={`text-xs mt-1.5 font-semibold ${remaining === 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
        {remaining === 0 ? 'Quota reached — contact your housemaster' : `${remaining} remaining`}
      </p>
    </div>
  );
}

function RequestModal({
  guardianMobile, primaryColor,
  onClose, onCreated,
  blockedInternal, blockedExternal,
}: {
  guardianMobile: string | null; primaryColor: string;
  onClose: () => void; onCreated: (e: Exeat) => void;
  blockedInternal: boolean; blockedExternal: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const bothBlocked = blockedInternal && blockedExternal;

  const defaultType = blockedInternal ? 'external' : 'internal';
  const [type,    setType]    = useState<'internal' | 'external'>(defaultType);
  const [dest,    setDest]    = useState('');
  const [reason,  setReason]  = useState('');
  const [contact, setContact] = useState(guardianMobile ?? '');
  const [depDate, setDepDate] = useState(tomorrow);
  const [depTime, setDepTime] = useState('08:00');
  const [retDate, setRetDate] = useState('');
  const [retTime, setRetTime] = useState('18:00');
  const [notes,   setNotes]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const isBlocked = type === 'internal' ? blockedInternal : blockedExternal;

  async function submit() {
    if (!dest.trim())   { setError('Destination is required'); return; }
    if (!reason.trim()) { setError('Reason is required'); return; }
    if (!retDate)       { setError('Expected return date is required'); return; }
    setSaving(true); setError('');
    try {
      const r = await studentApi.post<Exeat>('/api/exeat/student-request', {
        exeat_type: type, destination: dest.trim(), reason: reason.trim(),
        parent_contact: contact.trim() || null,
        departure_date: depDate, departure_time: depTime + ':00',
        expected_return_date: retDate, expected_return_time: retTime + ':00',
        notes: notes.trim() || null,
      });
      onCreated(r.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string; error?: string } } };
      setError(err.response?.data?.message ?? err.response?.data?.error ?? 'Failed to submit request');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <p className="font-bold text-slate-900 dark:text-white">Request Exeat</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 text-sm">✕</button>
        </div>

        {bothBlocked ? (
          <div className="px-5 py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
            <p className="font-bold text-slate-800 dark:text-white">All quotas reached</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">You have used all your allowed exeats for this semester. Contact your housemaster or senior housemaster for an exception.</p>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 mt-2">Close</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Type selector */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-2">Exeat Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['internal', 'external'] as const).map(t => {
                    const blocked = t === 'internal' ? blockedInternal : blockedExternal;
                    return (
                      <button key={t} onClick={() => !blocked && setType(t)} disabled={blocked}
                        className={`py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all text-left ${type === t && !blocked ? 'border-current' : 'border-slate-200 dark:border-slate-600'} ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                        style={type === t && !blocked ? { borderColor: primaryColor, color: primaryColor, backgroundColor: `${primaryColor}10` } : { color: '#64748b' }}>
                        <p className="capitalize">{t}</p>
                        <p className="text-[10px] font-normal mt-0.5 opacity-70">{t === 'internal' ? 'Few hours off campus' : 'Overnight / home visit'}</p>
                        {blocked && <p className="text-[10px] text-red-500 mt-0.5">Quota reached</p>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isBlocked ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  You have used all your {type} exeat slots for this semester. Contact your housemaster for an exception.
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Destination *</label>
                    <input value={dest} onChange={e => setDest(e.target.value)} placeholder="e.g. Kumasi — family home"
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Reason *</label>
                    <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Medical appointment"
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Parent / Guardian Contact</label>
                    <input value={contact} onChange={e => setContact(e.target.value)} placeholder="e.g. 0244123456"
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-[11px] text-slate-400 mt-1">Pre-filled from your record. Edit to override.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Departure Date *</label>
                      <input type="date" value={depDate} min={today} onChange={e => setDepDate(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Departure Time *</label>
                      <input type="time" value={depTime} onChange={e => setDepTime(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Expected Return *</label>
                      <input type="date" value={retDate} min={depDate} onChange={e => setRetDate(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Return Time *</label>
                      <input type="time" value={retTime} onChange={e => setRetTime(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Additional Notes</label>
                    <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes for the housemaster"
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                </>
              )}
            </div>
            {!isBlocked && (
              <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
                <button onClick={submit} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
                  style={{ backgroundColor: primaryColor }}>
                  {saving ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function StudentExeatPage() {
  const colors = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  const [data,       setData]       = useState<MyRequestsResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);

  function load() {
    setLoading(true);
    studentApi.get<MyRequestsResponse>('/api/exeat/my-requests')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const blockedInternal = useMemo(() => {
    if (!data) return false;
    const { settings, used } = data;
    if (!settings.semester_start_date || settings.max_internal === null) return false;
    return used.internal >= settings.max_internal;
  }, [data]);

  const blockedExternal = useMemo(() => {
    if (!data) return false;
    const { settings, used } = data;
    if (!settings.semester_start_date || settings.max_external === null) return false;
    return used.external >= settings.max_external;
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const exeats = data?.exeats ?? [];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Exeat Requests</h1>
          {data?.house && <p className="text-xs text-slate-400 mt-0.5">House: {data.house}</p>}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white"
          style={{ backgroundColor: primary }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Request
        </button>
      </div>

      {/* Quota cards */}
      {data?.settings.semester_start_date ? (
        <div className="grid grid-cols-2 gap-3">
          <QuotaBar label="Internal" used={data.used.internal} max={data.settings.max_internal} color={primary} />
          <QuotaBar label="External" used={data.used.external} max={data.settings.max_external} color="#7c3aed" />
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-300 font-medium">
          Exeat quotas have not been configured by your school yet.
        </div>
      )}

      {/* Requests list */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
          {exeats.length > 0 ? `${exeats.length} request${exeats.length !== 1 ? 's' : ''}` : 'No requests yet'}
        </p>
        {exeats.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-slate-400">
                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">You have no exeat requests yet.</p>
            <p className="text-xs text-slate-400 mt-1">Tap the Request button to submit one.</p>
          </div>
        ) : (
          exeats.map(e => {
            const meta = STATUS_META[e.status] ?? STATUS_META.pending;
            const isOverdue = e.status === 'overdue';
            return (
              <div key={e.id} className={`bg-white dark:bg-slate-800 rounded-xl border ${isOverdue ? 'border-red-200 dark:border-red-700' : 'border-slate-100 dark:border-slate-700'} p-4 space-y-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${e.exeat_type === 'external' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'}`}>
                      {e.exeat_type}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>{meta.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 shrink-0">{new Date(e.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {e.destination && <div><span className="text-slate-400">Destination: </span><span className="text-slate-700 dark:text-slate-300 font-medium">{e.destination}</span></div>}
                  {e.reason && <div><span className="text-slate-400">Reason: </span><span className="text-slate-700 dark:text-slate-300">{e.reason}</span></div>}
                  <div><span className="text-slate-400">Departs: </span><span className="text-slate-700 dark:text-slate-300">{fmtDate(e.departure_date)} {fmtTime(e.departure_time)}</span></div>
                  <div className={isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                    <span className="text-slate-400">Exp. return: </span>
                    <span>{fmtDate(e.expected_return_date)} {fmtTime(e.expected_return_time)}</span>
                  </div>
                  {e.actual_return_date && (
                    <div><span className="text-slate-400">Returned: </span><span className="text-green-700 dark:text-green-400 font-medium">{fmtDate(e.actual_return_date)} {fmtTime(e.actual_return_time ?? '')}</span></div>
                  )}
                  {e.granted_by_name && <div><span className="text-slate-400">Approved by: </span><span className="text-slate-700 dark:text-slate-300">{e.granted_by_name}</span></div>}
                </div>
                {e.status === 'rejected' && e.notes && (
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                    Reason: {e.notes}
                  </p>
                )}
                {isOverdue && (
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 font-semibold">
                    You have not returned by the expected time. Please report to your housemaster.
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <RequestModal
          guardianMobile={data?.guardian_mobile ?? null}
          primaryColor={primary}
          blockedInternal={blockedInternal}
          blockedExternal={blockedExternal}
          onClose={() => setShowModal(false)}
          onCreated={e => {
            setData(prev => prev ? { ...prev, exeats: [e, ...prev.exeats] } : prev);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
