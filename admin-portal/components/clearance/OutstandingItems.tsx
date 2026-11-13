'use client';

export interface OutstandingItem {
  loan_id: string; source: 'inventory' | 'library'; item_name: string; quantity: number;
  issued_at: string; due_date: string | null; tag_number: string | null; imei: string | null; is_overdue: boolean;
}

// Items the student still holds. While any are listed the student cannot be
// fully cleared, whatever the offices have marked.
export function OutstandingItems({ items, forStudent = false }: { items?: OutstandingItem[] | null; forStudent?: boolean }) {
  if (!items?.length) return null;
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="rounded-xl border border-[#B83232]/30 bg-[#FBEAEA] dark:bg-[#B83232]/15 p-4 space-y-2">
      <div>
        <p className="text-sm font-bold text-[#B83232]">
          {items.length} item{items.length === 1 ? '' : 's'} not returned
        </p>
        <p className="text-xs text-[#7a2222] dark:text-[#f0a0a0]">
          {forStudent
            ? 'You cannot be cleared until these are returned to the school.'
            : 'This student cannot be cleared until these are returned, or recorded as lost by the store or library.'}
        </p>
      </div>
      <ul className="divide-y divide-[#B83232]/15">
        {items.map(i => (
          <li key={`${i.source}-${i.loan_id}`} className="py-1.5 text-sm text-slate-800 dark:text-slate-100">
            <span className="font-semibold">{i.item_name}</span>
            {i.tag_number && <span className="text-slate-600 dark:text-slate-300">{i.source === 'library' ? `, copy ${i.tag_number}` : `, tag ${i.tag_number}`}</span>}
            {i.quantity > 1 && <span className="text-slate-600 dark:text-slate-300"> × {i.quantity}</span>}
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {i.source === 'library' ? 'Library book' : 'From stores'}, since {fmt(i.issued_at)}
              {i.imei ? `, IMEI ${i.imei}` : ''}
              {i.due_date ? `, due ${fmt(i.due_date)}` : ''}
              {i.is_overdue && <span className="font-semibold text-[#B83232]"> (overdue)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
