'use client';
/** Tabs for a module's pages (Library, Clinic, Inventory ...), shown above the page. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { findTrail } from './admin-nav';

export function ModuleTabs() {
  const pathname = usePathname();
  const trail = findTrail(pathname);
  const mod = trail?.module;
  if (!mod?.children || mod.children.length < 2) return null;
  return (
    <nav aria-label={`${mod.label} pages`} className="-mx-4 md:mx-0 mb-5 print:hidden">
      <ul className="flex gap-1 overflow-x-auto no-scrollbar px-4 md:px-0 border-b border-line">
        {mod.children.map(c => {
          const active = c.href === trail?.item.href;
          return (
            <li key={c.href} className="flex-shrink-0">
              <Link href={c.href} aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center min-h-[44px] md:min-h-[40px] px-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${active
                  ? 'border-[#C8973A] text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'}`}>
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
