'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import type { BudgetTrack, BudgetEvent, DepartmentBudget, DepartmentBudgetItem } from '@/types/api';
import {
  statusStyle, TRACK_LABEL, EVENT_LABELS, fmtMoney, fmtDate, describeApiError, downloadPdf, safeFileName,
  inputCls, labelCls, cardCls, btnGhost, btnPrimary,
} from './shared';

interface TrackSummary {
  track: BudgetTrack; label: string; status: string;
  included_count: number; pending_count: number; total: number;
  reviewers: string[]; reviewer_is_fallback: boolean; can_open: boolean;
  permissions: { can_submit: boolean; can_approve: boolean; can_return: boolean };
}
interface CompilationDetail {
  year: { id: string; name: string };
  track: BudgetTrack; label: string; status: string;
  compilation: {
    compiled_by_name: string | null; submitted_at: string | null; compiler_note: string | null;
    head_reviewed_by_name: string | null; head_reviewed_at: string | null; head_note: string | null;
  } | null;
  included: (DepartmentBudget & { items: DepartmentBudgetItem[] })[];
  pending: DepartmentBudget[];
  total: number;
  events: BudgetEvent[];
  reviewers: string[]; reviewer_is_fallback: boolean;
  school_budget_status: string | null;
  permissions: { can_submit: boolean; can_approve: boolean; can_return: boolean };
}

function reviewerLine(names: string[], fallback: boolean) {
  if (!names.length) return 'No reviewer assigned. Ask an admin to assign an Assistant Head or a Principal.';
  return fallback ? `Reviewed by ${names.join(', ')} (Headmaster; no Assistant Head assigned)` : `Reviewed by ${names.join(', ')}`;
}

