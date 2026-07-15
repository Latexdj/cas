const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, is_current, current_semester FROM academic_years
       WHERE school_id = $1 ORDER BY name DESC`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/current', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, is_current, current_semester FROM academic_years
       WHERE school_id = $1 AND is_current = true LIMIT 1`,
      [req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No current academic year set' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, is_current = false, current_semester } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await pool.query(
      `INSERT INTO academic_years (school_id, name, is_current, current_semester)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.schoolId, name.trim(), is_current, current_semester || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const msg = err.constraint?.includes('current_year')
        ? 'Another year is already marked as current — unset it first'
        : 'An academic year with that name already exists';
      return res.status(409).json({ error: msg });
    }
    next(err);
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, is_current, current_semester } = req.body;

    if (is_current === true) {
      await pool.query(
        `UPDATE academic_years SET is_current = false WHERE school_id = $1 AND is_current = true`,
        [req.schoolId]
      );
    }

    const { rows } = await pool.query(
      `UPDATE academic_years
       SET name             = COALESCE($1, name),
           is_current       = COALESCE($2, is_current),
           current_semester = COALESCE($3, current_semester)
       WHERE id = $4 AND school_id = $5 RETURNING *`,
      [name||null, is_current??null, current_semester??null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Academic year not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM academic_years WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Academic year not found' });
    res.json({ message: 'Academic year deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
