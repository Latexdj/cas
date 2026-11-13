'use client';
import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import type { InvUnit } from './units';

// Pick the exact unit being handed over, by typing or scanning its tag number
// or IMEI. Only units in store and in good condition are offered.
export function UnitPicker({
  apiClient, itemId, value, onChange, inputClassName, extraParams,
}: {
  apiClient: AxiosInstance; itemId: string; extraParams?: Record<string, string>; value: InvUnit | null; onChange: (u: InvUnit | null) => void; inputClassName?: string;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<InvUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      apiClient.get<InvUnit[]>(`/api/inventory/items/${itemId}/units`, { params: { ...extraParams, available: 'true', search: q.trim() || undefined } })
        .then(r => { if (!cancelled) setHits(r.data); })
        .catch(() => { if (!cancelled) setHits([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, itemId, q, value]);

  function pick(u: InvUnit) { onChange(u); setQ(''); setOpen(false); }

  const cls = inputClassName ?? 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[#B8D9C8] bg-[#E8F4EE] dark:bg-[#145C44]/20 dark:border-[#145C44] px-3 py-2">
        <div className="text-sm">
          <span className="font-semibold text-[#0B3D2E] dark:text-[#7cc79d]">Tag {value.tag_number}</span>
          {value.imei && <span className="block text-xs font-mono text-slate-600 dark:text-slate-300">IMEI {value.imei}</span>}
          {value.serial_number && <span className="block text-xs text-slate-500">Serial {value.serial_number}</span>}
        </div>
        <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">Change</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input className={cls} value={q} autoComplete="off"
        placeholder="Type or scan the tag number or IMEI…"
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const v = q.trim().toUpperCase();
          const exact = hits.find(h => h.tag_number.toUpperCase() === v || (h.imei ?? '') === q.trim());
          if (exact) pick(exact); else if (hits.length === 1) pick(hits[0]);
        }} />
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-30 max-h-64 overflow-y-auto">
          {loading && !hits.length ? (
            <p className="px-4 py-2.5 text-xs text-slate-400">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-2.5 text-xs text-slate-400">{q.trim() ? 'No unit in store matches that tag or IMEI.' : 'Every unit of this item is out on loan or needs repair.'}</p>
          ) : hits.map(h => (
            <div key={h.id} onMouseDown={e => { e.preventDefault(); pick(h); }}
              className="px-4 py-2 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <span className="font-semibold text-sm text-slate-800 dark:text-white">{h.tag_number}</span>
              {h.imei && <span className="text-xs font-mono text-slate-400 ml-2">IMEI {h.imei}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
