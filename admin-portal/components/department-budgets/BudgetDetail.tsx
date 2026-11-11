'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import Link from 'next/link';
import type { DepartmentBudgetDetail, DepartmentBudgetItem } from '@/types/api';
import PopulationCalculator from './PopulationCalculator';
import BulkExamCalculator from './BulkExamCalculator';
import {
  statusStyle, TRACK_LABEL, EVENT_LABELS, fmtMoney, fmtDate, describeApiError, downloadPdf, safeFileName,
  inputCls, labelCls, cardCls, btnGhost, btnPrimary,
} from './shared';

type DraftItem = {
  key: string; id: string | null; category: string; description: string; quantity: string; unitPrice: string;
  requestedQuantity: number | null; requestedUnitPrice: number | null; addedStage: string;
};
type ReviewAction = 'accept' | 'changes' | 'reject' | 'reopen' | 'withdraw' | null;

const STAGE_LABEL: Record<string, string> = { reviewer: 'reviewer', accountant: 'Accountant', owner: 'owner' };

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toDraftItems(items: DepartmentBudgetItem[]): DraftItem[] {
  return items.filter(i => !i.removed_at).map(i => ({
    key: i.id, id: i.id, category: i.category, description: i.description || '',
    // NUMERIC comes back as fixed-scale strings ("1294.00"); Number() tidies it.
    quantity: String(Number(i.quantity)), unitPrice: i.unit_price != null ? String(Number(i.unit_price)) : '',
    requestedQuantity: num(i.requested_quantity), requestedUnitPrice: num(i.requested_unit_price),
    addedStage: i.added_stage ?? 'owner',
  }));
}

function rowAmount(row: { quantity: string; unitPrice: string }): number | null {
  const q = parseFloat(row.quantity);
  const p = parseFloat(row.unitPrice);
  if (!row.unitPrice.trim() || isNaN(p) || isNaN(q)) return null;
  return Math.round(q * p * 100) / 100;
}

// "Requested 10 × GH₵ 5.00" when a later stage changed the owner's request.
function requestedNote(r: { requestedQuantity: number | null; requestedUnitPrice: number | null; addedStage: string },
                       quantity: number, unitPrice: number | null): string | null {
  if (r.addedStage !== 'owner') return `Added by the ${STAGE_LABEL[r.addedStage] ?? r.addedStage}`;
  if (r.requestedQuantity == null) return null;
  const changed = r.requestedQuantity !== quantity || (r.requestedUnitPrice ?? null) !== (unitPrice ?? null);
  if (!changed) return null;
  return `Requested ${r.requestedQuantity}${r.requestedUnitPrice != null ? ` × ${fmtMoney(r.requestedUnitPrice)}` : ''}`;
}

