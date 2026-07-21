'use client';

import React from 'react';

const PAGE_SIZES = [10, 20, 40, 50] as const;

// ── Pagination bar ────────────────────────────────────────────────────────────

interface PaginationProps {
  page:       number;
  pageSize:   number | 'all';
  total:      number;
  onPage:     (p: number) => void;
  onPageSize: (s: number | 'all') => void;
  className?: string;
}

export function Pagination({ page, pageSize, total, onPage, onPageSize, className = '' }: PaginationProps) {
  const pages = pageSize === 'all' ? 1 : Math.ceil(total / (pageSize as number));
  const from  = total === 0 ? 0 : pageSize === 'all' ? 1 : (page - 1) * (pageSize as number) + 1;
  const to    = pageSize === 'all' ? total : Math.min(page * (pageSize as number), total);

  // Build page number window
  const nums: (number | '…')[] = [];
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) nums.push(i);
  } else {
    nums.push(1);
    if (page > 3) nums.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) nums.push(i);
    if (page < pages - 2) nums.push('…');
    nums.push(pages);
  }

  return (
    <div className={`flex items-center justify-between gap-4 pt-3 pb-1 px-1 flex-wrap text-sm ${className}`}>
      {/* Left: size selector + count */}
      <div className="flex items-center gap-2 text-slate-500">
        <span className="whitespace-nowrap">Show</span>
        <select
          value={pageSize}
          onChange={e => {
            const v = e.target.value;
            onPageSize(v === 'all' ? 'all' : Number(v));
            onPage(1);
          }}
          className="border border-slate-200 rounded-md px-2 py-1 text-sm bg-white text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
        >
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          <option value="all">All</option>
        </select>
        <span className="whitespace-nowrap text-slate-400">
          {total === 0 ? 'No records' : `${from}–${to} of ${total}`}
        </span>
      </div>

      {/* Right: prev / page numbers / next */}
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <NavBtn onClick={() => onPage(page - 1)} disabled={page === 1}>← Prev</NavBtn>
          {nums.map((n, i) =>
            n === '…'
              ? <span key={`e${i}`} className="px-1 text-slate-400 select-none">…</span>
              : <NavBtn key={n} onClick={() => onPage(n as number)} active={page === n}>{n}</NavBtn>
          )}
          <NavBtn onClick={() => onPage(page + 1)} disabled={page === pages}>Next →</NavBtn>
        </div>
      )}
    </div>
  );
}

function NavBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[32px] px-2.5 py-1 rounded text-sm font-medium transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        ${active
          ? 'bg-green-700 text-white border border-green-700'
          : 'text-slate-600 border border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700'
        }`}
    >
      {children}
    </button>
  );
}

// ── Sortable <th> ─────────────────────────────────────────────────────────────

interface ThProps {
  label:      string;
  sortKey:    string;
  currentKey: string | null;
  currentDir: 'asc' | 'desc' | null;
  onSort:     (key: string) => void;
  className?: string;
  style?:     React.CSSProperties;
  center?:    boolean;
}

export function Th({ label, sortKey, currentKey, currentDir, onSort, className = '', style, center }: ThProps) {
  const active = currentKey === sortKey;
  return (
    <th
      className={`cursor-pointer select-none whitespace-nowrap ${className}`}
      style={style}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${center ? 'justify-center w-full' : ''}`}>
        {label}
        <span className="inline-flex flex-col gap-px ml-0.5" aria-hidden>
          <svg viewBox="0 0 6 4" width="7" height="4"
            fill={active && currentDir === 'asc' ? '#15803D' : '#CBD5E1'}>
            <path d="M3 0 L6 4 L0 4 Z" />
          </svg>
          <svg viewBox="0 0 6 4" width="7" height="4"
            fill={active && currentDir === 'desc' ? '#15803D' : '#CBD5E1'}>
            <path d="M3 4 L6 0 L0 0 Z" />
          </svg>
        </span>
      </span>
    </th>
  );
}
