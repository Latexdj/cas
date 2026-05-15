const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { verifyLocation, getWeekNumber } = require('../services/geo.service');
const { uploadPhoto }   = require('../services/storage.service');

router.use(authenticate, requireActiveSubscription);

async function findDuplicateClass(teacherId, date, subject, classNamesStr) {
  const submitted = classNamesStr.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
  const { rows } = await pool.query(
    `SELECT class_names FROM attendance
     WHERE date = $1 AND teacher_id = $2 AND LOWER(subject) = LOWER($3)`,
    [date, teacherId, subject]
  );
  for (const row of rows) {
    const existing = row.class_names.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
    const overlap  = submitted.filter(c => existing.includes(c));
    if (overlap.length) return overlap;
  }
  return null;
}

// POST /api/attendance/submit
router.post('/submit', async (req, res, next) => {
  try {
    const {
      teacherId, subject, classNames, periods, topic,
      gpsCoordinates, imageBase64, locationName,
      academicYearId, semester, photoSizeKb,
    } = req.body;

    const missing = ['teacherId','subject','classNames','periods','imageBase64','topic','gpsCoordinates','locationName'].filter(f => !req.body[f]);
    if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });

    if (req.user.role === 'teacher' && req.user.id !== teacherId) {
      return res.status(403).json({ error: 'You can only submit attendance for yourself' });
    }

    // Resolve academic year
    let yearId = academicYearId, sem = semester;
    if (!yearId || !sem) {
      const { rows } = await pool.query(
        `SELECT id, current_semester FROM academic_years
         WHERE school_id = $1 AND is_current = true LIMIT 1`,
        [req.schoolId]
      );
      if (!rows.length) return res.status(400).json({ error: 'No current academic year configured' });
      yearId = yearId || rows[0].id;
      sem    = sem    || rows[0].current_semester;
    }

    const today      = new Date().toISOString().slice(0, 10);
    const weekNumber = getWeekNumber(new Date());

    const overlap = await findDuplicateClass(teacherId, today, subject, classNames);
    if (overlap) {
      return res.status(409).json({ error: `Attendance already recorded for: ${overlap.join(', ')} today` });
    }

    // GPS / location verification — both required
    let locationId = null, locationVerified = false, locationMsg = 'Location not verified';
    const { rows: locRows } = await pool.query(
      `SELECT * FROM locations WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [req.schoolId, locationName]
    );
    if (!locRows.length) {
      return res.status(400).json({ error: `Location "${locationName}" not found. Please select a valid classroom location.` });
    }
    locationId = locRows[0].id;
    if (locRows[0].has_coordinates) {
      const [lat, lng] = gpsCoordinates.split(',').map(Number);
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Invalid GPS coordinates. Please refresh your location and try again.' });
      }
      const result = verifyLocation(locRows[0], lat, lng);
      if (!result.valid) {
        return res.status(400).json({ error: `You do not appear to be in ${locationName}. ${result.message}` });
      }
      locationVerified = result.verified;
      locationMsg      = result.message;
    } else {
      return res.status(400).json({
        error: `GPS coordinates have not been configured for "${locationName}". Ask your administrator to add GPS coordinates for this location before attendance can be submitted.`,
      });
    }

    // Upload photo
    const { rows: tRows } = await pool.query(`SELECT name FROM teachers WHERE id = $1`, [teacherId]);
    const tName    = tRows[0]?.name || teacherId;
    const fileName = `${req.schoolId}/${tName}_${today}_${classNames.replace(/,\s*/g,'_')}_${Date.now()}.png`;
    const photoUrl = await uploadPhoto(imageBase64, fileName);

    const { rows } = await pool.query(
      `INSERT INTO attendance
         (school_id, date, academic_year_id, semester, teacher_id,
          subject, class_names, periods, topic, gps_coordinates,
          photo_url, week_number, location_id, location_name,
          location_verified, location_verification_message, photo_size_kb)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        req.schoolId, today, yearId, sem, teacherId,
        subject, classNames, periods, topic||null, gpsCoordinates||null,
        photoUrl, weekNumber, locationId, locationName||null,
        locationVerified, locationMsg, photoSizeKb||null,
      ]
    );
    res.status(201).json({ message: 'Attendance recorded', record: rows[0], locationMessage: locationMsg });
  } catch (err) { next(err); }
});

