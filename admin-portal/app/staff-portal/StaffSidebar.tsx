'use client';
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
  /** Only used when items.length === 0 — a single directly-clickable row (e.g. Letters). */
  onClick?: () => void;
}

interface StaffSidebarProps {
  groups: StaffSidebarGroup[];
  activeGroupKey: string;
  primary: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// Per-viewer UI preference, not a server setting — same treatment the admin
// dashboard's Sidebar gives its own open-section memory (localStorage, no
// backend). Distinct key so the two never collide if both are open in
// different tabs on the same browser.
const OPEN_GROUP_STORAGE_KEY = 'cas_staff_sidebar_open_section';

function loadStoredOpenGroup(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OPEN_GROUP_STORAGE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch { return null; }
}

function saveStoredOpenGroup(key: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (key) localStorage.setItem(OPEN_GROUP_STORAGE_KEY, key);
    else localStorage.removeItem(OPEN_GROUP_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function StaffSidebar({ groups, activeGroupKey, primary, mobileOpen, onMobileClose }: StaffSidebarProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(() => loadStoredOpenGroup() ?? activeGroupKey);

  // Whichever group owns the currently active section is always force-open —
  // the active view's items must never end up hidden behind a collapsed
  // accordion header, same intent as the admin Sidebar's route-driven
  // auto-expand, just driven by `section` instead of a URL path.
  useEffect(() => { setOpenGroup(activeGroupKey); }, [activeGroupKey]);

  function toggleGroup(key: string) {
    const next = openGroup === key ? null : key;
    setOpenGroup(next);
    saveStoredOpenGroup(next);
  }

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onMobileClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 overflow-y-auto transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:sticky md:top-0 md:h-screen md:translate-x-0 md:z-auto md:w-56 md:shrink-0`}
      >
        <nav className="p-3 space-y-1">
          {groups.map(group => {
            if (group.items.length === 0) {
              const isActive = activeGroupKey === group.key;
              return (
                <button
                  key={group.key}
                  onClick={() => { group.onClick?.(); onMobileClose(); }}
                  className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${isActive ? 'text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  style={isActive ? { background: primary } : {}}
                >
                  {group.label}
                </button>
              );
            }

            const isOpen = openGroup === group.key;
            const isActiveGroup = activeGroupKey === group.key;
            return (
              <div key={group.key}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${isActiveGroup ? '' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  style={isActiveGroup ? { color: primary, background: `${primary}14` } : {}}
                >
                  <span>{group.label}</span>
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    className="w-4 h-4 shrink-0 transition-transform"
                    style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="mt-1 ml-2 space-y-0.5 border-l border-slate-200 dark:border-slate-700 pl-2">
                    {group.items.map(item => (
                      <button
                        key={item.key}
                        onClick={() => { item.onClick(); onMobileClose(); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${item.active ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        style={item.active ? { background: primary } : {}}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
