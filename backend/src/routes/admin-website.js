const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { uploadFile } = require('../services/storage.service');

router.use(authenticate, requireActiveSubscription, adminOnly, checkModuleAccess('website'));

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM school_website_settings WHERE school_id = $1`, [req.schoolId]
    );
    res.json(rows[0] ?? { school_id: req.schoolId, is_published: false,
      show_programs: true, show_admissions_cta: true });
  } catch (err) { next(err); }
});

router.patch('/settings', async (req, res, next) => {
  try {
    const {
      slug, is_published, hero_tagline, show_programs, show_admissions_cta,
      hero_image_data,
    } = req.body;

    let hero_image_url = null;
    if (hero_image_data) hero_image_url = await uploadFile(hero_image_data, `website/${req.schoolId}/hero`, { upsert: true });

    const { rows } = await pool.query(
      `INSERT INTO school_website_settings
         (school_id, slug, is_published, hero_image_url, hero_tagline, show_programs, show_admissions_cta, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (school_id) DO UPDATE SET
         slug                = COALESCE(EXCLUDED.slug,                school_website_settings.slug),
         is_published         = COALESCE(EXCLUDED.is_published,        school_website_settings.is_published),
         hero_image_url       = COALESCE(EXCLUDED.hero_image_url,      school_website_settings.hero_image_url),
         hero_tagline         = COALESCE(EXCLUDED.hero_tagline,        school_website_settings.hero_tagline),
         show_programs        = COALESCE(EXCLUDED.show_programs,       school_website_settings.show_programs),
         show_admissions_cta  = COALESCE(EXCLUDED.show_admissions_cta, school_website_settings.show_admissions_cta),
         updated_at           = now()
       RETURNING *`,
      [req.schoolId, slug || null,
       is_published !== undefined ? Boolean(is_published) : null,
       hero_image_url, hero_tagline || null,
       show_programs !== undefined ? Boolean(show_programs) : null,
       show_admissions_cta !== undefined ? Boolean(show_admissions_cta) : null]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That URL slug is already taken by another school.' });
    next(err);
  }
});

module.exports = router;
