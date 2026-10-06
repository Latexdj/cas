// Shared server-side limits for Website module text fields. Enforced here
// (not just via frontend maxlength) because a QA pass found a 100KB title
// could be submitted directly through the API. Picked to comfortably fit
// real school content — e.g. "St. Augustine's Senior High Technical School
// — Our Rich History" is ~55 chars — without being a DB schema constraint,
// since TEXT columns have no inherent limit and a future school's genuine
// content shouldn't risk a migration to raise a hardcoded VARCHAR cap.
const LIMITS = {
  title: 200,
  menu_label: 60, // website_pages.menu_label
  label: 60,      // website_menu_items.label — same concept, different column name
  slug: 100,
  seo_title: 70,
  seo_description: 300,
};

// field -> value map; returns the first field name that exceeds its limit,
// or null if everything is within bounds. Skips absent/empty values (the
// existing "required" checks already cover those separately).
function findOversizedField(fields) {
  for (const [key, value] of Object.entries(fields)) {
    const limit = LIMITS[key];
    if (limit && typeof value === 'string' && value.length > limit) return { field: key, limit };
  }
  return null;
}

module.exports = { LIMITS, findOversizedField };
