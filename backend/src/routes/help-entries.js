'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, adminOnly, requireActiveSubscription);

// super_admin can modify any entry; admin can only modify their own school-scoped entries.
function canModify(req, entrySchoolId) {
  if (req.user.role === 'super_admin') return true;
  return entrySchoolId !== null && entrySchoolId === req.schoolId;
}

// GET / — list entries visible to this user
// super_admin sees only global entries (school_id IS NULL)
// admin sees global + their own school-scoped entries
router.get('/', async (req, res, next) => {
  try {
    const { rows } = req.user.role === 'super_admin'
      ? await pool.query(
          `SELECT * FROM help_entries
           WHERE school_id IS NULL
           ORDER BY feature_area ASC, title ASC`
        )
      : await pool.query(
          `SELECT * FROM help_entries
           WHERE school_id IS NULL OR school_id = $1
           ORDER BY school_id NULLS FIRST, feature_area ASC, title ASC`,
          [req.schoolId]
        );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — create entry
// admin always creates school-scoped; super_admin always creates global (school_id IS NULL)
router.post('/', async (req, res, next) => {
  try {
    const { feature_area, title, body, applicable_roles, is_active } = req.body;
    if (!feature_area?.trim()) return res.status(400).json({ error: 'feature_area is required' });
    if (!title?.trim())        return res.status(400).json({ error: 'title is required' });
    if (!body?.trim())         return res.status(400).json({ error: 'body is required' });

    const school_id = req.user.role === 'super_admin' ? null : req.schoolId;
    const roles     = Array.isArray(applicable_roles) && applicable_roles.length
      ? applicable_roles
      : ['admin'];

    const { rows } = await pool.query(
      `INSERT INTO help_entries (school_id, feature_area, applicable_roles, title, body, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [school_id, feature_area.trim(), roles, title.trim(), body.trim(), is_active !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /:id — update entry
router.patch('/:id', async (req, res, next) => {
  try {
    const { rows: found } = await pool.query('SELECT * FROM help_entries WHERE id = $1', [req.params.id]);
    if (!found.length) return res.status(404).json({ error: 'Entry not found' });
    if (!canModify(req, found[0].school_id)) return res.status(403).json({ error: 'Global entries can only be edited by super_admin' });

    const e = found[0];
    const { feature_area, title, body, applicable_roles, is_active } = req.body;

    const { rows } = await pool.query(
      `UPDATE help_entries
       SET feature_area     = $1,
           title            = $2,
           body             = $3,
           applicable_roles = $4,
           is_active        = $5,
           updated_at       = now()
       WHERE id = $6
       RETURNING *`,
      [
        (feature_area ?? e.feature_area).trim?.() ?? feature_area ?? e.feature_area,
        (title        ?? e.title       ).trim?.() ?? title        ?? e.title,
        (body         ?? e.body        ).trim?.() ?? body         ?? e.body,
        Array.isArray(applicable_roles) ? applicable_roles : e.applicable_roles,
        is_active !== undefined ? is_active : e.is_active,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: found } = await pool.query('SELECT * FROM help_entries WHERE id = $1', [req.params.id]);
    if (!found.length) return res.status(404).json({ error: 'Entry not found' });
    if (!canModify(req, found[0].school_id)) return res.status(403).json({ error: 'Global entries can only be deleted by super_admin' });

    await pool.query('DELETE FROM help_entries WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
