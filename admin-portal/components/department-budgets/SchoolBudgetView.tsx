'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import type { BudgetEvent, BudgetTrack, DepartmentBudgetItem } from '@/types/api';
import {
  statusStyle, EVENT_LABELS, fmtMoney, fmtDate, describeApiError, downloadPdf, safeFileName,
  inputCls, labelCls, cardCls, btnGhost, btnPrimary,
} from './shared';

interface SchoolLine {
  id: string; category: string; description: string | null;
  quantity: number | string; unit_price: number | string | null; amount: number | string | null;
}
interface TrackBlock {
  track: BudgetTrack; label: string; compilation_status: string;
  compiled_by_name: string | null; submitted_at: string | null;
  head_reviewed_by_name: string | null; head_reviewed_at: string | null;
  total: number;
  budgets: { id: string; name: string; owner_kind: string; total: number; items: DepartmentBudgetItem[] }[];
  not_included: { id: string; name: string; status: string }[];
}
interface SchoolBudget {
  year: { id: string; name: string };
  status: 'Compiling' | 'Final';
  tracks: TrackBlock[];
  school_items: SchoolLine[];
  school_items_total: number;
  grand_total: number;
  blockers: string[];
  notes: string | null;
  finalised_by_name?: string | null;
  finalised_at?: string | null;
  events: BudgetEvent[];
  permissions: { can_edit: boolean; can_finalise: boolean; can_reopen: boolean };
}

const emptyLine = { category: '', description: '', quantity: '1', unit_price: '' };

function lineAmount(q: string, p: string) {
  const qn = parseFloat(q); const pn = parseFloat(p);
  if (!p.trim() || isNaN(qn) || isNaN(pn)) return null;
  return Math.round(qn * pn * 100) / 100;
}

