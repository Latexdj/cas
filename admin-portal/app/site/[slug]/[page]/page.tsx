import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { SiteChrome } from '@/components/site/SiteChrome';
import { GalleryGrid } from '@/components/site/GalleryGrid';
import { getSiteBranding, getSitePage, getSiteMenu } from '@/lib/site-data';

type Params = Promise<{ slug: string; page: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, page: pageSlug } = await params;
  const [branding, page] = await Promise.all([getSiteBranding(slug), getSitePage(slug, pageSlug)]);
  if (!branding || !page) return { title: 'Page Not Found' };

  const title = page.seo_title || page.title;
  const description = page.seo_description || undefined;
  const image = page.og_image_url || branding.logo_url || undefined;

  return {
    title: `${title} — ${branding.school_name}`,
    description,
    openGraph: { title: `${title} — ${branding.school_name}`, description, images: image ? [image] : undefined },
  };
}

export default async function SchoolWebsiteSubPage({ params }: { params: Params }) {
  const { slug, page: pageSlug } = await params;
  // "home" is the site's own homepage, served at /site/<slug> with no page
  // needed — consolidate any old/stray page at this URL onto the canonical
  // one rather than serving it as separate, duplicate content.
  if (pageSlug === 'home') permanentRedirect(`/site/${slug}`);
  const [branding, page, menu] = await Promise.all([getSiteBranding(slug), getSitePage(slug, pageSlug), getSiteMenu(slug)]);
  if (!branding || !page) notFound();

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
      ) : page.page_type === 'gallery' ? (
        <section className="pt-32 pb-20 px-6 bg-white">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-8">{page.title}</h1>
            {page.content && (
              <div className="site-page-content mb-10" dangerouslySetInnerHTML={{ __html: page.content }} />
            )}
            <GalleryGrid images={page.images ?? []} />
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
