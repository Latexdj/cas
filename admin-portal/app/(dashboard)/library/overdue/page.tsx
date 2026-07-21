'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface OverdueLoan {
  id: string; issued_at: string; due_date: string; days_overdue: number;
  fine_amount: number; fine_paid: boolean;
  book_title: string; copy_number: string;
  student_name: string; student_code: string; class_name: string;
}

export default function OverduePage() {
  const [loans,   setLoans]   = useState<OverdueLoan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<OverdueLoan[]>('/api/library-admin/loans/overdue')
      .then(r => setLoans(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(loans as Record<string, unknown>[]);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Overdue Books</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{loans.length} overdue loan(s)</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : loans.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No overdue books.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <Th label="Student" sortKey="student_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <Th label="Book" sortKey="book_title" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap">Copy</th>
                <Th label="Due Date" sortKey="due_date" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <Th label="Days Overdue" sortKey="days_overdue" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
                <Th label="Fine" sortKey="fine_amount" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide whitespace-nowrap" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {(displayRows as OverdueLoan[]).map(l => (
                <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{l.student_name}</p>
                    <p className="text-xs text-slate-500">{l.student_code} · {l.class_name}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{l.book_title}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">#{l.copy_number}</td>
                  <td className="px-4 py-3 text-red-600 dark:text-red-400 font-semibold">{l.due_date}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-semibold">
                      {l.days_overdue}d
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-red-600 dark:text-red-400">
                    {l.fine_amount > 0 ? `GHS ${l.fine_amount.toFixed(2)}` : '—'}
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
