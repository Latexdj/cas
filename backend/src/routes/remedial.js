const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { verifyLocation } = require('../services/geo.service');
const { uploadPhoto } = require('../services/storage.service');
const { sendRemedialScheduledNotification } = require('../services/email.service');

router.use(authenticate, requireActiveSubscription);

// GET /api/remedial — all remedial lessons (admin)
router.get('/', adminOnly, async (req, res, next) => {
  try {
    const { status, teacherId } = req.query;
    const conditions = [`rl.school_id = $1`];
    const params = [req.schoolId];

    if (status)    { params.push(status);    conditions.push(`rl.status = $${params.length}`); }
    if (teacherId) { params.push(teacherId); conditions.push(`rl.teacher_id = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT rl.id, rl.teacher_id, rl.absence_id,
              rl.original_absence_date::text AS original_absence_date,
              rl.subject, rl.class_name,
              rl.remedial_date::text AS remedial_date,
              rl.remedial_time, rl.remedial_end_time,
              rl.duration_periods, rl.topic,
              rl.location_id, rl.location_name, rl.notes, rl.status,
              rl.photo_url, rl.gps_coordinates,
              rl.verified_by, rl.verified_at, rl.created_at, rl.updated_at,
              te.name AS teacher_name
       FROM remedial_lessons rl
       JOIN teachers te ON te.id = rl.teacher_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY rl.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/remedial/teacher/:teacherId — teacher's remedial lessons
router.get('/teacher/:teacherId', async (req, res, next) => {
  try {
    if (req.user.role === 'teacher' && req.user.id !== req.params.teacherId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await pool.query(
      `SELECT
         rl.id, rl.original_absence_date::text AS original_absence_date, rl.subject, rl.class_name,
         rl.remedial_date::text AS remedial_date, rl.remedial_time, rl.duration_periods,
         rl.topic, rl.location_name, rl.status, rl.notes, rl.created_at,
         EXISTS (
           SELECT 1 FROM student_attendance_sessions sas
           WHERE sas.remedial_id = rl.id AND sas.school_id = rl.school_id
         ) AS has_register
       FROM remedial_lessons rl
       WHERE rl.school_id = $1 AND rl.teacher_id = $2
       ORDER BY rl.remedial_date DESC`,
      [req.schoolId, req.params.teacherId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/remedial/outstanding/:teacherId
// Absences that still need a remedial lesson scheduled.
router.get('/outstanding/:teacherId', async (req, res, next) => {
  try {
    if (req.user.role === 'teacher' && req.user.id !== req.params.teacherId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await pool.query(
      `SELECT ab.id, ab.date::text AS date, ab.subject, ab.class_name,
              ab.scheduled_period, ab.reason, ab.periods_lost,
              s.period_duration_minutes
       FROM absences ab
       JOIN schools s ON s.id = ab.school_id
       WHERE ab.school_id = $1 AND ab.teacher_id = $2
         AND ab.status = 'Absent'
         AND ab.is_auto_generated = true
         AND ab.date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY ab.date DESC`,
      [req.schoolId, req.params.teacherId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/remedial — schedule a remedial lesson
router.post('/', async (req, res, next) => {
  try {
    const {
      absenceId, originalAbsenceDate,
      subject, className, remedialDate, remedialTime,
      remedialEndTime, durationPeriods, periodsCovered,
      topic, locationName, notes,
    } = req.body;

    // Allow the frontend to pass either teacherId explicitly or rely on the authenticated user
    const teacherId = req.body.teacherId || req.user.id;

    const missing = ['originalAbsenceDate', 'subject', 'className', 'remedialDate', 'remedialTime']
      .filter(f => !req.body[f]);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    if (req.user.role === 'teacher' && req.user.id !== teacherId) {
      return res.status(403).json({ error: 'You can only schedule remedial lessons for yourself' });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (remedialDate < today) {
      return res.status(400).json({ error: 'Remedial date cannot be in the past' });
    }

    // Resolve location — accept either a locationId or a locationName
    let locationId = req.body.locationId || null;
    let resolvedLocationName = locationName || null;
    if (locationId && !resolvedLocationName) {
      const { rows: locRows } = await pool.query(
        `SELECT name FROM locations WHERE id = $1 AND school_id = $2 LIMIT 1`,
        [locationId, req.schoolId]
      );
      if (locRows.length) resolvedLocationName = locRows[0].name;
    } else if (locationName && !locationId) {
      const { rows: locRows } = await pool.query(
        `SELECT id FROM locations WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [req.schoolId, locationName]
      );
      if (locRows.length) locationId = locRows[0].id;
    }

    const storedPeriods = periodsCovered ?? durationPeriods ?? null;
    const { rows } = await pool.query(
      `INSERT INTO remedial_lessons
         (school_id, teacher_id, absence_id, original_absence_date, subject, class_name,
          remedial_date, remedial_time, remedial_end_time, duration_periods, topic,
          location_id, location_name, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Scheduled')
       RETURNING *`,
      [
        req.schoolId, teacherId, absenceId || null, originalAbsenceDate, subject, className,
        remedialDate, remedialTime, remedialEndTime || null, storedPeriods, topic || null,
        locationId, resolvedLocationName, notes || null,
      ]
    );

    if (absenceId) {
      await pool.query(
        `UPDATE absences SET status = 'Remedial Scheduled', updated_at = now()
         WHERE id = $1 AND school_id = $2`,
        [absenceId, req.schoolId]
      );
    }

    const { rows: teacherRows } = await pool.query(
      `SELECT name FROM teachers WHERE id = $1 AND school_id = $2`,
      [teacherId, req.schoolId]
    );
    if (teacherRows.length) {
      await sendRemedialScheduledNotification(rows[0], teacherRows[0].name);
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/remedial/:id/register — students + current register state
router.get('/:id/register', async (req, res, next) => {
  try {
    const { rows: rlRows } = await pool.query(
      `SELECT id, teacher_id, subject, class_name FROM remedial_lessons WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rlRows.length) return res.status(404).json({ error: 'Remedial lesson not found' });
    const rl = rlRows[0];
    if (req.user.role === 'teacher' && req.user.id !== rl.teacher_id)
      return res.status(403).json({ error: 'Access denied' });

    const [{ rows: students }, { rows: sessRows }] = await Promise.all([
      pool.query(
        `SELECT id, student_code, name FROM students
         WHERE school_id = $1 AND LOWER(class_name) = LOWER($2) AND LOWER(status) = 'active'
         ORDER BY name`,
        [req.schoolId, rl.class_name]
      ),
      pool.query(
        `SELECT id FROM student_attendance_sessions WHERE remedial_id = $1 AND school_id = $2 LIMIT 1`,
        [req.params.id, req.schoolId]
      ),
    ]);

    let recordMap = new Map();
    let sessionId = null;
    if (sessRows.length) {
      sessionId = sessRows[0].id;
      const { rows: recRows } = await pool.query(
        `SELECT student_id, status FROM student_attendance_records WHERE session_id = $1`,
        [sessionId]
      );
      recRows.forEach(r => recordMap.set(r.student_id, r.status));
    }

    res.json({
      sessionId,
      students: students.map(s => ({ ...s, status: recordMap.get(s.id) || null })),
    });
  } catch (err) { next(err); }
});

// POST /api/remedial/:id/register — submit or update the student register
router.post('/:id/register', async (req, res, next) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || !records.length)
      return res.status(400).json({ error: 'records[] is required' });

    const { rows: rlRows } = await pool.query(
      `SELECT id, teacher_id, subject, class_name, remedial_date::text AS remedial_date, status
       FROM remedial_lessons WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rlRows.length) return res.status(404).json({ error: 'Remedial lesson not found' });
    const rl = rlRows[0];
    if (req.user.role === 'teacher' && req.user.id !== rl.teacher_id)
      return res.status(403).json({ error: 'Access denied' });
    if (rl.status === 'Cancelled')
      return res.status(400).json({ error: 'Cannot mark register for a cancelled remedial' });

    const { rows: ayRows } = await pool.query(
      `SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`,
      [req.schoolId]
    );
    const yearId = ayRows[0]?.id || null;
    const sem    = ayRows[0]?.current_semester || null;
    const validStatuses = new Set(['Present', 'Absent', 'Late']);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: sessRows } = await client.query(
        `SELECT id FROM student_attendance_sessions WHERE remedial_id = $1 AND school_id = $2 LIMIT 1`,
        [req.params.id, req.schoolId]
      );
      let sessionId;
      if (sessRows.length) {
        sessionId = sessRows[0].id;
        await client.query(`DELETE FROM student_attendance_records WHERE session_id = $1`, [sessionId]);
      } else {
        const { rows: newSess } = await client.query(
          `INSERT INTO student_attendance_sessions
             (school_id, date, subject, class_name, teacher_id, academic_year_id, semester, remedial_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [req.schoolId, rl.remedial_date, rl.subject, rl.class_name,
           rl.teacher_id, yearId, sem, req.params.id]
        );
        sessionId = newSess[0].id;
      }

      for (const rec of records) {
        const status = validStatuses.has(rec.status) ? rec.status : 'Present';
        await client.query(
          `INSERT INTO student_attendance_records (school_id, session_id, student_id, status)
           VALUES ($1,$2,$3,$4)`,
          [req.schoolId, sessionId, rec.studentId, status]
        );
      }

      await client.query('COMMIT');
      const present = records.filter(r => r.status === 'Present').length;
      const absent  = records.filter(r => r.status === 'Absent').length;
      const late    = records.filter(r => r.status === 'Late').length;
      res.json({ sessionId, total: records.length, present, absent, late });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

// POST /api/remedial/:id/submit — submit attendance for a remedial lesson
router.post('/:id/submit', async (req, res, next) => {
  try {
    const { gpsCoordinates, imageBase64, topic, durationPeriods } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

    const { rows: rlRows } = await pool.query(
      `SELECT rl.*, te.name AS teacher_name
       FROM remedial_lessons rl
       JOIN teachers te ON te.id = rl.teacher_id
       WHERE rl.id = $1 AND rl.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rlRows.length) return res.status(404).json({ error: 'Remedial lesson not found' });
    const rl = rlRows[0];

    if (req.user.role === 'teacher' && req.user.id !== rl.teacher_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (rl.status !== 'Scheduled') {
      return res.status(400).json({ error: `Cannot submit — lesson is already '${rl.status}'` });
    }

    let locationMsg = 'Location not verified';
    if (rl.location_id && gpsCoordinates) {
      const { rows: locRows } = await pool.query(
        `SELECT * FROM locations WHERE id = $1`, [rl.location_id]
      );
      if (locRows.length) {
        const [lat, lng] = gpsCoordinates.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          const result = verifyLocation(locRows[0], lat, lng);
          if (!result.valid) {
            return res.status(400).json({ error: `Location verification failed: ${result.message}` });
          }
          locationMsg = result.message;
        }
      }
    }

    const fileName = `${req.schoolId}/remedial_${rl.teacher_name}_${rl.remedial_date}_${Date.now()}.png`;
    const photoUrl = await uploadPhoto(imageBase64, fileName);

    const { rows } = await pool.query(
      `UPDATE remedial_lessons
       SET status = 'Completed',
           photo_url = $1,
           gps_coordinates = $2,
           topic = COALESCE($3, topic),
           duration_periods = COALESCE($4, duration_periods),
           updated_at = now()
       WHERE id = $5 AND school_id = $6 RETURNING *`,
      [photoUrl, gpsCoordinates || null, topic || null, durationPeriods || null, req.params.id, req.schoolId]
    );

    if (rl.absence_id) {
      await pool.query(
        `UPDATE absences SET status = 'Made Up', updated_at = now()
         WHERE id = $1 AND school_id = $2`,
        [rl.absence_id, req.schoolId]
      );
    }

    res.json({ message: 'Remedial attendance submitted successfully', record: rows[0], locationMessage: locationMsg });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/remedial/:id/verify — admin verifies a completed remedial lesson
router.patch('/:id/verify', adminOnly, async (req, res, next) => {
  try {
    const { notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE remedial_lessons
       SET status = 'Verified',
           verified_by = $1,
           verified_at = now(),
           notes = COALESCE($2, notes),
           updated_at = now()
       WHERE id = $3 AND school_id = $4 AND status = 'Completed'
       RETURNING *`,
      [req.user.name || 'Admin', notes || null, req.params.id, req.schoolId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Remedial lesson not found or not yet completed' });
    }

    if (rows[0].absence_id) {
      const periodsCovered = rows[0].duration_periods ?? 1;

      // Fetch current periods_lost on the absence
      const { rows: absRows } = await pool.query(
        `SELECT periods_lost FROM absences WHERE id = $1 AND school_id = $2`,
        [rows[0].absence_id, req.schoolId]
      );
      const periodsLost = absRows[0]?.periods_lost ?? 1;
      const remaining   = periodsLost - periodsCovered;

      if (remaining <= 0) {
        // All periods covered — fully resolve the absence
        await pool.query(
          `UPDATE absences SET status = 'Made Up', periods_lost = 0, updated_at = now()
           WHERE id = $1 AND school_id = $2`,
          [rows[0].absence_id, req.schoolId]
        );
      } else {
        // Partial coverage — reduce periods_lost, leave status 'Absent' so it reappears in outstanding
        await pool.query(
          `UPDATE absences SET periods_lost = $1, updated_at = now()
           WHERE id = $2 AND school_id = $3`,
          [remaining, rows[0].absence_id, req.schoolId]
        );
      }
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/remedial/:id/cancel
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const { rows: rlRows } = await pool.query(
      `SELECT teacher_id, absence_id, status FROM remedial_lessons
       WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rlRows.length) return res.status(404).json({ error: 'Remedial lesson not found' });
    const rl = rlRows[0];

    if (req.user.role === 'teacher' && req.user.id !== rl.teacher_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (rl.status !== 'Scheduled') {
      return res.status(400).json({ error: `Cannot cancel — lesson is '${rl.status}'` });
    }

    await pool.query(
      `UPDATE remedial_lessons SET status = 'Cancelled', updated_at = now()
       WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );

    if (rl.absence_id) {
      await pool.query(
        `UPDATE absences SET status = 'Absent', updated_at = now()
         WHERE id = $1 AND school_id = $2`,
        [rl.absence_id, req.schoolId]
      );
    }

    res.json({ message: 'Remedial lesson cancelled' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
