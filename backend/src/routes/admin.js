const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { runAbsenceCheck } = require('../jobs/absenceCheck');

router.use(authenticate, requireActiveSubscription, adminOnly);

// GET /api/admin/stats — dashboard counters
router.get('/stats', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM attendance
          WHERE school_id = $2 AND date = $1)::int          AS today_attendance,
        (SELECT COUNT(*) FROM absences
          WHERE school_id = $2 AND date = $1)::int          AS today_absences,
        (SELECT COUNT(*) FROM teachers
          WHERE school_id = $2 AND status = 'Active')::int  AS total_teachers,
        (SELECT COUNT(*) FROM attendance
          WHERE school_id = $2
            AND date >= DATE_TRUNC('week', CURRENT_DATE))::int AS week_attendance,
        (SELECT COUNT(*) FROM absences
          WHERE school_id = $2
            AND status IN ('Absent','Remedial Scheduled'))::int AS outstanding_absences,
        (SELECT COUNT(*) FROM remedial_lessons
          WHERE school_id = $2
            AND status = 'Scheduled')::int                  AS pending_remedials
    `, [today, req.schoolId]);

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/classroom-status
// Shows every timetable slot for today, marked present/absent based on attendance.
router.get('/classroom-status', async (req, res, next) => {
  try {
    const jsDay    = new Date().getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const today    = new Date().toISOString().slice(0, 10);
    const nowTime  = new Date().toTimeString().slice(0, 5);

    const { rows } = await pool.query(`
      SELECT
        tt.id                   AS slot_id,
        tt.class_name,
        tt.subject,
        tt.start_time::text,
        tt.end_time::text,
        te.name                 AS teacher_name,
        te.id                   AS teacher_id,
        CASE
          WHEN a.id IS NOT NULL THEN 'present'
          WHEN $4 BETWEEN tt.start_time AND tt.end_time THEN 'in_session'
          WHEN $4 > tt.end_time THEN 'absent'
          ELSE 'upcoming'
        END                     AS status,
        a.submitted_at,
        a.location_verified
      FROM timetable tt
      JOIN teachers te ON te.id = tt.teacher_id
      LEFT JOIN attendance a
        ON  a.teacher_id = tt.teacher_id
        AND a.school_id  = $1
        AND a.date       = $3
        AND LOWER(a.subject) = LOWER(tt.subject)
        AND (
          LOWER(a.class_names) = LOWER(tt.class_name)
          OR LOWER(a.class_names) LIKE LOWER(tt.class_name || ',%')
          OR LOWER(a.class_names) LIKE LOWER('%,' || tt.class_name)
          OR LOWER(a.class_names) LIKE LOWER('%,' || tt.class_name || ',%')
        )
      WHERE tt.school_id = $1 AND tt.day_of_week = $2
      ORDER BY tt.start_time, tt.class_name
    `, [req.schoolId, dayOfWeek, today, nowTime]);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/reports/absences?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/reports/absences', async (req, res, next) => {
  try {
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const to   = req.query.to   || from;

    const { rows } = await pool.query(`
      SELECT
        ab.date, ab.subject, ab.class_name, ab.scheduled_period,
        ab.status, ab.reason, ab.is_auto_generated,
        te.name AS teacher_name, te.email AS teacher_email
      FROM absences ab
      JOIN teachers te ON te.id = ab.teacher_id
      WHERE ab.school_id = $1 AND ab.date BETWEEN $2 AND $3
      ORDER BY ab.date, te.name
    `, [req.schoolId, from, to]);

    res.json({ from, to, total: rows.length, records: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/reports/remedial?status=&from=&to=
router.get('/reports/remedial', async (req, res, next) => {
  try {
    const { status, from, to } = req.query;
    const conditions = [`rl.school_id = $1`];
    const params = [req.schoolId];

    if (status) { params.push(status); conditions.push(`rl.status = $${params.length}`); }
    if (from)   { params.push(from);   conditions.push(`rl.remedial_date >= $${params.length}`); }
    if (to)     { params.push(to);     conditions.push(`rl.remedial_date <= $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT
        rl.original_absence_date, rl.remedial_date, rl.remedial_time,
        rl.subject, rl.class_name, rl.duration_periods,
        rl.status, rl.verified_by, rl.verified_at, rl.notes,
        te.name AS teacher_name
      FROM remedial_lessons rl
      JOIN teachers te ON te.id = rl.teacher_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY rl.remedial_date DESC
    `, params);

    res.json({ total: rows.length, records: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/reports/weekly-summary
router.get('/reports/weekly-summary', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        te.name   AS teacher_name,
        a.week_number,
        MIN(a.date)::text   AS week_start,
        COUNT(*)::int       AS sessions,
        SUM(a.periods)::int AS total_periods
      FROM attendance a
      JOIN teachers te ON te.id = a.teacher_id
      WHERE a.school_id = $1
      GROUP BY te.name, a.week_number
      ORDER BY a.week_number DESC, te.name
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/run-absence-check — trigger the cron job manually
router.post('/run-absence-check', async (req, res, next) => {
  try {
    const result = await runAbsenceCheck(req.schoolId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/settings — return school info + theme colors
router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT name, email, phone, address, code, primary_color, accent_color FROM schools WHERE id = $1`,
      [req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'School not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/admin/settings — update school theme colors
router.patch('/settings', async (req, res, next) => {
  try {
    const { primary_color, accent_color } = req.body;
    if (!primary_color || !accent_color)
      return res.status(400).json({ error: 'primary_color and accent_color required' });
    // Validate hex color format
    const hexRe = /^#[0-9A-Fa-f]{6}$/;
    if (!hexRe.test(primary_color) || !hexRe.test(accent_color))
      return res.status(400).json({ error: 'Colors must be valid hex codes (e.g. #1A2B3C)' });

    const { rows } = await pool.query(
      `UPDATE schools SET primary_color = $1, accent_color = $2, updated_at = now()
       WHERE id = $3 RETURNING primary_color, accent_color`,
      [primary_color, accent_color, req.schoolId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