export default function BudgetDetail({ apiClient, budgetId, backHref, onBack }: {
  apiClient: AxiosInstance; budgetId: string; backHref?: string; onBack?: () => void;
}) {
  const [budget, setBudget] = useState<DepartmentBudgetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [dirty, setDirty] = useState(false);

  const [action, setAction] = useState<ReviewAction>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [calculatorFor, setCalculatorFor] = useState<string | null>(null);
  const [bulkCalculatorOpen, setBulkCalculatorOpen] = useState(false);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await apiClient.get<DepartmentBudgetDetail>(`/api/department-budgets/${budgetId}`);
      setBudget(data);
      setDraftItems(toDraftItems(data.items));
      setDirty(false);
    } catch (e: unknown) {
      setError(describeApiError(e, 'Could not load this budget. Check your connection and try again.'));
    } finally { setLoading(false); }
  }, [apiClient, budgetId]);

  useEffect(() => { load(); }, [load]);

  const stage = budget?.permissions?.editStage ?? null;
  const editable = !!stage;
  const accountantStage = stage === 'accountant';

  function addRow() {
    setDraftItems(rows => [...rows, {
      key: `new-${Date.now()}`, id: null, category: '', description: '', quantity: '1', unitPrice: '',
      requestedQuantity: null, requestedUnitPrice: null, addedStage: stage ?? 'owner',
    }]);
    setDirty(true);
  }
  function removeRow(key: string) {
    setDraftItems(rows => rows.filter(r => r.key !== key));
    setDirty(true);
  }
  function updateRow(key: string, patch: Partial<DraftItem>) {
    setDraftItems(rows => rows.map(r => r.key === key ? { ...r, ...patch } : r));
    setDirty(true);
  }

  const draftTotal = draftItems.reduce((sum, r) => sum + (rowAmount(r) ?? 0), 0);

  async function saveItems(): Promise<boolean> {
    if (!budget) return false;
    setSaving(true); setError(''); setNotice('');
    try {
      const items = draftItems
        .filter(r => r.category.trim())
        .map(r => ({
          id: r.id ?? undefined,
          category: r.category.trim(), description: r.description.trim() || undefined,
          quantity: parseFloat(r.quantity) || 0,
          unit_price: r.unitPrice.trim() ? parseFloat(r.unitPrice) : undefined,
        }));
      await apiClient.put(`/api/department-budgets/${budgetId}`, { items, updated_at: budget.updated_at });
      await load();
      setNotice('Changes saved.');
      return true;
    } catch (e: unknown) {
      setError(describeApiError(e, 'Could not save. Check your connection and try again.'));
      return false;
    } finally { setSaving(false); }
  }

  async function submitBudget() {
    if (dirty && !(await saveItems())) return;
    setSaving(true); setError('');
    try {
      await apiClient.post(`/api/department-budgets/${budgetId}/submit`);
      await load();
      setNotice('Budget submitted for review.');
    } catch (e: unknown) {
      setError(describeApiError(e, 'Could not submit. Check your connection and try again.'));
    } finally { setSaving(false); }
  }

  async function deleteBudget() {
    setSaving(true); setError('');
    try {
      await apiClient.delete(`/api/department-budgets/${budgetId}`);
      if (onBack) onBack(); else if (backHref) window.location.href = backHref;
    } catch (e: unknown) {
      setError(describeApiError(e, 'Could not delete this draft.'));
      setSaving(false);
    }
  }

  async function exportPdf() {
    if (!budget) return;
    setExporting('pdf'); setError('');
    try {
      await downloadPdf(apiClient, `/api/department-budgets/${budgetId}/pdf`, `Budget_${safeFileName(budget.department_name)}.pdf`);
    } catch {
      setError('Could not export the PDF. Try again in a moment.');
    } finally { setExporting(''); }
  }

  async function exportExcel() {
    if (!budget) return;
    setExporting('excel'); setError('');
    try {
      const XLSX = await import('xlsx');
      const active = budget.items.filter(i => !i.removed_at);
      const headers = ['No.', 'Item / Activity', 'Description', 'Quantity', 'Unit Price (GH₵)', 'Amount (GH₵)', 'Requested Qty', 'Requested Unit Price'];
      const rows = active.map((item, idx) => [
        idx + 1, item.category, item.description || '', Number(item.quantity),
        item.unit_price != null ? Number(item.unit_price) : '', item.amount != null ? Number(item.amount) : '',
        item.requested_quantity != null ? Number(item.requested_quantity) : '',
        item.requested_unit_price != null ? Number(item.requested_unit_price) : '',
      ]);
      const totalRow = ['', '', '', '', 'TOTAL', Number(budget.total_amount ?? 0), '', ''];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows, totalRow]);
      ws['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Budget');
      XLSX.writeFile(wb, `Budget_${safeFileName(budget.department_name)}.xlsx`);
    } catch {
      setError('Could not export the Excel file. Try again in a moment.');
    } finally { setExporting(''); }
  }

  function openAction(a: ReviewAction) {
    setAction(a); setActionNote(''); setActionError('');
  }

  async function runAction() {
    if (!action) return;
    if ((action === 'changes' || action === 'reject') && !actionNote.trim()) {
      setActionError(action === 'changes' ? 'Say what needs to change.' : 'Give a reason for rejecting.');
      return;
    }
    if (dirty && (action === 'accept') && !(await saveItems())) return;
    const endpoint = { accept: 'accept', changes: 'request-changes', reject: 'reject', reopen: 'reopen', withdraw: 'withdraw' }[action];
    setActing(true); setActionError('');
    try {
      await apiClient.post(`/api/department-budgets/${budgetId}/${endpoint}`, { note: actionNote.trim() || undefined });
      setAction(null);
      await load();
    } catch (e: unknown) {
      setActionError(describeApiError(e, 'Could not complete that. Check your connection and try again.'));
    } finally { setActing(false); }
  }

  if (loading && !budget) return (
    <div className="flex py-16">
      <div className="w-7 h-7 rounded-full border-4 border-b-transparent animate-spin" style={{ borderColor: '#145C44', borderBottomColor: 'transparent' }} />
    </div>
  );
  if (!budget) return <p className="text-sm text-[#B83232]">{error || 'Budget not found.'}</p>;

  const p = budget.permissions;
  const ss = statusStyle(budget.status);
  const trackLabel = TRACK_LABEL[budget.track] ?? budget.track;
  const removedItems = budget.items.filter(i => i.removed_at);
  const requestedTotal = Number(budget.requested_total ?? 0);
  const backButton = onBack
    ? <button type="button" onClick={onBack} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; All budgets</button>
    : backHref ? <Link href={backHref} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; All budgets</Link> : null;

  const actionTitle: Record<string, string> = {
    accept: 'Accept into the compiled budget', changes: 'Send back for changes', reject: 'Reject budget',
    reopen: 'Reopen for review', withdraw: 'Withdraw submission',
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          {backButton}
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{budget.department_name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {budget.academic_year_name} budget, {trackLabel} track
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ backgroundColor: ss.bg, color: ss.color }}>{budget.status}</span>
          <button onClick={exportExcel} disabled={!!exporting} className={btnGhost}>{exporting === 'excel' ? 'Exporting…' : 'Export Excel'}</button>
          <button onClick={exportPdf} disabled={!!exporting} className={btnGhost}>{exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}</button>
          {p?.canDelete && (confirmDelete ? (
            <>
              <button onClick={deleteBudget} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#B83232] disabled:opacity-50">Confirm delete</button>
              <button onClick={() => setConfirmDelete(false)} className={btnGhost}>Keep</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className={btnGhost}>Delete draft</button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-[#B83232] bg-[#FBEAEA] dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
      {notice && !error && <p className="text-sm text-[#2D7A4F]">{notice}</p>}

      {budget.review_note && (budget.status === 'Changes Requested' || budget.status === 'Rejected') && (
        <div className="rounded-xl px-4 py-3 text-sm border-l-4"
          style={{ backgroundColor: budget.status === 'Rejected' ? '#FBEAEA' : '#FEF3DC', borderColor: budget.status === 'Rejected' ? '#B83232' : '#C8780A', color: '#2A2620' }}>
          <p className="font-semibold mb-0.5">{budget.status === 'Rejected' ? 'Reason for rejection' : 'Changes requested'}</p>
          <p>{budget.review_note}</p>
          {budget.reviewed_by_name && <p className="text-xs mt-1 text-slate-500">{budget.reviewed_by_name}, {fmtDate(budget.reviewed_at, true)}</p>}
        </div>
      )}
      {(budget.status === 'Accepted' || budget.status === 'Approved') && (
        <div className="rounded-xl px-4 py-3 text-sm bg-[#E4F4EB] text-[#1F5A3A] dark:bg-green-900/20 dark:text-[#7FD1A8]">
          Accepted into the {trackLabel} budget{budget.reviewed_by_name ? ` by ${budget.reviewed_by_name}` : ''}{budget.reviewed_at ? ` on ${fmtDate(budget.reviewed_at)}` : ''}.
          {budget.compilation_status && budget.compilation_status !== 'Compiling' && (
            <span> The {trackLabel} budget is now {budget.compilation_status === 'Submitted' ? 'with the Head for approval' : budget.compilation_status === 'Approved' ? 'approved by the Head' : 'returned by the Head'}.</span>
          )}
        </div>
      )}
      {budget.school_budget_status === 'Final' && (
        <p className="text-sm text-slate-500 dark:text-slate-400">The school budget for this year is final, so this budget is locked.</p>
      )}
      {stage === 'reviewer' && (
        <p className="text-sm text-slate-500 dark:text-slate-400">You are reviewing this budget. Changes you make are shown to the department against what they requested.</p>
      )}
      {accountantStage && (
        <p className="text-sm text-slate-500 dark:text-slate-400">You can adjust quantities and prices or remove lines. Add school-wide lines on the school budget.</p>
      )}

      <div className={`${cardCls} p-5 space-y-4`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">Line items</h2>
          {editable && !accountantStage && (
            <div className="flex items-center gap-3">
              <button onClick={() => setBulkCalculatorOpen(true)} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">
                Calculate whole exam
              </button>
              <button onClick={addRow} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">Add item</button>
            </div>
          )}
        </div>

        {editable ? (
          <div className="space-y-3">
            {draftItems.map(row => {
              const note = requestedNote(row, parseFloat(row.quantity) || 0, row.unitPrice.trim() ? parseFloat(row.unitPrice) : null);
              return (
                <div key={row.key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="Item (e.g. Answer booklets)" value={row.category}
                      disabled={accountantStage} onChange={e => updateRow(row.key, { category: e.target.value })} />
                    <input className={inputCls} placeholder="Description (optional)" value={row.description}
                      disabled={accountantStage} onChange={e => updateRow(row.key, { description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-[110px_130px_1fr_auto_auto] gap-2 items-center">
                    <input className={inputCls} type="number" min="0" step="0.01" placeholder="Qty" value={row.quantity}
                      onChange={e => updateRow(row.key, { quantity: e.target.value })} />
                    <input className={inputCls} type="number" min="0" step="0.01" placeholder="Unit price" value={row.unitPrice}
                      onChange={e => updateRow(row.key, { unitPrice: e.target.value })} />
                    <span className="text-sm font-mono text-slate-500 dark:text-slate-400 text-right sm:text-left">{fmtMoney(rowAmount(row))}</span>
                    {!accountantStage ? (
                      <button onClick={() => setCalculatorFor(row.key)}
                        className="text-xs font-semibold px-2.5 py-2 rounded-lg whitespace-nowrap bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        Calculate
                      </button>
                    ) : <span />}
                    <button onClick={() => removeRow(row.key)} className="text-xs font-semibold text-[#B83232] px-2 py-2">Remove</button>
                  </div>
                  {note && <p className="text-xs text-[#C8780A]">{note}</p>}
                </div>
              );
            })}
            {draftItems.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No lines yet. Use Add item to list what this budget needs.</p>}
            {!accountantStage && (
              <button onClick={addRow} className="w-full py-2 rounded-lg text-xs font-semibold border border-dashed border-[#145C44] text-[#145C44] dark:border-[#2ab289] dark:text-[#2ab289]">
                Add item
              </button>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Total</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{fmtMoney(draftTotal)}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {budget.items.filter(i => !i.removed_at).map(item => {
              const note = requestedNote(
                { requestedQuantity: num(item.requested_quantity), requestedUnitPrice: num(item.requested_unit_price), addedStage: item.added_stage ?? 'owner' },
                Number(item.quantity), num(item.unit_price));
              return (
                <div key={item.id} className="flex justify-between items-start py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.category}</p>
                    {item.description && <p className="text-xs text-slate-400">{item.description}</p>}
                    <p className="text-xs text-slate-400">Qty {Number(item.quantity)}{item.unit_price != null ? ` × ${fmtMoney(item.unit_price)}` : ''}</p>
                    {note && <p className="text-xs text-[#C8780A]">{note}</p>}
                  </div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-mono whitespace-nowrap">{fmtMoney(item.amount)}</span>
                </div>
              );
            })}
            {budget.items.filter(i => !i.removed_at).length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">This budget has no lines.</p>}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Total</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{fmtMoney(budget.total_amount)}</span>
            </div>
          </div>
        )}
        {requestedTotal > 0 && Math.abs(requestedTotal - Number(budget.total_amount)) > 0.005 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">Originally requested: {fmtMoney(requestedTotal)}</p>
        )}
      </div>

      {removedItems.length > 0 && (
        <div className={`${cardCls} p-5 space-y-2`}>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">Removed at review</h2>
          {removedItems.map(item => (
            <div key={item.id} className="flex justify-between items-start text-sm">
              <div>
                <p className="text-slate-500 line-through">{item.category}</p>
                <p className="text-xs text-slate-400">Removed by the {STAGE_LABEL[item.removed_stage ?? ''] ?? 'reviewer'}</p>
              </div>
              <span className="font-mono text-slate-400 line-through">{fmtMoney(item.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {(editable || p?.canSubmit || p?.canWithdraw || p?.canReview || p?.canReopen) && (
        <div className="flex justify-end gap-2 flex-wrap">
          {editable && (
            <button onClick={saveItems} disabled={saving || !dirty}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
          {p?.canSubmit && (
            <button onClick={submitBudget} disabled={saving || draftItems.filter(r => r.category.trim()).length === 0} className={btnPrimary}>
              {saving ? 'Submitting…' : 'Submit for review'}
            </button>
          )}
          {p?.canWithdraw && <button onClick={() => openAction('withdraw')} className={btnGhost}>Withdraw submission</button>}
          {p?.canReopen && <button onClick={() => openAction('reopen')} className={btnGhost}>Reopen for review</button>}
          {p?.canReview && (
            <>
              <button onClick={() => openAction('reject')} className="px-4 py-2 rounded-lg text-sm font-semibold border border-[#B83232] text-[#B83232]">Reject</button>
              <button onClick={() => openAction('changes')} className="px-4 py-2 rounded-lg text-sm font-semibold border border-[#C8780A] text-[#C8780A]">Send back for changes</button>
              <button onClick={() => openAction('accept')} className={btnPrimary}>Accept</button>
            </>
          )}
        </div>
      )}

      {action && (
        <div className={`${cardCls} p-5 space-y-3`}>
          <p className="font-bold text-slate-900 dark:text-white">{actionTitle[action]}</p>
          {action === 'accept' && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              The budget is added to the {trackLabel} budget as it stands{dirty ? ', including your unsaved changes' : ''}. You can reopen it until you submit the {trackLabel} budget to the Head.
            </p>
          )}
          <div>
            <label className={labelCls}>
              {action === 'changes' ? 'What needs to change? (required)' : action === 'reject' ? 'Reason for rejecting (required)' : 'Note (optional)'}
            </label>
            <textarea value={actionNote} rows={3} onChange={e => { setActionNote(e.target.value); setActionError(''); }}
              className={`${inputCls} resize-none`} />
          </div>
          {actionError && <p className="text-sm text-[#B83232]">{actionError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAction(null)} className={btnGhost}>Cancel</button>
            <button onClick={runAction} disabled={acting}
              className={action === 'reject' ? 'px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#B83232] disabled:opacity-50' : btnPrimary}>
              {acting ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      {budget.events && budget.events.length > 0 && (
        <div className={`${cardCls} p-5 space-y-2`}>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">History</h2>
          <ol className="space-y-2">
            {budget.events.map(ev => (
              <li key={ev.id} className="text-sm">
                <span className="text-slate-700 dark:text-slate-200">{EVENT_LABELS[ev.action] ?? ev.action}</span>
                <span className="text-xs text-slate-400"> by {ev.actor_label || 'unknown'}, {fmtDate(ev.created_at, true)}</span>
                {ev.note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ev.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {calculatorFor && (
        <PopulationCalculator
          apiClient={apiClient}
          itemName={draftItems.find(r => r.key === calculatorFor)?.category || ''}
          onApply={(qty) => updateRow(calculatorFor, { quantity: String(qty) })}
          onClose={() => setCalculatorFor(null)}
        />
      )}

      {bulkCalculatorOpen && (
        <BulkExamCalculator
          apiClient={apiClient}
          onApply={(qty, category) => {
            setDraftItems(rows => [...rows, {
              key: `new-${Date.now()}`, id: null, category, description: '', quantity: String(qty), unitPrice: '',
              requestedQuantity: null, requestedUnitPrice: null, addedStage: stage ?? 'owner',
            }]);
            setDirty(true);
            setBulkCalculatorOpen(false);
          }}
          onClose={() => setBulkCalculatorOpen(false)}
        />
      )}
    </div>
  );
}
