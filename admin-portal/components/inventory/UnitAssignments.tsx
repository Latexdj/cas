'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { type InvUnit, fileToGrid, apiError, downloadPairingTemplate } from './units';

export interface AssignPerson { id: string; name: string; code: string; detail?: string | null }
export interface UnitAssignment { recipient_id: string; unit_id: string; tag_number: string; imei: string | null }
export interface AssignResult { assignments: UnitAssignment[]; problems: string[]; complete: boolean }

const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';

// Pairs each person with the unit (tag number) they receive. Fill in tag
// order with one click, type or scan tags row by row, or upload a sheet that
// pairs IDs with tags. Nothing is claimed until the issue is confirmed.
export function UnitAssignments({
  apiClient, itemId, people, onChange, extraParams,
}: {
  apiClient: AxiosInstance; itemId: string; extraParams?: Record<string, string>; people: AssignPerson[]; onChange: (r: AssignResult) => void;
}) {
  const [units, setUnits] = useState<InvUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true); setLoadError(''); setTyped({});
    apiClient.get<InvUnit[]>(`/api/inventory/items/${itemId}/units`, { params: { ...extraParams, available: 'true', all: 'true' } })
      .then(r => setUnits(r.data))
      .catch(e => setLoadError(apiError(e, 'Could not load the units in store.')))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, itemId]);

  const index = useMemo(() => {
    const m = new Map<string, InvUnit>();
    for (const u of units) {
      m.set(u.tag_number.trim().toUpperCase(), u);
      if (u.imei) m.set(u.imei.trim(), u);
    }
    return m;
  }, [units]);

  const result = useMemo<AssignResult & { rowError: Record<string, string> }>(() => {
    const rowError: Record<string, string> = {};
    const assignments: UnitAssignment[] = [];
    const usedBy = new Map<string, string>();
    for (const p of people) {
      const raw = (typed[p.id] ?? '').trim();
      if (!raw) continue;
      const u = index.get(raw.toUpperCase()) ?? index.get(raw);
      if (!u) { rowError[p.id] = 'Not in store'; continue; }
      if (usedBy.has(u.id)) { rowError[p.id] = `Also given to ${usedBy.get(u.id)}`; continue; }
      usedBy.set(u.id, p.name);
      assignments.push({ recipient_id: p.id, unit_id: u.id, tag_number: u.tag_number, imei: u.imei });
    }
    const missing = people.length - assignments.length - Object.keys(rowError).length;
    const problems: string[] = [];
    if (Object.keys(rowError).length) problems.push(`${Object.keys(rowError).length} row(s) have a tag that can't be used`);
    if (missing > 0) problems.push(`${missing} person(s) have no tag yet`);
    return { assignments, problems, complete: assignments.length === people.length, rowError };
  }, [people, typed, index]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current({ assignments: result.assignments, problems: result.problems, complete: result.complete });
  }, [result]);

  function fillInOrder() {
    const used = new Set(result.assignments.map(a => a.unit_id));
    const free = units.filter(u => !used.has(u.id));
    const needing = people.filter(p => !(typed[p.id] ?? '').trim() || result.rowError[p.id]);
    const next = { ...typed };
    needing.forEach((p, i) => { if (free[i]) next[p.id] = free[i].tag_number; });
    setTyped(next);
    setNote(free.length < needing.length
      ? `Only ${free.length} unit(s) are free in store, so ${needing.length - free.length} people still have no tag.` : '');
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setNote('');
    try {
      const grid = (await fileToGrid(f)).map(r => (r ?? []).map(c => String(c ?? '').trim()));
      const byCode = new Map(people.map(p => [p.code.trim().toUpperCase(), p.id]));
      const head = (grid[0] ?? []).map(c => c.toLowerCase());
      const idCol = head.findIndex(h => /id|code|student|teacher/.test(h));
      const tagCol = head.findIndex(h => /tag|imei/.test(h));
      const hasHead = idCol >= 0 && tagCol >= 0;
      const [ic, tc] = hasHead ? [idCol, tagCol] : [0, 1];
      const next = { ...typed };
      let matched = 0, unknown = 0;
      for (const row of hasHead ? grid.slice(1) : grid) {
        const code = (row[ic] ?? '').toUpperCase(), tag = row[tc] ?? '';
        if (!code || !tag) continue;
        const pid = byCode.get(code);
        if (pid) { next[pid] = tag; matched++; } else unknown++;
      }
      setTyped(next);
      setNote(`${matched} pairing(s) applied${unknown ? `, ${unknown} ID(s) in the sheet are not on this list` : ''}.`);
    } catch { setNote('That file could not be read. Save it as .xlsx or .csv with an ID column and a Tag column.'); }
    if (fileRef.current) fileRef.current.value = '';
  }

  if (loading) return <p className="text-sm text-slate-500">Loading the units in store…</p>;
  if (loadError) return <p className="text-sm text-[#B83232]">{loadError}</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {units.length} unit{units.length === 1 ? '' : 's'} free in store. Each person needs one tag number. Type or scan a tag (or IMEI) on each row, fill the rest in tag order, or download the pairing sheet (everyone listed, with an empty Tag Number column), fill it in and upload it back.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={fillInOrder}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#145C44] hover:bg-[#0B3D2E]">Fill empty rows in tag order</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
        <button type="button" onClick={() => downloadPairingTemplate(people, 'Issue').catch(() => setNote('The pairing sheet could not be created. Try again.'))}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Download pairing sheet</button>
        <button type="button" onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Upload pairing sheet</button>
        <button type="button" onClick={() => { setTyped({}); setNote(''); }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:underline">Clear all</button>
      </div>
      {note && <p className="text-xs text-[#C8780A]">{note}</p>}
      <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
            <tr className="text-left text-xs text-slate-500">
              <th className="px-3 py-1.5 font-semibold">Name</th>
              <th className="px-3 py-1.5 font-semibold w-40">Tag number</th>
              <th className="px-3 py-1.5 font-semibold">IMEI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {people.map(p => {
              const a = result.assignments.find(x => x.recipient_id === p.id);
              const err = result.rowError[p.id];
              return (
                <tr key={p.id}>
                  <td className="px-3 py-1.5">
                    <span className="block text-slate-800 dark:text-white truncate">{p.name}</span>
                    <span className="block text-xs text-slate-400">{p.code}{p.detail ? `, ${p.detail}` : ''}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <input className={`${inputCls} ${err ? 'border-[#B83232]' : ''}`} value={typed[p.id] ?? ''} list={`units-${itemId}`}
                      onChange={e => setTyped(t => ({ ...t, [p.id]: e.target.value }))} placeholder="Tag" />
                    {err && <span className="block text-xs text-[#B83232] mt-0.5">{err}</span>}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{a?.imei ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id={`units-${itemId}`}>
          {units.map(u => <option key={u.id} value={u.tag_number} />)}
        </datalist>
      </div>
      <p className={`text-xs font-semibold ${result.complete ? 'text-[#2D7A4F]' : 'text-[#C8780A]'}`}>
        {result.complete ? `All ${people.length} people have a tag.` : `${result.assignments.length} of ${people.length} have a tag. ${result.problems.join('. ')}.`}
      </p>
    </div>
  );
}
