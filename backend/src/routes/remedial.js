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
      `SELECT rl.*, te.name AS teacher_name
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
         id, original_absence_date, subject, class_name,
         remedial_date, remedial_time, duration_periods,
         topic, location_name, status, notes, created_at
       FROM remedial_lessons
       WHERE school_id = $1 AND teacher_id = $2
       ORDER BY remedial_date DESC`,
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
      `SELECT id, date, subject, class_name, scheduled_period, reason
       FROM absences
       WHERE school_id = $1 AND teacher_id = $2
         AND status = 'Absent'
         AND is_auto_generated = true
         AND date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY date DESC`,
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
      teacherId, absenceId, originalAbsenceDate,
      subject, className, remedialDate, remedialTime,
      durationPeriods, topic, locationName, notes,
    } = req.body;

    const missing = ['teacherId', 'originalAbsenceDate', 'subject', 'className', 'remedialDate', 'remedialTime']
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

    let locationId = null;
    if (locationName) {
      const { rows } = await pool.query(
        `SELECT id FROM locations WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [req.schoolId, locationName]
      );
      if (rows.length) locationId = rows[0].id;
    }

    const { rows } = await pool.query(
      `INSERT INTO remedial_lessons
         (school_id, teacher_id, absence_id, original_absence_date, subject, class_name,
          remedial_date, remedial_time, duration_periods, topic,
          location_id, location_name, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Scheduled')
       RETURNING *`,
      [
        req.schoolId, teacherId, absenceId || null, originalAbsenceDate, subject, className,
        remedialDate, remedialTime, durationPeriods || null, topic || null,
        locationId, locationName || null, notes || null,
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
      ['Admin', notes || null, req.params.id, req.schoolId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Remedial lesson not found or not yet completed' });
    }

    if (rows[0].absence_id) {
      await pool.query(
        `UPDATE absences SET status = 'Verified', updated_at = now()
         WHERE id = $1 AND school_id = $2`,
        [rows[0].absence_id, req.schoolId]
      );
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
