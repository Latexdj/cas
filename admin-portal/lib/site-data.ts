import { cache } from 'react';
import type { MenuNode } from '@/components/site/SiteChrome';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface SiteBranding {
  school_id: string; school_name: string; logo_url: string | null;
  primary_color: string; accent_color: string;
  motto: string | null; vision: string | null; mission: string | null; core_values: string | null;
  address: string | null; phone: string | null; email: string | null;
  school_type: string | null; headmaster_name: string | null; region: string | null; district: string | null;
  slug: string; is_published: boolean; hero_image_url: string | null; hero_tagline: string | null;
  show_programs: boolean; show_admissions_cta: boolean; show_stats: boolean;
  programs: { id: string; name: string }[];
  stats: { students: number; faculty: number; programmes: number } | null;
  admissions_slug: string | null;
}

export interface SitePage {
  id: string; slug: string; title: string; menu_label: string | null; content: string | null;
  seo_title: string | null; seo_description: string | null; og_image_url: string | null; page_type: string;
}

export interface SiteMenu { header: MenuNode[]; footer: MenuNode[] }

// Wrapped in React's cache() so a generateMetadata() call and the page
// body's own call for the same (slug[, pageSlug]) within one request only
// hit the backend once — the standard App Router pattern for sharing data
// between the two without a duplicate network round-trip.
export const getSiteBranding = cache(async (slug: string): Promise<SiteBranding | null> => {
  const res = await fetch(`${API}/api/website/${slug}`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return res.json();
});

export const getSitePage = cache(async (slug: string, pageSlug: string): Promise<SitePage | null> => {
  const res = await fetch(`${API}/api/website/${slug}/pages/${pageSlug}`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return res.json();
});

export const getSiteMenu = cache(async (slug: string): Promise<SiteMenu | null> => {
  const res = await fetch(`${API}/api/website/${slug}/menu`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return res.json();
});
