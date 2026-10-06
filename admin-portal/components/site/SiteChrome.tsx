'use client';
import { useEffect, useState } from 'react';
import { readableOn } from '@/lib/site-theme';

export interface MenuNode {
  id: string;
  label: string;
  page_slug: string | null;
  external_url: string | null;
  open_new_tab: boolean;
  children: MenuNode[];
}

export interface NavLink { id?: string; href: string; label: string; openNewTab?: boolean }

// Keyed by the menu item's own database id, not its resolved href — two
// different menu items can legitimately resolve to the same href (e.g. two
// items both pointing at #academics), and React requires list keys to be
// unique regardless of what they link to.
function resolveHref(node: MenuNode, slug: string, isHomepage: boolean): NavLink {
  if (node.page_slug) {
    const href = node.page_slug === 'home' ? `/site/${slug}` : `/site/${slug}/${node.page_slug}`;
    return { id: node.id, href, label: node.label, openNewTab: node.open_new_tab };
  }
  const url = node.external_url || '#';
  if (url.startsWith('#')) {
    return { id: node.id, href: isHomepage ? url : `/site/${slug}${url}`, label: node.label, openNewTab: node.open_new_tab };
  }
  return { id: node.id, href: url, label: node.label, openNewTab: node.open_new_tab };
}

interface SiteChromeProps {
  slug: string;
  schoolName: string;
  logoUrl: string | null;
  primary: string;
  accent: string;
  motto: string | null;
  menu: { header: MenuNode[]; footer: MenuNode[] } | null;
  fallbackNavLinks: NavLink[];
  canApply: boolean;
  admissionsSlug: string | null;
  isHomepage: boolean;
  children: React.ReactNode;
}

export function SiteChrome({
  slug, schoolName, logoUrl, primary, accent, motto, menu, fallbackNavLinks,
  canApply, admissionsSlug, isHomepage, children,
}: SiteChromeProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const onPrimary = readableOn(primary);

  const headerLinks: NavLink[] = menu && menu.header.length > 0
    ? menu.header.map(n => resolveHref(n, slug, isHomepage))
    : fallbackNavLinks;
  const footerLinks: NavLink[] = menu && menu.footer.length > 0
    ? menu.footer.map(n => resolveHref(n, slug, isHomepage))
    : fallbackNavLinks;

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // Transparent-over-dark-hero only makes sense when this page actually has
  // a dark hero at the top (the homepage). Every other page is plain white
  // content, so its header must always be solid or the nav becomes
  // invisible (white text on a white page).
  const solid = scrolled || !isHomepage;

  return (
    <div className="min-h-screen bg-[#F5F0E8] font-sans">
      <header className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${solid ? 'bg-white shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href={`/site/${slug}`} className="flex items-center gap-3 min-w-0">
            {logoUrl
              ? <img src={logoUrl} alt="" className="w-9 h-9 object-contain rounded-lg flex-shrink-0" />
              : <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ backgroundColor: accent, color: readableOn(accent) }}>{schoolName[0]}</div>
            }
            <span className={`font-bold text-sm truncate ${solid ? 'text-slate-900' : 'text-white'}`}>{schoolName}</span>
          </a>
          <nav className="hidden md:flex items-center gap-4 min-w-0">
            {/* Scrolls horizontally instead of silently clipping links off-screen
                when a school has more menu items than fit at this width. */}
            <div className="flex items-center gap-6 overflow-x-auto min-w-0">
              {headerLinks.map(l => (
                <a key={l.id ?? l.href} href={l.href} target={l.openNewTab ? '_blank' : undefined} rel={l.openNewTab ? 'noopener noreferrer' : undefined}
                  className={`text-sm font-semibold whitespace-nowrap transition-colors ${solid ? 'text-slate-600 hover:text-slate-900' : 'text-white/85 hover:text-white'}`}>{l.label}</a>
              ))}
            </div>
            {canApply && (
              <a href={`/admissions/${admissionsSlug}`}
                className="px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-transform hover:-translate-y-0.5 flex-shrink-0"
                style={{ backgroundColor: accent, color: readableOn(accent) }}>
                Apply Now
              </a>
            )}
          </nav>
          <button
            className={`md:hidden p-2 rounded-lg ${solid ? 'text-slate-700' : 'text-white'}`}
            onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 shadow-sm">
            <div className="px-6 py-4 flex flex-col gap-3">
              {headerLinks.map(l => (
                <a key={l.id ?? l.href} href={l.href} onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-slate-700">{l.label}</a>
              ))}
              {canApply && (
                <a href={`/admissions/${admissionsSlug}`}
                  className="px-5 py-2.5 rounded-lg text-sm font-bold text-center"
                  style={{ backgroundColor: accent, color: readableOn(accent) }}>
                  Apply Now
                </a>
              )}
            </div>
          </div>
        )}
      </header>

      {children}

      <footer className="pt-16 pb-8 px-6" style={{ backgroundColor: primary }}>
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10 mb-10">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-3">
              {logoUrl
                ? <img src={logoUrl} alt="" className="w-8 h-8 object-contain rounded" />
                : <div className="w-8 h-8 rounded flex items-center justify-center font-bold text-xs" style={{ backgroundColor: accent, color: readableOn(accent) }}>{schoolName[0]}</div>
              }
              <span className="font-bold" style={{ color: onPrimary }}>{schoolName}</span>
            </div>
            {motto && <p className="text-sm italic max-w-xs" style={{ color: onPrimary, opacity: 0.65 }}>&ldquo;{motto}&rdquo;</p>}
          </div>
          {footerLinks.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: accent }}>Quick Links</p>
              <ul className="space-y-2.5">
                {footerLinks.map(l => (
                  <li key={l.id ?? l.href}><a href={l.href} className="text-sm hover:underline" style={{ color: onPrimary, opacity: 0.75 }}>{l.label}</a></li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="max-w-6xl mx-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderTop: `1px solid rgba(${onPrimary === '#FFFFFF' ? '255,255,255' : '0,0,0'},0.12)` }}>
          <p className="text-xs" style={{ color: onPrimary, opacity: 0.55 }}>© {new Date().getFullYear()} {schoolName}. All rights reserved.</p>
          <p className="text-xs" style={{ color: onPrimary, opacity: 0.55 }}>Powered by <span className="font-semibold" style={{ opacity: 0.85 }}>CAS School Management System</span></p>
        </div>
      </footer>
    </div>
  );
}
