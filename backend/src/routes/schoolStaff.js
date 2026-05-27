'use strict';
const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription, adminOnly } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription, adminOnly);

// GET /api/school-staff
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ss.id, ss.name, ss.email, ss.is_active, ss.created_at,
              COALESCE(ARRAY_AGG(ssr.role ORDER BY ssr.role) FILTER (WHERE ssr.role IS NOT NULL), '{}') AS roles
       FROM school_staff ss
       LEFT JOIN school_staff_roles ssr ON ssr.staff_id = ss.id
       WHERE ss.school_id = $1
       GROUP BY ss.id
       ORDER BY ss.name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/school-staff
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, roles = [] } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'name, email and password are required' });
    if (!roles.length)
      return res.status(400).json({ error: 'At least one role (clearance or library) is required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const hash = await bcrypt.hash(String(password), 12);
    const { rows } = await pool.query(
      `INSERT INTO school_staff (school_id, name, email, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, is_active, created_at`,
      [req.schoolId, name.trim(), email.trim().toLowerCase(), hash]
    );
    const staff = rows[0];
    for (const role of roles) {
      await pool.query(
        `INSERT INTO school_staff_roles (staff_id, school_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [staff.id, req.schoolId, role]
      );
    }
    res.status(201).json({ ...staff, roles });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A staff account with this email already exists' });
    next(err);
  }
});

// PUT /api/school-staff/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, password, is_active, roles } = req.body;
    let hash;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      hash = await bcrypt.hash(String(password), 12);
    }
    const { rows } = await pool.query(
      `UPDATE school_staff
       SET name          = COALESCE($1, name),
           email         = COALESCE($2, email),
           password_hash = COALESCE($3, password_hash),
           is_active     = COALESCE($4, is_active)
       WHERE id = $5 AND school_id = $6
       RETURNING id, name, email, is_active, created_at`,
      [name?.trim() || null, email?.trim().toLowerCase() || null,
       hash || null, is_active ?? null,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Staff not found' });

    if (Array.isArray(roles)) {
      await pool.query(`DELETE FROM school_staff_roles WHERE staff_id = $1`, [req.params.id]);
      for (const role of roles) {
        await pool.query(
          `INSERT INTO school_staff_roles (staff_id, school_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [req.params.id, req.schoolId, role]
        );
      }
    }
    const { rows: roleRows } = await pool.query(
      `SELECT role FROM school_staff_roles WHERE staff_id = $1 ORDER BY role`, [req.params.id]
    );
    res.json({ ...rows[0], roles: roleRows.map(r => r.role) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    next(err);
  }
});

// DELETE /api/school-staff/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM school_staff WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Staff not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Library Teacher Assignments ────────────────────────────────────────────────

// GET /api/school-staff/library-teachers
router.get('/library-teachers', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT lts.id, lts.teacher_id, lts.is_active, lts.created_at,
              t.name AS teacher_name, t.teacher_code
       FROM library_teacher_staff lts
       JOIN teachers t ON t.id = lts.teacher_id
       WHERE lts.school_id = $1
       ORDER BY t.name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/school-staff/library-teachers
router.post('/library-teachers', async (req, res, next) => {
  try {
    const { teacher_id } = req.body;
    if (!teacher_id) return res.status(400).json({ error: 'teacher_id is required' });
    const { rows } = await pool.query(
      `INSERT INTO library_teacher_staff (school_id, teacher_id)
       VALUES ($1, $2)
       ON CONFLICT (school_id, teacher_id) DO UPDATE SET is_active = true
       RETURNING *`,
      [req.schoolId, teacher_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Teacher not found' });
    next(err);
  }
});

// DELETE /api/school-staff/library-teachers/:id
router.delete('/library-teachers/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM library_teacher_staff WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
