// Fixed categories for Websites and tools (must match CATEGORIES in
// backend/src/routes/teacher-resources.js and the table's CHECK).
export const SITE_CATEGORIES = [
  { key: 'curriculum',               label: 'Curriculum & syllabus' },
  { key: 'lesson_planning',          label: 'Lesson planning' },
  { key: 'videos',                   label: 'Videos' },
  { key: 'past_questions',           label: 'Past questions & exams' },
  { key: 'professional_development', label: 'Professional development' },
  { key: 'tools',                    label: 'Tools' },
] as const;

export type SiteCategory = typeof SITE_CATEGORIES[number]['key'];

export const categoryLabel = (k: string) => SITE_CATEGORIES.find(c => c.key === k)?.label ?? k;

// "nacca.gov.gh" from a full link, for showing where a site goes.
export function siteDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
