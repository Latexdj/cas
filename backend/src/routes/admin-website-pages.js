const router = require('express').Router();
const pool   = require('../config/db');
const sanitizeHtml = require('sanitize-html');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { uploadFile } = require('../services/storage.service');
const { findOversizedField } = require('../utils/websiteValidation');

router.use(authenticate, requireActiveSubscription, adminOnly, checkModuleAccess('website'));

// First place admin-authored rich text (from the existing Tiptap
// RichTextEditor, previously only ever rendered back to the authoring admin
// or into a server-generated PDF) reaches anonymous public visitors — so
// every write sanitizes server-side before it touches the database. The
// allowlist mirrors exactly what RichTextEditor.tsx can actually produce.
function sanitizePageContent(html) {
  if (!html) return html;
  return sanitizeHtml(html, {
    allowedTags: ['p', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'br', 'span', 'img'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedStyles: {
      '*': {
        'font-family':      [/^[\w\s,'"-]+$/],
        'font-size':        [/^\d+(\.\d+)?pt$/],
        'line-height':      [/^[\d.]+$/],
        'list-style-type':  [/^(disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman)$/],
        'text-align':       [/^(left|center|right|justify)$/],
      },
    },
  });
}

// Page slugs become a public URL segment (/site/<slug>/<pageSlug>) that an
// admin can type freely — normalize rather than reject so "My Page!" still
// works, instead of forcing non-technical users to hand-craft a URL-safe
// string. Returns null if nothing usable is left (e.g. all-Unicode/symbol input).
function normalizeSlug(raw) {
  const slug = String(raw ?? '')
    .trim().toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip accents (é → e)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function paragraph(text) {
  return `<p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>`;
}

// ── Pages ─────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, title, status, is_homepage, page_type, updated_at
       FROM website_pages WHERE school_id = $1 ORDER BY is_homepage DESC, title`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM website_pages WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Page not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, menu_label, seo_title, seo_description, content, og_image_data } = req.body;
    const slug = normalizeSlug(req.body.slug);
    if (!slug || !title) return res.status(400).json({ error: 'Slug and title are required.' });
    // "home" is reserved for the site's own homepage (served at /site/<slug>
    // with no page needed) — this used to be the only way an admin could get
    // a working "Home" nav link, which left an empty duplicate page sitting
    // in the sitemap. Use a Home-type navigation item instead.
    if (slug === 'home') return res.status(400).json({ error: 'The slug "home" is reserved for your site’s homepage. Use Navigation to add a Home link instead of creating a page.' });
    // 'contact' and 'homepage' are only ever set by generate-starter — a
    // school should have at most one of each, which this general endpoint
    // has no way to enforce. 'gallery' is the only extra type choosable here.
    const pageType = req.body.page_type === 'gallery' ? 'gallery' : 'standard';

    const oversized = findOversizedField({ title, menu_label, seo_title, seo_description, slug });
    if (oversized) return res.status(400).json({ error: `${oversized.field.replace('_', ' ')} must be ${oversized.limit} characters or fewer.` });

    let og_image_url = null;
    if (og_image_data) og_image_url = await uploadFile(og_image_data, `website/${req.schoolId}/pages/${slug}-og`, { upsert: true });

    const { rows } = await pool.query(
      `INSERT INTO website_pages (school_id, slug, title, menu_label, page_type, seo_title, seo_description, og_image_url, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [req.schoolId, slug, title, menu_label || null, pageType, seo_title || null, seo_description || null,
       og_image_url, sanitizePageContent(content || '')]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A page with that URL slug already exists.' });
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { title, menu_label, seo_title, seo_description, content, status, og_image_data } = req.body;

    const { rows: current } = await pool.query(`SELECT slug, is_homepage FROM website_pages WHERE id = $1 AND school_id = $2`, [req.params.id, req.schoolId]);
    if (!current.length) return res.status(404).json({ error: 'Page not found' });

    let slug = null;
    if (req.body.slug !== undefined) {
      slug = normalizeSlug(req.body.slug);
      if (!slug) return res.status(400).json({ error: 'That slug is not valid.' });
      if (current[0].is_homepage && slug !== current[0].slug) {
        return res.status(400).json({ error: 'The homepage URL cannot be changed.' });
      }
      if (!current[0].is_homepage && slug === 'home') {
        return res.status(400).json({ error: 'The slug "home" is reserved for your site’s homepage. Use Navigation to add a Home link instead of creating a page.' });
      }
    }
    if (status !== undefined && !['draft', 'published'].includes(status)) {
      return res.status(400).json({ error: 'Status must be draft or published.' });
    }

    const oversized = findOversizedField({ title, menu_label, seo_title, seo_description, slug });
    if (oversized) return res.status(400).json({ error: `${oversized.field.replace('_', ' ')} must be ${oversized.limit} characters or fewer.` });

    let og_image_url = null;
    if (og_image_data) og_image_url = await uploadFile(og_image_data, `website/${req.schoolId}/pages/${req.params.id}-og`, { upsert: true });

    const { rows } = await pool.query(
      `UPDATE website_pages SET
         slug             = COALESCE($1, slug),
         title            = COALESCE($2, title),
         menu_label       = COALESCE($3, menu_label),
         seo_title        = COALESCE($4, seo_title),
         seo_description  = COALESCE($5, seo_description),
         og_image_url     = COALESCE($6, og_image_url),
         content          = COALESCE($7, content),
         status           = COALESCE($8, status),
         updated_at       = now()
       WHERE id = $9 AND school_id = $10
       RETURNING *`,
      [slug || null, title || null, menu_label || null, seo_title || null, seo_description || null,
       og_image_url, content !== undefined ? sanitizePageContent(content) : null,
       status || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Page not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A page with that URL slug already exists.' });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM website_pages WHERE id = $1 AND school_id = $2 AND is_homepage = false RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Page not found, or the homepage cannot be deleted.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const { rows: src } = await pool.query(
      `SELECT * FROM website_pages WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!src.length) return res.status(404).json({ error: 'Page not found' });
    const p = src[0];
    let newSlug = `${p.slug}-copy`;
    for (let i = 2; ; i++) {
      const { rows: clash } = await pool.query(`SELECT 1 FROM website_pages WHERE school_id = $1 AND slug = $2`, [req.schoolId, newSlug]);
      if (!clash.length) break;
      newSlug = `${p.slug}-copy-${i}`;
    }
    const { rows } = await pool.query(
      `INSERT INTO website_pages (school_id, slug, title, menu_label, page_type, content, seo_title, seo_description, og_image_url, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
       RETURNING *`,
      [req.schoolId, newSlug, `${p.title} (Copy)`, p.menu_label, p.page_type, p.content, p.seo_title, p.seo_description, p.og_image_url]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// One-time starter content generator, derived from this school's own
// schools/school_website_settings data — not a blind boot-time backfill.
// No-ops if the school already has pages, so it's safe to call repeatedly.
router.post('/generate-starter', async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query(`SELECT 1 FROM website_pages WHERE school_id = $1 LIMIT 1`, [req.schoolId]);
    if (existing.length) return res.status(409).json({ error: 'Starter pages already exist for this school.' });

    const { rows: schoolRows } = await pool.query(
      `SELECT name, motto, vision, mission, core_values, address, phone, email FROM schools WHERE id = $1`,
      [req.schoolId]
    );
    const { rows: settingsRows } = await pool.query(
      `SELECT show_programs FROM school_website_settings WHERE school_id = $1`, [req.schoolId]
    );
    const { rows: programCount } = await pool.query(`SELECT count(*)::int AS n FROM programs WHERE school_id = $1`, [req.schoolId]);
    const school = schoolRows[0] || {};
    const showAcademics = (settingsRows[0]?.show_programs ?? true) && programCount[0].n > 0;

    const aboutParts = [];
    if (school.mission) aboutParts.push(paragraph(school.mission));
    if (school.vision) aboutParts.push(`<h2>Our Vision</h2>${paragraph(school.vision)}`);
    if (school.core_values) aboutParts.push(`<h2>Our Core Values</h2>${paragraph(school.core_values)}`);
    const aboutContent = aboutParts.join('') || paragraph(`Tell visitors about ${school.name || 'your school'} here.`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [home] } = await client.query(
        `INSERT INTO website_pages (school_id, slug, title, menu_label, page_type, status, is_homepage)
         VALUES ($1,'home','Home','Home','homepage','published',true) RETURNING id, slug`,
        [req.schoolId]
      );
      const { rows: [about] } = await client.query(
        `INSERT INTO website_pages (school_id, slug, title, menu_label, page_type, content, status)
         VALUES ($1,'about','About Us','About','standard',$2,'published') RETURNING id, slug`,
        [req.schoolId, sanitizePageContent(aboutContent)]
      );
      const { rows: [contact] } = await client.query(
        `INSERT INTO website_pages (school_id, slug, title, menu_label, page_type, status)
         VALUES ($1,'contact','Contact Us','Contact','contact','published') RETURNING id, slug`,
        [req.schoolId]
      );

      const headerItems = [
        { label: 'Home', page_id: home.id },
        { label: 'About', page_id: about.id },
        ...(showAcademics ? [{ label: 'Academics', external_url: '#academics' }] : []),
        { label: 'Contact', page_id: contact.id },
      ];
      for (let i = 0; i < headerItems.length; i++) {
        const it = headerItems[i];
        await client.query(
          `INSERT INTO website_menu_items (school_id, location, label, page_id, external_url, sort_order)
           VALUES ($1,'header',$2,$3,$4,$5)`,
          [req.schoolId, it.label, it.page_id || null, it.external_url || null, i]
        );
        await client.query(
          `INSERT INTO website_menu_items (school_id, location, label, page_id, external_url, sort_order)
           VALUES ($1,'footer',$2,$3,$4,$5)`,
          [req.schoolId, it.label, it.page_id || null, it.external_url || null, i]
        );
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const { rows } = await pool.query(
      `SELECT id, slug, title, status, is_homepage, page_type, updated_at FROM website_pages WHERE school_id = $1 ORDER BY is_homepage DESC, title`,
      [req.schoolId]
    );
    res.status(201).json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
