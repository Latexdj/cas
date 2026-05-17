const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription, adminOnly);

const DAY_LABELS = {
  1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
  4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday',
};

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, day_of_week, start_time, end_time, created_at
       FROM school_breaks WHERE school_id = $1
       ORDER BY COALESCE(day_of_week, 0), start_time`,
      [req.schoolId]
    );
    res.json(rows.map(r => ({
      ...r,
      day_label: r.day_of_week ? DAY_LABELS[r.day_of_week] : 'All days',
    })));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, day_of_week, start_time, end_time } = req.body;
    if (!name || !start_time || !end_time) {
      return res.status(400).json({ error: 'name, start_time and end_time are required' });
    }
    if (start_time >= end_time) {
      return res.status(400).json({ error: 'start_time must be before end_time' });
    }
    const dow = day_of_week ? parseInt(day_of_week, 10) : null;
    const { rows } = await pool.query(
      `INSERT INTO school_breaks (school_id, name, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.schoolId, name.trim(), dow, start_time, end_time]
    );
    res.status(201).json({ ...rows[0], day_label: rows[0].day_of_week ? DAY_LABELS[rows[0].day_of_week] : 'All days' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A break already exists at that start time for this day.' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, day_of_week, start_time, end_time } = req.body;
    if (start_time && end_time && start_time >= end_time) {
      return res.status(400).json({ error: 'start_time must be before end_time' });
    }
    const dow = day_of_week !== undefined ? (day_of_week ? parseInt(day_of_week, 10) : null) : undefined;
    const { rows } = await pool.query(
      `UPDATE school_breaks
       SET name        = COALESCE($1, name),
           day_of_week = CASE WHEN $2::boolean THEN $3::integer ELSE day_of_week END,
           start_time  = COALESCE($4, start_time),
           end_time    = COALESCE($5, end_time)
       WHERE id = $6 AND school_id = $7 RETURNING *`,
      [
        name?.trim() ?? null,
        dow !== undefined,
        dow ?? null,
        start_time ?? null,
        end_time ?? null,
        req.params.id,
        req.schoolId,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Break not found' });
    res.json({ ...rows[0], day_label: rows[0].day_of_week ? DAY_LABELS[rows[0].day_of_week] : 'All days' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A break already exists at that start time for this day.' });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM school_breaks WHERE id = $1 AND school_id = $2',
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Break not found' });
    res.json({ message: 'Break deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
