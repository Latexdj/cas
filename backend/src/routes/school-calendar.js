const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

// Ensure kind column exists independently of the main migration chain
(async () => {
  try {
    await pool.query(`ALTER TABLE school_vacation_periods ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'vacation'`);
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE school_vacation_periods ADD CONSTRAINT svp_kind_check CHECK (kind IN ('vacation','exam'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
  } catch (err) {
    console.error('[school-calendar] kind column setup failed:', err.message);
  }
})();

router.use(authenticate, requireActiveSubscription);

// GET /api/school-calendar?year=2026&month=5  — all authenticated users (teachers read-only)
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
      `SELECT id, date::text, name, type, notes,
              start_time::text AS start_time, end_time::text AS end_time,
              created_at
       FROM school_calendar
       WHERE ${conditions.join(' AND ')}
       ORDER BY date ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/school-calendar — admin only
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { date, name, type, notes, start_time, end_time } = req.body;
    const valid = ['Holiday', 'School Event', 'Closed Day'];
    if (!date || !name || !type) {
      return res.status(400).json({ error: 'date, name and type are required' });
    }
    if (!valid.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${valid.join(', ')}` });
    }
    if ((start_time && !end_time) || (!start_time && end_time)) {
      return res.status(400).json({ error: 'Provide both start_time and end_time, or neither (whole-day event)' });
    }
    if (start_time && end_time && start_time >= end_time) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }

    const { rows } = await pool.query(
      `INSERT INTO school_calendar (school_id, date, name, type, notes, start_time, end_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (school_id, date, name) DO UPDATE
         SET type = EXCLUDED.type, notes = EXCLUDED.notes,
             start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time
       RETURNING id, date::text AS date, name, type, notes,
                 start_time::text AS start_time, end_time::text AS end_time, created_at`,
      [req.schoolId, date, name.trim(), type, notes || null, start_time || null, end_time || null]
    );

    // Retroactively clear auto-generated absences already recorded for this event.
    // For whole-day events: excuse all absences on that date.
    // For partial-day events: excuse only absences whose timetable slot overlaps the event window.
    let rowCount = 0;
    if (!start_time || !end_time) {
      // Whole day
      ({ rowCount } = await pool.query(
        `UPDATE absences SET status = 'Excused', updated_at = now()
         WHERE school_id = $1 AND date = $2
           AND is_auto_generated = true AND status = 'Absent'`,
        [req.schoolId, date]
      ));
    } else {
      // Partial day — only excuse absences for lessons that overlap with the event window
      ({ rowCount } = await pool.query(
        `UPDATE absences a SET status = 'Excused', updated_at = now()
         WHERE a.school_id = $1 AND a.date = $2
           AND a.is_auto_generated = true AND a.status = 'Absent'
           AND EXISTS (
             SELECT 1 FROM timetable tt
             WHERE tt.school_id  = a.school_id
               AND tt.teacher_id = a.teacher_id
               AND tt.start_time < $4::time
               AND tt.end_time   > $3::time
           )`,
        [req.schoolId, date, start_time, end_time]
      ));
    }
    if (rowCount > 0) {
      console.log(`[Calendar] Retroactively excused ${rowCount} absence(s) on ${date} for school ${req.schoolId} (${type}: ${name})`);
    }

    res.status(201).json({ ...rows[0], absences_excused: rowCount });
  } catch (err) { next(err); }
});

// POST /api/school-calendar/:id/reapply — re-run retroactive absence clearing for an existing event
router.post('/:id/reapply', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT date::text AS date, name, type, start_time::text AS start_time, end_time::text AS end_time
       FROM school_calendar WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    const { date, name, type, start_time, end_time } = rows[0];

    let rowCount = 0;
    if (!start_time || !end_time) {
      ({ rowCount } = await pool.query(
        `UPDATE absences SET status = 'Excused', updated_at = now()
         WHERE school_id = $1 AND date = $2
           AND is_auto_generated = true AND status = 'Absent'`,
        [req.schoolId, date]
      ));
    } else {
      ({ rowCount } = await pool.query(
        `UPDATE absences a SET status = 'Excused', updated_at = now()
         WHERE a.school_id = $1 AND a.date = $2
           AND a.is_auto_generated = true AND a.status = 'Absent'
           AND EXISTS (
             SELECT 1 FROM timetable tt
             WHERE tt.school_id  = a.school_id
               AND tt.teacher_id = a.teacher_id
               AND tt.start_time < $4::time
               AND tt.end_time   > $3::time
           )`,
        [req.schoolId, date, start_time, end_time]
      ));
    }

    console.log(`[Calendar] Reapply: excused ${rowCount} absence(s) on ${date} (${type}: ${name})`);
    res.json({ date, name, absences_excused: rowCount });
  } catch (err) { next(err); }
});

// ── Vacation periods ──────────────────────────────────────────────────────────

// GET /api/school-calendar/vacations?year=YYYY&kind=vacation|exam
router.get('/vacations', async (req, res, next) => {
  try {
    const { year, kind } = req.query;
    const params = [req.schoolId];
    const conds  = ['school_id = $1'];
    if (year) {
      params.push(year);
      conds.push(`(EXTRACT(YEAR FROM start_date) = $${params.length} OR EXTRACT(YEAR FROM end_date) = $${params.length})`);
    }
    if (kind) {
      params.push(kind);
      conds.push(`kind = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT id, name, kind, start_date::text AS start_date, end_date::text AS end_date, created_at
       FROM school_vacation_periods WHERE ${conds.join(' AND ')}
       ORDER BY start_date ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/school-calendar/vacations — admin only; retroactively excuses absences in range
router.post('/vacations', adminOnly, async (req, res, next) => {
  try {
    const { name, start_date, end_date, kind = 'vacation' } = req.body;
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'name, start_date and end_date are required' });
    }
    if (!['vacation', 'exam'].includes(kind)) {
      return res.status(400).json({ error: 'kind must be vacation or exam' });
    }
    if (end_date < start_date) {
      return res.status(400).json({ error: 'end_date must be on or after start_date' });
    }
    const { rows } = await pool.query(
      `INSERT INTO school_vacation_periods (school_id, name, kind, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, kind, start_date::text AS start_date, end_date::text AS end_date, created_at`,
      [req.schoolId, name.trim(), kind, start_date, end_date]
    );
    // Retroactively excuse any auto-generated absences within this period
    const { rowCount } = await pool.query(
      `UPDATE absences SET status = 'Excused', updated_at = now()
       WHERE school_id = $1 AND date BETWEEN $2 AND $3
         AND is_auto_generated = true AND status = 'Absent'`,
      [req.schoolId, start_date, end_date]
    );
    if (rowCount > 0) {
      console.log(`[Calendar] ${kind} period "${name}": retroactively excused ${rowCount} absence(s) for school ${req.schoolId}`);
    }
    res.status(201).json({ ...rows[0], absences_excused: rowCount });
  } catch (err) { next(err); }
});

// DELETE /api/school-calendar/vacations/:id — admin only
router.delete('/vacations/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM school_vacation_periods WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Vacation period not found' });
    res.json({ message: 'Removed' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────

// DELETE /api/school-calendar/:id — admin only
router.delete('/:id', adminOnly, async (req, res, next) => {
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
