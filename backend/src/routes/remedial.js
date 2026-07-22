const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { verifyLocation } = require('../services/geo.service');
const { uploadPhoto } = require('../services/storage.service');
const { sendRemedialScheduledNotification } = require('../services/email.service');
const { createNotification, sendTeacherEmail } = require('../services/notification.service');

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
              te.name AS teacher_name,
              EXISTS (
                SELECT 1 FROM student_attendance_sessions sas
                WHERE sas.remedial_id = rl.id AND sas.school_id = rl.school_id
              ) AS has_register
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
         AND (
           ab.date >= CURRENT_DATE - INTERVAL '30 days'
           OR EXISTS (
             SELECT 1 FROM remedial_lessons rl
             WHERE rl.school_id = $1
               AND rl.status IN ('Rejected', 'Cancelled')
               AND (
                 rl.absence_id = ab.id
                 OR (
                   ab.absence_group_id IS NOT NULL
                   AND rl.absence_id IN (
                     SELECT id FROM absences
                     WHERE absence_group_id = ab.absence_group_id AND school_id = $1
                   )
                 )
               )
           )
         )
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
      absenceId, absenceGroupId, originalAbsenceDate,
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

    // For combined-class absences, update every sibling via the shared group UUID;
    // for solo absences, update the single row by id.
    if (absenceGroupId) {
      await pool.query(
        `UPDATE absences SET status = 'Remedial Scheduled', updated_at = now()
         WHERE absence_group_id = $1 AND school_id = $2`,
        [absenceGroupId, req.schoolId]
      );
    } else if (absenceId) {
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
        `SELECT id, student_code, name, class_name FROM students
         WHERE school_id = $1
           AND LOWER(class_name) = ANY(
             ARRAY(SELECT LOWER(TRIM(c)) FROM unnest(string_to_array($2, ',')) AS c)
           )
           AND LOWER(status) = 'active'
         ORDER BY class_name, name`,
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

    const { rows: timeRows } = await pool.query(
      `SELECT (remedial_date + remedial_time) > NOW() AS not_started FROM remedial_lessons WHERE id = $1`,
      [req.params.id]
    );
    if (timeRows[0]?.not_started)
      return res.status(400).json({ error: 'Lesson has not started yet' });

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

    const { rows: timeRows } = await pool.query(
      `SELECT (remedial_date + remedial_time) > NOW() AS not_started FROM remedial_lessons WHERE id = $1`,
      [req.params.id]
    );
    if (timeRows[0]?.not_started)
      return res.status(400).json({ error: 'Lesson has not started yet' });

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
      const { rows: [updAbs] } = await pool.query(
        `UPDATE absences SET status = 'Made Up', updated_at = now()
         WHERE id = $1 AND school_id = $2 RETURNING absence_group_id`,
        [rl.absence_id, req.schoolId]
      );
      if (updAbs?.absence_group_id) {
        await pool.query(
          `UPDATE absences SET status = 'Made Up', updated_at = now()
           WHERE absence_group_id = $1 AND id != $2 AND school_id = $3`,
          [updAbs.absence_group_id, rl.absence_id, req.schoolId]
        );
      }
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

      // Fetch current periods_lost and group on the primary absence
      const { rows: absRows } = await pool.query(
        `SELECT periods_lost, absence_group_id FROM absences WHERE id = $1 AND school_id = $2`,
        [rows[0].absence_id, req.schoolId]
      );
      const periodsLost = absRows[0]?.periods_lost ?? 1;
      const groupId     = absRows[0]?.absence_group_id ?? null;
      const remaining   = periodsLost - periodsCovered;

      if (remaining <= 0) {
        // Fully resolved — mark primary Made Up
        await pool.query(
          `UPDATE absences SET status = 'Made Up', periods_lost = 0, updated_at = now()
           WHERE id = $1 AND school_id = $2`,
          [rows[0].absence_id, req.schoolId]
        );
        // Resolve combined-class siblings (their periods_lost = 0 so they close automatically)
        if (groupId) {
          await pool.query(
            `UPDATE absences SET status = 'Made Up', periods_lost = 0, updated_at = now()
             WHERE absence_group_id = $1 AND id != $2 AND school_id = $3`,
            [groupId, rows[0].absence_id, req.schoolId]
          );
        }
      } else {
        // Partial coverage — reduce periods_lost; siblings remain as-is (periods_lost = 0)
        await pool.query(
          `UPDATE absences SET periods_lost = $1, updated_at = now()
           WHERE id = $2 AND school_id = $3`,
          [remaining, rows[0].absence_id, req.schoolId]
        );
      }
    }

    // Notify teacher
    try {
      const rl = rows[0];
      const { rows: tr } = await pool.query(`SELECT name, email FROM teachers WHERE id=$1`, [rl.teacher_id]);
      const t = tr[0];
      const date = rl.remedial_date?.slice?.(0, 10) ?? rl.remedial_date;
      const title = 'Remedial Lesson Verified';
      const msg = `Your remedial lesson for ${rl.subject} — ${rl.class_name} on ${date} has been verified and accepted.`;
      await createNotification(req.schoolId, rl.teacher_id, title, msg);
      if (t?.email) await sendTeacherEmail(t.email, title, `Dear ${t?.name || 'Teacher'},\n\n${msg}\n\n— CAS`);
    } catch (e) { /* non-fatal */ }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/remedial/:id/reject — admin rejects a completed (submitted) remedial
