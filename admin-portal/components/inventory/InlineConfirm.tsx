'use client';
import { useEffect, useRef } from 'react';

// An in-page "are you sure?" step, used instead of the browser's confirm()
// pop-up so it matches CAS and works the same on phones. It sits where the
// action buttons were, and takes focus so keyboard and screen-reader users
// land on it.
export function InlineConfirm({
  title, detail, confirmLabel, busyLabel, busy = false, danger = false, primary = '#145C44',
  onConfirm, onCancel,
}: {
  title: string;
  detail?: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  danger?: boolean;
  primary?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div ref={ref} tabIndex={-1} role="alertdialog" aria-label={title}
      onKeyDown={e => { if (e.key === 'Escape' && !busy) onCancel(); }}
      className={`rounded-xl border p-4 space-y-3 outline-none ${danger
        ? 'border-[#B83232]/30 bg-[#FBEDED] dark:bg-[#B83232]/10'
        : 'border-[#C8973A]/40 bg-[#FBF6EC] dark:bg-[#C8973A]/10'}`}>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-white">{title}</p>
        {detail && <p className="text-xs text-slate-600 dark:text-slate-300">{detail}</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40">
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: danger ? '#B83232' : primary }}>
          {busy ? (busyLabel ?? 'Working…') : confirmLabel}
        </button>
      </div>
    </div>
  );
}
