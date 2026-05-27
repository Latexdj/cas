'use client';

import { useEffect, useState } from 'react';
import { getClearanceColors } from './layout';
import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function clearanceAxios() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cas_cl_token') : '';
  return axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } });
}

interface Office { id: string; name: string; office_type: string; sort_order: number; }
interface PendingStudent {
  student_id: string; name: string; student_code: string; class_name: string; picture_url: string | null;
  item_id: string; office_id: string; office_name: string; status: string; notes: string | null; actioned_at: string | null;
}
interface LookupResult {
  student: { id: string; name: string; student_code: string; class_name: string; picture_url: string | null };
  items: { item_id: string; office_id: string; office_name: string; status: string; notes: string | null; actioned_at: string | null }[];
}
interface HistoryItem {
  name: string; student_code: string; class_name: string;
  item_id: string; office_name: string; status: string; notes: string | null; actioned_at: string | null;
}

const STATUS_STYLE = {
  cleared:     { badge: 'bg-green-100 text-green-700', label: 'Cleared'     },
  not_cleared: { badge: 'bg-red-100 text-red-700',    label: 'Not Cleared' },
  pending:     { badge: 'bg-amber-100 text-amber-700', label: 'Pending'    },
};

export default function ClearanceStaffPage() {
  const [offices,  setOffices]  = useState<Office[]>([]);
  const [pending,  setPending]  = useState<PendingStudent[]>([]);
  const [history,  setHistory]  = useState<HistoryItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<'pending' | 'lookup' | 'history'>('pending');
  const [officeFilter, setOfficeFilter] = useState('');

  const [lookupCode,    setLookupCode]    = useState('');
  const [lookupResult,  setLookupResult]  = useState<LookupResult | null>(null);
  const [lookupError,   setLookupError]   = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  const [action,   setAction]   = useState<{ item_id: string; office_name: string } | null>(null);
  const [acStatus, setAcStatus] = useState<'cleared' | 'not_cleared'>('cleared');
  const [acNotes,  setAcNotes]  = useState('');
  const [acSaving, setAcSaving] = useState(false);
  const [acError,  setAcError]  = useState('');

  const colors = typeof window !== 'undefined' ? getClearanceColors() : { primary: '#1a5c38' };
  const primary = colors.primary;
  const api = clearanceAxios();

  useEffect(() => {
    Promise.all([
      api.get<Office[]>('/api/clearance/my-offices'),
      api.get<PendingStudent[]>('/api/clearance/pending'),
      api.get<HistoryItem[]>('/api/clearance/history'),
    ]).then(([o, p, h]) => {
      setOffices(o.data); setPending(p.data); setHistory(h.data);
    }).catch(() => {}).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!lookupCode.trim()) return;
    setLookupLoading(true); setLookupError(''); setLookupResult(null);
    try {
      const r = await api.get<LookupResult>(`/api/clearance/student/${lookupCode.trim()}`);
      setLookupResult(r.data);
    } catch { setLookupError('Student not found.'); }
    finally { setLookupLoading(false); }
  }

  function openAction(item_id: string, office_name: string) {
    setAction({ item_id, office_name });
    setAcStatus('cleared'); setAcNotes(''); setAcError('');
  }

  async function submitAction() {
    if (!action) return;
    if (acStatus === 'not_cleared' && !acNotes.trim()) { setAcError('A reason is required when marking as not cleared.'); return; }
    setAcSaving(true); setAcError('');
    try {
      await api.post('/api/clearance/action', { item_id: action.item_id, status: acStatus, notes: acNotes.trim() || null });
      setAction(null);
      const [p, h] = await Promise.all([
        api.get<PendingStudent[]>('/api/clearance/pending'),
        api.get<HistoryItem[]>('/api/clearance/history'),
      ]);
      setPending(p.data); setHistory(h.data);
      if (lookupResult) {
        setLookupResult(prev => prev ? {
          ...prev,
          items: prev.items.map(i => i.item_id === action.item_id
            ? { ...i, status: acStatus, notes: acNotes.trim() || null, actioned_at: new Date().toISOString() }
            : i),
        } : null);
      }
    } catch (err: unknown) {
      setAcError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Action failed');
    } finally { setAcSaving(false); }
  }

  const filteredPending = officeFilter ? pending.filter(p => p.office_id === officeFilter) : pending;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">My Clearance Desk</h1>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {offices.map(o => (
            <span key={o.id} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: `${primary}20`, color: primary }}>{o.name}</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
        {([['pending', 'Pending'], ['lookup', 'Student Lookup'], ['history', 'History']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === key ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}
            style={tab === key ? { background: primary } : {}}>
            {label}{key === 'pending' && pending.length > 0 ? ` (${pending.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <div className="space-y-3">
          {offices.length > 1 && (
            <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 w-full">
              <option value="">All my offices</option>
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          {filteredPending.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">No pending students — all caught up!</div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-50">
              {filteredPending.map(s => (
                <div key={s.item_id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-sm font-bold text-slate-500 overflow-hidden">
                    {s.picture_url ? <img src={s.picture_url} alt="" className="w-full h-full object-cover" /> : s.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.student_code} · {s.class_name}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[s.status as keyof typeof STATUS_STYLE]?.badge ?? 'bg-slate-100 text-slate-500'}`}>
                    {STATUS_STYLE[s.status as keyof typeof STATUS_STYLE]?.label ?? s.status}
                  </span>
                  <button onClick={() => openAction(s.item_id, s.office_name)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white shrink-0" style={{ background: primary }}>
                    Action
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'lookup' && (
        <div className="space-y-4">
          <form onSubmit={handleLookup} className="flex gap-2">
            <input value={lookupCode} onChange={e => { setLookupCode(e.target.value.toUpperCase()); setLookupError(''); setLookupResult(null); }}
              placeholder="Enter Student ID…" maxLength={20}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500" />
            <button type="submit" disabled={lookupLoading || !lookupCode.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
              {lookupLoading ? '…' : 'Search'}
            </button>
          </form>
          {lookupError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{lookupError}</p>}
          {lookupResult && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center text-lg font-bold text-slate-500 overflow-hidden shrink-0">
                  {lookupResult.student.picture_url
                    ? <img src={lookupResult.student.picture_url} alt="" className="w-full h-full object-cover" />
                    : lookupResult.student.name[0]}
                </div>
                <div>
                  <p className="font-bold text-slate-800">{lookupResult.student.name}</p>
                  <p className="text-xs text-slate-400">{lookupResult.student.student_code} · {lookupResult.student.class_name}</p>
                </div>
              </div>
              {lookupResult.items.length === 0
                ? <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">No clearance items for your office.</div>
                : lookupResult.items.map(item => {
                  const st = STATUS_STYLE[item.status as keyof typeof STATUS_STYLE] ?? STATUS_STYLE.pending;
                  return (
                    <div key={item.item_id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{item.office_name}</p>
                        {item.notes && <p className="text-xs text-slate-500 mt-0.5">{item.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
                        <button onClick={() => openAction(item.item_id, item.office_name)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: primary }}>
                          Action
                        </button>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {history.length === 0
            ? <div className="p-10 text-center text-slate-400 text-sm">No actions yet.</div>
            : <div className="divide-y divide-slate-50">
                {history.map((h, i) => {
                  const st = STATUS_STYLE[h.status as keyof typeof STATUS_STYLE] ?? STATUS_STYLE.pending;
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{h.name}</p>
                        <p className="text-xs text-slate-400">{h.student_code} · {h.class_name}</p>
                        {h.notes && <p className="text-xs text-slate-500 mt-0.5 truncate">{h.notes}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
                        {h.actioned_at && <p className="text-[10px] text-slate-400 mt-1">{new Date(h.actioned_at).toLocaleDateString()}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>
      )}

      {/* Action Modal */}
      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <p className="font-bold text-slate-800">Clearance Action</p>
              <button onClick={() => setAction(null)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-slate-500">Office: <span className="font-semibold text-slate-700">{action.office_name}</span></p>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Decision</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setAcStatus('cleared')}
                    className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${acStatus === 'cleared' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                    Cleared
                  </button>
                  <button onClick={() => setAcStatus('not_cleared')}
                    className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${acStatus === 'not_cleared' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                    Not Cleared
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Reason / Notes {acStatus === 'not_cleared' && <span className="text-red-500">*</span>}
                </label>
                <textarea value={acNotes} onChange={e => { setAcNotes(e.target.value); setAcError(''); }} rows={3}
                  placeholder={acStatus === 'not_cleared' ? 'Required — state the reason clearly…' : 'Optional notes…'}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
              {acError && <p className="text-sm text-red-600">{acError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setAction(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600">Cancel</button>
                <button onClick={submitAction} disabled={acSaving || (acStatus === 'not_cleared' && !acNotes.trim())}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${acStatus === 'not_cleared' ? 'bg-red-600' : 'bg-green-600'}`}>
                  {acSaving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