// GET /api/attendance (admin, paginated)
router.get('/', adminOnly, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const { date, teacherId, subject, from, to } = req.query;

    const conds  = [`a.school_id = $1`];
    const params = [req.schoolId];
    if (date)      { params.push(date);          conds.push(`a.date = $${params.length}`); }
    if (from)      { params.push(from);          conds.push(`a.date >= $${params.length}`); }
    if (to)        { params.push(to);            conds.push(`a.date <= $${params.length}`); }
    if (teacherId) { params.push(teacherId);      conds.push(`a.teacher_id = $${params.length}`); }
    if (subject)   { params.push(`%${subject}%`); conds.push(`a.subject ILIKE $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT a.id, a.date, a.submitted_at, a.semester, a.subject, a.class_names,
              a.periods, a.topic, a.photo_url, a.week_number,
              a.location_name, a.location_verified, a.gps_coordinates, a.photo_size_kb,
              te.id AS teacher_id, te.name AS teacher_name,
              ay.name AS academic_year
       FROM attendance a
       JOIN teachers te ON te.id = a.teacher_id
       JOIN academic_years ay ON ay.id = a.academic_year_id
       WHERE ${conds.join(' AND ')}
       ORDER BY a.submitted_at DESC
       LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/attendance/today/:teacherId
router.get('/today/:teacherId', async (req, res, next) => {
  try {
    if (req.user.role === 'teacher' && req.user.id !== req.params.teacherId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `SELECT id, subject, class_names, periods, topic, location_name, location_verified, submitted_at
       FROM attendance
       WHERE school_id = $1 AND date = $2 AND teacher_id = $3
       ORDER BY submitted_at`,
      [req.schoolId, today, req.params.teacherId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/attendance/history
router.get('/history', async (req, res, next) => {
  try {
    const teacherId = req.user.role === 'admin' ? (req.query.teacherId||null) : req.user.id;
    const limit  = Math.min(parseInt(req.query.limit)||30, 100);
    const offset = parseInt(req.query.offset)||0;

    const conds  = [`a.school_id = $1`];
    const params = [req.schoolId];
    if (teacherId)               { params.push(teacherId);                           conds.push(`a.teacher_id = $${params.length}`); }
    if (req.query.from)          { params.push(req.query.from);                      conds.push(`a.date >= $${params.length}`); }
    if (req.query.to)            { params.push(req.query.to);                        conds.push(`a.date <= $${params.length}`); }
    if (req.query.academic_year_id) { params.push(req.query.academic_year_id);       conds.push(`a.academic_year_id = $${params.length}`); }
    if (req.query.semester)      { params.push(parseInt(req.query.semester, 10));    conds.push(`a.semester = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT a.id, a.date, a.submitted_at, a.subject, a.class_names,
              a.periods, a.topic, a.location_name, a.location_verified,
              te.name AS teacher_name, ay.name AS academic_year
       FROM attendance a
       JOIN teachers te ON te.id = a.teacher_id
       JOIN academic_years ay ON ay.id = a.academic_year_id
       WHERE ${conds.join(' AND ')}
       ORDER BY a.date DESC, a.submitted_at DESC
       LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/attendance/my-summary — teacher's own attendance stats (defaults to current year + semester)
router.get('/my-summary', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    const useAll = semester === 'all' || semester === '0';

    let yearId = academic_year_id?.trim() || null;
    let sem    = useAll ? null : (semester ? parseInt(semester, 10) : null);

    if (!yearId || (!useAll && sem === null)) {
      const { rows: ayRows } = await pool.query(
        `SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`,
        [req.schoolId]
      );
      if (!yearId) yearId = ayRows[0]?.id    || null;
      if (!useAll && sem === null) sem = ayRows[0]?.current_semester || null;
    }

    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(a.periods), 0)::int AS present_periods,
        COUNT(DISTINCT ab.id) FILTER (WHERE ab.status != 'Excused')::int AS absent_periods,
        COUNT(DISTINCT ab.id) FILTER (WHERE ab.status  = 'Excused')::int AS excused_periods,
        (COALESCE(SUM(a.periods), 0)
          + COUNT(DISTINCT ab.id) FILTER (WHERE ab.status != 'Excused'))::int AS total_scheduled,
        CASE
          WHEN (COALESCE(SUM(a.periods), 0)
                + COUNT(DISTINCT ab.id) FILTER (WHERE ab.status != 'Excused')) = 0 THEN NULL
          ELSE ROUND(
            100.0 * COALESCE(SUM(a.periods), 0) /
            NULLIF(COALESCE(SUM(a.periods), 0)
              + COUNT(DISTINCT ab.id) FILTER (WHERE ab.status != 'Excused'), 0), 1)
        END AS attendance_pct
      FROM teachers t
      LEFT JOIN attendance a
        ON  a.teacher_id = t.id
        AND a.school_id  = $1
        AND ($2::uuid IS NULL OR a.academic_year_id = $2::uuid)
        AND ($3::int  IS NULL OR a.semester = $3::int)
      LEFT JOIN absences ab
        ON  ab.teacher_id = t.id
        AND ab.school_id  = $1
        AND ab.date >= COALESCE(
              (SELECT MIN(a2.date) FROM attendance a2
               WHERE  a2.teacher_id = $4 AND a2.school_id = $1
                 AND ($2::uuid IS NULL OR a2.academic_year_id = $2::uuid)
                 AND ($3::int  IS NULL OR a2.semester = $3::int)),
              CURRENT_DATE - INTERVAL '365 days')
        AND ab.date <= COALESCE(
              (SELECT MAX(a2.date) FROM attendance a2
               WHERE  a2.teacher_id = $4 AND a2.school_id = $1
                 AND ($2::uuid IS NULL OR a2.academic_year_id = $2::uuid)
                 AND ($3::int  IS NULL OR a2.semester = $3::int)),
              CURRENT_DATE)
      WHERE t.id = $4 AND t.school_id = $1
      GROUP BY t.id
    `, [req.schoolId, yearId || null, sem || null, req.user.id]);

    res.json(rows[0] || {
      present_periods: 0, absent_periods: 0, excused_periods: 0,
      total_scheduled: 0, attendance_pct: null,
    });
  } catch (err) { next(err); }
});

module.exports = router;
