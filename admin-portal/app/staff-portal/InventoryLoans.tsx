'use client';

import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';

const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';
const cardCls  = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden';

interface Loan {
  id: string; item_id: string; quantity: number;
  borrower_type: 'student' | 'teacher'; borrower_name: string; borrower_detail: string | null;
  issued_at: string; due_date: string | null; notes: string | null;
  item_name: string; asset_tag: string | null; is_overdue: boolean;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function InventoryLoans({
  api, primary, onItemsChanged,
}: {
  api: AxiosInstance; primary: string; onItemsChanged: () => void;
}) {
  const [loans,        setLoans]        = useState<Loan[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [search,        setSearch]       = useState('');
  const [overdueOnly,   setOverdueOnly]  = useState(false);

  const [returningId,   setReturningId]  = useState<string | null>(null);
  const [condById,      setCondById]     = useState<Record<string, string>>({});
  const [notesById,     setNotesById]    = useState<Record<string, string>>({});
  const [errById,       setErrById]      = useState<Record<string, string>>({});
  const [submittingId,  setSubmittingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.get<Loan[]>('/api/inventory/loans/active', {
      params: { search: search.trim() || undefined, overdue_only: overdueOnly ? 'true' : undefined },
    }).then(r => setLoans(r.data)).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, overdueOnly]);

  async function submitReturn(loanId: string) {
    setSubmittingId(loanId); setErrById(e => ({ ...e, [loanId]: '' }));
    try {
      const cond = condById[loanId] || '';
      await api.post(`/api/inventory/loans/${loanId}/return`, {
        condition_on_return: cond || undefined,
        notes: notesById[loanId]?.trim() || undefined,
      });
      setLoans(prev => prev.filter(l => l.id !== loanId));
      setReturningId(null);
      onItemsChanged();
    } catch (e: any) {
      setErrById(prev => ({ ...prev, [loanId]: e?.response?.data?.error ?? 'Could not record the return. Check your connection and try again.' }));
    } finally { setSubmittingId(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search borrower or item…" className={`${inputCls} flex-1 min-w-[180px]`} />
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
          <input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)}
            className="w-4 h-4 accent-[#145C44] rounded" />
          Overdue only
        </label>
      </div>

      <div className={cardCls}>
        {loading ? (
          <p className="p-5 text-center text-slate-400 text-sm">Loading…</p>
        ) : loans.length === 0 ? (
          <p className="p-5 text-center text-slate-400 text-sm">No returnable items are out on loan. Items issued from returnable stock show here until they come back.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {loans.map(l => (
              <div key={l.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                      {l.item_name}{l.asset_tag ? ` (${l.asset_tag})` : ''}
                    </p>
                    <p className="text-xs text-slate-400">
                      <span className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold mr-1 bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300`}>
                        {l.borrower_type === 'teacher' ? 'Teacher' : 'Student'}
                      </span>
                      {l.borrower_name}, qty {l.quantity}, issued {fmtDate(l.issued_at)}
                    </p>
                    <p className={`text-xs mt-0.5 ${l.is_overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-400'}`}>
                      {l.due_date ? `${l.is_overdue ? 'Overdue since ' : 'Due '}${fmtDate(l.due_date)}` : 'No due date'}
                    </p>
                    {l.notes && <p className="text-xs text-slate-400 mt-0.5">{l.notes}</p>}
                  </div>
                  <button onClick={() => setReturningId(returningId === l.id ? null : l.id)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white shrink-0" style={{ background: primary }}>
                    Return
                  </button>
                </div>

                {returningId === l.id && (
                  <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select className={inputCls} value={condById[l.id] ?? ''}
                        onChange={e => setCondById(prev => ({ ...prev, [l.id]: e.target.value }))}>
                        <option value="">Condition unchanged</option>
                        <option value="Good">Good</option>
                        <option value="Damaged">Damaged</option>
                      </select>
                      <input className={inputCls} placeholder="Notes (optional)"
                        value={notesById[l.id] ?? ''}
                        onChange={e => setNotesById(prev => ({ ...prev, [l.id]: e.target.value }))} />
                    </div>
                    {errById[l.id] && <p className="text-sm text-red-600">{errById[l.id]}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => setReturningId(null)}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                        Cancel
                      </button>
                      <button onClick={() => submitReturn(l.id)} disabled={submittingId === l.id}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
                        {submittingId === l.id ? 'Processing…' : 'Confirm Return'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
