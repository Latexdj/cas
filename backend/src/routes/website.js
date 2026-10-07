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

// GET /api/website — every published, module-enabled school's slug plus its
// published pages' slugs/updated_at. Public, no-auth (same "public is
// public" design as the rest of this file) — used only to build
// app/sitemap.ts; carries no content, just the URL shape.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT w.school_id, w.slug AS school_slug, w.updated_at AS site_updated_at,
             p.slug AS page_slug, p.updated_at AS page_updated_at
      FROM school_website_settings w
      LEFT JOIN website_pages p ON p.school_id = w.school_id AND p.status = 'published' AND p.is_homepage = false AND p.slug <> 'home'
      WHERE w.is_published = true
      ORDER BY w.slug
    `);
    const bySchool = new Map();
    for (const row of rows) {
      if (!bySchool.has(row.school_id)) {
        bySchool.set(row.school_id, { school_slug: row.school_slug, site_updated_at: row.site_updated_at, pages: [] });
      }
      if (row.page_slug) bySchool.get(row.school_id).pages.push({ slug: row.page_slug, updated_at: row.page_updated_at });
    }
    const result = [];
    for (const [schoolId, entry] of bySchool) {
      if (await isModuleEnabledForSchool(schoolId, 'website')) result.push(entry);
    }
    res.json(result);
  } catch (err) { next(err); }
});

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

// GET /api/website/:slug/pages/:pageSlug — published pages only; a draft or
// missing page is indistinguishable from an unpublished site (same 404
// semantics used throughout this file).
router.get('/:slug/pages/:pageSlug', async (req, res, next) => {
  try {
    const school = await getSchoolBySlug(req.params.slug);
    if (!school) return res.status(404).json({ error: 'Website not found' });
    const { rows } = await pool.query(
      `SELECT id, slug, title, menu_label, content, seo_title, seo_description, og_image_url, page_type
       FROM website_pages WHERE school_id = $1 AND slug = $2 AND status = 'published'`,
      [school.school_id, req.params.pageSlug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Page not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/website/:slug/menu — header + footer trees in one call, with
// page_id entries resolved to their slug/title so the frontend needs no
// second round-trip to render links.
router.get('/:slug/menu', async (req, res, next) => {
  try {
    const school = await getSchoolBySlug(req.params.slug);
    if (!school) return res.status(404).json({ error: 'Website not found' });
    const { rows } = await pool.query(
      `SELECT m.id, m.location, m.label, m.external_url, m.is_home_link, m.parent_id, m.open_new_tab,
              p.slug AS page_slug
       FROM website_menu_items m LEFT JOIN website_pages p ON p.id = m.page_id AND p.school_id = m.school_id
       WHERE m.school_id = $1 AND m.is_visible = true
         AND (m.page_id IS NULL OR p.status = 'published')
       ORDER BY m.sort_order`,
      [school.school_id]
    );
    const buildTree = (items) => {
      const byId = new Map(items.map(it => [it.id, { ...it, children: [] }]));
      const top = [];
      for (const it of byId.values()) {
        if (it.parent_id && byId.has(it.parent_id)) byId.get(it.parent_id).children.push(it);
        else top.push(it);
      }
      return top;
    };
    res.json({
      header: buildTree(rows.filter(r => r.location === 'header')),
      footer: buildTree(rows.filter(r => r.location === 'footer')),
    });
  } catch (err) { next(err); }
});

module.exports = router;
