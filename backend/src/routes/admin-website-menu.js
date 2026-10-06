const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');

router.use(authenticate, requireActiveSubscription, adminOnly, checkModuleAccess('website'));

function buildTree(items) {
  const byId = new Map(items.map(it => [it.id, { ...it, children: [] }]));
  const top = [];
  for (const it of byId.values()) {
    if (it.parent_id && byId.has(it.parent_id)) byId.get(it.parent_id).children.push(it);
    else top.push(it);
  }
  return top;
}

// GET /?location=header|footer
router.get('/', async (req, res, next) => {
  try {
    const location = req.query.location === 'footer' ? 'footer' : 'header';
    const { rows } = await pool.query(
      `SELECT m.*, p.slug AS page_slug, p.title AS page_title
       FROM website_menu_items m LEFT JOIN website_pages p ON p.id = m.page_id
       WHERE m.school_id = $1 AND m.location = $2
       ORDER BY m.sort_order`,
      [req.schoolId, location]
    );
    res.json(buildTree(rows));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { location, label, page_id, external_url, parent_id, open_new_tab, is_visible } = req.body;
    if (!location || !['header', 'footer'].includes(location)) return res.status(400).json({ error: 'Location must be header or footer.' });
    if (!label) return res.status(400).json({ error: 'Label is required.' });
    if (!page_id && !external_url) return res.status(400).json({ error: 'A page or an external URL is required.' });
    if (page_id && external_url) return res.status(400).json({ error: 'Choose either a page or an external URL, not both.' });

    const { rows: maxRow } = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM website_menu_items WHERE school_id = $1 AND location = $2 AND parent_id IS NOT DISTINCT FROM $3`,
      [req.schoolId, location, parent_id || null]
    );

    const { rows } = await pool.query(
      `INSERT INTO website_menu_items (school_id, location, label, page_id, external_url, parent_id, sort_order, open_new_tab, is_visible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [req.schoolId, location, label, page_id || null, external_url || null, parent_id || null,
       maxRow[0].next, Boolean(open_new_tab), is_visible !== undefined ? Boolean(is_visible) : true]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { label, page_id, external_url, parent_id, sort_order, open_new_tab, is_visible } = req.body;
    if (page_id && external_url) return res.status(400).json({ error: 'Choose either a page or an external URL, not both.' });

    const { rows } = await pool.query(
      `UPDATE website_menu_items SET
         label        = COALESCE($1, label),
         page_id      = CASE WHEN $2::uuid IS NOT NULL THEN $2 WHEN $3::text IS NOT NULL THEN NULL ELSE page_id END,
         external_url = CASE WHEN $3::text IS NOT NULL THEN $3 WHEN $2::uuid IS NOT NULL THEN NULL ELSE external_url END,
         parent_id    = COALESCE($4, parent_id),
         sort_order   = COALESCE($5, sort_order),
         open_new_tab = COALESCE($6, open_new_tab),
         is_visible   = COALESCE($7, is_visible),
         updated_at   = now()
       WHERE id = $8 AND school_id = $9
       RETURNING *`,
      [label || null, page_id || null, external_url || null, parent_id || null, sort_order ?? null,
       open_new_tab !== undefined ? Boolean(open_new_tab) : null,
       is_visible !== undefined ? Boolean(is_visible) : null,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Menu item not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM website_menu_items WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Menu item not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