// The single school budget for the year: each track's approved budget plus
// the Accountant's school-wide lines (utilities, maintenance, ...). The
// Accountant edits and finalises it; everyone else sees it read-only.
export default function SchoolBudgetView({ apiClient, onOpenBudget }: {
  apiClient: AxiosInstance; onOpenBudget?: (id: string) => void;
}) {
  const [data, setData] = useState<SchoolBudget | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(emptyLine);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [finalNotes, setFinalNotes] = useState('');
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');

  const load = useCallback(() => {
    setError('');
    apiClient.get<SchoolBudget>('/api/department-budgets/school-budget')
      .then(r => setData(r.data))
      .catch(e => setError(describeApiError(e, 'Could not load the school budget. Check your connection and try again.')));
  }, [apiClient]);
  useEffect(() => { load(); }, [load]);

  function startEdit(line: SchoolLine) {
    setEditingId(line.id);
    setForm({
      category: line.category, description: line.description ?? '',
      quantity: String(Number(line.quantity)), unit_price: line.unit_price != null ? String(Number(line.unit_price)) : '',
    });
  }

  async function saveLine() {
    if (!data) return;
    if (!form.category.trim()) { setError('Give the line an item name.'); return; }
    setSaving(true); setError(''); setNotice('');
    const body = {
      year: data.year.id, category: form.category.trim(), description: form.description.trim() || undefined,
      quantity: parseFloat(form.quantity) || 0, unit_price: form.unit_price.trim() ? parseFloat(form.unit_price) : undefined,
    };
    try {
      if (editingId) await apiClient.put(`/api/department-budgets/school-budget/items/${editingId}`, body);
      else await apiClient.post('/api/department-budgets/school-budget/items', body);
      setForm(emptyLine); setEditingId(null);
      load();
    } catch (e) {
      setError(describeApiError(e, 'Could not save the line. Check your connection and try again.'));
    } finally { setSaving(false); }
  }

  async function removeLine(id: string) {
    if (!data) return;
    setSaving(true); setError('');
    try {
      await apiClient.delete(`/api/department-budgets/school-budget/items/${id}`, { params: { year: data.year.id } });
      if (editingId === id) { setEditingId(null); setForm(emptyLine); }
      load();
    } catch (e) {
      setError(describeApiError(e, 'Could not remove the line.'));
    } finally { setSaving(false); }
  }

  async function finalise() {
    if (!data) return;
    setSaving(true); setError('');
    try {
      await apiClient.post('/api/department-budgets/school-budget/finalise', { year: data.year.id, notes: finalNotes.trim() || undefined });
      setConfirmFinal(false); setFinalNotes('');
      setNotice('The school budget is now final and locked.');
      load();
    } catch (e) {
      setError(describeApiError(e, 'Could not finalise the school budget.'));
    } finally { setSaving(false); }
  }

  async function reopen() {
    if (!data) return;
    setSaving(true); setError('');
    try {
      await apiClient.post('/api/department-budgets/school-budget/reopen', { year: data.year.id });
      setConfirmReopen(false);
      load();
    } catch (e) {
      setError(describeApiError(e, 'Could not reopen the school budget.'));
    } finally { setSaving(false); }
  }

  async function exportPdf() {
    if (!data) return;
    setExporting('pdf'); setError('');
    try {
      await downloadPdf(apiClient, `/api/department-budgets/school-budget/pdf?year=${data.year.id}`, `School_Budget_${safeFileName(data.year.name)}.pdf`);
    } catch { setError('Could not export the PDF. Try again in a moment.'); }
    finally { setExporting(''); }
  }

  async function exportExcel() {
    if (!data) return;
    setExporting('excel'); setError('');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const summary: (string | number)[][] = [
        [`School budget, ${data.year.name}`], [`Status: ${data.status}`], [],
        ['Section', 'Amount (GH₵)'],
        ...data.tracks.map(t => [`${t.label} budget`, Number(t.total)]),
        ['School-wide lines', Number(data.school_items_total)],
        ['GRAND TOTAL', Number(data.grand_total)],
      ];
      const ws = XLSX.utils.aoa_to_sheet(summary);
      ws['!cols'] = [{ wch: 30 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Summary');
      for (const t of data.tracks) {
        const rows: (string | number)[][] = [['Department or unit', 'Item', 'Description', 'Quantity', 'Unit Price (GH₵)', 'Amount (GH₵)']];
        for (const b of t.budgets) {
          for (const i of b.items) {
            rows.push([b.name, i.category, i.description ?? '', Number(i.quantity),
              i.unit_price != null ? Number(i.unit_price) : '', i.amount != null ? Number(i.amount) : '']);
          }
          rows.push(['', '', '', '', `Subtotal, ${b.name}`, Number(b.total)]);
        }
        rows.push([], ['', '', '', '', 'TOTAL', Number(t.total)]);
        const s = XLSX.utils.aoa_to_sheet(rows);
        s['!cols'] = [{ wch: 26 }, { wch: 28 }, { wch: 28 }, { wch: 10 }, { wch: 26 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, s, t.label.slice(0, 31));
      }
      const lines: (string | number)[][] = [['Item', 'Description', 'Quantity', 'Unit Price (GH₵)', 'Amount (GH₵)'],
        ...data.school_items.map(i => [i.category, i.description ?? '', Number(i.quantity),
          i.unit_price != null ? Number(i.unit_price) : '', i.amount != null ? Number(i.amount) : '']),
        [], ['', '', '', 'TOTAL', Number(data.school_items_total)]];
      const ls = XLSX.utils.aoa_to_sheet(lines);
      ls['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ls, 'School-wide lines');
      XLSX.writeFile(wb, `School_Budget_${safeFileName(data.year.name)}.xlsx`);
    } catch { setError('Could not export the Excel file. Try again in a moment.'); }
    finally { setExporting(''); }
  }

  if (!data) return error
    ? <p className="text-sm text-[#B83232]">{error}</p>
    : <p className="text-sm text-slate-400">Loading…</p>;

  const ss = statusStyle(data.status);
  const final = data.status === 'Final';
  const canEdit = data.permissions.can_edit;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">School budget</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{data.year.name}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ backgroundColor: ss.bg, color: ss.color }}>{data.status}</span>
          <button onClick={exportExcel} disabled={!!exporting} className={btnGhost}>{exporting === 'excel' ? 'Exporting…' : 'Export Excel'}</button>
          <button onClick={exportPdf} disabled={!!exporting} className={btnGhost}>{exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}</button>
        </div>
      </div>

      {error && <p className="text-sm text-[#B83232] bg-[#FBEAEA] dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
      {notice && !error && <p className="text-sm text-[#2D7A4F]">{notice}</p>}

      {final && (
        <div className="rounded-xl px-4 py-3 text-sm bg-[#E4F4EB] text-[#1F5A3A] dark:bg-green-900/20 dark:text-[#7FD1A8]">
          Finalised by {data.finalised_by_name ?? 'the Accountant'} on {fmtDate(data.finalised_at)}. It is locked; only an admin can reopen it.
          {data.notes && <p className="mt-1">{data.notes}</p>}
        </div>
      )}

      <div className={`${cardCls} p-4`}>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {data.tracks.map(t => (
              <tr key={t.track}>
                <td className="py-2 text-slate-700 dark:text-slate-200">
                  {t.label} budget
                  <span className="block text-xs text-slate-400">
                    {t.compilation_status === 'Approved'
                      ? `Approved by ${t.head_reviewed_by_name ?? 'the Head'} on ${fmtDate(t.head_reviewed_at)}`
                      : `Not approved yet (${t.compilation_status}), so not counted`}
                  </span>
                </td>
                <td className="py-2 text-right font-mono text-slate-700 dark:text-slate-200">{fmtMoney(t.total)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 text-slate-700 dark:text-slate-200">School-wide lines</td>
              <td className="py-2 text-right font-mono text-slate-700 dark:text-slate-200">{fmtMoney(data.school_items_total)}</td>
            </tr>
            <tr>
              <td className="pt-3 font-bold text-slate-900 dark:text-white">Grand total</td>
              <td className="pt-3 text-right font-bold font-mono text-slate-900 dark:text-white">{fmtMoney(data.grand_total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {data.tracks.map(t => t.budgets.length > 0 && (
        <div key={t.track} className={`${cardCls} overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-sm font-bold text-slate-800 dark:text-white">{t.label} budget</p>
            <p className="text-sm font-bold font-mono text-slate-900 dark:text-white">{fmtMoney(t.total)}</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {t.budgets.map(b => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-sm text-slate-800 dark:text-white">{b.name}
                  <span className="text-xs text-slate-400 ml-2">{b.items.length} line{b.items.length === 1 ? '' : 's'}</span>
                </span>
                <span className="text-sm font-mono text-slate-700 dark:text-slate-200">{fmtMoney(b.total)}</span>
                {onOpenBudget && !final && (
                  <button onClick={() => onOpenBudget(b.id)} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">
                    {canEdit ? 'Adjust prices' : 'Open'}
                  </button>
                )}
              </div>
            ))}
          </div>
          {t.not_included.length > 0 && (
            <p className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700">
              Left out because they were not accepted: {t.not_included.map(n => n.name).join(', ')}.
            </p>
          )}
        </div>
      ))}

      <div className={`${cardCls} p-4 space-y-3`}>
        <p className="text-sm font-bold text-slate-800 dark:text-white">School-wide lines</p>
        {data.school_items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {canEdit ? 'Add costs that belong to the whole school rather than one department, such as utilities or maintenance.' : 'No school-wide lines.'}
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {data.school_items.map(l => (
              <div key={l.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 dark:text-white">{l.category}</p>
                  <p className="text-xs text-slate-400">
                    Qty {Number(l.quantity)}{l.unit_price != null ? ` × ${fmtMoney(l.unit_price)}` : ''}{l.description ? `, ${l.description}` : ''}
                  </p>
                </div>
                <span className="text-sm font-mono text-slate-700 dark:text-slate-200">{fmtMoney(l.amount)}</span>
                {canEdit && (
                  <>
                    <button onClick={() => startEdit(l)} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">Edit</button>
                    <button onClick={() => removeLine(l.id)} disabled={saving} className="text-xs font-semibold text-[#B83232] hover:underline">Remove</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{editingId ? 'Edit line' : 'Add a line'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className={inputCls} placeholder="Item (e.g. Electricity)" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
              <input className={inputCls} placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-[110px_130px_1fr_auto] gap-2 items-center">
              <input className={inputCls} type="number" min="0" step="0.01" placeholder="Qty" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              <input className={inputCls} type="number" min="0" step="0.01" placeholder="Unit price" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} />
              <span className="text-sm font-mono text-slate-500">{fmtMoney(lineAmount(form.quantity, form.unit_price))}</span>
              <div className="flex gap-2">
                {editingId && <button onClick={() => { setEditingId(null); setForm(emptyLine); }} className={btnGhost}>Cancel</button>}
                <button onClick={saveLine} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : editingId ? 'Save' : 'Add'}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!final && canEdit && (
        <div className={`${cardCls} p-4 space-y-3`}>
          <p className="text-sm font-bold text-slate-800 dark:text-white">Finalise</p>
          {data.blockers.length > 0 ? (
            <ul className="space-y-1">
              {data.blockers.map(b => <li key={b} className="text-sm text-[#C8780A]">{b}.</li>)}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Finalising locks the school budget for {data.year.name} and records it as approved for the year. Only an admin can reopen it.
            </p>
          )}
          {confirmFinal ? (
            <div className="space-y-2">
              <label className={labelCls}>Note (optional)</label>
              <textarea rows={2} value={finalNotes} onChange={e => setFinalNotes(e.target.value)} className={`${inputCls} resize-none`} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmFinal(false)} className={btnGhost}>Cancel</button>
                <button onClick={finalise} disabled={saving} className={btnPrimary}>{saving ? 'Finalising…' : `Finalise at ${fmtMoney(data.grand_total)}`}</button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <button onClick={() => setConfirmFinal(true)} disabled={!data.permissions.can_finalise} className={btnPrimary}>Finalise school budget</button>
            </div>
          )}
        </div>
      )}

      {final && data.permissions.can_reopen && (
        <div className="flex justify-end gap-2">
          {confirmReopen ? (
            <>
              <button onClick={() => setConfirmReopen(false)} className={btnGhost}>Keep it final</button>
              <button onClick={reopen} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#B83232] disabled:opacity-50">Confirm reopen</button>
            </>
          ) : (
            <button onClick={() => setConfirmReopen(true)} className={btnGhost}>Reopen school budget</button>
          )}
        </div>
      )}

      {data.events.length > 0 && (
        <div className={`${cardCls} p-5 space-y-2`}>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">History</h2>
          <ol className="space-y-2">
            {data.events.map(ev => (
              <li key={ev.id} className="text-sm">
                <span className="text-slate-700 dark:text-slate-200">{EVENT_LABELS[ev.action] ?? ev.action}</span>
                {ev.note && <span className="text-slate-500 dark:text-slate-400">: {ev.note}</span>}
                <span className="text-xs text-slate-400"> by {ev.actor_label || 'unknown'}, {fmtDate(ev.created_at, true)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
