const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// ── Academic Years ─────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, is_current, current_semester,
              start_date::text AS start_date, end_date::text AS end_date
       FROM academic_years
       WHERE school_id = $1 ORDER BY name DESC`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/current', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, is_current, current_semester,
              start_date::text AS start_date, end_date::text AS end_date
       FROM academic_years
       WHERE school_id = $1 AND is_current = true LIMIT 1`,
      [req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No current academic year set' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, is_current = false, current_semester, start_date, end_date } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (start_date && end_date && end_date < start_date) {
      return res.status(400).json({ error: 'end_date must be on or after start_date' });
    }

    const { rows } = await pool.query(
      `INSERT INTO academic_years (school_id, name, is_current, current_semester, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, is_current, current_semester,
                 start_date::text AS start_date, end_date::text AS end_date`,
      [req.schoolId, name.trim(), is_current, current_semester || null, start_date || null, end_date || null]
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
    const { name, is_current, current_semester, start_date, end_date } = req.body;
    if (start_date && end_date && end_date < start_date) {
      return res.status(400).json({ error: 'end_date must be on or after start_date' });
    }

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
           current_semester = COALESCE($3, current_semester),
           start_date       = COALESCE($4, start_date),
           end_date         = COALESCE($5, end_date)
       WHERE id = $6 AND school_id = $7
       RETURNING id, name, is_current, current_semester,
                 start_date::text AS start_date, end_date::text AS end_date`,
      [name||null, is_current??null, current_semester??null, start_date||null, end_date||null, req.params.id, req.schoolId]
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

// ── Semesters ─────────────────────────────────────────────────────────────────

router.get('/:yearId/semesters', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, academic_year_id, number, name,
              start_date::text AS start_date, end_date::text AS end_date, created_at
       FROM semesters
       WHERE school_id = $1 AND academic_year_id = $2
       ORDER BY number ASC`,
      [req.schoolId, req.params.yearId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/:yearId/semesters', adminOnly, async (req, res, next) => {
  try {
    const { number, name, start_date, end_date } = req.body;
    if (!number || !name) return res.status(400).json({ error: 'number and name are required' });
    if (![1, 2].includes(Number(number))) return res.status(400).json({ error: 'number must be 1 or 2' });
    if (start_date && end_date && end_date < start_date) {
      return res.status(400).json({ error: 'end_date must be on or after start_date' });
    }

    // Verify year belongs to this school
    const { rowCount: yearCount } = await pool.query(
      `SELECT 1 FROM academic_years WHERE id = $1 AND school_id = $2`,
      [req.params.yearId, req.schoolId]
    );
    if (!yearCount) return res.status(404).json({ error: 'Academic year not found' });

    const { rows } = await pool.query(
      `INSERT INTO semesters (school_id, academic_year_id, number, name, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (school_id, academic_year_id, number) DO UPDATE
         SET name = EXCLUDED.name, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date
       RETURNING id, academic_year_id, number, name,
                 start_date::text AS start_date, end_date::text AS end_date, created_at`,
      [req.schoolId, req.params.yearId, Number(number), name.trim(), start_date || null, end_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:yearId/semesters/:semId', adminOnly, async (req, res, next) => {
  try {
    const { name, start_date, end_date } = req.body;
    if (start_date && end_date && end_date < start_date) {
      return res.status(400).json({ error: 'end_date must be on or after start_date' });
    }
    const { rows } = await pool.query(
      `UPDATE semesters
       SET name       = COALESCE($1, name),
           start_date = COALESCE($2, start_date),
           end_date   = COALESCE($3, end_date)
       WHERE id = $4 AND school_id = $5 AND academic_year_id = $6
       RETURNING id, academic_year_id, number, name,
                 start_date::text AS start_date, end_date::text AS end_date, created_at`,
      [name||null, start_date||null, end_date||null, req.params.semId, req.schoolId, req.params.yearId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Semester not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:yearId/semesters/:semId', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM semesters WHERE id = $1 AND school_id = $2 AND academic_year_id = $3`,
      [req.params.semId, req.schoolId, req.params.yearId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Semester not found' });
    res.json({ message: 'Semester deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
