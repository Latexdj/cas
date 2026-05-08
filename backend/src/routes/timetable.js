const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.subject, tt.class_name,
             te.id AS teacher_id, te.name AS teacher_name
      FROM timetable tt
      JOIN teachers te ON te.id = tt.teacher_id
      WHERE tt.school_id = $1
      ORDER BY tt.day_of_week, tt.start_time
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// Today's schedule for a specific teacher
router.get('/today/:teacherId', async (req, res, next) => {
  try {
    const jsDay     = new Date().getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const { rows } = await pool.query(`
      SELECT id, day_of_week, start_time, end_time, subject, class_name,
             EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 AS duration_hours
      FROM timetable
      WHERE school_id = $1 AND teacher_id = $2 AND day_of_week = $3
      ORDER BY start_time
    `, [req.schoolId, req.params.teacherId, dayOfWeek]);

    res.json(rows.map(r => ({ ...r, periods: Math.round(parseFloat(r.duration_hours)) })));
  } catch (err) { next(err); }
});

// Full weekly schedule for a teacher
router.get('/teacher/:teacherId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, day_of_week, start_time, end_time, subject, class_name
       FROM timetable WHERE school_id = $1 AND teacher_id = $2
       ORDER BY day_of_week, start_time`,
      [req.schoolId, req.params.teacherId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { day_of_week, start_time, end_time, teacher_id, subject, class_name } = req.body;
    if (!day_of_week || !start_time || !end_time || !teacher_id || !subject || !class_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO timetable (school_id, day_of_week, start_time, end_time, teacher_id, subject, class_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.schoolId, day_of_week, start_time, end_time, teacher_id, subject.trim(), class_name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { day_of_week, start_time, end_time, teacher_id, subject, class_name } = req.body;
    const { rows } = await pool.query(
      `UPDATE timetable
       SET day_of_week = COALESCE($1, day_of_week),
           start_time  = COALESCE($2, start_time),
           end_time    = COALESCE($3, end_time),
           teacher_id  = COALESCE($4, teacher_id),
           subject     = COALESCE($5, subject),
           class_name  = COALESCE($6, class_name),
           updated_at  = now()
       WHERE id = $7 AND school_id = $8 RETURNING *`,
      [day_of_week||null, start_time||null, end_time||null,
       teacher_id||null, subject||null, class_name||null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Timetable entry not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM timetable WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Timetable entry not found' });
    res.json({ message: 'Timetable entry deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
