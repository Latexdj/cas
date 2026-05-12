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
      locationVerified = false;
      locationMsg      = 'Location recorded (no GPS reference configured for this location).';
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
    if (teacherId)      { params.push(teacherId);      conds.push(`a.teacher_id = $${params.length}`); }
    if (req.query.from) { params.push(req.query.from); conds.push(`a.date >= $${params.length}`); }
    if (req.query.to)   { params.push(req.query.to);   conds.push(`a.date <= $${params.length}`); }

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

module.exports = router;
