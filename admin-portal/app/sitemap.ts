import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://admin-portal-eta-topaz.vercel.app';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface SitemapSchoolEntry {
  school_slug: string;
  site_updated_at: string;
  pages: { slug: string; updated_at: string }[];
}

// Only the Website module's own URLs — the existing public admissions
// portal isn't part of this sitemap, out of scope for this conversion.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let schools: SitemapSchoolEntry[] = [];
  try {
    const res = await fetch(`${API}/api/website`, { next: { revalidate: 3600 } });
    if (res.ok) schools = await res.json();
  } catch {
    // A sitemap that fails to build shouldn't break the deploy — return
    // an empty one rather than throwing.
    return [];
  }

  const entries: MetadataRoute.Sitemap = [];
  for (const school of schools) {
    entries.push({ url: `${SITE_URL}/site/${school.school_slug}`, lastModified: new Date(school.site_updated_at) });
    for (const page of school.pages) {
      entries.push({ url: `${SITE_URL}/site/${school.school_slug}/${page.slug}`, lastModified: new Date(page.updated_at) });
    }
  }
  return entries;
}
