'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

const RichTextEditor = dynamic(
  () => import('@/components/RichTextEditor').then(m => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-[300px] rounded-lg border border-slate-200 bg-slate-50 animate-pulse" /> }
);

interface PageData {
  id?: string; slug?: string; title?: string; menu_label?: string;
  seo_title?: string; seo_description?: string; og_image_url?: string;
  content?: string; status?: 'draft' | 'published'; is_homepage?: boolean;
  page_type?: string;
}

interface GalleryImage { id: string; image_url: string; caption: string | null; sort_order: number }

const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Page type is chosen once at creation and is immutable after — same
// precedent as the homepage's slug being locked — so this panel only needs
// to exist once the page has a real id to attach images to.
function GalleryPanel({ pageId }: { pageId: string }) {
  const [images, setImages] = useState<GalleryImage[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await api.get('/api/admin/website/gallery', { params: { page_id: pageId } });
    setImages(data);
  }, [pageId]);
  useEffect(() => { load(); }, [load]);

  async function upload(files: FileList) {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const image_data = await fileToBase64(file);
        await api.post('/api/admin/website/gallery', { page_id: pageId, image_data });
      }
      await load();
    } catch { /* a failed image doesn't block the others already uploaded */ }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function updateCaption(id: string, caption: string) {
    await api.patch(`/api/admin/website/gallery/${id}`, { caption });
    load();
  }

  async function remove(id: string) {
    await api.delete(`/api/admin/website/gallery/${id}`);
    load();
  }

  async function move(index: number, dir: -1 | 1) {
    if (!images) return;
    const other = images[index + dir];
    const self  = images[index];
    if (!other) return;
    await Promise.all([
      api.patch(`/api/admin/website/gallery/${self.id}`, { sort_order: other.sort_order }),
      api.patch(`/api/admin/website/gallery/${other.id}`, { sort_order: self.sort_order }),
    ]);
    load();
  }

  return (
    <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">Photos</h2>
        <label className="text-xs font-semibold text-[#145C44] hover:underline cursor-pointer">
          {uploading ? 'Uploading…' : '+ Add photos'}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" disabled={uploading}
            onChange={e => e.target.files?.length && upload(e.target.files)} />
        </label>
      </div>
      {images === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : images.length === 0 ? (
        <p className="text-sm text-slate-400">No photos yet. Add some above.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {images.map((img, i) => (
            <div key={img.id} className="border border-slate-100 rounded-lg overflow-hidden">
              <img src={img.image_url} alt="" className="w-full h-36 object-cover" />
              <div className="p-2 space-y-2">
                <input
                  className={`${inputCls} mt-0`} placeholder="Caption (optional)"
                  defaultValue={img.caption ?? ''}
                  onBlur={e => { if (e.target.value !== (img.caption ?? '')) updateCaption(img.id, e.target.value); }}
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="w-6 h-6 text-slate-400 hover:text-slate-700 disabled:opacity-20">↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === images.length - 1} className="w-6 h-6 text-slate-400 hover:text-slate-700 disabled:opacity-20">↓</button>
                  </div>
                  <button onClick={() => remove(img.id)} className="text-xs font-semibold text-red-600 hover:underline">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function WebsitePageEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';

  const [page,    setPage]    = useState<PageData>({ page_type: 'standard' });
  const [saving,  setSaving]  = useState<'draft' | 'publish' | null>(null);
  const [error,   setError]   = useState('');
  const [ogB64,   setOgB64]   = useState('');
  const ogRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (isNew) return;
    try { const { data } = await api.get(`/api/admin/website/pages/${id}`); setPage(data); } catch {}
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof PageData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPage(p => ({ ...p, [k]: e.target.value }));

  async function save(status: 'draft' | 'publish') {
    if (!page.slug || !page.title) { setError('Title and slug are required.'); return; }
    setSaving(status); setError('');
    try {
      const payload: Record<string, unknown> = {
        slug: page.slug, title: page.title, menu_label: page.menu_label || null,
        seo_title: page.seo_title || null, seo_description: page.seo_description || null,
        content: page.content ?? '',
      };
      if (ogB64) payload.og_image_data = ogB64;

      if (isNew) {
        payload.page_type = page.page_type === 'gallery' ? 'gallery' : 'standard';
        const { data } = await api.post('/api/admin/website/pages', payload);
        if (status === 'publish') {
          await api.patch(`/api/admin/website/pages/${data.id}`, { status: 'published' });
        }
        router.replace(`/website/pages/${data.id}`);
      } else {
        payload.status = status === 'publish' ? 'published' : 'draft';
        const { data } = await api.patch(`/api/admin/website/pages/${id}`, payload);
        setPage(data); setOgB64('');
        if (ogRef.current) ogRef.current.value = '';
      }
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(null); }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/website/pages" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Pages</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{isNew ? 'Create page' : page.title || 'Edit page'}</h1>
          {!isNew && page.status && (
            <p className="text-xs text-slate-400 mt-0.5">{page.status === 'published' ? 'Published' : 'Draft — not visible on your public site yet'}</p>
          )}
        </div>
      </div>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500">Page title</label>
            <input className={inputCls} value={page.title ?? ''} onChange={set('title')} placeholder="About Us" disabled={page.is_homepage} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">Menu label</label>
            <input className={inputCls} value={page.menu_label ?? ''} onChange={set('menu_label')} placeholder="Defaults to page title" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500">URL slug</label>
          <input className={inputCls} value={page.slug ?? ''} onChange={set('slug')} placeholder="about-us" disabled={page.is_homepage} />
        </div>
        {isNew && (
          <div>
            <label className="block text-xs font-semibold text-slate-500">Page type</label>
            <p className="text-xs text-slate-400 mt-0.5 mb-1.5">Can&apos;t be changed after the page is created.</p>
            <div className="flex gap-2">
              {(['standard', 'gallery'] as const).map(t => (
                <button key={t} type="button" onClick={() => setPage(p => ({ ...p, page_type: t }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    (page.page_type ?? 'standard') === t ? 'bg-[#145C44] text-white border-[#145C44]' : 'text-slate-600 border-slate-200'
                  }`}>
                  {t === 'standard' ? 'Standard page' : 'Photo gallery'}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">{page.page_type === 'gallery' ? 'Introduction (optional)' : 'Content'}</h2>
        <RichTextEditor value={page.content ?? ''} onChange={html => setPage(p => ({ ...p, content: html }))}
          placeholder={page.page_type === 'gallery' ? 'A short intro shown above the photos…' : 'Write your page content…'}
          minHeight={page.page_type === 'gallery' ? 120 : 300} />
      </section>

      {page.page_type === 'gallery' && (
        isNew
          ? <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-5">Save this page to start adding photos.</p>
          : <GalleryPanel pageId={id} />
      )}

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-500">SEO</h2>
        <div>
          <label className="block text-xs font-semibold text-slate-500">SEO title</label>
          <input className={inputCls} value={page.seo_title ?? ''} onChange={set('seo_title')} placeholder="Defaults to page title" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500">SEO description</label>
          <input className={inputCls} value={page.seo_description ?? ''} onChange={set('seo_description')} placeholder="One or two sentences shown in search results" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500">Social share image</label>
          {page.og_image_url && <img src={page.og_image_url} className="mt-1 w-full h-24 object-cover rounded-lg border border-slate-200" />}
          <input ref={ogRef} type="file" accept="image/*" className="mt-1 text-xs"
            onChange={async e => { if (e.target.files?.[0]) setOgB64(await fileToBase64(e.target.files[0])); }} />
        </div>
      </section>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => save('draft')} loading={saving === 'draft'}>Save Draft</Button>
        <Button onClick={() => save('publish')} loading={saving === 'publish'}>Publish</Button>
      </div>
    </div>
  );
}
