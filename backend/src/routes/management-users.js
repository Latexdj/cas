'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate, adminOnly);

const VALID_ROLES = ['principal', 'vice_principal'];

// GET /api/admin/management-users — list teachers who have a management role
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, teacher_code, department, management_role AS role, status, created_at
       FROM teachers
       WHERE school_id = $1 AND management_role IS NOT NULL
       ORDER BY management_role, name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/admin/management-users — assign a management role to a teacher
router.post('/', async (req, res, next) => {
  try {
    const { teacher_id, role } = req.body;
    if (!teacher_id || !role)
      return res.status(400).json({ error: 'teacher_id and role are required' });
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ error: 'Role must be principal or vice_principal' });

    const { rows: existing } = await pool.query(
      `SELECT id, management_role FROM teachers WHERE id = $1 AND school_id = $2`,
      [teacher_id, req.schoolId]
    );
    if (!existing.length)
      return res.status(404).json({ error: 'Teacher not found' });
    if (existing[0].management_role)
      return res.status(409).json({ error: 'This teacher already has a management role assigned' });

    const { rows } = await pool.query(
      `UPDATE teachers SET management_role = $1, is_admin = true, updated_at = now()
       WHERE id = $2 AND school_id = $3
       RETURNING id, name, teacher_code, department, management_role AS role, status`,
      [role, teacher_id, req.schoolId]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/admin/management-users/:id — change role
router.put('/:id', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role || !VALID_ROLES.includes(role))
      return res.status(400).json({ error: 'Role must be principal or vice_principal' });

    const { rows } = await pool.query(
      `UPDATE teachers SET management_role = $1, updated_at = now()
       WHERE id = $2 AND school_id = $3
       RETURNING id, name, teacher_code, department, management_role AS role, status`,
      [role, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/admin/management-users/:id — revoke management access
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE teachers SET management_role = NULL, is_admin = false, updated_at = now()
       WHERE id = $1 AND school_id = $2 AND management_role IS NOT NULL`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Management user not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
