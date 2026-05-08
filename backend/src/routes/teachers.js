const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// GET /api/teachers
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id, t.name, t.email, t.phone, t.department,
        t.status, t.is_admin, t.notes,
        COUNT(tt.id)::int AS total_periods
      FROM teachers t
      LEFT JOIN timetable tt ON tt.teacher_id = t.id
      WHERE t.school_id = $1
      GROUP BY t.id
      ORDER BY t.name
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/teachers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, department, status, is_admin, notes
       FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });

    const teacher = rows[0];
    const { rows: schedule } = await pool.query(
      `SELECT id, day_of_week, start_time, end_time, subject, class_name
       FROM timetable WHERE teacher_id = $1 AND school_id = $2
       ORDER BY day_of_week, start_time`,
      [teacher.id, req.schoolId]
    );
    teacher.schedule = schedule;
    res.json(teacher);
  } catch (err) { next(err); }
});

// POST /api/teachers (admin only)
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, email, phone, department, status = 'Active', is_admin = false, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const pinHash = await bcrypt.hash(process.env.DEFAULT_TEACHER_PIN || '1234', 12);
    const { rows } = await pool.query(
      `INSERT INTO teachers (school_id, name, email, phone, department, status, is_admin, notes, pin_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, name, email, phone, department, status, is_admin, notes`,
      [req.schoolId, name.trim(), email || null, phone || null,
       department || null, status, is_admin, notes || null, pinHash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A teacher with that name already exists in this school' });
    }
    next(err);
  }
});

// PUT /api/teachers/:id (admin only)
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, email, phone, department, status, is_admin, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE teachers
       SET name       = COALESCE($1, name),
           email      = COALESCE($2, email),
           phone      = COALESCE($3, phone),
           department = COALESCE($4, department),
           status     = COALESCE($5, status),
           is_admin   = COALESCE($6, is_admin),
           notes      = COALESCE($7, notes),
           updated_at = now()
       WHERE id = $8 AND school_id = $9
       RETURNING id, name, email, phone, department, status, is_admin, notes`,
      [name||null, email||null, phone||null, department||null,
       status||null, is_admin??null, notes||null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/teachers/:id (admin only)
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ message: 'Teacher deleted' });
  } catch (err) { next(err); }
});

// POST /api/teachers/:id/reset-pin (admin only)
router.post('/:id/reset-pin', adminOnly, async (req, res, next) => {
  try {
    const defaultPin = process.env.DEFAULT_TEACHER_PIN || '1234';
    const pinHash    = await bcrypt.hash(defaultPin, 12);
    const { rowCount } = await pool.query(
      `UPDATE teachers SET pin_hash = $1 WHERE id = $2 AND school_id = $3`,
      [pinHash, req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ message: `PIN reset to default (${defaultPin})` });
  } catch (err) { next(err); }
});

module.exports = router;
