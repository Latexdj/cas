const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription, adminOnly);

// GET /api/school-calendar?year=2026&month=5
router.get('/', async (req, res, next) => {
  try {
    const conditions = ['school_id = $1'];
    const params     = [req.schoolId];

    if (req.query.year) {
      params.push(req.query.year);
      conditions.push(`EXTRACT(YEAR FROM date) = $${params.length}`);
    }
    if (req.query.month) {
      params.push(req.query.month);
      conditions.push(`EXTRACT(MONTH FROM date) = $${params.length}`);
    }
    if (req.query.from) {
      params.push(req.query.from);
      conditions.push(`date >= $${params.length}`);
    }
    if (req.query.to) {
      params.push(req.query.to);
      conditions.push(`date <= $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT id, date, name, type, notes, created_at
       FROM school_calendar
       WHERE ${conditions.join(' AND ')}
       ORDER BY date ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/school-calendar
router.post('/', async (req, res, next) => {
  try {
    const { date, name, type, notes } = req.body;
    const valid = ['Holiday', 'School Event', 'Closed Day'];
    if (!date || !name || !type) {
      return res.status(400).json({ error: 'date, name and type are required' });
    }
    if (!valid.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${valid.join(', ')}` });
    }
    const { rows } = await pool.query(
      `INSERT INTO school_calendar (school_id, date, name, type, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (school_id, date, name) DO UPDATE SET type = EXCLUDED.type, notes = EXCLUDED.notes
       RETURNING *`,
      [req.schoolId, date, name.trim(), type, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/school-calendar/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM school_calendar WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Entry not found' });
    res.json({ message: 'Removed' });
  } catch (err) { next(err); }
});

module.exports = router;
