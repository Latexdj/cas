'use client';
import { useState } from 'react';
import type { AxiosInstance } from 'axios';
import { UnitPicker } from './UnitPicker';
import { type InvUnit, apiError } from './units';

// For loans made before an item was tracked by unit: record which tablet
// (tag number) that person actually has.
export function AssignTag({
  apiClient, loanId, itemId, onDone, extraParams,
}: {
  apiClient: AxiosInstance; loanId: string; itemId: string; onDone: (tag: string, imei: string | null) => void;
  extraParams?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<InvUnit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!unit) return;
    setBusy(true); setError('');
    try {
      await apiClient.post(`/api/inventory/loans/${loanId}/assign-unit`, { unit_id: unit.id }, { params: extraParams });
      onDone(unit.tag_number, unit.imei);
      setOpen(false);
    } catch (e) { setError(apiError(e, 'Could not add the tag. Check your connection and try again.')); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="text-xs font-semibold px-2.5 py-1 rounded-md border border-[#C8780A]/40 text-[#C8780A] hover:bg-[#FDF3E3] whitespace-nowrap">
        Add tag
      </button>
    );
  }
  return (
    <div className="space-y-1.5 w-full min-w-[14rem]">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">Issued before tags were recorded. Which unit does this person have?</p>
      <UnitPicker apiClient={apiClient} itemId={itemId} value={unit} onChange={setUnit} extraParams={extraParams} />
      {error && <p className="text-[11px] text-[#B83232]">{error}</p>}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Cancel</button>
        <button type="button" onClick={save} disabled={!unit || busy} className="flex-1 py-1 rounded-md text-xs font-semibold bg-[#145C44] text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save tag'}</button>
      </div>
    </div>
  );
}
