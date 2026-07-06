'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

const FUND_SOURCES = ['Capitation Grant', 'PTA Fund', 'IGF', 'Other'];

const EXPENDITURE_HEADS = [
  'Teaching & Learning Materials',
  'Minor Repairs & Maintenance',
  'Sports & Cultural Activities',
  'School Management & Office',
  'Teacher In-Service Training',
  'Enrollment Drive & Community Mobilisation',
  'Support for Needy Pupils',
  'Community-School Relations',
];

interface AcademicYear { id: string; name: string; is_current: boolean; }

interface Cashbook {
  id: string; school_id: string; academic_year_id: string; academic_year_name: string;
  fund_source: string; opening_balance: string; notes: string | null; created_at: string;
}

interface Entry {
  id: string; cashbook_id: string; entry_date: string;
  entry_type: 'receipt' | 'payment'; particulars: string;
  expenditure_head: string | null; voucher_ref: string | null;
  amount: string; receipt_url: string | null; created_at: string;
  runningBalance?: number;
}

interface EntryForm {
  entry_date: string; entry_type: 'receipt' | 'payment';
  particulars: string; expenditure_head: string;
  voucher_ref: string; amount: string; receipt_data: string;
}

const EMPTY_ENTRY: EntryForm = {
  entry_date: '', entry_type: 'receipt',
  particulars: '', expenditure_head: '', voucher_ref: '', amount: '', receipt_data: '',
};

function today() { return new Date().toISOString().slice(0, 10); }

