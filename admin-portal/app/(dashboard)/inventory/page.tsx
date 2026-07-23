'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { StatCard } from '@/components/ui/Card';

interface Stats {
  total_items: number;
  total_units: number;
  available_units: number;
  items_with_issued: number;
  damaged_items: number;
  transactions_today: number;
}

export default function InventoryOverviewPage() {
  const router = useRouter();
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get<Stats>('/api/inventory/stats')
      .then(r => setStats(r.data))
      .catch(() => setError('Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Inventory</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Track school assets, equipment, and books</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Total Items"       value={stats.total_items}         color="blue" />
            <StatCard label="Total Units"       value={stats.total_units}         color="purple" />
            <StatCard label="Available Units"   value={stats.available_units}     color="green" />
            <StatCard label="Items Issued"      value={stats.items_with_issued}   color="yellow" />
            <StatCard label="Damaged"           value={stats.damaged_items}       color="red" />
            <StatCard label="Activity Today"    value={stats.transactions_today}  color="blue" />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              {[
                { href: '/inventory/items',        label: 'View All Items' },
                { href: '/inventory/items?add=1',  label: 'Add Item' },
                { href: '/inventory/categories',   label: 'Manage Categories' },
                { href: '/inventory/transactions', label: 'Transaction Log' },
              ].map(({ href, label }) => (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
