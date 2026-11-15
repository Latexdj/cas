'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { HelpWidget, HelpNavItem } from '@/components/HelpWidget';
import { filterByModules, type NavItem, type NavSection } from './admin-nav';

// Per-viewer preferences, kept in this browser only (like the theme).
const OPEN_KEY   = 'cas_sidebar_open_section';
const PINS_KEY   = 'cas_nav_pins';
const RECENT_KEY = 'cas_nav_recent';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

const matches = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');

/** The sidebar entry that owns the route: a module counts as active on any of its pages. */
function activeEntry(secs: NavSection[], pathname: string): string | null {
  let best: { href: string; len: number } | null = null;
  for (const s of secs) for (const i of s.items) {
    const hrefs = i.children ? i.children.map(c => c.href) : [i.href];
    for (const h of hrefs) if (matches(pathname, h) && (!best || h.length > best.len)) best = { href: i.href, len: h.length };
  }
  return best?.href ?? null;
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');
  const [pendingProfileRequests, setPendingProfileRequests] = useState(0);
  const [schoolId, setSchoolId] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const enabledModules = useEnabledModules(api, schoolId, userId);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [pins, setPins] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const sections = filterByModules(enabledModules);
  const entries = sections.flatMap(s => s.items);
  const activeHref = activeEntry(sections, pathname);

  // Open the section that owns the current page; otherwise the last one opened.
  useEffect(() => {
    const owner = sections.find(s => s.items.some(i => i.href === activeHref))?.label;
    if (owner) setOpenSection(owner);
    else setOpenSection(prev => prev ?? read<string | null>(OPEN_KEY, null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, activeHref]);

  // Pins load once; recent pages update on every navigation.
  useEffect(() => { setPins(read<string[]>(PINS_KEY, [])); }, []);
  useEffect(() => {
    if (!activeHref) return;
    const next = [activeHref, ...read<string[]>(RECENT_KEY, []).filter(h => h !== activeHref)].slice(0, 6);
    write(RECENT_KEY, next);
    setRecent(next);
  }, [activeHref]);

  useEffect(() => {
    setSchoolId(getUser()?.schoolId);
    setUserId(getUser()?.id);
    api.get('/api/admin/settings').then(r => { setLogoUrl(r.data.logo_url ?? null); setSchoolName(r.data.name ?? r.data.school_name ?? ''); }).catch(() => {});
    api.get('/api/admin/teacher-profile-requests', { params: { status: 'Pending' } })
      .then(r => setPendingProfileRequests(Array.isArray(r.data) ? r.data.length : 0))
      .catch(() => setPendingProfileRequests(0));
  }, []);

  function toggleSection(label: string) {
    setOpenSection(prev => { const next = prev === label ? null : label; write(OPEN_KEY, next); return next; });
  }
  function togglePin(href: string) {
    setPins(prev => { const next = prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href].slice(0, 8); write(PINS_KEY, next); return next; });
  }

  const byHref = Object.fromEntries(entries.map(i => [i.href, i]));
  const pinned = pins.map(h => byHref[h]).filter(Boolean) as NavItem[];
  const recentItems = recent.filter(h => h !== activeHref && !pins.includes(h)).map(h => byHref[h]).filter(Boolean).slice(0, 4) as NavItem[];

  const row = (item: NavItem, key: string) => {
    const active = item.href === activeHref;
    const isPinned = pins.includes(item.href);
    const badge = item.href === '/teacher-profile-requests' && pendingProfileRequests > 0;
    return (
      <div key={key} className="group relative flex items-center">
        {active && <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-[3px] rounded-full bg-[#C8973A]" />}
        <Link href={item.href} onClick={onClose} aria-current={active ? 'page' : undefined}
          className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 min-h-[36px] rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: active ? 'rgba(200,151,58,0.15)' : 'transparent', color: active ? '#D6A64E' : 'rgba(255,255,255,0.72)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-[17px] h-[17px] flex-shrink-0" aria-hidden>{item.icon}</svg>
          <span className="truncate">{item.label}</span>
          {badge && (
            <span className="ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center bg-[#C8973A] text-[#0B3D2E]">
              {pendingProfileRequests > 99 ? '99+' : pendingProfileRequests}
            </span>
          )}
        </Link>
        <button type="button" onClick={() => togglePin(item.href)}
          aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label} to the top`} title={isPinned ? 'Unpin' : 'Pin to the top'}
          className={`ml-0.5 w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center transition-opacity focus:opacity-100 hover:bg-white/10 ${isPinned ? 'opacity-100 text-[#C8973A]' : 'opacity-0 group-hover:opacity-100 text-white/50'}`}>
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinejoin="round" d="M12 17.3l-5.5 3.2 1.5-6.2L3 10.1l6.3-.5L12 3.8l2.7 5.8 6.3.5-5 4.2 1.5 6.2z" />
          </svg>
        </button>
      </div>
    );
  };

  const group = (label: string, items: NavItem[]) => (
    <div className="mb-3">
      <p className="px-3 mb-1 text-xs font-medium text-white/55">{label}</p>
      <div className="ml-[10px] pl-3">{items.map(i => row(i, `${label}-${i.href}`))}</div>
    </div>
  );

  return (
    <>
    <aside
      className={[
        'fixed inset-y-0 left-0 z-50 w-72 flex flex-col flex-shrink-0',
        'transition-transform duration-300 ease-in-out motion-reduce:transition-none',
        open ? 'translate-x-0' : '-translate-x-full',
        'md:relative md:w-60 md:translate-x-0 md:z-auto',
        'print:hidden',
      ].join(' ')}
      style={{ backgroundColor: '#0B3D2E' }}
      aria-label="Main menu"
    >
      <div className="h-16 flex items-center px-5 border-b border-white/[0.08]">
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#C8973A]">
              <span className="text-sm font-bold text-[#0B3D2E]">C</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white text-sm font-bold leading-tight truncate">{schoolName || 'CAS Admin'}</p>
            <p className="text-xs leading-tight text-[#D6A64E]/80">Admin</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto no-scrollbar py-4 px-3">
        {pinned.length > 0 && group('Pinned', pinned)}
        {recentItems.length > 0 && group('Recent', recentItems)}
        {(pinned.length > 0 || recentItems.length > 0) && <div className="mx-3 mb-3 h-px bg-white/[0.08]" />}

        {sections.map(section => {
          const isOpen = openSection === section.label;
          const holdsActive = section.items.some(i => i.href === activeHref);
          return (
            <div key={section.label} className="mb-0.5">
              <button type="button" onClick={() => toggleSection(section.label)} aria-expanded={isOpen}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[40px] rounded-lg transition-colors ${isOpen ? 'bg-white/[0.06]' : 'hover:bg-white/[0.05]'}`}>
                <span className={`flex-1 text-left text-sm font-semibold ${holdsActive ? 'text-[#D6A64E]' : 'text-white/85'}`}>{section.label}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden
                  className="w-3.5 h-3.5 flex-shrink-0 text-white/40 transition-transform duration-200 motion-reduce:transition-none"
                  style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="ml-[10px] pl-3 mt-0.5 mb-2 border-l border-[#C8973A]/15">
                  {section.items.map(item => row(item, item.href))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
    {pathname === '/dashboard' && (
      <HelpWidget navItems={sections.flatMap(s => s.items.flatMap(i => (i.children ?? [i]).map((c): HelpNavItem => ({ section: s.label, label: i.children ? `${i.label}: ${c.label}` : c.label, href: c.href }))))} />
    )}
    </>
  );
}
