const router = require('express').Router();
const pool   = require('../config/db');
const crypto = require('crypto');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { verifyLocation } = require('../services/geo.service');
const { uploadPhoto, uploadDocument } = require('../services/storage.service');
const { logAudit }       = require('../services/audit.service');

router.use(authenticate, requireActiveSubscription);

// ── QR helpers (same secret mechanism as classroom-qr / plc) ──────────────────

async function getSchoolSecret(schoolId) {
  const { rows } = await pool.query('SELECT qr_secret FROM schools WHERE id = $1', [schoolId]);
  if (rows[0]?.qr_secret) return rows[0].qr_secret;
  const newSecret = crypto.randomBytes(32).toString('hex');
  await pool.query('UPDATE schools SET qr_secret = $1 WHERE id = $2', [newSecret, schoolId]);
  return newSecret;
}

async function buildToken(schoolId, label) {
  const secret = await getSchoolSecret(schoolId);
  const hmac   = crypto.createHmac('sha256', secret)
    .update(`${schoolId}:${label}`)
    .digest('hex')
    .slice(0, 16);
  return `cas-qr:${schoolId}:${label}:${hmac}`;
}

function parseToken(token) {
  const parts = token.split(':');
  if (parts.length < 4 || parts[0] !== 'cas-qr') return null;
  const schoolId = parts[1];
  const hmac     = parts[parts.length - 1];
  const label    = parts.slice(2, -1).join(':');
  return { schoolId, label, hmac };
}

// ── Repeat-schedule helpers ───────────────────────────────────────────────────

/**
 * Generate an array of ISO date strings (YYYY-MM-DD) for a repeat schedule.
 * 'daily'  → every Mon–Fri between startDate and endDate (inclusive)
 * 'weekly' → the same day-of-week as startDate, once per week until endDate
 * Returns at most MAX_INSTANCES entries.
 */
const MAX_INSTANCES = 200;

