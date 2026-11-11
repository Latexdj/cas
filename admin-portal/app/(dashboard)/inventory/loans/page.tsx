'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface Loan {
  id: string; item_id: string; quantity: number; borrower_type: 'student' | 'teacher';
  borrower_name: string; borrower_detail: string | null; issued_at: string;
  due_date: string | null; notes: string | null; item_name: string; asset_tag: string | null;
  is_overdue: boolean;
}

const BORROWER_COLORS: Record<string, string> = {
  student: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  teacher: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

function LoansPageInner() {
  const searchParams = useSearchParams();
  const itemIdFilter = searchParams.get('item_id') ?? '';

  const [loans,       setLoans]       = useState<Loan[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Inline return form, keyed by loan id
  const [returningId, setReturningId] = useState('');
  const [retCondition, setRetCondition] = useState('');
  const [retNotes,      setRetNotes]     = useState('');
  const [retSaving,     setRetSaving]    = useState(false);
  const [retError,      setRetError]     = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get<Loan[]>('/api/inventory/loans/active', {
      params: {
        search: search || undefined,
        overdue_only: overdueOnly ? 'true' : undefined,
        item_id: itemIdFilter || undefined,
      },
    }).then(r => setLoans(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [search, overdueOnly, itemIdFilter]);

  useEffect(() => { load(); }, [load]);

  function openReturn(loanId: string) {
    setReturningId(loanId); setRetCondition(''); setRetNotes(''); setRetError('');
  }

  async function submitReturn(loanId: string) {
    setRetSaving(true); setRetError('');
    try {
      await api.post(`/api/inventory/loans/${loanId}/return`, {
        condition_on_return: retCondition || undefined,
        notes: retNotes || undefined,
      });
      setReturningId('');
      setLoans(prev => prev.filter(l => l.id !== loanId));
    } catch (err: unknown) {
      setRetError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not record the return. Check your connection and try again.');
    } finally { setRetSaving(false); }
  }

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(loans);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Outstanding Loans</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Returnable items currently with a student or teacher{itemIdFilter ? ', filtered to one item' : ''}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white w-64"
          placeholder="Search borrower or item…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
          <input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)}
            className="w-4 h-4 accent-red-600 rounded" />
          Overdue only
        </label>
        {itemIdFilter && (
          <a href="/inventory/loans" className="text-xs text-[#145C44] dark:text-[#2ab289] hover:underline">Clear item filter</a>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : loans.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No returnable items are out on loan. Items issued from returnable stock show here until they come back.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <Th label="Item" sortKey="item_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap" />
                <Th label="Borrower" sortKey="borrower_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap" />
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">Qty</th>
                <Th label="Issued" sortKey="issued_at" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap" />
                <Th label="Due" sortKey="due_date" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap" />
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {(displayRows as Loan[]).map(l => (
                <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{l.item_name}</p>
                    {l.asset_tag && <p className="text-xs text-slate-400">{l.asset_tag}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{l.borrower_name}</p>
                    <span className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${BORROWER_COLORS[l.borrower_type]}`}>
                      {l.borrower_type}
                    </span>
                    {l.borrower_detail && <span className="ml-1 text-xs text-slate-400">{l.borrower_detail}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{l.quantity}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{new Date(l.issued_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {l.due_date ? (
                      <span className={l.is_overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}>
                        {new Date(l.due_date).toLocaleDateString()}{l.is_overdue ? ' (overdue)' : ''}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[12rem]">{l.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    {returningId === l.id ? (
                      <div className="flex flex-col gap-1.5 w-56">
                        <select value={retCondition} onChange={e => setRetCondition(e.target.value)}
                          className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                          <option value="">Condition on return…</option>
                          <option value="Good">Good</option>
                          <option value="Damaged">Damaged</option>
                        </select>
                        <input value={retNotes} onChange={e => setRetNotes(e.target.value)} placeholder="Notes (optional)"
                          className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
                        {retError && <p className="text-[11px] text-red-500">{retError}</p>}
                        <div className="flex gap-1.5">
                          <button onClick={() => setReturningId('')} className="flex-1 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Cancel</button>
                          <button onClick={() => submitReturn(l.id)} disabled={retSaving}
                            className="flex-1 py-1 rounded-md text-xs font-semibold bg-[#145C44] text-white disabled:opacity-40">
                            {retSaving ? '…' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => openReturn(l.id)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#E8F4EE] dark:bg-green-900/20 text-[#145C44] dark:text-[#2ab289] hover:bg-[#D1EAD9] whitespace-nowrap">
                        Return
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && loans.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total}
            onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} />
        )}
      </div>
    </div>
  );
}

export default function LoansPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
      <LoansPageInner />
    </Suspense>
  );
}
