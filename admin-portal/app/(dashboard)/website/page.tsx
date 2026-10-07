'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Settings { slug?: string; is_published?: boolean }
interface PageRow { status: 'draft' | 'published'; is_homepage: boolean }
interface MenuTree { children: unknown[] }

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-100 hover:border-[#145C44]/30 hover:bg-[#E8F4EE]/40 transition-colors">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className="text-slate-300">&rarr;</span>
    </Link>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
    </div>
  );
}

export default function WebsiteDashboard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const [menuCount, setMenuCount] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [{ data: s }, { data: p }, { data: h }, { data: f }, { data: c }] = await Promise.all([
      api.get('/api/admin/website/settings'),
      api.get('/api/admin/website/pages'),
      api.get('/api/admin/website/menu', { params: { location: 'header' } }),
      api.get('/api/admin/website/menu', { params: { location: 'footer' } }),
      api.get('/api/admin/website/contact'),
    ]);
    setSettings(s);
    setPages(p);
    const count = (items: MenuTree[]): number => items.reduce((n, it) => n + 1 + count((it.children as MenuTree[]) || []), 0);
    setMenuCount(count(h) + count(f));
    setUnreadCount(c.unread_count);
  }, []);
  useEffect(() => { load(); }, [load]);

  const siteUrl = settings?.slug ? `${typeof window !== 'undefined' ? window.location.origin : ''}/site/${settings.slug}` : null;
  const publishedCount = pages?.filter(p => p.status === 'published').length ?? 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Website</h1>
        <p className="text-sm text-slate-400 mt-0.5">Your school's public website — separate from the Admissions portal, visible whether or not Admissions is open.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-medium text-slate-800">Website is {settings?.is_published ? 'Published' : 'Unpublished'}</p>
          {siteUrl ? (
            <a href={siteUrl} target="_blank" className="text-xs text-[#145C44] font-mono hover:underline">{siteUrl}</a>
          ) : (
            <p className="text-xs text-slate-400">Set a URL slug in Settings to publish your site.</p>
          )}
        </div>
        <Link href="/website/settings" className="text-xs font-semibold text-[#145C44] hover:underline">Edit settings</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Pages" value={pages ? String(pages.length) : '—'} />
        <StatTile label="Published pages" value={pages ? String(publishedCount) : '—'} />
        <StatTile label="Menu items" value={menuCount !== null ? String(menuCount) : '—'} />
        <StatTile label="Unread inquiries" value={unreadCount !== null ? String(unreadCount) : '—'} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-500 mb-3">Quick actions</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <QuickAction href="/website/pages/new" label="Create page" />
          <QuickAction href="/website/pages" label="Manage pages" />
          <QuickAction href="/website/navigation" label="Manage navigation" />
          <QuickAction href="/website/inquiries" label="View inquiries" />
          <QuickAction href="/website/settings" label="Website settings" />
        </div>
      </div>
    </div>
  );
}
