'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface PageRow {
  id: string; slug: string; title: string; status: 'draft' | 'published';
  is_homepage: boolean; page_type: string; updated_at: string;
}

function StatusBadge({ status }: { status: string }) {
  return status === 'published'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#E8F4EE] text-[#0B3D2E]">Published</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">Draft</span>;
}

export default function WebsitePagesList() {
  const [pages,   setPages]   = useState<PageRow[] | null>(null);
  const [slug,    setSlug]    = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: p }, { data: s }] = await Promise.all([
      api.get('/api/admin/website/pages'),
      api.get('/api/admin/website/settings'),
    ]);
    setPages(p);
    setSlug(s.slug ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function generateStarter() {
    setGenerating(true);
    try { await api.post('/api/admin/website/pages/generate-starter'); await load(); }
    catch {} finally { setGenerating(false); }
  }

  async function duplicate(id: string) {
    await api.post(`/api/admin/website/pages/${id}/duplicate`);
    await load();
  }

  async function remove(id: string) {
    setDeleting(id);
    try { await api.delete(`/api/admin/website/pages/${id}`); await load(); }
    catch {} finally { setDeleting(null); }
  }

  if (!pages) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/website" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Website</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Pages</h1>
          <p className="text-sm text-slate-400 mt-0.5">Create and manage the pages on your public website.</p>
        </div>
        <Link href="/website/pages/new"><Button>Create page</Button></Link>
      </div>

      {pages.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center space-y-3">
          <p className="text-sm text-slate-500">No pages yet. Generate a starter Home, About and Contact page from your existing website settings, or create one from scratch.</p>
          <Button onClick={generateStarter} loading={generating}>Generate starter pages</Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 font-semibold">
              <tr>
                <th className="text-left px-4 py-2.5">Title</th>
                <th className="text-left px-4 py-2.5">Slug</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Updated</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pages.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {p.title}{p.is_homepage && <span className="ml-2 text-xs text-slate-400 font-normal">(Homepage)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                    {slug ? (
                      <a href={`/site/${slug}${p.is_homepage ? '' : '/' + p.slug}`} target="_blank" className="hover:underline">/{p.slug}</a>
                    ) : `/${p.slug}`}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(p.updated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/website/pages/${p.id}`} className="text-xs font-semibold text-[#145C44] hover:underline mr-3">Edit</Link>
                    <button onClick={() => duplicate(p.id)} className="text-xs font-semibold text-slate-500 hover:underline mr-3">Duplicate</button>
                    {!p.is_homepage && (
                      <button onClick={() => remove(p.id)} disabled={deleting === p.id} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40">Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
