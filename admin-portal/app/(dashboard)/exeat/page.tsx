'use client';
import { useEffect, useState, useMemo } from 'react';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';
import { api } from '@/lib/api';

interface ExeatSettings { max_internal: number; max_external: number; semester_start_date: string | null; }

function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: (s: ExeatSettings) => void }) {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [maxInt,   setMaxInt]   = useState('5');
  const [maxExt,   setMaxExt]   = useState('2');
  const [semStart, setSemStart] = useState('');
  const [error,    setError]    = useState('');

  useEffect(() => {
    api.get<ExeatSettings>('/api/exeat/settings')
      .then(r => {
        setMaxInt(String(r.data.max_internal ?? 5));
        setMaxExt(String(r.data.max_external ?? 2));
        setSemStart(r.data.semester_start_date ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!semStart) { setError('Semester start date is required'); return; }
    setSaving(true); setError('');
    try {
      const r = await api.put<ExeatSettings>('/api/exeat/settings', {
        max_internal: parseInt(maxInt) || 0,
        max_external: parseInt(maxExt) || 0,
        semester_start_date: semStart,
      });
      onSaved(r.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-900 dark:text-white">Exeat Quota Settings</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 text-sm">✕</button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6"><div className="w-6 h-6 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Set the maximum number of each exeat type a student may take per semester. Leave at 0 to block all self-requests for that type.</p>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Semester Start Date *</label>
              <input type="date" value={semStart} onChange={e => setSemStart(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              <p className="text-[11px] text-slate-400 mt-1">Exeat counts reset from this date each semester.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Max Internal</label>
                <input type="number" min="0" max="99" value={maxInt} onChange={e => setMaxInt(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Max External</label>
                <input type="number" min="0" max="99" value={maxExt} onChange={e => setMaxExt(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-green-700 text-white text-sm font-semibold disabled:opacity-40">
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface Exeat {
  id: string; exeat_type: 'internal' | 'external'; status: string;
  destination: string | null; reason: string | null; parent_contact: string | null; notes: string | null; sms_sent: boolean;
  departure_date: string; departure_time: string;
  expected_return_date: string; expected_return_time: string;
  actual_return_date: string | null; actual_return_time: string | null;
  granted_at: string | null; created_at: string;
  student_id: string; student_name: string; student_code: string; class_name: string; house: string;
  granted_by_name: string | null;
}

const STATUS_META: Record<string, { label: string; badge: string }> = {
  pending:  { label: 'Pending',  badge: 'bg-amber-100 text-amber-700' },
  active:   { label: 'Out',      badge: 'bg-blue-100 text-blue-700'   },
  overdue:  { label: 'Overdue',  badge: 'bg-red-100 text-red-700'     },
  returned: { label: 'Returned', badge: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', badge: 'bg-slate-100 text-slate-600' },
};

function fmtTime(t: string | null) { return t?.slice(0, 5) ?? '—'; }
function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d.slice(0, 10) + 'T12:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminExeatPage() {
  const [exeats,   setExeats]   = useState<Exeat[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [fStatus,  setFStatus]  = useState('');
  const [fType,    setFType]    = useState('');
  const [fHouse,   setFHouse]   = useState('');
  const [fFrom,    setFFrom]    = useState('');
  const [fTo,      setFTo]      = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [quotaSettings, setQuotaSettings] = useState<ExeatSettings | null>(null);

  useEffect(() => {
    api.get<ExeatSettings>('/api/exeat/settings')
      .then(r => setQuotaSettings(r.data))
      .catch(() => {});
  }, []);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (fStatus) params.set('status', fStatus);
    if (fType)   params.set('type',   fType);
    if (fHouse)  params.set('house',  fHouse);
    if (fFrom)   params.set('from',   fFrom);
    if (fTo)     params.set('to',     fTo);
    api.get<Exeat[]>(`/api/exeat?${params}`)
      .then(r => setExeats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const houses = useMemo(() => [...new Set(exeats.map(e => e.house).filter(Boolean))].sort(), [exeats]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return exeats.filter(e =>
      !q ||
      e.student_name.toLowerCase().includes(q) ||
      e.student_code.toLowerCase().includes(q) ||
      e.destination?.toLowerCase().includes(q) ||
      e.house?.toLowerCase().includes(q)
    );
  }, [exeats, search]);

  const { displayRows, total: pagedTotal, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(filtered);

  const counts = useMemo(() => ({
    total:    exeats.length,
    out:      exeats.filter(e => e.status === 'active').length,
    overdue:  exeats.filter(e => e.status === 'overdue').length,
    pending:  exeats.filter(e => e.status === 'pending').length,
    returned: exeats.filter(e => e.status === 'returned').length,
  }), [exeats]);

  return (
    <div className="space-y-6">
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={s => { setQuotaSettings(s); setShowSettings(false); }}
        />
      )}

      {/* Header row with settings button */}
      <div className="flex items-center justify-between gap-3">
        {quotaSettings?.semester_start_date ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Semester quota — Internal: <strong className="text-slate-700 dark:text-slate-300">{quotaSettings.max_internal}</strong> · External: <strong className="text-slate-700 dark:text-slate-300">{quotaSettings.max_external}</strong> · from {fmtDate(quotaSettings.semester_start_date)}
          </p>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Exeat quotas not configured — students can request without limits.</p>
        )}
        <button onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Quota Settings
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',    value: counts.total,    color: 'text-slate-700 dark:text-white'   },
          { label: 'Out',      value: counts.out,      color: 'text-blue-600'                    },
          { label: 'Overdue',  value: counts.overdue,  color: 'text-red-600'                     },
          { label: 'Pending',  value: counts.pending,  color: 'text-amber-600'                   },
          { label: 'Returned', value: counts.returned, color: 'text-green-600'                   },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student, destination, house…"
            className="flex-1 min-w-[180px] border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}
            className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="active">Out</option>
            <option value="overdue">Overdue</option>
            <option value="returned">Returned</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={fType} onChange={e => setFType(e.target.value)}
            className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">All Types</option>
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </select>
          <select value={fHouse} onChange={e => setFHouse(e.target.value)}
            className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">All Houses</option>
            {houses.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)}
            className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500" />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={fTo} onChange={e => setFTo(e.target.value)}
            className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500" />
          <button onClick={load} className="px-4 py-2 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800">
            Apply
          </button>
        </div>
        <p className="text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-slate-500">No exeat records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <Th label="Student" sortKey="student_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left" />
                  <th className="px-4 py-3 text-left">House</th>
                  <Th label="Type" sortKey="exeat_type" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left" />
                  <Th label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left" />
                  <Th label="Departed" sortKey="departure_date" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left" />
                  <th className="px-4 py-3 text-left">Exp. Return</th>
                  <th className="px-4 py-3 text-left">Returned</th>
                  <th className="px-4 py-3 text-left">Granted By</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {(displayRows as typeof filtered).map(e => {
                  const meta   = STATUS_META[e.status] ?? STATUS_META.pending;
                  const isOpen = expanded === e.id;
                  return (
                    <>
                      <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 dark:text-white">{e.student_name}</p>
                          <p className="text-xs text-slate-400">{e.student_code} · {e.class_name}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{e.house || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${e.exeat_type === 'external' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                            {e.exeat_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>{meta.label}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">{fmtDate(e.departure_date)} {fmtTime(e.departure_time)}</td>
                        <td className={`px-4 py-3 text-xs whitespace-nowrap font-medium ${e.status === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
                          {fmtDate(e.expected_return_date)} {fmtTime(e.expected_return_time)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {e.actual_return_date ? `${fmtDate(e.actual_return_date)} ${fmtTime(e.actual_return_time)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{e.granted_by_name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => setExpanded(isOpen ? null : e.id)}
                            className="text-xs text-green-700 dark:text-green-400 font-semibold hover:underline">
                            {isOpen ? 'Less' : 'More'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50 dark:bg-slate-700/20">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                              <div><span className="text-slate-400">Destination: </span><span className="text-slate-700 dark:text-slate-300">{e.destination || '—'}</span></div>
                              <div><span className="text-slate-400">Reason: </span><span className="text-slate-700 dark:text-slate-300">{e.reason || '—'}</span></div>
                              <div><span className="text-slate-400">Parent Contact: </span><span className="text-slate-700 dark:text-slate-300">{e.parent_contact || '—'}</span></div>
                              <div><span className="text-slate-400">SMS Sent: </span><span className={e.sms_sent ? 'text-green-600' : 'text-slate-500'}>{e.sms_sent ? 'Yes' : 'No'}</span></div>
                              {e.notes && <div className="col-span-2"><span className="text-slate-400">Notes: </span><span className="text-slate-700 dark:text-slate-300">{e.notes}</span></div>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} pageSize={pageSize} total={pagedTotal}
              onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} />
          </div>
        )}
      </div>
    </div>
  );
}
