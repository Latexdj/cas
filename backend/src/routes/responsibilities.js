'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription, adminOnly } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

const VALID_MODULES = ['library'];

// GET /api/responsibilities/my-modules — teacher-facing (no adminOnly)
router.get('/my-modules', async (req, res, next) => {
  try {
    const role = req.user?.role;
    if (role !== 'teacher' && role !== 'admin') {
      return res.status(403).json({ error: 'Teacher access only' });
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT tr.module_key
       FROM teacher_responsibility_assignments tra
       JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
       WHERE tra.teacher_id = $1 AND tr.school_id = $2 AND tr.module_key IS NOT NULL`,
      [req.user.id, req.schoolId]
    );
    res.json({ module_keys: rows.map(r => r.module_key) });
  } catch (err) { next(err); }
});

// All routes below require admin
router.use(adminOnly);

// GET /api/responsibilities
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT tr.id, tr.name, tr.description, tr.module_key, tr.sort_order, tr.created_at,
              COUNT(tra.id)::int AS teacher_count,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT('id', t.id, 'name', t.name, 'teacher_code', t.teacher_code)
                  ORDER BY t.name
                ) FILTER (WHERE t.id IS NOT NULL), '[]'
              ) AS teachers
       FROM teacher_responsibilities tr
       LEFT JOIN teacher_responsibility_assignments tra ON tra.responsibility_id = tr.id
       LEFT JOIN teachers t ON t.id = tra.teacher_id
       WHERE tr.school_id = $1
       GROUP BY tr.id
       ORDER BY tr.sort_order, tr.name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/responsibilities
router.post('/', async (req, res, next) => {
  try {
    const { name, description, module_key, sort_order = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (module_key && !VALID_MODULES.includes(module_key)) {
      return res.status(400).json({ error: `module_key must be one of: ${VALID_MODULES.join(', ')}` });
    }
    const { rows } = await pool.query(
      `INSERT INTO teacher_responsibilities (school_id, name, description, module_key, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.schoolId, name.trim(), description?.trim() || null, module_key || null, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A responsibility with this name already exists' });
    next(err);
  }
});

// PUT /api/responsibilities/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, description, module_key, sort_order = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (module_key && !VALID_MODULES.includes(module_key)) {
      return res.status(400).json({ error: `module_key must be one of: ${VALID_MODULES.join(', ')}` });
    }
    const { rows } = await pool.query(
      `UPDATE teacher_responsibilities
       SET name        = $1,
           description = $2,
           module_key  = $3,
           sort_order  = $4
       WHERE id = $5 AND school_id = $6
       RETURNING *`,
      [name.trim(), description?.trim() || null, module_key || null, sort_order, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Responsibility not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A responsibility with this name already exists' });
    next(err);
  }
});

// DELETE /api/responsibilities/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM teacher_responsibilities WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Responsibility not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
