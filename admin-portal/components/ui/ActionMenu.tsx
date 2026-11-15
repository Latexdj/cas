'use client';
/**
 * A menu of actions behind one button: the ⋯ menu on a table row, or a
 * page's "More" menu. Keeps rows and toolbars to one visible action, with
 * destructive actions last and in red only inside the menu.
 *
 *   <ActionMenu label={`Actions for ${s.name}`} items={[
 *     { label: 'Edit', onClick: () => openEdit(s) },
 *     { label: 'Delete', onClick: () => remove(s), destructive: true },
 *   ]} />
 *
 * The menu is positioned against the window, so table containers that scroll
 * sideways don't clip it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';

export type ActionItem =
  | { label: string; onClick?: () => void; href?: string; destructive?: boolean; disabled?: boolean; hint?: string }
  | { heading: string };

export function ActionMenu({ items, label, trigger, align = 'right' }: {
  items: ActionItem[];
  /** Accessible name for the button, e.g. "Actions for Abena Nyarko". */
  label: string;
  /** Visible button content; defaults to a ⋯ icon. */
  trigger?: ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = 224, estH = Math.min(items.length * 44 + 16, 400);
    const up = r.bottom + estH > window.innerHeight - 8 && r.top > estH;
    const left = align === 'right' ? Math.max(8, r.right - w) : Math.min(r.left, window.innerWidth - w - 8);
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left, up });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const els = [...(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([aria-disabled=true])') ?? [])];
        const i = els.indexOf(document.activeElement as HTMLElement);
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', key);
    setTimeout(() => menu.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus(), 0);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('scroll', close, true); document.removeEventListener('keydown', key); };
  }, [open]);

  const itemCls = (d?: boolean, dis?: boolean) =>
    `w-full flex flex-col items-start text-left px-4 py-2.5 min-h-[40px] text-sm focus:outline-none focus:bg-sunken hover:bg-sunken ${dis ? 'opacity-50 pointer-events-none' : ''} ${d ? 'text-bad-ink' : 'text-ink'}`;

  return (
    <>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={trigger ? undefined : label}
        onClick={() => setOpen(o => !o)}
        className={trigger
          ? 'inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold border border-line-strong text-ink-2 bg-surface hover:bg-sunken'
          : 'inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-muted hover:bg-sunken hover:text-ink'}>
        {trigger ?? (
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
          </svg>
        )}
      </button>
      {open && pos && (
        <div ref={menu} role="menu" aria-label={label}
          className="fixed z-[55] w-56 rounded-xl border border-line bg-elevated shadow-lg py-1.5"
          style={{ top: pos.top, left: pos.left, transform: pos.up ? 'translateY(-100%)' : undefined }}>
          {items.map((it, i) => 'heading' in it
            ? <p key={i} className={`px-4 pt-2 pb-1 text-xs font-medium text-ink-muted ${i > 0 ? 'mt-1 border-t border-line' : ''}`}>{it.heading}</p>
            : it.href
              ? <Link key={i} role="menuitem" href={it.href} className={itemCls(it.destructive, it.disabled)} onClick={() => setOpen(false)}>
                  {it.label}{it.hint && <span className="text-xs text-ink-muted">{it.hint}</span>}
                </Link>
              : <button key={i} role="menuitem" type="button" aria-disabled={it.disabled} className={itemCls(it.destructive, it.disabled)}
                  onClick={() => { setOpen(false); it.onClick?.(); }}>
                  {it.label}{it.hint && <span className="text-xs text-ink-muted">{it.hint}</span>}
                </button>)}
        </div>
      )}
    </>
  );
}