// The compiled Academics and Administration budgets: who is compiling, where
// each stands with the Head, and (when one is opened) its departments,
// subtotals and the submit / approve / return actions.
export default function CompilationsPanel({ apiClient, onOpenBudget, initialTrack = null }: {
  apiClient: AxiosInstance; onOpenBudget?: (id: string) => void; initialTrack?: BudgetTrack | null;
}) {
  const [summary, setSummary] = useState<{ year: { id: string; name: string }; tracks: TrackSummary[] } | null>(null);
  const [error, setError] = useState('');
  const [openTrack, setOpenTrack] = useState<BudgetTrack | null>(initialTrack);

  const loadSummary = useCallback(() => {
    setError('');
    apiClient.get('/api/department-budgets/compilations')
      .then(r => setSummary(r.data))
      .catch(e => setError(describeApiError(e, 'Could not load the compiled budgets. Check your connection and try again.')));
  }, [apiClient]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { setOpenTrack(initialTrack); }, [initialTrack]);

  if (openTrack) {
    return <CompilationView apiClient={apiClient} track={openTrack} onOpenBudget={onOpenBudget}
      onBack={() => { setOpenTrack(null); loadSummary(); }} />;
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Compiled budgets</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Each track&apos;s accepted budgets, compiled by its Assistant Head and approved by the Head{summary ? `, for ${summary.year.name}` : ''}.
        </p>
      </div>
      {error && <p className="text-sm text-[#B83232]">{error}</p>}
      {!summary && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {summary && summary.tracks.length === 0 && (
        <div className={`${cardCls} px-5 py-8 text-sm text-slate-500 dark:text-slate-400`}>
          You don&apos;t review or approve any compiled budget.
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        {summary?.tracks.map(t => {
          const ss = statusStyle(t.status);
          const action = t.permissions.can_approve ? 'Review and approve' : t.permissions.can_submit ? 'Compile and submit' : 'Open';
          return (
            <div key={t.track} className={`${cardCls} p-4 space-y-2`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-slate-900 dark:text-white">{t.label} budget</p>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ backgroundColor: ss.bg, color: ss.color }}>{t.status}</span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtMoney(t.total)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.included_count} accepted, {t.pending_count} not yet accepted
              </p>
              <p className="text-xs text-slate-400">{reviewerLine(t.reviewers, t.reviewer_is_fallback)}</p>
              {t.can_open ? (
                <button onClick={() => setOpenTrack(t.track)}
                  className={t.permissions.can_approve || t.permissions.can_submit ? btnPrimary : btnGhost}>
                  {action}
                </button>
              ) : (
                <p className="text-xs text-slate-400">Opens for you once the Head approves it.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompilationView({ apiClient, track, onBack, onOpenBudget }: {
  apiClient: AxiosInstance; track: BudgetTrack; onBack: () => void; onOpenBudget?: (id: string) => void;
}) {
  const [data, setData] = useState<CompilationDetail | null>(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'submit' | 'approve' | 'return' | null>(null);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel'>('');

  const load = useCallback(() => {
    setError('');
    apiClient.get<CompilationDetail>(`/api/department-budgets/compilations/${track}`)
      .then(r => setData(r.data))
      .catch(e => setError(describeApiError(e, 'Could not load this compiled budget. Check your connection and try again.')));
  }, [apiClient, track]);
  useEffect(() => { load(); }, [load]);

  async function run() {
    if (!action || !data) return;
    if (action === 'return' && !note.trim()) { setActionError('Say what needs to change before returning it.'); return; }
    setActing(true); setActionError('');
    try {
      await apiClient.post(`/api/department-budgets/compilations/${track}/${action}`, { year: data.year.id, note: note.trim() || undefined });
      setAction(null); setNote('');
      load();
    } catch (e) {
      setActionError(describeApiError(e, 'Could not complete that. Check your connection and try again.'));
    } finally { setActing(false); }
  }

  async function exportPdf() {
    if (!data) return;
    setExporting('pdf'); setError('');
    try {
      await downloadPdf(apiClient, `/api/department-budgets/compilations/${track}/pdf?year=${data.year.id}`,
        `${safeFileName(data.label)}_Budget_${safeFileName(data.year.name)}.pdf`);
    } catch { setError('Could not export the PDF. Try again in a moment.'); }
    finally { setExporting(''); }
  }

  async function exportExcel() {
    if (!data) return;
    setExporting('excel'); setError('');
    try {
      const XLSX = await import('xlsx');
      const aoa: (string | number)[][] = [[`${data.label} budget, ${data.year.name}`], [`Status: ${data.status}`], []];
      aoa.push(['Department or unit', 'Item', 'Description', 'Quantity', 'Unit Price (GH₵)', 'Amount (GH₵)']);
      for (const b of data.included) {
        for (const i of b.items) {
          aoa.push([b.department_name, i.category, i.description ?? '', Number(i.quantity),
            i.unit_price != null ? Number(i.unit_price) : '', i.amount != null ? Number(i.amount) : '']);
        }
        aoa.push(['', '', '', '', `Subtotal, ${b.department_name}`, Number(b.total_amount)]);
      }
      aoa.push([], ['', '', '', '', 'TOTAL', Number(data.total)]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 26 }, { wch: 28 }, { wch: 28 }, { wch: 10 }, { wch: 26 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, data.label);
      XLSX.writeFile(wb, `${safeFileName(data.label)}_Budget_${safeFileName(data.year.name)}.xlsx`);
    } catch { setError('Could not export the Excel file. Try again in a moment.'); }
    finally { setExporting(''); }
  }

  if (!data) return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Compiled budgets</button>
      {error ? <p className="text-sm text-[#B83232]">{error}</p> : <p className="text-sm text-slate-400">Loading…</p>}
    </div>
  );

  const ss = statusStyle(data.status);
  const c = data.compilation;
  const p = data.permissions;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button onClick={onBack} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Compiled budgets</button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{data.label} budget</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{data.year.name}. {reviewerLine(data.reviewers, data.reviewer_is_fallback)}.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ backgroundColor: ss.bg, color: ss.color }}>{data.status}</span>
          <button onClick={exportExcel} disabled={!!exporting} className={btnGhost}>{exporting === 'excel' ? 'Exporting…' : 'Export Excel'}</button>
          <button onClick={exportPdf} disabled={!!exporting} className={btnGhost}>{exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}</button>
        </div>
      </div>

      {error && <p className="text-sm text-[#B83232]">{error}</p>}

      {data.status === 'Returned' && c?.head_note && (
        <div className="rounded-xl px-4 py-3 text-sm border-l-4 bg-[#FEF3DC] border-[#C8780A] text-[#2A2620]">
          <p className="font-semibold mb-0.5">Returned by the Head</p>
          <p>{c.head_note}</p>
          <p className="text-xs mt-1 text-slate-500">{c.head_reviewed_by_name}, {fmtDate(c.head_reviewed_at, true)}</p>
        </div>
      )}
      {data.status === 'Submitted' && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Submitted to the Head by {c?.compiled_by_name ?? 'the reviewer'} on {fmtDate(c?.submitted_at)}.{c?.compiler_note ? ` Note: ${c.compiler_note}` : ''}
        </p>
      )}
      {data.status === 'Approved' && (
        <div className="rounded-xl px-4 py-3 text-sm bg-[#E4F4EB] text-[#1F5A3A] dark:bg-green-900/20 dark:text-[#7FD1A8]">
          Approved by {c?.head_reviewed_by_name ?? 'the Head'} on {fmtDate(c?.head_reviewed_at)}. It now goes to the Accountant for the school budget.
        </div>
      )}

      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-sm font-bold text-slate-800 dark:text-white">Included budgets ({data.included.length})</p>
          <p className="text-sm font-bold font-mono text-slate-900 dark:text-white">{fmtMoney(data.total)}</p>
        </div>
        {data.included.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
            No budgets accepted yet. Open a submitted budget and accept it to include it here.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {data.included.map(b => {
              const isOpen = expanded.has(b.id);
              return (
                <div key={b.id}>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <button onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}
                      className="flex-1 min-w-0 text-left">
                      <span className="text-sm font-medium text-slate-800 dark:text-white">{b.department_name}</span>
                      <span className="text-xs text-slate-400 ml-2">{b.items.length} line{b.items.length === 1 ? '' : 's'}</span>
                    </button>
                    <span className="text-sm font-mono text-slate-700 dark:text-slate-200">{fmtMoney(b.total_amount)}</span>
                    {onOpenBudget && (
                      <button onClick={() => onOpenBudget(b.id)} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">Open</button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="px-4 pb-3">
                      {b.items.map(i => (
                        <div key={i.id} className="flex justify-between text-xs py-1 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                          <span className="text-slate-600 dark:text-slate-300">{i.category}, qty {Number(i.quantity)}{i.unit_price != null ? ` × ${fmtMoney(i.unit_price)}` : ''}</span>
                          <span className="font-mono text-slate-600 dark:text-slate-300">{fmtMoney(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data.pending.length > 0 && (
        <div className={`${cardCls} p-4 space-y-2`}>
          <p className="text-sm font-bold text-slate-800 dark:text-white">Not included ({data.pending.length})</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">These are left out of the {data.label} budget until they are accepted.</p>
          {data.pending.map(b => {
            const s = statusStyle(b.status);
            return (
              <div key={b.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 text-slate-700 dark:text-slate-200">{b.department_name}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ backgroundColor: s.bg, color: s.color }}>{b.status}</span>
                {onOpenBudget && <button onClick={() => onOpenBudget(b.id)} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">Open</button>}
              </div>
            );
          })}
        </div>
      )}

      {(p.can_submit || p.can_approve || p.can_return) && !action && (
        <div className="flex justify-end gap-2 flex-wrap">
          {p.can_submit && <button onClick={() => setAction('submit')} className={btnPrimary}>Submit to the Head</button>}
          {p.can_return && <button onClick={() => setAction('return')} className="px-4 py-2 rounded-lg text-sm font-semibold border border-[#C8780A] text-[#C8780A]">Return for changes</button>}
          {p.can_approve && <button onClick={() => setAction('approve')} className={btnPrimary}>Approve</button>}
        </div>
      )}

      {action && (
        <div className={`${cardCls} p-5 space-y-3`}>
          <p className="font-bold text-slate-900 dark:text-white">
            {action === 'submit' ? `Submit the ${data.label} budget to the Head` : action === 'approve' ? `Approve the ${data.label} budget` : 'Return for changes'}
          </p>
          {action === 'submit' && data.pending.length > 0 && (
            <p className="text-sm text-[#C8780A]">{data.pending.length} budget{data.pending.length === 1 ? ' is' : 's are'} not accepted and will be left out.</p>
          )}
          {action === 'approve' && <p className="text-sm text-slate-500 dark:text-slate-400">Once approved, it goes to the Accountant and can no longer be changed by the reviewer.</p>}
          <div>
            <label className={labelCls}>{action === 'return' ? 'What needs to change? (required)' : 'Note (optional)'}</label>
            <textarea rows={3} value={note} onChange={e => { setNote(e.target.value); setActionError(''); }} className={`${inputCls} resize-none`} />
          </div>
          {actionError && <p className="text-sm text-[#B83232]">{actionError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAction(null); setActionError(''); }} className={btnGhost}>Cancel</button>
            <button onClick={run} disabled={acting} className={btnPrimary}>{acting ? 'Saving…' : 'Confirm'}</button>
          </div>
        </div>
      )}

      {data.events.length > 0 && (
        <div className={`${cardCls} p-5 space-y-2`}>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">History</h2>
          <ol className="space-y-2">
            {data.events.map(ev => (
              <li key={ev.id} className="text-sm">
                <span className="text-slate-700 dark:text-slate-200">{ev.action === 'submitted' ? 'Submitted to the Head' : (EVENT_LABELS[ev.action] ?? ev.action)}</span>
                <span className="text-xs text-slate-400"> by {ev.actor_label || 'unknown'}, {fmtDate(ev.created_at, true)}</span>
                {ev.note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ev.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
