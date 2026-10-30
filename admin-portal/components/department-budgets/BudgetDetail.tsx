'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import Link from 'next/link';
import type { DepartmentBudgetDetail, DepartmentBudgetItem } from '@/types/api';
import PopulationCalculator from './PopulationCalculator';

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Draft:               { bg: '#F1F5F9', color: '#64748B' },
  Submitted:           { bg: '#FFFBEB', color: '#D97706' },
  Approved:            { bg: '#DCFCE7', color: '#145C44' },
  'Changes Requested': { bg: '#EFF6FF', color: '#1D4ED8' },
  Rejected:            { bg: '#FEF2F2', color: '#DC2626' },
};

const EDITABLE_STATUSES = ['Draft', 'Changes Requested', 'Rejected'];

function fmtMoney(n: number | null) {
  if (n == null) return '—';
  return `GHS ${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';

type DraftItem = { id: string; category: string; description: string; quantity: string; unitPrice: string };

function toDraftItems(items: DepartmentBudgetItem[]): DraftItem[] {
  return items.map(i => ({
    id: i.id, category: i.category, description: i.description || '',
    // The API returns NUMERIC columns as fixed-scale strings (e.g. "1294.00")
    // — round-tripping through Number() first strips that to a plain "1294"
    // instead of showing the raw decimal formatting.
    quantity: String(Number(i.quantity)), unitPrice: i.unit_price != null ? String(Number(i.unit_price)) : '',
  }));
}

function rowAmount(row: DraftItem): number | null {
  const q = parseFloat(row.quantity);
  const p = parseFloat(row.unitPrice);
  if (!row.unitPrice.trim() || isNaN(p) || isNaN(q)) return null;
  return Math.round(q * p * 100) / 100;
}

export default function BudgetDetail({ apiClient, backHref, budgetId, canReview }: {
  apiClient: AxiosInstance; backHref: string; budgetId: string; canReview: boolean;
}) {
  const [budget, setBudget] = useState<DepartmentBudgetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

  const [reviewAction, setReviewAction] = useState<'approve' | 'changes' | 'reject' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [calculatorFor, setCalculatorFor] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await apiClient.get<DepartmentBudgetDetail>(`/api/department-budgets/${budgetId}`);
      setBudget(data);
      setDraftItems(toDraftItems(data.items));
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load budget.');
    } finally { setLoading(false); }
  }, [apiClient, budgetId]);

  useEffect(() => { load(); }, [load]);

  function addRow() {
    setDraftItems(rows => [...rows, { id: `new-${Date.now()}`, category: '', description: '', quantity: '1', unitPrice: '' }]);
  }
  function removeRow(id: string) {
    setDraftItems(rows => rows.filter(r => r.id !== id));
  }
  function updateRow(id: string, patch: Partial<DraftItem>) {
    setDraftItems(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  const draftTotal = draftItems.reduce((sum, r) => sum + (rowAmount(r) ?? 0), 0);

  async function saveItems() {
    setSaving(true); setError('');
    try {
      const items = draftItems
        .filter(r => r.category.trim())
        .map(r => ({
          category: r.category.trim(), description: r.description.trim() || undefined,
          quantity: parseFloat(r.quantity) || 0,
          unit_price: r.unitPrice.trim() ? parseFloat(r.unitPrice) : undefined,
        }));
      const { data } = await apiClient.put<DepartmentBudgetDetail>(`/api/department-budgets/${budgetId}`, { items });
      setBudget(data);
      setDraftItems(toDraftItems(data.items));
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function submitBudget() {
    setSaving(true); setError('');
    try {
      await saveItems();
      const { data } = await apiClient.post<DepartmentBudgetDetail>(`/api/department-budgets/${budgetId}/submit`);
      setBudget(data);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to submit.');
    } finally { setSaving(false); }
  }

  async function deleteBudget() {
    if (!confirm('Delete this draft budget? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/department-budgets/${budgetId}`);
      window.location.href = backHref;
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to delete.');
      setDeleting(false);
    }
  }

  async function exportPdf() {
    if (!budget) return;
    setExportingPdf(true);
    try {
      const response = await apiClient.get(`/api/department-budgets/${budgetId}/pdf`, { responseType: 'blob', timeout: 60000 });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Budget_${budget.department_name.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch {
      alert('Could not export PDF. Please try again.');
    } finally { setExportingPdf(false); }
  }

  async function exportExcel() {
    if (!budget) return;
    setExportingExcel(true);
    try {
      const XLSX = await import('xlsx');
      const headers = ['No.', 'Item / Activity Description', 'Description', 'Quantity', 'Unit Price (GHS)', 'Estimated Amt (GHS)'];
      const rows = budget.items.map((item, idx) => [
        idx + 1, item.category, item.description || '', Number(item.quantity),
        item.unit_price != null ? Number(item.unit_price) : '', item.amount != null ? Number(item.amount) : '',
      ]);
      const totalRow = ['', '', '', '', 'TOTAL', budget.total_amount != null ? Number(budget.total_amount) : ''];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows, totalRow]);
      ws['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Budget');
      XLSX.writeFile(wb, `Budget_${budget.department_name.replace(/[^A-Za-z0-9]+/g, '_')}.xlsx`);
    } catch {
      alert('Could not export Excel. Please try again.');
    } finally { setExportingExcel(false); }
  }

  function openReview(action: 'approve' | 'changes' | 'reject') {
    setReviewAction(action); setReviewNote(''); setReviewError('');
  }

  async function submitReview() {
    if (!reviewAction) return;
    if (reviewAction !== 'approve' && !reviewNote.trim()) {
      setReviewError(reviewAction === 'changes' ? 'A note explaining the requested changes is required.' : 'A reason is required to reject.');
      return;
    }
    setReviewing(true); setReviewError('');
    const endpoint = reviewAction === 'approve' ? 'approve' : reviewAction === 'changes' ? 'request-changes' : 'reject';
    try {
      const { data } = await apiClient.post<DepartmentBudgetDetail>(`/api/department-budgets/${budgetId}/${endpoint}`, { note: reviewNote.trim() || undefined });
      setBudget(data);
      setReviewAction(null);
    } catch (e: unknown) {
      setReviewError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to submit review.');
    } finally { setReviewing(false); }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#145C44', borderTopColor: 'transparent' }} />
    </div>
  );
  if (!budget) return <p className="text-sm text-red-600">{error || 'Budget not found.'}</p>;

  const editable = EDITABLE_STATUSES.includes(budget.status);
  const ss = STATUS_STYLES[budget.status] ?? { bg: '#F1F5F9', color: '#64748B' };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href={backHref} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Back</Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{budget.department_name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{budget.academic_year_name} Budget</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: ss.bg, color: ss.color }}>{budget.status}</span>
          <button onClick={exportExcel} disabled={exportingExcel}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50">
            {exportingExcel ? 'Exporting…' : 'Export Excel'}
          </button>
          <button onClick={exportPdf} disabled={exportingPdf}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50">
            {exportingPdf ? 'Exporting…' : 'Export PDF'}
          </button>
          {budget.status === 'Draft' && (
            <button onClick={deleteBudget} disabled={deleting}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

      {budget.review_note && (budget.status === 'Changes Requested' || budget.status === 'Rejected') && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: budget.status === 'Rejected' ? '#FEF2F2' : '#EFF6FF', color: budget.status === 'Rejected' ? '#991B1B' : '#1E40AF' }}>
          <p className="font-semibold mb-0.5">{budget.status === 'Rejected' ? 'Rejection reason' : 'Requested changes'}</p>
          <p>{budget.review_note}</p>
          {budget.reviewed_by_name && <p className="text-xs mt-1 opacity-70">— {budget.reviewed_by_name}, {fmtDate(budget.reviewed_at)}</p>}
        </div>
      )}
      {budget.status === 'Approved' && budget.reviewed_by_name && (
        <div className="rounded-xl px-4 py-3 text-sm bg-[#DCFCE7] text-[#14532D]">
          Approved by {budget.reviewed_by_name} on {fmtDate(budget.reviewed_at)}.
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">Line Items</h2>
          {editable && (
            <button onClick={addRow} className="text-xs font-semibold" style={{ color: '#145C44' }}>+ Add Item</button>
          )}
        </div>

        {editable ? (
          <div className="space-y-3">
            {draftItems.map(row => (
              <div key={row.id} className="rounded-lg border border-slate-100 dark:border-slate-700 p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Category (e.g. Answer Booklets)" value={row.category}
                    onChange={e => updateRow(row.id, { category: e.target.value })} />
                  <input className={inputCls} placeholder="Description (optional)" value={row.description}
                    onChange={e => updateRow(row.id, { description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-[110px_130px_1fr_auto_auto] gap-2 items-center">
                  <input className={inputCls} type="number" min="0" step="0.01" placeholder="Qty" value={row.quantity}
                    onChange={e => updateRow(row.id, { quantity: e.target.value })} />
                  <input className={inputCls} type="number" min="0" step="0.01" placeholder="Unit Price" value={row.unitPrice}
                    onChange={e => updateRow(row.id, { unitPrice: e.target.value })} />
                  <span className="text-sm font-mono text-slate-500 dark:text-slate-400 text-right sm:text-left">{fmtMoney(rowAmount(row))}</span>
                  <button onClick={() => setCalculatorFor(row.id)}
                    className="text-xs font-semibold px-2.5 py-2 rounded-lg whitespace-nowrap" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                    Calculate
                  </button>
                  <button onClick={() => removeRow(row.id)} className="text-xs font-semibold text-red-500 px-2 py-2">Remove</button>
                </div>
              </div>
            ))}
            {draftItems.length === 0 && <p className="text-sm text-slate-400">No items yet — click &quot;+ Add Item&quot;.</p>}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Total</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">{fmtMoney(draftTotal)}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {budget.items.map(item => (
              <div key={item.id} className="flex justify-between items-start py-1.5 border-b border-slate-50 dark:border-slate-700 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.category}</p>
                  {item.description && <p className="text-xs text-slate-400">{item.description}</p>}
                  <p className="text-xs text-slate-400">Qty {Number(item.quantity)}{item.unit_price != null ? ` × ${fmtMoney(item.unit_price)}` : ''}</p>
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-mono whitespace-nowrap">{fmtMoney(item.amount)}</span>
              </div>
            ))}
            {budget.items.length === 0 && <p className="text-sm text-slate-400">No items.</p>}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Total</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">{fmtMoney(budget.total_amount)}</span>
            </div>
          </div>
        )}
      </div>

      {editable && (
        <div className="flex justify-end gap-3">
          <button onClick={saveItems} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={submitBudget} disabled={saving || draftItems.filter(r => r.category.trim()).length === 0}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: '#145C44' }}>
            {saving ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      )}

      {canReview && budget.status === 'Submitted' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">Review This Budget</h2>
          <div className="flex gap-3">
            <button onClick={() => openReview('approve')}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#145C44' }}>
              Approve
            </button>
            <button onClick={() => openReview('changes')}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#1D4ED8' }}>
              Request Changes
            </button>
            <button onClick={() => openReview('reject')}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#DC2626' }}>
              Reject
            </button>
          </div>
        </div>
      )}

      {reviewAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/45 px-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-900 dark:text-white">
                {reviewAction === 'approve' ? 'Approve Budget' : reviewAction === 'changes' ? 'Request Changes' : 'Reject Budget'}
              </p>
              <button onClick={() => setReviewAction(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-sm">✕</button>
            </div>
            <div>
              <label className={labelCls}>
                {reviewAction === 'approve' ? 'Note (optional)' : reviewAction === 'changes' ? 'What needs to change? *' : 'Reason for rejection *'}
              </label>
              <textarea value={reviewNote} rows={3}
                onChange={e => { setReviewNote(e.target.value); setReviewError(''); }}
                placeholder={reviewAction === 'changes' ? 'e.g. Reduce textbook allocation, split equipment into two items…' : reviewAction === 'reject' ? 'e.g. Exceeds department allocation for this year…' : 'Optional comment…'}
                className={inputCls + ' resize-none'} />
            </div>
            {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setReviewAction(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600">
                Cancel
              </button>
              <button onClick={submitReview} disabled={reviewing}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: reviewAction === 'approve' ? '#145C44' : reviewAction === 'changes' ? '#1D4ED8' : '#DC2626' }}>
                {reviewing ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {calculatorFor && (
        <PopulationCalculator
          apiClient={apiClient}
          itemName={draftItems.find(r => r.id === calculatorFor)?.category || ''}
          onApply={(qty) => updateRow(calculatorFor, { quantity: String(qty) })}
          onClose={() => setCalculatorFor(null)}
        />
      )}
    </div>
  );
}
