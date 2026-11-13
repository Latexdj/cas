'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { type InvUnit, type UnitRow, UNIT_STATUS_LABEL, gridToUnits, textToGrid, fileToGrid, apiError } from './units';

const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';
const btnPrimary = 'px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#145C44] hover:bg-[#0B3D2E] disabled:opacity-50';
const btnGhost = 'px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700';

const STATUS_TONE: Record<InvUnit['status'], string> = {
  in_store: 'bg-[#E8F4EE] text-[#2D7A4F] dark:bg-[#2D7A4F]/20 dark:text-[#7cc79d]',
  issued: 'bg-[#FDF3E3] text-[#C8780A] dark:bg-[#C8780A]/20 dark:text-[#f0b85a]',
  lost: 'bg-[#FBEAEA] text-[#B83232] dark:bg-[#B83232]/20 dark:text-[#f08a8a]',
  written_off: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
};

// Units of one tracked item: register them in bulk, see who holds each one,
// and edit, mark damaged, write off or delete. Used by the admin dashboard,
// the Staff Portal (stores) and the HOD inventory page.
export function UnitsManager({
  apiClient, item, onClose, onChanged, extraParams,
}: {
  apiClient: AxiosInstance;
  // Sent with every request, e.g. a HOD's dept_id.
  extraParams?: Record<string, string>;
  item: { id: string; name: string };
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [units, setUnits] = useState<InvUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InvUnit | null>(null);

  const load = useCallback(() => {
    setLoading(true); setLoadError('');
    apiClient.get<InvUnit[]>(`/api/inventory/items/${item.id}/units`, { params: { ...extraParams, search: search || undefined, status: status || undefined } })
      .then(r => setUnits(r.data))
      .catch(e => setLoadError(apiError(e, 'Could not load the units. Check your connection and try again.')))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, item.id, search, status]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  function changed() { load(); onChanged?.(); }

  const counts = units.reduce((acc, u) => { acc[u.status] = (acc[u.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/55 p-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <p className="font-bold text-slate-900 dark:text-white">{item.name}: units</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Each unit has its own tag number and IMEI, recorded against whoever receives it.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-3 flex flex-wrap gap-2 items-center border-b border-slate-100 dark:border-slate-700 shrink-0">
          <input className={`${inputCls} flex-1 min-w-[180px]`} placeholder="Search tag, IMEI, serial or holder…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className={`${inputCls} w-auto`} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All units</option>
            {Object.entries(UNIT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className={btnPrimary} onClick={() => setAdding(true)}>Add units</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {adding ? (
            <AddUnits apiClient={apiClient} extraParams={extraParams} itemId={item.id} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); changed(); }} />
          ) : loading ? (
            <p className="p-5 text-sm text-slate-500">Loading units…</p>
          ) : loadError ? (
            <p className="p-5 text-sm text-[#B83232]">{loadError}</p>
          ) : units.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-300">{search || status ? 'No unit matches this search.' : 'No units are registered for this item.'}</p>
              {!search && !status && <p className="text-xs text-slate-400">Use Add units to paste or upload the list of tag numbers and IMEIs.</p>}
            </div>
          ) : (
            <>
              <p className="px-5 pt-3 text-xs text-slate-500 dark:text-slate-400">
                {units.length} shown: {counts.in_store ?? 0} in store, {counts.issued ?? 0} on loan
                {counts.lost ? `, ${counts.lost} lost` : ''}{counts.written_off ? `, ${counts.written_off} written off` : ''}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      <th className="px-5 py-2 font-semibold">Tag</th>
                      <th className="px-3 py-2 font-semibold">IMEI</th>
                      <th className="px-3 py-2 font-semibold">Serial</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Holder</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {units.map(u => (
                      <tr key={u.id} className="text-slate-800 dark:text-slate-200">
                        <td className="px-5 py-2 font-semibold whitespace-nowrap">{u.tag_number}</td>
                        <td className="px-3 py-2 font-mono text-xs">{u.imei ?? '-'}</td>
                        <td className="px-3 py-2 text-xs">{u.serial_number ?? '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_TONE[u.status]}`}>{UNIT_STATUS_LABEL[u.status]}</span>
                          {u.condition === 'Damaged' && <span className="ml-1 text-xs font-semibold text-[#B83232]">Damaged</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {u.borrower_name ? (
                            <>
                              <span className="font-semibold">{u.borrower_name}</span>
                              {u.borrower_detail && <span className="text-slate-400"> {u.borrower_detail}</span>}
                              {u.is_overdue && <span className="ml-1 font-semibold text-[#B83232]">Overdue</span>}
                            </>
                          ) : '-'}
                        </td>
                        <td className="px-5 py-2 text-right">
                          <button className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline" onClick={() => setEditing(u)}>Manage</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {editing && (
        <EditUnit apiClient={apiClient} extraParams={extraParams} unit={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed(); }} />
      )}
    </div>
  );
}

function AddUnits({ apiClient, extraParams, itemId, onCancel, onSaved }: {
  apiClient: AxiosInstance; extraParams?: Record<string, string>; itemId: string; onCancel: () => void; onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [errors, setErrors] = useState<{ line: number; error: string }[]>([]);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function setFromGrid(grid: unknown[][]) {
    const parsed = gridToUnits(grid);
    setRows(parsed); setErrors([]); setChecked(false); setMsg('');
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try { setText(''); setFromGrid(await fileToGrid(f)); }
    catch { setMsg('That file could not be read. Save it as .xlsx or .csv and try again.'); }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function check(save: boolean) {
    if (!rows.length) { setMsg('Paste or upload the list first.'); return; }
    setBusy(true); setMsg('');
    try {
      const { data } = await apiClient.post<{ ok: boolean; errors: { line: number; error: string }[]; added?: number }>(
        `/api/inventory/items/${itemId}/units`, { units: rows, dry_run: !save }, { params: extraParams });
      setErrors(data.errors ?? []); setChecked(true);
      if (save && data.ok) onSaved();
    } catch (e) {
      const err = e as { response?: { data?: { errors?: { line: number; error: string }[] } } };
      if (err.response?.data?.errors?.length) { setErrors(err.response.data.errors); setChecked(true); }
      else setMsg(apiError(e, 'Could not save the units. Check your connection and try again.'));
    } finally { setBusy(false); }
  }

  const errLines = new Set(errors.map(e => e.line));

  return (
    <div className="p-5 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-white">Add units</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Copy the Tag, IMEI and Serial columns from Excel and paste them below, or upload the spreadsheet. A first row with the column names is fine. Without one, the columns are read as Tag, IMEI, Serial.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
        <button className={btnGhost} onClick={() => fileRef.current?.click()}>Upload spreadsheet</button>
        <span className="text-xs text-slate-400">or paste:</span>
      </div>
      <textarea className={`${inputCls} font-mono text-xs h-32`} value={text}
        placeholder={'Tag\tIMEI\tSerial\nTAB-001\t356789104512345\tR58N12ABC\nTAB-002\t356789104512346\tR58N12ABD'}
        onChange={e => { setText(e.target.value); setFromGrid(textToGrid(e.target.value)); }} />

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {rows.length} unit{rows.length === 1 ? '' : 's'} read
            {checked && (errors.length ? `, ${errors.length} problem${errors.length === 1 ? '' : 's'} to fix` : ', all good to save')}
          </p>
          {errors.length > 0 && (
            <ul className="text-xs text-[#B83232] bg-[#FBEAEA] dark:bg-[#B83232]/15 rounded-lg p-3 space-y-0.5 max-h-32 overflow-y-auto">
              {errors.map((e, i) => <li key={i}>Row {e.line}: {e.error}</li>)}
            </ul>
          )}
          <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                <tr className="text-left text-slate-500"><th className="px-3 py-1.5">Row</th><th className="px-3 py-1.5">Tag</th><th className="px-3 py-1.5">IMEI</th><th className="px-3 py-1.5">Serial</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.slice(0, 500).map((r, i) => (
                  <tr key={i} className={errLines.has(i + 1) ? 'bg-[#FBEAEA] dark:bg-[#B83232]/15' : 'text-slate-700 dark:text-slate-300'}>
                    <td className="px-3 py-1 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-1 font-semibold">{r.tag_number || <span className="text-[#B83232]">missing</span>}</td>
                    <td className="px-3 py-1 font-mono">{r.imei}</td>
                    <td className="px-3 py-1">{r.serial_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 500 && <p className="px-3 py-1.5 text-xs text-slate-400">Showing the first 500 rows. All {rows.length} will be saved.</p>}
          </div>
        </div>
      )}

      {msg && <p className="text-sm text-[#B83232]">{msg}</p>}
      <div className="flex flex-wrap gap-2 justify-end">
        <button className={btnGhost} onClick={onCancel}>Cancel</button>
        <button className={btnGhost} disabled={busy || !rows.length} onClick={() => check(false)}>{busy ? 'Checking…' : 'Check list'}</button>
        <button className={btnPrimary} disabled={busy || !rows.length || (checked && errors.length > 0)} onClick={() => check(true)}>
          {busy ? 'Saving…' : `Save ${rows.length || ''} unit${rows.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

function EditUnit({ apiClient, extraParams, unit, onClose, onSaved }: {
  apiClient: AxiosInstance; extraParams?: Record<string, string>; unit: InvUnit; onClose: () => void; onSaved: () => void;
}) {
  const [tag, setTag] = useState(unit.tag_number);
  const [imei, setImei] = useState(unit.imei ?? '');
  const [serial, setSerial] = useState(unit.serial_number ?? '');
  const [notes, setNotes] = useState(unit.notes ?? '');
  const [condition, setCondition] = useState(unit.condition);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true); setError('');
    try {
      await apiClient.put(`/api/inventory/units/${unit.id}`, {
        tag_number: tag, imei, serial_number: serial, notes, condition, reason: reason || undefined, ...extra,
      }, { params: extraParams });
      onSaved();
    } catch (e) { setError(apiError(e, 'Could not save this unit. Check your connection and try again.')); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError('');
    try { await apiClient.delete(`/api/inventory/units/${unit.id}`, { params: extraParams }); onSaved(); }
    catch (e) { setError(apiError(e, 'Could not delete this unit.')); setConfirmDelete(false); }
    finally { setBusy(false); }
  }

  const label = 'text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B3D2E]/40 p-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-900 dark:text-white">Unit {unit.tag_number}</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_TONE[unit.status]}`}>{UNIT_STATUS_LABEL[unit.status]}</span>
        </div>
        {unit.borrower_name && (
          <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 rounded-lg px-3 py-2">
            With <span className="font-semibold">{unit.borrower_name}</span>{unit.borrower_detail ? ` (${unit.borrower_detail})` : ''}
            {unit.issued_at ? ` since ${new Date(unit.issued_at).toLocaleDateString()}` : ''}. Record its return from Loans.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Tag number</label><input className={inputCls} value={tag} onChange={e => setTag(e.target.value)} /></div>
          <div><label className={label}>IMEI</label><input className={`${inputCls} font-mono`} value={imei} onChange={e => setImei(e.target.value)} /></div>
          <div><label className={label}>Serial</label><input className={inputCls} value={serial} onChange={e => setSerial(e.target.value)} /></div>
          <div>
            <label className={label}>Condition</label>
            <select className={inputCls} value={condition} onChange={e => setCondition(e.target.value as InvUnit['condition'])}>
              <option value="Good">Good</option><option value="Damaged">Damaged</option>
            </select>
          </div>
        </div>
        <div><label className={label}>Notes</label><input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} /></div>
        {(condition !== unit.condition || unit.status === 'in_store') && (
          <div><label className={label}>Reason (kept in the history)</label><input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Cracked screen" /></div>
        )}
        {error && <p className="text-sm text-[#B83232]">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button className={`${btnGhost} flex-1`} onClick={onClose}>Cancel</button>
          <button className={`${btnPrimary} flex-1`} disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save'}</button>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
          {unit.status === 'in_store' && (
            <button className="w-full text-sm font-semibold text-[#C8780A] hover:underline text-left" disabled={busy}
              onClick={() => { if (!reason.trim()) { setError('Enter a reason before writing this unit off.'); return; } save({ status: 'written_off' }); }}>
              Write this unit off
            </button>
          )}
          {(unit.status === 'lost' || unit.status === 'written_off') && (
            <button className="w-full text-sm font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline text-left" disabled={busy}
              onClick={() => save({ status: 'in_store' })}>
              Found it: put back in store
            </button>
          )}
          {unit.status !== 'issued' && (confirmDelete ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-600 dark:text-slate-300 flex-1">Delete this unit? Only for one entered by mistake.</span>
              <button className="font-semibold text-[#B83232]" onClick={remove} disabled={busy}>Delete</button>
              <button className="font-semibold text-slate-500" onClick={() => setConfirmDelete(false)}>Keep</button>
            </div>
          ) : (
            <button className="w-full text-sm font-semibold text-[#B83232] hover:underline text-left" onClick={() => setConfirmDelete(true)}>Delete (entered by mistake)</button>
          ))}
        </div>
      </div>
    </div>
  );
}