function generateRepeatDates(startDate, endDate, repeat) {
  const dates  = [];
  const cursor = new Date(startDate + 'T00:00:00Z');
  const end    = new Date(endDate   + 'T00:00:00Z');

  if (repeat === 'daily') {
    // Mon–Fri only
    while (cursor <= end && dates.length < MAX_INSTANCES) {
      const dow = cursor.getUTCDay(); // 0=Sun, 6=Sat
      if (dow >= 1 && dow <= 5) {
        dates.push(cursor.toISOString().slice(0, 10));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else if (repeat === 'weekly') {
    while (cursor <= end && dates.length < MAX_INSTANCES) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  return dates;
}

// ── Admin: meetings CRUD ──────────────────────────────────────────────────────

// GET /api/meetings — list meetings with optional ?type=&from=&to= filters
router.get('/', adminOnly, async (req, res, next) => {
  try {
    const { type, from, to } = req.query;
    const conds  = ['m.school_id = $1'];
    const params = [req.schoolId];

    if (type) { params.push(type); conds.push(`m.meeting_type = $${params.length}`); }
    if (from) { params.push(from); conds.push(`m.date >= $${params.length}`); }
    if (to)   { params.push(to);   conds.push(`m.date <= $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT m.*, l.name AS location_name, l.has_coordinates
       FROM meetings m
       LEFT JOIN locations l ON l.id = m.location_id
       WHERE ${conds.join(' AND ')}
       ORDER BY m.date DESC, m.start_time`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/meetings — create one or many (with repeat support)
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const {
      title, meeting_type, date, start_time, end_time, location_id,
      repeat = 'none', repeat_end_date,
    } = req.body;

    if (!title || !meeting_type || !date || !start_time || !end_time || !location_id) {
      return res.status(400).json({
        error: 'title, meeting_type, date, start_time, end_time, location_id are required',
      });
    }

    const VALID_TYPES = ['PLC', 'Morning Briefing', 'Staff Meeting', 'PTA', 'Other'];
    if (!VALID_TYPES.includes(meeting_type)) {
      return res.status(400).json({ error: `meeting_type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    // Build list of dates to insert
    let dates;
    if (repeat === 'none' || !repeat_end_date) {
      dates = [date];
    } else if (repeat === 'daily' || repeat === 'weekly') {
      if (repeat_end_date < date) {
        return res.status(400).json({ error: 'repeat_end_date must be on or after date' });
      }
      dates = generateRepeatDates(date, repeat_end_date, repeat);
      if (!dates.length) {
        return res.status(400).json({ error: 'No valid dates found for the requested repeat range' });
      }
    } else {
      return res.status(400).json({ error: "repeat must be 'none', 'daily', or 'weekly'" });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inserted = [];
      for (const d of dates) {
        const { rows } = await client.query(
          `INSERT INTO meetings
             (school_id, title, meeting_type, date, start_time, end_time, location_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [req.schoolId, title, meeting_type, d, start_time, end_time, location_id]
        );
        inserted.push(rows[0]);
      }

      await client.query('COMMIT');

      await logAudit(
        req.schoolId, 'MEETING_CREATED', req.user.id, req.user.name,
        'meetings', inserted[0].id,
        { title, meeting_type, count: inserted.length }
      );

      res.status(201).json({ inserted: inserted.length, meetings: inserted });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// POST /api/meetings/:id/minutes — admin uploads meeting minutes
router.post('/:id/minutes', adminOnly, async (req, res, next) => {
  try {
    const { fileBase64, filename } = req.body;
    if (!fileBase64 || !filename) {
      return res.status(400).json({ error: 'fileBase64 and filename are required' });
    }

    const { rows: mtg } = await pool.query(
      'SELECT id FROM meetings WHERE id = $1 AND school_id = $2',
      [req.params.id, req.schoolId]
    );
    if (!mtg.length) return res.status(404).json({ error: 'Meeting not found' });

    let docUrl, docFilename;
    try {
      const result = await uploadDocument(
        fileBase64,
        filename,
        `meeting-minutes/${req.schoolId}`
      );
      docUrl      = result.url;
      docFilename = result.filename;
    } catch (uploadErr) {
      return res.status(400).json({ error: uploadErr.message });
    }

    const { rows } = await pool.query(
      `UPDATE meetings
       SET minutes_url = $1, minutes_filename = $2, minutes_uploaded_at = now()
       WHERE id = $3 AND school_id = $4
       RETURNING id, minutes_url, minutes_filename, minutes_uploaded_at`,
      [docUrl, docFilename, req.params.id, req.schoolId]
    );

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/meetings/:id/minutes — admin removes meeting minutes
router.delete('/:id/minutes', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE meetings
       SET minutes_url = NULL, minutes_filename = NULL, minutes_uploaded_at = NULL
       WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Meeting not found' });
    res.json({ message: 'Minutes removed' });
  } catch (err) { next(err); }
});

// PUT /api/meetings/:id — update meeting
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { title, meeting_type, date, start_time, end_time, location_id, is_active } = req.body;

    if (meeting_type) {
      const VALID_TYPES = ['PLC', 'Morning Briefing', 'Staff Meeting', 'PTA', 'Other'];
      if (!VALID_TYPES.includes(meeting_type)) {
        return res.status(400).json({ error: `meeting_type must be one of: ${VALID_TYPES.join(', ')}` });
      }
    }

    const { rows } = await pool.query(
      `UPDATE meetings SET
         title        = COALESCE($1, title),
         meeting_type = COALESCE($2, meeting_type),
         date         = COALESCE($3, date),
         start_time   = COALESCE($4, start_time),
         end_time     = COALESCE($5, end_time),
         location_id  = COALESCE($6, location_id),
         is_active    = COALESCE($7, is_active)
       WHERE id = $8 AND school_id = $9
       RETURNING *`,
      [
        title ?? null, meeting_type ?? null, date ?? null,
        start_time ?? null, end_time ?? null, location_id ?? null,
        is_active ?? null,
        req.params.id, req.schoolId,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Meeting not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/meetings/:id
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM meetings WHERE id = $1 AND school_id = $2',
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Meeting not found' });

    await logAudit(
      req.schoolId, 'MEETING_DELETED', req.user.id, req.user.name,
      'meetings', req.params.id, {}
    );

    res.json({ message: 'Meeting deleted' });
  } catch (err) { next(err); }
});

// GET /api/meetings/:id/token — returns QR token for client-side rendering
router.get('/:id/token', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, l.name AS location_name
       FROM meetings m
       JOIN locations l ON l.id = m.location_id
       WHERE m.id = $1 AND m.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Meeting not found' });

    const token = await buildToken(req.schoolId, rows[0].location_name);
    res.json({ token, location_name: rows[0].location_name, title: rows[0].title });
  } catch (err) { next(err); }
});

// GET /api/meetings/summary — per-teacher meeting attendance summary
router.get('/summary', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    const useAll = semester === 'all' || semester === '0';
    let yearId = academic_year_id?.trim() || null;
    let sem    = useAll ? null : (semester ? parseInt(semester, 10) : null);

    if (!yearId || (!useAll && sem === null)) {
      const { rows: ayRows } = await pool.query(
        `SELECT id, current_semester FROM academic_years
         WHERE school_id = $1 AND is_current = true LIMIT 1`,
        [req.schoolId]
      );
      if (!yearId) yearId = ayRows[0]?.id || null;
      if (!useAll && sem === null) sem = ayRows[0]?.current_semester || null;
    }

    const { rows } = await pool.query(`
      WITH att AS (
        SELECT teacher_id, COUNT(*) AS present_count
        FROM meeting_attendance
        WHERE school_id = $1
          AND ($2::uuid IS NULL OR academic_year_id = $2::uuid)
          AND ($3::int  IS NULL OR semester = $3::int)
        GROUP BY teacher_id
      ),
      dr AS (
        SELECT
          COALESCE(MIN(date), CURRENT_DATE - INTERVAL '365 days') AS min_date,
          COALESCE(MAX(date), CURRENT_DATE) AS max_date
        FROM meeting_attendance
        WHERE school_id = $1
          AND ($2::uuid IS NULL OR academic_year_id = $2::uuid)
          AND ($3::int  IS NULL OR semester = $3::int)
      ),
      abs AS (
        SELECT ab.teacher_id, COUNT(*) AS absent_count
        FROM meeting_absences ab, dr
        WHERE ab.school_id = $1
          AND ab.date >= dr.min_date
          AND ab.date <= dr.max_date
        GROUP BY ab.teacher_id
      )
      SELECT
        t.id,
        t.name,
        COALESCE(t.department, '—') AS department,
        COALESCE(att.present_count, 0)::int AS present_count,
        COALESCE(abs.absent_count, 0)::int  AS absent_count,
        (COALESCE(att.present_count, 0) + COALESCE(abs.absent_count, 0))::int AS total_scheduled,
        CASE
          WHEN (COALESCE(att.present_count, 0) + COALESCE(abs.absent_count, 0)) = 0 THEN NULL
          ELSE ROUND(
            100.0 * COALESCE(att.present_count, 0) /
            NULLIF(COALESCE(att.present_count, 0) + COALESCE(abs.absent_count, 0), 0), 1)
        END AS attendance_pct
      FROM teachers t
      LEFT JOIN att ON att.teacher_id = t.id
      LEFT JOIN abs ON abs.teacher_id = t.id
      WHERE t.school_id = $1 AND t.status = 'Active'
      ORDER BY attendance_pct ASC NULLS LAST, t.name
    `, [req.schoolId, yearId || null, sem || null]);

    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/meetings/attendance — admin list attendance records
router.get('/attendance', adminOnly, async (req, res, next) => {
  try {
    const { from, to, type } = req.query;
    const conds  = ['ma.school_id = $1'];
    const params = [req.schoolId];
    if (from) { params.push(from); conds.push(`ma.date >= $${params.length}`); }
    if (to)   { params.push(to);   conds.push(`ma.date <= $${params.length}`); }
    if (type) { params.push(type); conds.push(`m.meeting_type = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT ma.id, ma.date, ma.submitted_at, ma.notes, ma.location_name,
              ma.location_verified, ma.gps_coordinates, ma.photo_url,
              t.name AS teacher_name,
              m.title AS meeting_title, m.meeting_type
       FROM meeting_attendance ma
       JOIN teachers t ON t.id = ma.teacher_id
       JOIN meetings m ON m.id = ma.meeting_id
       WHERE ${conds.join(' AND ')}
       ORDER BY ma.date DESC, t.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/meetings/absences — admin list absence records
router.get('/absences', adminOnly, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const conds  = ['ab.school_id = $1'];
    const params = [req.schoolId];
    if (from) { params.push(from); conds.push(`ab.date >= $${params.length}`); }
    if (to)   { params.push(to);   conds.push(`ab.date <= $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT ab.id, ab.date, ab.status, ab.reason, ab.created_at,
              t.name AS teacher_name,
              m.title AS meeting_title, m.meeting_type
       FROM meeting_absences ab
       JOIN teachers t ON t.id = ab.teacher_id
       JOIN meetings m ON m.id = ab.meeting_id
       WHERE ${conds.join(' AND ')}
       ORDER BY ab.date DESC, t.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// DELETE /api/meetings/attendance/:id — admin delete attendance record
router.delete('/attendance/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM meeting_attendance WHERE id = $1 AND school_id = $2',
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Record not found' });
    res.json({ message: 'Attendance record deleted' });
  } catch (err) { next(err); }
});

// ── Teacher: meeting attendance summary ──────────────────────────────────────

// GET /api/meetings/my-summary — per-type attendance summary for current semester
router.get('/my-summary', async (req, res, next) => {
  try {
    // Resolve current academic year + semester
    const { rows: yearRows } = await pool.query(
      `SELECT id FROM academic_years
       WHERE school_id = $1 AND is_current = true
       LIMIT 1`,
      [req.schoolId]
    );
    const academicYearId = yearRows[0]?.id ?? null;

    let semester = null;
    if (academicYearId) {
      const { rows: semRows } = await pool.query(
        `SELECT semester FROM meeting_attendance
         WHERE school_id = $1 AND academic_year_id = $2
         ORDER BY date DESC LIMIT 1`,
        [req.schoolId, academicYearId]
      );
      semester = semRows[0]?.semester ?? null;
    }

    const { rows } = await pool.query(
      `WITH att AS (
         SELECT m.meeting_type, COUNT(*)::int AS present
         FROM meeting_attendance ma
         JOIN meetings m ON m.id = ma.meeting_id
         WHERE ma.school_id = $1
           AND ma.teacher_id = $2
           AND ($3::uuid IS NULL OR ma.academic_year_id = $3::uuid)
           AND ($4::int  IS NULL OR ma.semester         = $4::int)
         GROUP BY m.meeting_type
       ),
       date_range AS (
         SELECT
           COALESCE(MIN(ma.date), CURRENT_DATE - INTERVAL '365 days') AS min_date,
           COALESCE(MAX(ma.date), CURRENT_DATE)                        AS max_date
         FROM meeting_attendance ma
         WHERE ma.school_id = $1
           AND ($3::uuid IS NULL OR ma.academic_year_id = $3::uuid)
           AND ($4::int  IS NULL OR ma.semester         = $4::int)
       ),
       abs AS (
         SELECT m.meeting_type, COUNT(*)::int AS absent
         FROM meeting_absences ab
         JOIN meetings m ON m.id = ab.meeting_id
         WHERE ab.school_id = $1
           AND ab.teacher_id = $2
           AND ab.date >= (SELECT min_date FROM date_range)
           AND ab.date <= (SELECT max_date FROM date_range)
         GROUP BY m.meeting_type
       )
       SELECT
         COALESCE(att.meeting_type, abs.meeting_type) AS meeting_type,
         COALESCE(att.present, 0)::int                AS present,
         COALESCE(abs.absent,  0)::int                AS absent,
         (COALESCE(att.present, 0) + COALESCE(abs.absent, 0))::int AS total,
         CASE
           WHEN (COALESCE(att.present, 0) + COALESCE(abs.absent, 0)) = 0 THEN NULL
           ELSE ROUND(100.0 * COALESCE(att.present, 0) /
             NULLIF(COALESCE(att.present, 0) + COALESCE(abs.absent, 0), 0), 1)
         END AS pct
       FROM att
       FULL OUTER JOIN abs USING (meeting_type)
       ORDER BY meeting_type`,
      [req.schoolId, req.user.id, academicYearId, semester]
    );

    res.json(rows);
  } catch (err) { next(err); }
});

// ── Teacher: today's meetings ─────────────────────────────────────────────────

// GET /api/meetings/today — array of today's active meetings with submission status
router.get('/today', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { rows } = await pool.query(
      `SELECT
         m.*,
         l.name AS location_name, l.has_coordinates,
         l.latitude, l.longitude, l.radius_meters,
         ma.id       AS submitted_id,
         ma.submitted_at
       FROM meetings m
       JOIN locations l ON l.id = m.location_id
       LEFT JOIN meeting_attendance ma
         ON ma.meeting_id = m.id
        AND ma.teacher_id = $2
        AND ma.date        = $3
       WHERE m.school_id = $1
         AND m.date      = $3
         AND m.is_active = true
       ORDER BY m.start_time`,
      [req.schoolId, req.user.id, today]
    );

    const result = rows.map(r => ({
      id:             r.id,
      title:          r.title,
      meeting_type:   r.meeting_type,
      date:           r.date,
      start_time:     r.start_time,
      end_time:       r.end_time,
      location_id:    r.location_id,
      is_active:      r.is_active,
      created_at:     r.created_at,
      location_name:  r.location_name,
      has_coordinates: r.has_coordinates,
      latitude:       r.latitude,
      longitude:      r.longitude,
      radius_meters:  r.radius_meters,
      submitted: r.submitted_id
        ? { id: r.submitted_id, submitted_at: r.submitted_at }
        : null,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/meetings/verify-qr — teacher scans the venue QR for a meeting
router.post('/verify-qr', async (req, res, next) => {
  try {
    const { token, meetingId } = req.body;
    if (!token || !meetingId) {
      return res.status(400).json({ error: 'token and meetingId are required' });
    }

    const parsed = parseToken(token.trim());
    if (!parsed) return res.status(400).json({ error: 'Invalid QR code format' });
    if (parsed.schoolId !== req.schoolId) {
      return res.status(403).json({ error: 'QR code belongs to a different school' });
    }

    const { rows } = await pool.query(
      `SELECT m.id, l.name AS location_name
       FROM meetings m
       JOIN locations l ON l.id = m.location_id
       WHERE m.id = $1 AND m.school_id = $2`,
      [meetingId, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Meeting not found' });

    const expectedToken  = await buildToken(req.schoolId, rows[0].location_name);
    const expectedParsed = parseToken(expectedToken);

    const aBuf = Buffer.from(parsed.hmac.padEnd(expectedParsed.hmac.length, '0'), 'hex');
    const bBuf = Buffer.from(expectedParsed.hmac, 'hex');
    const valid = aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);

    if (!valid) {
      return res.status(400).json({
        error: 'QR code does not match the meeting venue. Scan the QR code posted at the meeting location.',
      });
    }

    res.json({ valid: true, locationName: rows[0].location_name });
  } catch (err) { next(err); }
});

// POST /api/meetings/submit — teacher submits meeting attendance
router.post('/submit', async (req, res, next) => {
  try {
    const { meetingId, notes, gpsCoordinates, imageBase64, photoSizeKb } = req.body;
    const teacherId = req.user.id;

    if (!meetingId || !gpsCoordinates || !imageBase64) {
      return res.status(400).json({ error: 'meetingId, gpsCoordinates, and imageBase64 are required' });
    }

    // Load meeting + location details
    const { rows: mtgRows } = await pool.query(
      `SELECT m.*, l.name AS location_name, l.has_coordinates,
              l.latitude, l.longitude, l.radius_meters
       FROM meetings m
       JOIN locations l ON l.id = m.location_id
       WHERE m.id = $1 AND m.school_id = $2 AND m.is_active = true`,
      [meetingId, req.schoolId]
    );
    if (!mtgRows.length) return res.status(404).json({ error: 'Meeting not found or is inactive' });
    const meeting = mtgRows[0];

    const today = new Date().toISOString().slice(0, 10);

    // Duplicate guard
    const { rows: existing } = await pool.query(
      'SELECT id FROM meeting_attendance WHERE meeting_id = $1 AND teacher_id = $2 AND date = $3',
      [meetingId, teacherId, today]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'You have already submitted attendance for this meeting today.' });
    }

    // GPS verification
    let locationVerified = false;
    let locationMsg      = 'Location not verified';
    if (meeting.has_coordinates) {
      const [lat, lng] = gpsCoordinates.split(',').map(Number);
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Invalid GPS coordinates.' });
      }
      const result = verifyLocation(meeting, lat, lng);
      if (!result.valid) {
        return res.status(400).json({
          error: `You do not appear to be at the meeting venue. ${result.message}`,
        });
      }
      locationVerified = result.verified;
      locationMsg      = result.message;
    }

    // Academic year / semester
    const { rows: ayRows } = await pool.query(
      'SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1',
      [req.schoolId]
    );
    const yearId = ayRows[0]?.id              ?? null;
    const sem    = ayRows[0]?.current_semester ?? null;

    // Upload photo
    const { rows: tRows } = await pool.query('SELECT name FROM teachers WHERE id = $1', [teacherId]);
    const tName    = tRows[0]?.name ?? teacherId;
    const fileName = `meetings/${req.schoolId}/${tName}_${today}_${Date.now()}.jpg`;
    const photoUrl = await uploadPhoto(imageBase64, fileName);

    // Insert attendance record
    const { rows: inserted } = await pool.query(
      `INSERT INTO meeting_attendance
         (school_id, meeting_id, teacher_id, date, academic_year_id, semester,
          notes, gps_coordinates, photo_url, photo_size_kb, location_name, location_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        req.schoolId, meetingId, teacherId, today, yearId, sem,
        notes?.trim() || null, gpsCoordinates, photoUrl, photoSizeKb || null,
        meeting.location_name, locationVerified,
      ]
    );

    // Clear any auto-generated absence for this meeting/teacher/date
    await pool.query(
      'DELETE FROM meeting_absences WHERE meeting_id = $1 AND teacher_id = $2 AND date = $3',
      [meetingId, teacherId, today]
    );

    await logAudit(
      req.schoolId, 'MEETING_ATTENDANCE_SUBMITTED', teacherId, tName,
      'meeting_attendance', inserted[0].id,
      { meeting_title: meeting.title, meeting_type: meeting.meeting_type, date: today, location: meeting.location_name }
    );

    res.status(201).json({
      message: 'Meeting attendance recorded',
      record: inserted[0],
      locationMessage: locationMsg,
    });
  } catch (err) { next(err); }
});

// GET /api/meetings/my-absences — teacher's own meeting absence records
router.get('/my-absences', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ab.id, ab.date, ab.reason, ab.status,
              m.title AS meeting_title, m.meeting_type,
              m.start_time::text, m.end_time::text
       FROM meeting_absences ab
       JOIN meetings m ON m.id = ab.meeting_id
       WHERE ab.school_id = $1 AND ab.teacher_id = $2
       ORDER BY ab.date DESC
       LIMIT 100`,
      [req.schoolId, req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/meetings/my-history — teacher's own meeting attendance history
router.get('/my-history', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;
    const { academic_year_id, semester, meeting_type } = req.query;

    const conds  = ['ma.school_id = $1', 'ma.teacher_id = $2'];
    const params = [req.schoolId, req.user.id];

    if (academic_year_id) {
      params.push(academic_year_id);
      conds.push(`ma.academic_year_id = $${params.length}`);
    }
    if (semester) {
      params.push(parseInt(semester, 10));
      conds.push(`ma.semester = $${params.length}`);
    }
    if (meeting_type) {
      params.push(meeting_type);
      conds.push(`m.meeting_type = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT
         ma.id, ma.date, ma.submitted_at, ma.notes, ma.location_name,
         ma.location_verified, ma.photo_url, ma.academic_year_id, ma.semester,
         m.title AS meeting_title,
         m.meeting_type,
         m.start_time::text,
         m.end_time::text
       FROM meeting_attendance ma
       JOIN meetings m ON m.id = ma.meeting_id
       WHERE ${conds.join(' AND ')}
       ORDER BY ma.date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
