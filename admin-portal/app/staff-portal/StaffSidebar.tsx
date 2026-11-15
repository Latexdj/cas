'use client';
/**
 * Staff portal navigation (design review 2026-11-15, Apple HIG):
 *  - phones: a tab bar at the bottom with Home, the person's main sections
 *    and More (a sheet with every section), always visible and in thumb reach;
 *  - desktop: the same sections as a sidebar;
 *  - inside a section, its pages are tabs at the top under a title, so the
 *    current place is always visible and nothing hides behind a menu.
 */
import { useEffect, useState } from 'react';

export interface StaffSidebarItem {
  key: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

export interface StaffSidebarGroup {
  key: string;
  label: string;
  items: StaffSidebarItem[];
  /** Opens the section (keeping whichever of its pages was open last). */
  onClick?: () => void;
}

const SHORT: Record<string, string> = { accounts: 'Accounts', inventory: 'Stores', scan: 'Scan' };

const COUNT = /\s*\((\d+)\)$/;
const countOf = (g: StaffSidebarGroup) => g.items.reduce((n, i) => n + Number(i.label.match(COUNT)?.[1] ?? 0), 0);
export const cleanLabel = (s: string) => s.replace(COUNT, '');

function Icon({ k }: { k: string }) {
  const p = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'w-6 h-6', 'aria-hidden': true };
  switch (k) {
    case 'home':      return <svg {...p}><path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" /></svg>;
    case 'clearance': return <svg {...p}><path d="M9 12l2 2 4-4" /><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></svg>;
    case 'library':   return <svg {...p}><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 19V5" /></svg>;
    case 'inventory': return <svg {...p}><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></svg>;
    case 'accounts':  return <svg {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></svg>;
    case 'clinic':    return <svg {...p}><path d="M12 21s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.5-7 10-7 10z" /><path d="M12 9v5M9.5 11.5h5" /></svg>;
    case 'letters':   return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
    case 'budgets':   return <svg {...p}><path d="M4 19h16M7 16V9M12 16V5M17 16v-4" /></svg>;
    case 'reports':   return <svg {...p}><path d="M8 3h8l4 4v14H4V3h4z" /><path d="M8 13h8M8 17h5" /></svg>;
    case 'scan':      return <svg {...p}><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10" /></svg>;
    default:          return <svg {...p}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
  }
}

interface StaffSidebarProps {
  groups: StaffSidebarGroup[];
  activeGroupKey: string;
  primary: string;
  /** Kept for compatibility; the More sheet replaces the old drawer. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function StaffSidebar({ groups, activeGroupKey, primary }: StaffSidebarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const open = (g: StaffSidebarGroup) => { (g.onClick ?? g.items[0]?.onClick)?.(); setMoreOpen(false); };

  // Tab bar: Home plus up to three sections, then More (never an overflow of tabs).
  const fitsAll = groups.length <= 5;
  const tabs = fitsAll ? groups : groups.slice(0, 4);
  const inMore = fitsAll ? [] : groups.slice(4);
  const moreActive = inMore.some(g => g.key === activeGroupKey);

  useEffect(() => {
    if (!moreOpen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [moreOpen]);

  const badge = (n: number) => n > 0 && (
    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#B83232] text-white text-[11px] font-bold leading-[18px] text-center">{n > 99 ? '99+' : n}</span>
  );

  return (
    <>
      {/* Desktop: sections as a sidebar */}
      <aside aria-label="Sections" className="hidden md:block sticky top-0 h-screen w-56 shrink-0 overflow-y-auto border-r border-line bg-surface">
        <nav className="p-3 space-y-0.5">
          {groups.map(g => {
            const active = g.key === activeGroupKey;
            return (
              <button key={g.key} type="button" onClick={() => open(g)} aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 min-h-[40px] rounded-lg text-sm font-semibold transition-colors ${active ? '' : 'text-ink-2 hover:bg-sunken'}`}
                style={active ? { color: primary, background: `${primary}14` } : undefined}>
                <span className="[&>svg]:w-5 [&>svg]:h-5"><Icon k={g.key} /></span>
                <span className="flex-1 text-left">{g.label}</span>
                {badge(countOf(g))}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Phones: tab bar */}
      <nav aria-label="Sections" className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)] print:hidden">
        <ul className="flex">
          {tabs.map(g => {
            const active = g.key === activeGroupKey;
            return (
              <li key={g.key} className="flex-1">
                <button type="button" onClick={() => open(g)} aria-current={active ? 'page' : undefined}
                  className={`relative w-full min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${active ? '' : 'text-ink-muted'}`}
                  style={active ? { color: primary } : undefined}>
                  <Icon k={g.key} />
                  <span>{SHORT[g.key] ?? g.label}</span>
                  {countOf(g) > 0 && <span className="absolute top-1.5 left-1/2 ml-2">{badge(countOf(g))}</span>}
                </button>
              </li>
            );
          })}
          {inMore.length > 0 && (
            <li className="flex-1">
              <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog"
                className={`w-full min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${moreActive ? '' : 'text-ink-muted'}`}
                style={moreActive ? { color: primary } : undefined}>
                <Icon k="more" />
                <span>More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {/* Phones: More sheet with every section */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" role="presentation">
          <div className="absolute inset-0 bg-[#0B3D2E]/55" onClick={() => setMoreOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="All sections"
            className="relative w-full rounded-t-2xl bg-elevated border-t border-line pb-[calc(12px+env(safe-area-inset-bottom))] pt-2">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
            <div className="flex items-center justify-between px-5 pb-2">
              <p className="text-base font-semibold text-ink">All sections</p>
              <button type="button" onClick={() => setMoreOpen(false)} className="text-sm font-semibold px-3 min-h-[44px] text-brand-ink">Done</button>
            </div>
            <ul className="px-3">
              {groups.map(g => {
                const active = g.key === activeGroupKey;
                return (
                  <li key={g.key}>
                    <button type="button" onClick={() => open(g)}
                      className={`w-full flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-base ${active ? 'font-semibold' : 'text-ink'}`}
                      style={active ? { color: primary } : undefined}>
                      <Icon k={g.key} />
                      <span className="flex-1 text-left">{g.label}</span>
                      {badge(countOf(g))}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/** Title for the current section, and its pages as tabs. */
export function SectionHeader({ group, primary }: { group?: StaffSidebarGroup; primary: string }) {
  if (!group || group.key === 'home') return null;
  const active = group.items.find(i => i.active);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold text-ink">
        {group.label}
        {active && group.items.length > 1 && <span className="text-ink-muted font-normal"> › {cleanLabel(active.label)}</span>}
      </h1>
      {group.items.length > 1 && (
        <div role="tablist" aria-label={`${group.label} pages`} className="-mx-4 md:mx-0 px-4 md:px-0 flex gap-1 overflow-x-auto no-scrollbar border-b border-line">
          {group.items.map(i => (
            <button key={i.key} role="tab" type="button" aria-selected={i.active} onClick={i.onClick}
              className={`shrink-0 px-3 min-h-[44px] md:min-h-[40px] text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${i.active ? 'text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              style={i.active ? { borderColor: primary } : undefined}>
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
