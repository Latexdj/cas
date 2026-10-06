import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://admin-portal-eta-topaz.vercel.app';

// The admin dashboard (admin-portal/app/(dashboard)/...) is a Next.js route
// group — it has no shared URL prefix like "/admin", its pages sit bare at
// the root (/students, /website, /settings, ...), same as the teacher,
// student, principal, primary and super-admin portals each having their
// own prefix but the main dashboard having none at all. Trying to list
// every authenticated path individually would be both impractical and
// fragile against new routes. Disallowing "/" and explicitly allowing only
// the two public trees is the standard, robust pattern for "nothing is
// crawlable except these" — a more specific `allow` overrides the broader
// `disallow` for matching paths.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/site/', '/admissions/'],
      disallow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
