const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM classes WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO classes (school_id, name) VALUES ($1,$2) RETURNING id, name`,
      [req.schoolId, name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Class already exists' });
    next(err);
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name } = req.body;
    const { rows } = await pool.query(
      `UPDATE classes SET name = COALESCE($1, name)
       WHERE id = $2 AND school_id = $3 RETURNING id, name`,
      [name?.trim() || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Class not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Class name already in use' });
    next(err);
  }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    // Block delete if the class name appears in any timetable class_names field
    const { rows: inUse } = await pool.query(
      `SELECT id FROM timetable
       WHERE school_id = $1 AND (
         class_names = (SELECT name FROM classes WHERE id = $2 AND school_id = $1)
         OR class_names LIKE (SELECT name || ',%'   FROM classes WHERE id = $2 AND school_id = $1)
         OR class_names LIKE (SELECT '%,' || name   FROM classes WHERE id = $2 AND school_id = $1)
         OR class_names LIKE (SELECT '%,' || name || ',%' FROM classes WHERE id = $2 AND school_id = $1)
       )
       LIMIT 1`,
      [req.schoolId, req.params.id]
    );
    if (inUse.length)
      return res.status(409).json({ error: 'Cannot delete — class is used in the timetable' });

    const { rowCount } = await pool.query(
      `DELETE FROM classes WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Class not found' });
    res.json({ message: 'Class deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
