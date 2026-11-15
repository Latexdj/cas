'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearUser, getUser } from '@/lib/auth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationsBell } from '@/components/NotificationsBell';
import { GlobalSearch } from './GlobalSearch';
import { findTrail } from './admin-nav';

interface Props {
  /** Fallback for pages outside the menu (detail pages and the like). */
  title: string;
  onMenuClick: () => void;
}

export function Header({ title, onMenuClick }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const user     = getUser();
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'A';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Where you are: Section › Module › Page, from the menu itself.
  const trail = findTrail(pathname);
  const exact = trail && pathname === trail.item.href;
  const crumbs: { label: string; href?: string }[] = trail
    ? [
        { label: trail.section },
        ...(trail.module ? [{ label: trail.module.label, href: trail.module.href }] : []),
        { label: trail.item.label, href: exact ? undefined : trail.item.href },
        ...(exact ? [] : [{ label: title }]),
      ]
    : [{ label: title }];

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  function logout() {
    clearUser();
    router.replace('/login');
  }

  return (
    <header className="h-16 flex items-center gap-3 px-4 md:px-6 flex-shrink-0 print:hidden bg-surface border-b border-line">
      <button
        onClick={onMenuClick}
        className="md:hidden flex flex-col justify-center items-center w-10 h-10 -ml-1 rounded-lg gap-1.5 flex-shrink-0 text-ink-2"
        aria-label="Open menu"
      >
        <span className="block w-5 h-0.5 rounded-full bg-current" />
        <span className="block w-5 h-0.5 rounded-full bg-current" />
        <span className="block w-5 h-0.5 rounded-full bg-current" />
      </button>

      <nav aria-label="You are here" className="flex-1 min-w-0">
        <ol className="flex items-center gap-1.5 text-sm min-w-0">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className={`flex items-center gap-1.5 min-w-0 ${last ? '' : 'hidden sm:flex'}`}>
                {c.href && !last
                  ? <Link href={c.href} className="text-ink-muted hover:text-ink truncate">{c.label}</Link>
                  : <span className={last ? 'font-semibold text-ink truncate' : 'text-ink-muted truncate'} aria-current={last ? 'page' : undefined}>{c.label}</span>}
                {!last && <span className="text-ink-muted" aria-hidden>›</span>}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex items-center gap-1.5 md:gap-2">
        <GlobalSearch />
        <ThemeToggle />
        <NotificationsBell />
        {user && (
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
              aria-label={`Account: ${user.name}`}
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-[#C8973A] text-[#1C1208] focus:outline-none focus:ring-2 focus:ring-[#145C44] focus:ring-offset-2">
              {initials}
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-line bg-elevated shadow-lg py-2">
                <div className="px-4 py-2 border-b border-line mb-1">
                  <p className="text-sm font-semibold text-ink truncate">{user.name}</p>
                  <p className="text-xs capitalize text-ink-muted">{user.role}</p>
                </div>
                <Link role="menuitem" href="/settings" onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm text-ink hover:bg-sunken">School settings</Link>
                <button role="menuitem" type="button" onClick={logout}
                  className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-sunken">Sign out</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
