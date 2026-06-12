'use client';
import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';

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
  const [exeats,  setExeats]  = useState<Exeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fType,   setFType]   = useState('');
  const [fHouse,  setFHouse]  = useState('');
  const [fFrom,   setFFrom]   = useState('');
  const [fTo,     setFTo]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const counts = useMemo(() => ({
    total:    exeats.length,
    out:      exeats.filter(e => e.status === 'active').length,
    overdue:  exeats.filter(e => e.status === 'overdue').length,
    pending:  exeats.filter(e => e.status === 'pending').length,
    returned: exeats.filter(e => e.status === 'returned').length,
  }), [exeats]);

  return (
    <div className="space-y-6">
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
                  <th className="px-4 py-3 text-left">Student</th>
                  <th className="px-4 py-3 text-left">House</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Departed</th>
                  <th className="px-4 py-3 text-left">Exp. Return</th>
                  <th className="px-4 py-3 text-left">Returned</th>
                  <th className="px-4 py-3 text-left">Granted By</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {filtered.map(e => {
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
          </div>
        )}
      </div>
    </div>
  );
}