function fmt(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function compressToBase64(file: File, maxPx = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function CashBookPage() {
  const [cashbooks, setCashbooks]   = useState<Cashbook[]>([]);
  const [years, setYears]           = useState<AcademicYear[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [entries, setEntries]       = useState<Entry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [pageError, setPageError]   = useState('');

  // New cashbook modal
  const [showNewCB, setShowNewCB]   = useState(false);
  const [newCBForm, setNewCBForm]   = useState({ academic_year_id: '', fund_source: 'Capitation Grant', opening_balance: '0', notes: '' });
  const [savingCB, setSavingCB]     = useState(false);
  const [cbError, setCBError]       = useState('');

  // Entry modal
  const [showEntry, setShowEntry]     = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [entryForm, setEntryForm]     = useState<EntryForm>(EMPTY_ENTRY);
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryError, setEntryError]   = useState('');
  const receiptRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterType, setFilterType]   = useState<'all' | 'receipt' | 'payment'>('all');
  const [filterMonth, setFilterMonth] = useState('');

  const loadCashbooks = useCallback(async () => {
    setLoading(true);
    try {
      const [cbRes, yrRes] = await Promise.all([
        api.get<Cashbook[]>('/api/primary/cashbook'),
        api.get<AcademicYear[]>('/api/academic-years'),
      ]);
      setCashbooks(cbRes.data);
      setYears(yrRes.data);
      if (cbRes.data.length > 0) setSelectedId(id => id || cbRes.data[0].id);
    } catch { setPageError('Failed to load data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCashbooks(); }, [loadCashbooks]);

  const loadEntries = useCallback(async () => {
    if (!selectedId) return;
    setLoadingEntries(true);
    try {
      const params: Record<string, string> = {};
      if (filterMonth) params.month = filterMonth;
      const { data } = await api.get<Entry[]>(
        `/api/primary/cashbook/${selectedId}/entries`,
        { params }
      );
      setEntries(data);
    } catch { setPageError('Failed to load entries.'); }
    finally { setLoadingEntries(false); }
  }, [selectedId, filterMonth]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const currentCB = cashbooks.find(c => c.id === selectedId);
  const opening   = parseFloat(currentCB?.opening_balance ?? '0');

  // Compute running balance and apply type filter
  let running = opening;
  const displayEntries = entries
    .map(e => {
      const amt = parseFloat(e.amount);
      if (e.entry_type === 'receipt') running += amt;
      else running -= amt;
      return { ...e, runningBalance: running };
    })
    .filter(e => filterType === 'all' || e.entry_type === filterType);

  const totalReceipts = entries
    .filter(e => e.entry_type === 'receipt')
    .reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalPayments = entries
    .filter(e => e.entry_type === 'payment')
    .reduce((s, e) => s + parseFloat(e.amount), 0);
  const closingBalance = opening + totalReceipts - totalPayments;

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function createCashbook() {
    if (!newCBForm.fund_source) { setCBError('Fund source is required.'); return; }
    setSavingCB(true); setCBError('');
    try {
      const { data } = await api.post<Cashbook>('/api/primary/cashbook', {
        ...newCBForm,
        academic_year_id: newCBForm.academic_year_id || null,
        opening_balance: parseFloat(newCBForm.opening_balance) || 0,
      });
      setCashbooks(prev => [data, ...prev]);
      setSelectedId(data.id);
      setShowNewCB(false);
      setNewCBForm({ academic_year_id: '', fund_source: 'Capitation Grant', opening_balance: '0', notes: '' });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCBError(msg ?? 'Failed to create cashbook.');
    } finally { setSavingCB(false); }
  }

  function openAdd() {
    setEditingEntry(null);
    setEntryForm({ ...EMPTY_ENTRY, entry_date: today() });
    setEntryError('');
    setShowEntry(true);
  }

  function openEdit(e: Entry) {
    setEditingEntry(e);
    setEntryForm({
      entry_date: e.entry_date.slice(0, 10),
      entry_type: e.entry_type,
      particulars: e.particulars,
      expenditure_head: e.expenditure_head ?? '',
      voucher_ref: e.voucher_ref ?? '',
      amount: e.amount,
      receipt_data: '',
    });
    setEntryError('');
    setShowEntry(true);
  }

  async function saveEntry() {
    if (!entryForm.entry_date || !entryForm.particulars || !entryForm.amount) {
      setEntryError('Date, particulars and amount are required.'); return;
    }
    if (entryForm.entry_type === 'payment' && !entryForm.expenditure_head) {
      setEntryError('Select an expenditure head for payments.'); return;
    }
    const amt = parseFloat(entryForm.amount);
    if (isNaN(amt) || amt <= 0) { setEntryError('Amount must be a positive number.'); return; }
    setSavingEntry(true); setEntryError('');
    try {
      if (editingEntry) {
        await api.put(`/api/primary/cashbook/${selectedId}/entries/${editingEntry.id}`, entryForm);
      } else {
        await api.post(`/api/primary/cashbook/${selectedId}/entries`, entryForm);
      }
      setShowEntry(false);
      await loadEntries();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setEntryError(msg ?? 'Save failed.');
    } finally { setSavingEntry(false); }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    try {
      await api.delete(`/api/primary/cashbook/${selectedId}/entries/${id}`);
      await loadEntries();
    } catch { setPageError('Delete failed.'); }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-show { display: block !important; }
          body { font-size: 12px; color: #000; }
          .print-table th, .print-table td { border: 1px solid #ccc; padding: 4px 6px; }
          .print-table { border-collapse: collapse; width: 100%; }
        }
        @media screen { .print-show { display: none; } }
      `}</style>

      {/* Print header */}
      <div className="print-show">
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            {currentCB?.fund_source} Cash Book — {currentCB?.academic_year_name}
          </h2>
          {filterMonth && <p style={{ fontSize: 11, color: '#555', margin: '2px 0' }}>Month: {filterMonth}</p>}
        </div>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cash Book</h1>
          <p className="text-sm text-slate-500 mt-0.5">Record and balance school fund transactions.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedId && (
            <button onClick={() => window.print()}
              className="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Return
            </button>
          )}
          <button
            onClick={() => { setCBError(''); setNewCBForm({ academic_year_id: '', fund_source: 'Capitation Grant', opening_balance: '0', notes: '' }); setShowNewCB(true); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5"
            style={{ backgroundColor: '#15803D' }}>
            + New Cashbook
          </button>
        </div>
      </div>

      {pageError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 no-print">{pageError}</p>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : cashbooks.length === 0 ? (
        /* Empty state */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-green-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <p className="text-slate-800 font-semibold text-base mb-1">No cashbooks yet</p>
          <p className="text-sm text-slate-400 mb-5">Create your first cashbook to start recording Capitation Grant transactions.</p>
          <button
            onClick={() => { setCBError(''); setShowNewCB(true); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#15803D' }}>
            Create Cashbook
          </button>
        </div>
      ) : (
        <>
          {/* Cashbook selector + filters */}
          <div className="flex flex-wrap gap-3 items-center no-print">
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setFilterMonth(''); setFilterType('all'); }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-semibold text-slate-800 max-w-xs">
              {cashbooks.map(cb => (
                <option key={cb.id} value={cb.id}>
                  {cb.fund_source}{cb.academic_year_name ? ` — ${cb.academic_year_name}` : ''}
                </option>
              ))}
            </select>

            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as typeof filterType)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="all">All entries</option>
              <option value="receipt">Receipts only</option>
              <option value="payment">Payments only</option>
            </select>

            <input
              type="month"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />

            {filterMonth && (
              <button onClick={() => setFilterMonth('')}
                className="text-xs text-slate-400 hover:text-slate-600 underline">
                Clear month
              </button>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Opening Balance', value: opening, cls: 'text-slate-800' },
              { label: 'Total Receipts',  value: totalReceipts, cls: 'text-green-700' },
              { label: 'Total Payments',  value: totalPayments, cls: 'text-red-600' },
              { label: 'Closing Balance', value: closingBalance, cls: closingBalance >= 0 ? 'text-green-700' : 'text-red-600' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{card.label}</p>
                <p className={`text-lg font-bold mt-1 font-mono ${card.cls}`}>
                  GH¢ {fmt(card.value)}
                </p>
              </div>
            ))}
          </div>

          {/* Ledger table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between no-print">
              <p className="text-sm font-semibold text-slate-700">
                {currentCB?.fund_source}
                {currentCB?.academic_year_name && <span className="text-slate-400 font-normal"> — {currentCB.academic_year_name}</span>}
                {currentCB?.notes && <span className="ml-2 text-slate-400 font-normal text-xs">({currentCB.notes})</span>}
              </p>
              <button onClick={openAdd}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: '#15803D' }}>
                + Add Entry
              </button>
            </div>

            {loadingEntries ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin"
                  style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm print-table">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Date</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Particulars</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Voucher Ref</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Expenditure Head</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Receipts (GH¢)</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Payments (GH¢)</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Balance (GH¢)</th>
                      <th className="px-3 py-2.5 no-print" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Opening balance row */}
                    <tr className="bg-slate-50/70">
                      <td className="px-3 py-2 text-xs text-slate-400">—</td>
                      <td className="px-3 py-2 text-xs font-semibold text-slate-600" colSpan={5}>
                        Opening Balance b/f
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-800 text-xs">{fmt(opening)}</td>
                      <td className="no-print" />
                    </tr>

                    {displayEntries.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-400 text-sm no-print">
                          No entries found. Click &quot;Add Entry&quot; to begin.
                        </td>
                      </tr>
                    )}

                    {displayEntries.map(e => (
                      <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs">{fmtDate(e.entry_date)}</td>
                        <td className="px-3 py-2.5 text-slate-800 max-w-xs">
                          <div className="truncate">{e.particulars}</div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs font-mono whitespace-nowrap">{e.voucher_ref || '—'}</td>
                        <td className="px-3 py-2.5">
                          {e.entry_type === 'payment' && e.expenditure_head ? (
                            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                              {e.expenditure_head}
                            </span>
                          ) : e.entry_type === 'receipt' ? (
                            <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full font-medium">
                              Receipt
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-green-700">
                          {e.entry_type === 'receipt' ? fmt(parseFloat(e.amount)) : ''}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-red-600">
                          {e.entry_type === 'payment' ? fmt(parseFloat(e.amount)) : ''}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${(e.runningBalance ?? 0) >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                          {fmt(e.runningBalance ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 no-print">
                          <div className="flex items-center gap-1.5">
                            {e.receipt_url && (
                              <a href={e.receipt_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline whitespace-nowrap">Receipt</a>
                            )}
                            <button onClick={() => openEdit(e)}
                              className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 whitespace-nowrap">
                              Edit
                            </button>
                            <button onClick={() => deleteEntry(e.id)}
                              className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 whitespace-nowrap">
                              Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* Closing balance row */}
                    {entries.length > 0 && (
                      <tr className="bg-slate-50 border-t-2 border-slate-300">
                        <td className="px-3 py-2 text-xs text-slate-400">—</td>
                        <td className="px-3 py-2 text-xs font-bold text-slate-700">Closing Balance c/f</td>
                        <td colSpan={2} />
                        <td className="px-3 py-2 text-right font-mono font-bold text-green-700 text-sm">
                          {fmt(opening + totalReceipts)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-red-600 text-sm">
                          {fmt(totalPayments + Math.max(0, closingBalance))}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-bold text-sm ${closingBalance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                          {fmt(closingBalance)}
                        </td>
                        <td className="no-print" />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Expenditure breakdown */}
          {entries.some(e => e.entry_type === 'payment') && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Payments by GES Expenditure Head</h3>
              <div className="space-y-3">
                {EXPENDITURE_HEADS.map(head => {
                  const total = entries
                    .filter(e => e.entry_type === 'payment' && e.expenditure_head === head)
                    .reduce((s, e) => s + parseFloat(e.amount), 0);
                  if (total === 0) return null;
                  const pct = totalPayments > 0 ? (total / totalPayments) * 100 : 0;
                  return (
                    <div key={head}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-medium">{head}</span>
                        <span className="font-mono font-semibold text-slate-800">GH¢ {fmt(total)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: '#15803D' }} />
                      </div>
                    </div>
                  );
                })}
                {EXPENDITURE_HEADS.every(h => entries.filter(e => e.entry_type === 'payment' && e.expenditure_head === h).length === 0) && (
                  <p className="text-sm text-slate-400 text-center py-4">No categorised payments yet.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── New Cashbook Modal ─────────────────────────────────────────────────── */}
      {showNewCB && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">New Cashbook</h2>
              <button onClick={() => setShowNewCB(false)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Academic Year</label>
                <select className={inputCls} value={newCBForm.academic_year_id}
                  onChange={e => setNewCBForm(f => ({ ...f, academic_year_id: e.target.value }))}>
                  <option value="">— Not linked to a specific year —</option>
                  {years.map(y => (
                    <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Fund Source *</label>
                <select className={inputCls} value={newCBForm.fund_source}
                  onChange={e => setNewCBForm(f => ({ ...f, fund_source: e.target.value }))}>
                  {FUND_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Opening Balance (GH¢)</label>
                <input type="number" min="0" step="0.01" className={inputCls}
                  value={newCBForm.opening_balance}
                  onChange={e => setNewCBForm(f => ({ ...f, opening_balance: e.target.value }))} />
                <p className="text-xs text-slate-400 mt-0.5">Balance carried forward from previous period, if any.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Notes (optional)</label>
                <input className={inputCls} placeholder="e.g. 2024/2025 Capitation Grant"
                  value={newCBForm.notes}
                  onChange={e => setNewCBForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {cbError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{cbError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowNewCB(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={createCashbook} disabled={savingCB}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#15803D' }}>
                {savingCB ? 'Creating…' : 'Create Cashbook'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Entry Modal ─────────────────────────────────────────────── */}
      {showEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="font-bold text-slate-900">{editingEntry ? 'Edit Entry' : 'Add Entry'}</h2>
              <button onClick={() => setShowEntry(false)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Receipt / Payment toggle */}
              <div className="flex rounded-xl overflow-hidden border border-slate-200">
                {(['receipt', 'payment'] as const).map(t => (
                  <button key={t}
                    onClick={() => setEntryForm(f => ({ ...f, entry_type: t, expenditure_head: '' }))}
                    className="flex-1 py-2.5 text-sm font-semibold transition-colors capitalize"
                    style={{
                      backgroundColor: entryForm.entry_type === t ? (t === 'receipt' ? '#15803D' : '#DC2626') : '#F8FAFC',
                      color: entryForm.entry_type === t ? '#fff' : '#64748B',
                    }}>
                    {t === 'receipt' ? '+ Receipt' : '− Payment'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Date *</label>
                  <input type="date" className={inputCls} value={entryForm.entry_date}
                    onChange={e => setEntryForm(f => ({ ...f, entry_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (GH¢) *</label>
                  <input type="number" min="0.01" step="0.01" placeholder="0.00" className={inputCls}
                    value={entryForm.amount}
                    onChange={e => setEntryForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Particulars *</label>
                <input className={inputCls}
                  placeholder={entryForm.entry_type === 'receipt'
                    ? 'e.g. Capitation Grant disbursement — Term 1'
                    : 'e.g. Purchase of exercise books'}
                  value={entryForm.particulars}
                  onChange={e => setEntryForm(f => ({ ...f, particulars: e.target.value }))} />
              </div>

              {entryForm.entry_type === 'payment' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">GES Expenditure Head *</label>
                  <select className={inputCls} value={entryForm.expenditure_head}
                    onChange={e => setEntryForm(f => ({ ...f, expenditure_head: e.target.value }))}>
                    <option value="">Select category…</option>
                    {EXPENDITURE_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Voucher / Cheque Ref</label>
                <input className={inputCls} placeholder="e.g. PV-001 or CHQ-00456"
                  value={entryForm.voucher_ref}
                  onChange={e => setEntryForm(f => ({ ...f, voucher_ref: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Receipt / Invoice Image (optional)
                </label>
                <input ref={receiptRef} type="file" accept="image/*" className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const b64 = await compressToBase64(file);
                    setEntryForm(f => ({ ...f, receipt_data: b64 }));
                    if (receiptRef.current) receiptRef.current.value = '';
                  }} />
                <div className="flex items-center gap-2">
                  <button onClick={() => receiptRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
                    {entryForm.receipt_data ? '✓ Image selected' : 'Upload Receipt Image'}
                  </button>
                  {entryForm.receipt_data && (
                    <button onClick={() => setEntryForm(f => ({ ...f, receipt_data: '' }))}
                      className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  )}
                  {editingEntry?.receipt_url && !entryForm.receipt_data && (
                    <a href={editingEntry.receipt_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline">View existing</a>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Photo of the physical receipt or invoice.</p>
              </div>

              {entryError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{entryError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowEntry(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={saveEntry} disabled={savingEntry}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: entryForm.entry_type === 'receipt' ? '#15803D' : '#DC2626' }}>
                {savingEntry ? 'Saving…' : editingEntry ? 'Update Entry' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
