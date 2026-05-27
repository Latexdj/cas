'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatCard } from '@/components/ui/Card';

interface Stats {
  total_books: number; total_copies: number; available_copies: number;
  active_loans: number; overdue_loans: number; total_resources: number;
}

export default function LibraryOverviewPage() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Stats>('/api/library-admin/stats')
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Library</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Overview of books, loans, and digital resources</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Total Books"       value={stats.total_books}      color="blue" />
            <StatCard label="Total Copies"      value={stats.total_copies}     color="purple" />
            <StatCard label="Available"         value={stats.available_copies} color="green" />
            <StatCard label="Active Loans"      value={stats.active_loans}     color="blue" />
            <StatCard label="Overdue"           value={stats.overdue_loans}    color="red" />
            <StatCard label="Digital Resources" value={stats.total_resources}  color="yellow" />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Quick Links</h2>
            <div className="flex flex-wrap gap-3">
              {[
                { href: '/library/books',     label: 'Manage Book Catalog' },
                { href: '/library/loans',     label: 'View All Loans' },
                { href: '/library/overdue',   label: 'Overdue Books' },
                { href: '/library/resources', label: 'Digital Resources' },
                { href: '/library/staff',     label: 'Manage Librarians' },
                { href: '/library/settings',  label: 'Loan Settings' },
              ].map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-red-500">Failed to load stats</p>
      )}
    </div>
  );
}
