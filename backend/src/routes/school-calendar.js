const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

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
