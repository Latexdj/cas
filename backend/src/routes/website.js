const router = require('express').Router();
const pool   = require('../config/db');
const { isModuleEnabledForSchool } = require('../middleware/moduleAccess');

// Public, no-auth school website — same design as the admissions portal
// (backend/src/routes/admissions.js): resolve the school by slug first, and
// gate it at that single point. An unpublished site and an unrecognized slug
// are indistinguishable (both 404), same semantics as admissions.
async function getSchoolBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT s.id AS school_id, s.name AS school_name, s.logo_url, s.primary_color, s.accent_color,
            s.motto, s.vision, s.mission, s.core_values,
            s.address, s.phone, s.email,
            s.school_type, s.headmaster_name, s.region, s.district,
            w.slug, w.is_published, w.hero_image_url, w.hero_tagline,
            w.show_programs, w.show_admissions_cta, w.show_stats
     FROM school_website_settings w
     JOIN schools s ON s.id = w.school_id
     WHERE w.slug = $1`,
    [slug]
  );
  const school = rows[0] || null;
  if (!school) return null;
  if (!school.is_published) return null;
  if (!await isModuleEnabledForSchool(school.school_id, 'website')) return null;
  return school;
}

// GET /api/website/:slug
router.get('/:slug', async (req, res, next) => {
  try {
    const school = await getSchoolBySlug(req.params.slug);
    if (!school) return res.status(404).json({ error: 'Website not found' });

    let programs = [];
    if (school.show_programs) {
      const { rows } = await pool.query(
        `SELECT id, name FROM programs WHERE school_id = $1 ORDER BY name`,
        [school.school_id]
      );
      programs = rows;
    }

    let stats = null;
    if (school.show_stats) {
      const [{ rows: s }, { rows: t }, { rows: p }] = await Promise.all([
        pool.query(`SELECT count(*)::int AS n FROM students WHERE school_id = $1 AND status = 'Active'`, [school.school_id]),
        pool.query(`SELECT count(*)::int AS n FROM teachers WHERE school_id = $1 AND status = 'Active'`, [school.school_id]),
        pool.query(`SELECT count(*)::int AS n FROM programs WHERE school_id = $1`, [school.school_id]),
      ]);
      stats = { students: s[0].n, faculty: t[0].n, programmes: p[0].n };
    }

    let admissions_slug = null;
    if (school.show_admissions_cta) {
      const { rows } = await pool.query(
        `SELECT portal_slug FROM school_admission_settings WHERE school_id = $1`,
        [school.school_id]
      );
      if (rows[0]?.portal_slug && await isModuleEnabledForSchool(school.school_id, 'admissions')) {
        admissions_slug = rows[0].portal_slug;
      }
    }

    res.json({ ...school, programs, stats, admissions_slug });
  } catch (err) { next(err); }
});

module.exports = router;