router.patch('/:id/reject', adminOnly, async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }

    const { rows: rlRows } = await pool.query(
      `SELECT absence_id, status FROM remedial_lessons WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rlRows.length) return res.status(404).json({ error: 'Remedial lesson not found' });
    const rl = rlRows[0];

    if (rl.status !== 'Completed') {
      return res.status(400).json({ error: `Cannot reject — lesson is '${rl.status}'. Only completed submissions can be rejected.` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE remedial_lessons
         SET status = 'Rejected', notes = $1, verified_by = $2, verified_at = now(), updated_at = now()
         WHERE id = $3 AND school_id = $4`,
        [reason.trim(), req.user.name || 'Admin', req.params.id, req.schoolId]
      );

      // Delete fraudulent student attendance session (records cascade automatically)
      await client.query(
        `DELETE FROM student_attendance_sessions WHERE remedial_id = $1 AND school_id = $2`,
        [req.params.id, req.schoolId]
      );

      // Revert primary absence and any combined-class siblings back to Absent
      if (rl.absence_id) {
        const { rows: [updAbs] } = await client.query(
          `UPDATE absences SET status = 'Absent', updated_at = now()
           WHERE id = $1 AND school_id = $2 RETURNING absence_group_id`,
          [rl.absence_id, req.schoolId]
        );
        if (updAbs?.absence_group_id) {
          await client.query(
            `UPDATE absences SET status = 'Absent', updated_at = now()
             WHERE absence_group_id = $1 AND id != $2 AND school_id = $3`,
            [updAbs.absence_group_id, rl.absence_id, req.schoolId]
          );
        }
      }

      await client.query('COMMIT');

      // Notify teacher (after commit, non-fatal)
      try {
        const { rows: rlInfo } = await pool.query(
          `SELECT teacher_id, subject, class_name, remedial_date::text AS remedial_date FROM remedial_lessons WHERE id=$1`,
          [req.params.id]
        );
        const rlRow = rlInfo[0];
        if (rlRow) {
          const { rows: tr } = await pool.query(`SELECT name, email FROM teachers WHERE id=$1`, [rlRow.teacher_id]);
          const t = tr[0];
          const title = 'Remedial Lesson Rejected';
          const msg = `Your remedial lesson for ${rlRow.subject} — ${rlRow.class_name} on ${rlRow.remedial_date} was rejected. Reason: ${reason.trim()}`;
          await createNotification(req.schoolId, rlRow.teacher_id, title, msg);
          if (t?.email) await sendTeacherEmail(t.email, title, `Dear ${t?.name || 'Teacher'},\n\n${msg}\n\nYou still need to complete a remedial lesson for this absence.\n\n— CAS`);
        }
      } catch (e) { /* non-fatal */ }

      res.json({ message: 'Remedial lesson rejected. Absence reverted to outstanding.' });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { next(err); }
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
      const { rows: [updAbs] } = await pool.query(
        `UPDATE absences SET status = 'Absent', updated_at = now()
         WHERE id = $1 AND school_id = $2 RETURNING absence_group_id`,
        [rl.absence_id, req.schoolId]
      );
      if (updAbs?.absence_group_id) {
        await pool.query(
          `UPDATE absences SET status = 'Absent', updated_at = now()
           WHERE absence_group_id = $1 AND id != $2 AND school_id = $3`,
          [updAbs.absence_group_id, rl.absence_id, req.schoolId]
        );
      }
    }

    res.json({ message: 'Remedial lesson cancelled' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
