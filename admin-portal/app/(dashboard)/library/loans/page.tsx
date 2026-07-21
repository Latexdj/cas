'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface Loan {
  id: string; status: string; issued_at: string; due_date: string; returned_at: string | null;
  fine_amount: number; fine_paid: boolean; notes: string | null;
  book_title: string; author: string | null; copy_number: string;
  student_name: string; student_code: string; class_name: string;
  issued_by: string | null; is_overdue: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  returned: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  overdue:  'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  lost:     'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function LoansPage() {
  const [loans,   setLoans]   = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('');

  function load() {
    setLoading(true);
    api.get<Loan[]>('/api/library-admin/loans', {
      params: { search: search || undefined, status: status || undefined },
    }).then(r => setLoans(r.data)).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(load, []);

  const filtered = loans.filter(l => {
    const s = search.toLowerCase();
    if (s && !l.student_name.toLowerCase().includes(s) && !l.student_code.toLowerCase().includes(s) && !l.book_title.toLowerCase().includes(s)) return false;
    if (status && l.status !== status) return false;
    return true;
  });
  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(filtered);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Loans</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">All book loans (latest 200)</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white w-64"
          placeholder="Search student or book…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="returned">Returned</option>
          <option value="lost">Lost</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No loans found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <Th label="Student" sortKey="student_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <Th label="Book" sortKey="book_title" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Copy</th>
                <Th label="Issued" sortKey="issued_at" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <Th label="Due" sortKey="due_date" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Returned</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Fine</th>
                <Th label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {(displayRows as Loan[]).map(l => (
                <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{l.student_name}</p>
                    <p className="text-xs text-slate-500">{l.student_code} · {l.class_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{l.book_title}</p>
                    {l.author && <p className="text-xs text-slate-500">{l.author}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">#{l.copy_number}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{new Date(l.issued_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={l.is_overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}>
                      {l.due_date}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {l.returned_at ? new Date(l.returned_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {l.fine_amount > 0 ? (
                      <span className={l.fine_paid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        GHS {l.fine_amount.toFixed(2)}{l.fine_paid ? ' ✓' : ''}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[l.status] ?? STATUS_COLORS.active}`}>
                      {l.is_overdue && l.status === 'active' ? 'overdue' : l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filtered.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total}
            onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} />
        )}
      </div>
    </div>
  );
}
