const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

function isEditLocked(sessionDate, lessonEndTime) {
  if (!lessonEndTime) return false;
  const endDt  = new Date(`${sessionDate}T${lessonEndTime}`);
  const cutoff = new Date(endDt.getTime() + 30 * 60 * 1000);
  return new Date() > cutoff;
}

/** POST /api/student-attendance/submit */
router.post('/submit', async (req, res, next) => {
  try {
    const { attendanceId, teacherId, subject, className, lessonEndTime, records } = req.body;
    if (!teacherId || !subject || !className || !Array.isArray(records) || !records.length) {
      return res.status(400).json({ error: 'teacherId, subject, className, and records[] are required' });
    }

    if (req.user.role === 'teacher' && req.user.id !== teacherId) {
      return res.status(403).json({ error: 'You can only submit attendance for yourself' });
    }

    const { rows: ayRows } = await pool.query(
      `SELECT id, current_semester FROM academic_years
       WHERE school_id = $1 AND is_current = true LIMIT 1`,
      [req.schoolId]
    );
    const yearId = ayRows[0]?.id            || null;
    const sem    = ayRows[0]?.current_semester || null;

    const today  = new Date().toISOString().slice(0, 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: existing } = await client.query(
        `SELECT id FROM student_attendance_sessions
         WHERE school_id = $1 AND date = $2 AND teacher_id = $3
           AND LOWER(subject) = LOWER($4) AND LOWER(class_name) = LOWER($5)`,
        [req.schoolId, today, teacherId, subject, className]
      );
      if (existing.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Student attendance already submitted for this lesson today' });
      }

      const { rows: sessRows } = await client.query(
        `INSERT INTO student_attendance_sessions
           (school_id, date, subject, class_name, teacher_id,
            academic_year_id, semester, lesson_end_time, attendance_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [req.schoolId, today, subject, className, teacherId,
         yearId, sem, lessonEndTime || null, attendanceId || null]
      );
      const sessionId = sessRows[0].id;

      const validStatuses = new Set(['Present', 'Absent', 'Late']);
      for (const rec of records) {
        await client.query(
          `INSERT INTO student_attendance_records (school_id, session_id, student_id, status)
           VALUES ($1,$2,$3,$4)`,
          [req.schoolId, sessionId, rec.studentId,
           validStatuses.has(rec.status) ? rec.status : 'Present']
        );
      }

      await client.query('COMMIT');
      const present = records.filter(r => r.status === 'Present').length;
      const absent  = records.filter(r => r.status === 'Absent').length;
      res.status(201).json({ sessionId, total: records.length, present, absent });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

/** GET /api/student-attendance/today/:teacherId */
router.get('/today/:teacherId', async (req, res, next) => {
  try {
    if (req.user.role === 'teacher' && req.user.id !== req.params.teacherId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `SELECT s.id, s.subject, s.class_name, s.lesson_end_time, s.created_at,
              COUNT(r.id)::int                                              AS total,
              SUM(CASE WHEN r.status = 'Present' THEN 1 ELSE 0 END)::int   AS present,
              SUM(CASE WHEN r.status = 'Absent'  THEN 1 ELSE 0 END)::int   AS absent
       FROM student_attendance_sessions s
       LEFT JOIN student_attendance_records r ON r.session_id = s.id
       WHERE s.school_id = $1 AND s.date = $2 AND s.teacher_id = $3
       GROUP BY s.id`,
      [req.schoolId, today, req.params.teacherId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/** GET /api/student-attendance/session/:sessionId */
router.get('/session/:sessionId', async (req, res, next) => {
  try {
    const { rows: sess } = await pool.query(
      `SELECT s.*, te.name AS teacher_name
       FROM student_attendance_sessions s
       LEFT JOIN teachers te ON te.id = s.teacher_id
       WHERE s.id = $1 AND s.school_id = $2`,
      [req.params.sessionId, req.schoolId]
    );
    if (!sess.length) return res.status(404).json({ error: 'Session not found' });

    const { rows: records } = await pool.query(
      `SELECT r.id, r.status, r.updated_at,
              st.id AS student_id, st.student_code, st.name, st.class_name
       FROM student_attendance_records r
       JOIN students st ON st.id = r.student_id
       WHERE r.session_id = $1
       ORDER BY st.name`,
      [req.params.sessionId]
    );
    res.json({ session: sess[0], records });
  } catch (err) { next(err); }
});

/** PATCH /api/student-attendance/records/:id — edit a single record */
router.patch('/records/:id', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['Present', 'Absent', 'Late'].includes(status)) {
      return res.status(400).json({ error: 'status must be Present, Absent, or Late' });
    }

    const { rows } = await pool.query(
      `SELECT r.id, r.session_id, s.date, s.lesson_end_time, s.teacher_id
       FROM student_attendance_records r
       JOIN student_attendance_sessions s ON s.id = r.session_id
       WHERE r.id = $1 AND r.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Record not found' });

    const rec = rows[0];

    if (req.user.role === 'teacher') {
      if (req.user.id !== rec.teacher_id)
        return res.status(403).json({ error: 'Access denied' });
      if (isEditLocked(rec.date, rec.lesson_end_time)) {
        return res.status(403).json({
          error: 'Edit window closed. The 30-minute editing period after the lesson has passed. Contact your administrator to make changes.',
        });
      }
    }

    const { rows: updated } = await pool.query(
      `UPDATE student_attendance_records SET status = $1, updated_at = now()
       WHERE id = $2 RETURNING id, status, updated_at`,
      [status, req.params.id]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

/** GET /api/student-attendance/teacher/:teacherId — teacher's own sessions (any date range) */
router.get('/teacher/:teacherId', async (req, res, next) => {
  try {
    if (req.user.role === 'teacher' && req.user.id !== req.params.teacherId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { from, to } = req.query;
    const conds  = ['s.school_id = $1', 's.teacher_id = $2'];
    const params = [req.schoolId, req.params.teacherId];
    if (from) { params.push(from); conds.push(`s.date >= $${params.length}`); }
    if (to)   { params.push(to);   conds.push(`s.date <= $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT s.id, s.date, s.subject, s.class_name,
              COUNT(r.id)::int                                             AS total,
              SUM(CASE WHEN r.status = 'Present' THEN 1 ELSE 0 END)::int  AS present,
              SUM(CASE WHEN r.status = 'Absent'  THEN 1 ELSE 0 END)::int  AS absent,
              SUM(CASE WHEN r.status = 'Late'    THEN 1 ELSE 0 END)::int  AS late
       FROM student_attendance_sessions s
       LEFT JOIN student_attendance_records r ON r.session_id = s.id
       WHERE ${conds.join(' AND ')}
       GROUP BY s.id
       ORDER BY s.date DESC, s.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/** GET /api/student-attendance/report/students — per-student attendance summary (admin) */
router.get('/report/students', adminOnly, async (req, res, next) => {
  try {
    const { class_name, from, to, academic_year_id, semester } = req.query;
    const conds  = ['r.school_id = $1'];
    const params = [req.schoolId];
    if (class_name)       { params.push(class_name);       conds.push(`st.class_name = $${params.length}`); }
    if (from)             { params.push(from);             conds.push(`s.date >= $${params.length}`); }
    if (to)               { params.push(to);               conds.push(`s.date <= $${params.length}`); }
    if (academic_year_id) { params.push(academic_year_id); conds.push(`s.academic_year_id = $${params.length}`); }
    if (semester)         { params.push(parseInt(semester)); conds.push(`s.semester = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT
         st.id, st.student_code, st.name, st.class_name,
         COUNT(r.id)::int                                             AS total_sessions,
         SUM(CASE WHEN r.status = 'Present' THEN 1 ELSE 0 END)::int  AS present,
         SUM(CASE WHEN r.status = 'Absent'  THEN 1 ELSE 0 END)::int  AS absent,
         SUM(CASE WHEN r.status = 'Late'    THEN 1 ELSE 0 END)::int  AS late,
         CASE WHEN COUNT(r.id) = 0 THEN NULL
              ELSE ROUND(100.0 * SUM(CASE WHEN r.status = 'Present' THEN 1 ELSE 0 END) / COUNT(r.id), 1)
         END AS present_pct
       FROM student_attendance_records r
       JOIN students st ON st.id = r.student_id
       JOIN student_attendance_sessions s ON s.id = r.session_id
       WHERE ${conds.join(' AND ')}
       GROUP BY st.id, st.student_code, st.name, st.class_name
       ORDER BY st.class_name, present_pct ASC NULLS LAST, st.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/** GET /api/student-attendance/report/teacher/:teacherId/students — per-student summary for teacher's own sessions */
router.get('/report/teacher/:teacherId/students', async (req, res, next) => {
  try {
    if (req.user.role === 'teacher' && req.user.id !== req.params.teacherId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { from, to, class_name } = req.query;
    const conds  = ['r.school_id = $1', 's.teacher_id = $2'];
    const params = [req.schoolId, req.params.teacherId];
    if (from)       { params.push(from);       conds.push(`s.date >= $${params.length}`); }
    if (to)         { params.push(to);         conds.push(`s.date <= $${params.length}`); }
    if (class_name) { params.push(class_name); conds.push(`st.class_name = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT
         st.id, st.student_code, st.name, st.class_name,
         COUNT(r.id)::int                                             AS total_sessions,
         SUM(CASE WHEN r.status = 'Present' THEN 1 ELSE 0 END)::int  AS present,
         SUM(CASE WHEN r.status = 'Absent'  THEN 1 ELSE 0 END)::int  AS absent,
         SUM(CASE WHEN r.status = 'Late'    THEN 1 ELSE 0 END)::int  AS late,
         CASE WHEN COUNT(r.id) = 0 THEN NULL
              ELSE ROUND(100.0 * SUM(CASE WHEN r.status = 'Present' THEN 1 ELSE 0 END) / COUNT(r.id), 1)
         END AS present_pct
       FROM student_attendance_records r
       JOIN students st ON st.id = r.student_id
       JOIN student_attendance_sessions s ON s.id = r.session_id
       WHERE ${conds.join(' AND ')}
       GROUP BY st.id, st.student_code, st.name, st.class_name
       ORDER BY present_pct ASC NULLS LAST, absent DESC, st.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/** GET /api/student-attendance — admin list of sessions with summary counts */
router.get('/', adminOnly, async (req, res, next) => {
  try {
    const { date, class_name, teacher_id, from, to, academic_year_id, semester } = req.query;
    const conds  = ['s.school_id = $1'];
    const params = [req.schoolId];

    if (date)             { params.push(date);             conds.push(`s.date = $${params.length}`); }
    if (from)             { params.push(from);             conds.push(`s.date >= $${params.length}`); }
    if (to)               { params.push(to);               conds.push(`s.date <= $${params.length}`); }
    if (class_name)       { params.push(class_name);       conds.push(`s.class_name = $${params.length}`); }
    if (teacher_id)       { params.push(teacher_id);       conds.push(`s.teacher_id = $${params.length}`); }
    if (academic_year_id) { params.push(academic_year_id); conds.push(`s.academic_year_id = $${params.length}`); }
    if (semester)         { params.push(parseInt(semester)); conds.push(`s.semester = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT s.id, s.date, s.subject, s.class_name, s.created_at,
              te.name AS teacher_name,
              COUNT(r.id)::int                                             AS total,
              SUM(CASE WHEN r.status = 'Present' THEN 1 ELSE 0 END)::int  AS present,
              SUM(CASE WHEN r.status = 'Absent'  THEN 1 ELSE 0 END)::int  AS absent,
              SUM(CASE WHEN r.status = 'Late'    THEN 1 ELSE 0 END)::int  AS late
       FROM student_attendance_sessions s
       LEFT JOIN teachers te ON te.id = s.teacher_id
       LEFT JOIN student_attendance_records r ON r.session_id = s.id
       WHERE ${conds.join(' AND ')}
       GROUP BY s.id, te.name
       ORDER BY s.date DESC, s.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
