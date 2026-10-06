'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface MenuItem {
  id: string; label: string; page_id: string | null; external_url: string | null;
  parent_id: string | null; sort_order: number; open_new_tab: boolean; is_visible: boolean;
  page_slug: string | null; page_title: string | null; children: MenuItem[];
}
interface PageOption { id: string; title: string; slug: string; status: string }

const inputCls = 'rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

function NewItemForm({ pages, onAdd }: { pages: PageOption[]; onAdd: (v: { label: string; page_id?: string; external_url?: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs font-semibold text-[#145C44] hover:underline">+ Add item</button>
  );

  const isPage = pages.some(p => p.id === target);

  return (
    <div className="border border-dashed border-slate-200 rounded-lg p-3 space-y-2">
      <input className={`${inputCls} w-full`} placeholder="Label" value={label} onChange={e => setLabel(e.target.value)} />
      <select className={`${inputCls} w-full`} value={target} onChange={e => setTarget(e.target.value)}>
        <option value="">Choose a page…</option>
        {pages.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        <option value="__external">Custom URL / anchor…</option>
      </select>
      {target === '__external' && (
        <input className={`${inputCls} w-full`} placeholder="https://… or #anchor" id="ext-url-input" />
      )}
      <div className="flex gap-2 justify-end">
        <button onClick={() => { setOpen(false); setLabel(''); setTarget(''); }} className="text-xs text-slate-400 px-2 py-1">Cancel</button>
        <button
          onClick={() => {
            if (!label || !target) return;
            if (target === '__external') {
              const url = (document.getElementById('ext-url-input') as HTMLInputElement | null)?.value || '';
              if (!url) return;
              onAdd({ label, external_url: url });
            } else {
              onAdd({ label, page_id: target });
            }
            setOpen(false); setLabel(''); setTarget('');
          }}
          className="text-xs font-semibold text-white bg-[#145C44] rounded-lg px-3 py-1.5">
          Add
        </button>
      </div>
    </div>
  );
}

function MenuColumn({ title, location, items, pages, onChange }: {
  title: string; location: 'header' | 'footer'; items: MenuItem[]; pages: PageOption[]; onChange: () => void;
}) {
  async function move(list: MenuItem[], index: number, dir: -1 | 1) {
    const other = list[index + dir];
    const self  = list[index];
    if (!other) return;
    await Promise.all([
      api.patch(`/api/admin/website/menu/${self.id}`, { sort_order: other.sort_order }),
      api.patch(`/api/admin/website/menu/${other.id}`, { sort_order: self.sort_order }),
    ]);
    onChange();
  }
  async function toggleVisible(item: MenuItem) {
    await api.patch(`/api/admin/website/menu/${item.id}`, { is_visible: !item.is_visible });
    onChange();
  }
  async function remove(id: string) {
    await api.delete(`/api/admin/website/menu/${id}`);
    onChange();
  }
  async function add(v: { label: string; page_id?: string; external_url?: string }) {
    await api.post('/api/admin/website/menu', { location, label: v.label, page_id: v.page_id, external_url: v.external_url });
    onChange();
  }

  function Row({ item, index, list, depth }: { item: MenuItem; index: number; list: MenuItem[]; depth: number }) {
    return (
      <div>
        <div className={`flex items-center justify-between gap-2 py-2 px-3 rounded-lg ${depth > 0 ? 'ml-6 bg-slate-50' : 'bg-white border border-slate-100'}`}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
            <p className="text-xs text-slate-400 truncate">{item.page_title ? `Page: ${item.page_title}` : item.external_url}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => move(list, index, -1)} disabled={index === 0} className="w-6 h-6 text-slate-400 hover:text-slate-700 disabled:opacity-20">↑</button>
            <button onClick={() => move(list, index, 1)} disabled={index === list.length - 1} className="w-6 h-6 text-slate-400 hover:text-slate-700 disabled:opacity-20">↓</button>
            <button onClick={() => toggleVisible(item)} className={`text-xs font-semibold px-2 py-1 rounded ${item.is_visible ? 'text-[#145C44]' : 'text-slate-400'}`}>
              {item.is_visible ? 'Visible' : 'Hidden'}
            </button>
            <button onClick={() => remove(item.id)} className="text-xs font-semibold text-red-500 px-1.5">Delete</button>
          </div>
        </div>
        {item.children.map((c, i) => <Row key={c.id} item={c} index={i} list={item.children} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
      <h2 className="text-sm font-semibold text-slate-500">{title}</h2>
      {items.length === 0 && <p className="text-xs text-slate-400">No items yet.</p>}
      <div className="space-y-2">
        {items.map((it, i) => <Row key={it.id} item={it} index={i} list={items} depth={0} />)}
      </div>
      <NewItemForm pages={pages} onAdd={add} />
    </div>
  );
}

export default function WebsiteNavigationPage() {
  const [header, setHeader] = useState<MenuItem[] | null>(null);
  const [footer, setFooter] = useState<MenuItem[] | null>(null);
  const [pages,  setPages]  = useState<PageOption[]>([]);

  const load = useCallback(async () => {
    const [h, f, p] = await Promise.all([
      api.get('/api/admin/website/menu', { params: { location: 'header' } }),
      api.get('/api/admin/website/menu', { params: { location: 'footer' } }),
      api.get('/api/admin/website/pages'),
    ]);
    setHeader(h.data);
    setFooter(f.data);
    setPages(p.data.filter((pg: PageOption) => pg.status === 'published'));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href="/website" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Website</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Navigation</h1>
        <p className="text-sm text-slate-400 mt-0.5">Control the header and footer menus on your public website. Only published pages can be linked.</p>
      </div>
      {header === null || footer === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <MenuColumn title="Header menu" location="header" items={header} pages={pages} onChange={load} />
          <MenuColumn title="Footer menu" location="footer" items={footer} pages={pages} onChange={load} />
        </div>
      )}
    </div>
  );
}
