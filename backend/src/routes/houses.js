const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, notes,
              (SELECT COUNT(*)::int FROM students WHERE house = houses.name AND school_id = $1 AND status = 'Active') AS student_count
       FROM houses WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO houses (school_id, name, notes) VALUES ($1,$2,$3) RETURNING id, name, notes`,
      [req.schoolId, name.trim(), notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A house with that name already exists' });
    next(err);
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `UPDATE houses SET name = $1, notes = $2
       WHERE id = $3 AND school_id = $4 RETURNING id, name, notes`,
      [name.trim(), notes || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'House not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A house with that name already exists' });
    next(err);
  }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM houses WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'House not found' });
    res.json({ message: 'House deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
