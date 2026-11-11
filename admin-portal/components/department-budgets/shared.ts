import type { AxiosInstance } from 'axios';
import type { BudgetTrack } from '@/types/api';

// CAS status colours: success #2D7A4F, warning #C8780A, danger #B83232.
export const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Draft:               { bg: '#F1F5F9', color: '#64748B' },
  Compiling:           { bg: '#F1F5F9', color: '#64748B' },
  Submitted:           { bg: '#FEF3DC', color: '#C8780A' },
  Accepted:            { bg: '#E4F4EB', color: '#2D7A4F' },
  Approved:            { bg: '#E4F4EB', color: '#2D7A4F' },
  Final:               { bg: '#E4F4EB', color: '#2D7A4F' },
  'Changes Requested': { bg: '#FEF3DC', color: '#C8780A' },
  Returned:            { bg: '#FEF3DC', color: '#C8780A' },
  Rejected:            { bg: '#FBEAEA', color: '#B83232' },
};

export function statusStyle(status: string) {
  return STATUS_STYLES[status] ?? STATUS_STYLES.Draft;
}

export const TRACK_LABEL: Record<BudgetTrack, string> = { academic: 'Academics', administration: 'Administration' };

export const EVENT_LABELS: Record<string, string> = {
  created: 'Created',
  submitted: 'Submitted for review',
  withdrawn: 'Withdrawn by the owner',
  accepted: 'Accepted into the compiled budget',
  changes_requested: 'Sent back for changes',
  rejected: 'Rejected',
  reopened: 'Reopened for review',
  edited_by_reviewer: 'Lines changed by the reviewer',
  edited_by_accountant: 'Prices changed by the Accountant',
  approved: 'Approved by the Head',
  returned: 'Returned by the Head',
  line_added: 'School-wide line added',
  line_removed: 'School-wide line removed',
  finalised: 'Finalised',
};

export function fmtMoney(n: number | string | null | undefined) {
  if (n == null || n === '') return '-';
  return `GH₵ ${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(d: string | null | undefined, withTime = false) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-GB', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

// A server error carries the real reason; show it as-is. No response at all
// usually means a timeout, which deserves its own message.
export function describeApiError(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string } }; code?: string };
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.code === 'ECONNABORTED') return 'The request timed out. The server may be busy, so try again in a moment.';
  return fallback;
}

export async function downloadPdf(apiClient: AxiosInstance, url: string, filename: string) {
  const response = await apiClient.get(url, { responseType: 'blob', timeout: 90000 });
  const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = blobUrl; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(blobUrl);
}

export function safeFileName(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#145C44]'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
// For compact dropdowns that sit in a row (filters, year pickers): no w-full,
// so a width class passed alongside it actually applies.
export const selectCls = 'rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#145C44]'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
export const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';
export const cardCls = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700';
export const btnGhost = 'px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50';
export const btnPrimary = 'px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#145C44] hover:bg-[#0B3D2E] disabled:opacity-50 transition-colors';
