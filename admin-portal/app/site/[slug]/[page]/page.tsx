'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { SiteChrome, MenuNode } from '@/components/site/SiteChrome';

interface Branding {
  school_name: string; logo_url: string | null; primary_color: string; accent_color: string;
  motto: string | null; phone: string | null; email: string | null; address: string | null;
  show_admissions_cta: boolean; admissions_slug: string | null;
}

interface PageContent {
  slug: string; title: string; menu_label: string | null; content: string | null;
  seo_title: string | null; seo_description: string | null; page_type: string;
}

export default function SchoolWebsiteSubPage() {
  const { slug, page: pageSlug } = useParams<{ slug: string; page: string }>();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [page,     setPage]     = useState<PageContent | null>(null);
  const [menu,     setMenu]     = useState<{ header: MenuNode[]; footer: MenuNode[] } | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(async () => {
    try {
      const [{ data: b }, { data: p }] = await Promise.all([
        publicApi.get(`/api/website/${slug}`),
        publicApi.get(`/api/website/${slug}/pages/${pageSlug}`),
      ]);
      setBranding(b);
      setPage(p);
      publicApi.get(`/api/website/${slug}/menu`).then(r => setMenu(r.data)).catch(() => setMenu(null));
    } catch {
      setError('This page could not be found.');
    } finally {
      setLoading(false);
    }
  }, [slug, pageSlug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (page) document.title = page.seo_title || page.title;
  }, [page]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8]">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-[#145C44] border-b-transparent animate-spin mx-auto" />
        <p className="text-sm text-slate-500 font-medium">Loading…</p>
      </div>
    </div>
  );

  if (error || !branding || !page) return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-xl font-bold text-slate-800">Page Not Found</p>
        <p className="text-slate-500 text-sm">{error || 'This page does not exist or has not been published yet.'}</p>
      </div>
    </div>
  );

  const primary = branding.primary_color || '#0B3D2E';
  const accent  = branding.accent_color  || '#C8973A';
  const canApply = Boolean(branding.show_admissions_cta && branding.admissions_slug);
  const hasContact = Boolean(branding.phone || branding.email || branding.address);
  const fallbackNavLinks = [hasContact && { href: '/site/' + slug + '#contact', label: 'Contact' }].filter(Boolean) as { href: string; label: string }[];

  return (
    <SiteChrome
      slug={slug} schoolName={branding.school_name} logoUrl={branding.logo_url}
      primary={primary} accent={accent} motto={branding.motto}
      menu={menu} fallbackNavLinks={fallbackNavLinks}
      canApply={canApply} admissionsSlug={branding.admissions_slug} isHomepage={false}
    >
      {page.page_type === 'contact' ? (
        <section className="pt-32 pb-20 px-6 bg-white">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-10">{page.title}</h1>
            {page.content && (
              <div className="site-page-content mb-10" dangerouslySetInnerHTML={{ __html: page.content }} />
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {branding.phone && (
                <a href={`tel:${branding.phone}`} className="flex items-center gap-4 p-5 rounded-xl border border-slate-100 bg-[#F5F0E8]/60 hover:shadow-md transition-shadow">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold">Phone</p>
                    <p className="font-bold text-slate-800 text-sm truncate">{branding.phone}</p>
                  </div>
                </a>
              )}
              {branding.email && (
                <a href={`mailto:${branding.email}`} className="flex items-center gap-4 p-5 rounded-xl border border-slate-100 bg-[#F5F0E8]/60 hover:shadow-md transition-shadow">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold">Email</p>
                    <p className="font-bold text-slate-800 text-sm truncate">{branding.email}</p>
                  </div>
                </a>
              )}
              {branding.address && (
                <div className="flex items-center gap-4 p-5 rounded-xl border border-slate-100 bg-[#F5F0E8]/60">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold">Address</p>
                    <p className="font-semibold text-slate-800 text-sm">{branding.address}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="pt-32 pb-20 px-6 bg-white">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-8">{page.title}</h1>
            {page.content
              ? <div className="site-page-content" dangerouslySetInnerHTML={{ __html: page.content }} />
              : <p className="text-slate-400 text-sm">This page has no content yet.</p>
            }
          </div>
        </section>
      )}
      <style>{`
        .site-page-content { color: #475569; line-height: 1.75; }
        .site-page-content h1, .site-page-content h2, .site-page-content h3,
        .site-page-content h4, .site-page-content h5, .site-page-content h6 {
          color: #0f172a; font-weight: 800; margin: 1.5em 0 0.5em;
        }
        .site-page-content h1 { font-size: 1.5rem; }
        .site-page-content h2 { font-size: 1.25rem; }
        .site-page-content h3 { font-size: 1.1rem; }
        .site-page-content p { margin: 0 0 1em; }
        .site-page-content ul { margin: 0 0 1em; padding-left: 1.4em; list-style-type: disc; }
        .site-page-content ol { margin: 0 0 1em; padding-left: 1.4em; list-style-type: decimal; }
        .site-page-content li { margin-bottom: 0.3em; }
        .site-page-content a { color: ${primary}; text-decoration: underline; }
        .site-page-content img { max-width: 100%; border-radius: 0.75rem; margin: 1em 0; }
      `}</style>
    </SiteChrome>
  );
}
