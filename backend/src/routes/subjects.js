const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, code FROM subjects WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, code } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO subjects (school_id, name, code) VALUES ($1,$2,$3) RETURNING id, name, code`,
      [req.schoolId, name.trim(), code?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Subject already exists' });
    next(err);
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, code } = req.body;
    const { rows } = await pool.query(
      `UPDATE subjects
       SET name = COALESCE($1, name), code = COALESCE($2, code)
       WHERE id = $3 AND school_id = $4
       RETURNING id, name, code`,
      [name?.trim() || null, code?.trim() || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Subject not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Subject name already in use' });
    next(err);
  }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rows: inUse } = await pool.query(
      `SELECT id FROM timetable
       WHERE school_id = $1
         AND LOWER(subject) = (SELECT LOWER(name) FROM subjects WHERE id = $2 AND school_id = $1)
       LIMIT 1`,
      [req.schoolId, req.params.id]
    );
    if (inUse.length)
      return res.status(409).json({ error: 'Cannot delete — subject is used in the timetable' });

    const { rowCount } = await pool.query(
      `DELETE FROM subjects WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Subject not found' });
    res.json({ message: 'Subject deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
