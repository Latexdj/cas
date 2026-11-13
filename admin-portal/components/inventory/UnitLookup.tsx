'use client';
import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { type InvUnit, UNIT_STATUS_LABEL } from './units';

interface LookupUnit extends InvUnit {
  item_name: string;
  history: { borrower_name: string; borrower_detail: string | null; issued_at: string; returned_at: string | null; condition_on_return: string | null; status: string }[];
}

// "Who has tablet T-123?" Type or scan a tag number or IMEI.
export function UnitLookup({ apiClient, extraParams }: { apiClient: AxiosInstance; extraParams?: Record<string, string> }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<LookupUnit[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const v = q.trim();
    if (v.length < 2) { setRows(null); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      apiClient.get<LookupUnit[]>('/api/inventory/units/lookup', { params: { ...extraParams, q: v } })
        .then(r => { if (!cancelled) setRows(r.data); })
        .catch(() => { if (!cancelled) setRows([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, q]);

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '');

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-white">Find a unit</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Type or scan a tag number or IMEI to see who has it.</p>
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tag number or IMEI…"
        className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]" />
      {loading && <p className="text-xs text-slate-400">Searching…</p>}
      {rows && !loading && rows.length === 0 && <p className="text-xs text-slate-500">No unit has that tag number or IMEI. Check it and try again.</p>}
      {rows?.map(u => (
        <div key={u.id} className="rounded-lg border border-slate-100 dark:border-slate-700 p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{u.item_name}: tag {u.tag_number}</p>
            <span className="text-xs font-semibold text-slate-500">{UNIT_STATUS_LABEL[u.status]}{u.condition === 'Damaged' ? ', damaged' : ''}</span>
          </div>
          {u.imei && <p className="text-xs font-mono text-slate-500">IMEI {u.imei}</p>}
          {u.borrower_name ? (
            <p className="text-sm text-slate-700 dark:text-slate-200">
              With <span className="font-semibold">{u.borrower_name}</span>{u.borrower_detail ? ` (${u.borrower_detail})` : ''} since {fmt(u.issued_at ?? null)}
              {u.due_date ? `, due ${fmt(u.due_date)}` : ''}{u.is_overdue ? <span className="font-semibold text-[#B83232]"> (overdue)</span> : null}
            </p>
          ) : u.status === 'in_store' ? <p className="text-sm text-[#2D7A4F]">In the store.</p> : null}
          {u.history.filter(h => h.status !== 'active').length > 0 && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold">Earlier holders</summary>
              <ul className="mt-1 space-y-0.5">
                {u.history.filter(h => h.status !== 'active').map((h, i) => (
                  <li key={i}>{h.borrower_name}{h.borrower_detail ? ` (${h.borrower_detail})` : ''}: {fmt(h.issued_at)} to {fmt(h.returned_at)}{h.condition_on_return ? `, returned ${h.condition_on_return.toLowerCase()}` : ''}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
