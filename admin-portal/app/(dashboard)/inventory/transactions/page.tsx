'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface Transaction {
  id: string; item_id: string; item_name: string; item_type: string;
  category_name: string | null; type: string; quantity: number;
  issued_to_name: string | null; issued_to_role: string | null;
  notes: string | null; performed_by_name: string | null; created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  issued: 'Issued', returned: 'Returned', damaged: 'Damaged',
  repaired: 'Repaired', written_off: 'Written Off', added: 'Added', adjusted: 'Adjusted',
};
const TYPE_COLORS: Record<string, string> = {
  issued:     'bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-400',
  returned:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  damaged:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  repaired:   'bg-teal-100  text-teal-700  dark:bg-teal-900/30  dark:text-teal-400',
  written_off:'bg-red-100   text-red-700   dark:bg-red-900/30   dark:text-red-400',
  added:      'bg-slate-100 text-slate-600 dark:bg-slate-700    dark:text-slate-300',
  adjusted:   'bg-slate-100 text-slate-600 dark:bg-slate-700    dark:text-slate-300',
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function InventoryTransactionsPage() {
  const [rows,        setRows]       = useState<Transaction[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [filterType,  setFilterType] = useState('');
  const [page,        setPage]       = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (filterType) params.type = filterType;
      const res = await api.get<Transaction[]>('/api/inventory/transactions', { params });
      setRows(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [filterType, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Transaction Log</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Full history of all inventory activity</p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(0); }}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
          <option value="">All Activity</option>
          <option value="issued">Issued</option>
          <option value="returned">Returned</option>
          <option value="damaged">Damaged</option>
          <option value="repaired">Repaired</option>
          <option value="written_off">Written Off</option>
          <option value="added">Added</option>
        </select>
        <button onClick={() => load()} className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-10 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">No transactions yet</p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Item</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Action</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Qty</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Recipient</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Notes</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b last:border-0 border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmt(row.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{row.item_name}</p>
                      {row.category_name && <p className="text-xs text-slate-400">{row.category_name}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[row.type] ?? ''}`}>
                        {TYPE_LABELS[row.type] ?? row.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums">{row.quantity}</td>
                    <td className="px-4 py-3">
                      {row.issued_to_name ? (
                        <>
                          <p className="text-slate-800 dark:text-slate-200">{row.issued_to_name}</p>
                          {row.issued_to_role && <p className="text-xs text-slate-400">{row.issued_to_role}</p>}
                        </>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">{row.notes ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{row.performed_by_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
            <span>{rows.length < PAGE_SIZE ? `${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + rows.length}` : `Page ${page + 1}`}</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700">← Prev</button>
              <button disabled={rows.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700">Next →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
