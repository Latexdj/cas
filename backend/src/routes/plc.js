const router = require('express').Router();
const pool   = require('../config/db');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { verifyLocation } = require('../services/geo.service');
const { uploadPhoto }    = require('../services/storage.service');
const { logAudit }       = require('../services/audit.service');

router.use(authenticate, requireActiveSubscription);

// ── QR helpers (reuses the same school secret as classroom-qr) ─
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

// ── Admin: sessions CRUD ───────────────────────────────────────

// GET /api/plc/sessions
router.get('/sessions', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, l.name AS location_name, l.has_coordinates
       FROM plc_sessions s
       LEFT JOIN locations l ON l.id = s.location_id
       WHERE s.school_id = $1
       ORDER BY s.day_of_week, s.start_time`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/plc/sessions
router.post('/sessions', adminOnly, async (req, res, next) => {
  try {
    const { title, day_of_week, start_time, end_time, location_id } = req.body;
    if (!title || !day_of_week || !start_time || !end_time || !location_id) {
      return res.status(400).json({ error: 'title, day_of_week, start_time, end_time, location_id are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO plc_sessions (school_id, title, day_of_week, start_time, end_time, location_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.schoolId, title, day_of_week, start_time, end_time, location_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/plc/sessions/:id
router.put('/sessions/:id', adminOnly, async (req, res, next) => {
  try {
    const { title, day_of_week, start_time, end_time, location_id, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE plc_sessions SET
         title       = COALESCE($1, title),
         day_of_week = COALESCE($2, day_of_week),
         start_time  = COALESCE($3, start_time),
         end_time    = COALESCE($4, end_time),
         location_id = COALESCE($5, location_id),
         is_active   = COALESCE($6, is_active)
       WHERE id = $7 AND school_id = $8 RETURNING *`,
      [title, day_of_week ?? null, start_time, end_time, location_id, is_active ?? null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/plc/sessions/:id
router.delete('/sessions/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM plc_sessions WHERE id = $1 AND school_id = $2',
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Session not found' });
    res.json({ message: 'Session deleted' });
  } catch (err) { next(err); }
});

// GET /api/plc/sessions/:id/token — return raw QR token (client renders the image)
router.get('/sessions/:id/token', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, l.name AS location_name
       FROM plc_sessions s
       JOIN locations l ON l.id = s.location_id
       WHERE s.id = $1 AND s.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    const token = await buildToken(req.schoolId, rows[0].location_name);
    res.json({ token, location_name: rows[0].location_name, title: rows[0].title });
  } catch (err) { next(err); }
});

// ── Teacher: today's session ───────────────────────────────────

// GET /api/plc/today
router.get('/today', async (req, res, next) => {
  try {
    const day = new Date().getDay();
    const dow = day === 0 ? 7 : day;
    const today = new Date().toISOString().slice(0, 10);

    const { rows: sessions } = await pool.query(
      `SELECT s.*, l.name AS location_name, l.has_coordinates,
              l.latitude, l.longitude, l.radius_meters
       FROM plc_sessions s
       JOIN locations l ON l.id = s.location_id
       WHERE s.school_id = $1 AND s.day_of_week = $2 AND s.is_active = true
       ORDER BY s.start_time LIMIT 1`,
      [req.schoolId, dow]
    );

    if (!sessions.length) return res.json(null);
    const session = sessions[0];

    const { rows: subRows } = await pool.query(
      `SELECT id, submitted_at FROM plc_attendance
       WHERE session_id = $1 AND teacher_id = $2 AND date = $3`,
      [session.id, req.user.id, today]
    );

    res.json({ session, submitted: subRows[0] ?? null });
  } catch (err) { next(err); }
});

// POST /api/plc/verify-qr — teacher scans PLC venue QR
router.post('/verify-qr', async (req, res, next) => {
  try {
    const { token, sessionId } = req.body;
    if (!token || !sessionId) {
      return res.status(400).json({ error: 'token and sessionId are required' });
    }

    const parsed = parseToken(token.trim());
    if (!parsed) return res.status(400).json({ error: 'Invalid QR code format' });
    if (parsed.schoolId !== req.schoolId) {
      return res.status(403).json({ error: 'QR code belongs to a different school' });
    }

    const { rows } = await pool.query(
      `SELECT s.id, l.name AS location_name
       FROM plc_sessions s
       JOIN locations l ON l.id = s.location_id
       WHERE s.id = $1 AND s.school_id = $2`,
      [sessionId, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });

    const expectedToken  = await buildToken(req.schoolId, rows[0].location_name);
    const expectedParsed = parseToken(expectedToken);

    const aBuf = Buffer.from(parsed.hmac.padEnd(expectedParsed.hmac.length, '0'), 'hex');
    const bBuf = Buffer.from(expectedParsed.hmac, 'hex');
    const valid = aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);

    if (!valid) {
      return res.status(400).json({
        error: 'QR code does not match the PLC venue. Scan the QR code posted at the PLC room.',
      });
    }

    res.json({ valid: true, locationName: rows[0].location_name });
  } catch (err) { next(err); }
});

// POST /api/plc/submit
router.post('/submit', async (req, res, next) => {
  try {
    const { sessionId, agenda, gpsCoordinates, imageBase64, photoSizeKb } = req.body;
    const teacherId = req.user.id;

    if (!sessionId || !imageBase64 || !gpsCoordinates) {
      return res.status(400).json({ error: 'sessionId, gpsCoordinates, and imageBase64 are required' });
    }

    const { rows: sesRows } = await pool.query(
      `SELECT s.*, l.name AS location_name, l.has_coordinates,
              l.latitude, l.longitude, l.radius_meters
       FROM plc_sessions s
       JOIN locations l ON l.id = s.location_id
       WHERE s.id = $1 AND s.school_id = $2 AND s.is_active = true`,
      [sessionId, req.schoolId]
    );
    if (!sesRows.length) return res.status(404).json({ error: 'PLC session not found' });
    const session = sesRows[0];

    const today = new Date().toISOString().slice(0, 10);

    const { rows: existing } = await pool.query(
      'SELECT id FROM plc_attendance WHERE session_id = $1 AND teacher_id = $2 AND date = $3',
      [sessionId, teacherId, today]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'You have already submitted PLC attendance today.' });
    }

    // GPS verification
    let locationVerified = false;
    let locationMsg = 'Location not verified';
    if (session.has_coordinates) {
      const [lat, lng] = gpsCoordinates.split(',').map(Number);
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Invalid GPS coordinates.' });
      }
      const result = verifyLocation(session, lat, lng);
      if (!result.valid) {
        return res.status(400).json({
          error: `You do not appear to be at the PLC venue. ${result.message}`,
        });
      }
      locationVerified = result.verified;
      locationMsg      = result.message;
    }

    // Academic year
    const { rows: ayRows } = await pool.query(
      'SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1',
      [req.schoolId]
    );
    const yearId = ayRows[0]?.id ?? null;
    const sem    = ayRows[0]?.current_semester ?? null;

    // Upload photo
    const { rows: tRows } = await pool.query('SELECT name FROM teachers WHERE id = $1', [teacherId]);
    const tName    = tRows[0]?.name ?? teacherId;
    const fileName = `plc/${req.schoolId}/${tName}_${today}_${Date.now()}.jpg`;
    const photoUrl = await uploadPhoto(imageBase64, fileName);

    const { rows: inserted } = await pool.query(
      `INSERT INTO plc_attendance
         (school_id, session_id, teacher_id, date, academic_year_id, semester,
          agenda, gps_coordinates, photo_url, photo_size_kb, location_name, location_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        req.schoolId, sessionId, teacherId, today, yearId, sem,
        agenda?.trim() || null, gpsCoordinates, photoUrl, photoSizeKb || null,
        session.location_name, locationVerified,
      ]
    );

    // Clear any auto-generated PLC absence for today if teacher was already flagged
    await pool.query(
      'DELETE FROM plc_absences WHERE session_id = $1 AND teacher_id = $2 AND date = $3',
      [sessionId, teacherId, today]
    );

    await logAudit(req.schoolId, 'PLC_ATTENDANCE_SUBMITTED', teacherId, tName, 'plc_attendance', inserted[0].id, {
      session_title: session.title, date: today, location: session.location_name,
    });

    res.status(201).json({
      message: 'PLC attendance recorded',
      record: inserted[0],
      locationMessage: locationMsg,
    });
  } catch (err) { next(err); }
});

// GET /api/plc/my-history
router.get('/my-history', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;
    const { academic_year_id, semester } = req.query;

    const conds  = ['pa.school_id = $1', 'pa.teacher_id = $2'];
    const params = [req.schoolId, req.user.id];
    if (academic_year_id) { params.push(academic_year_id); conds.push(`pa.academic_year_id = $${params.length}`); }
    if (semester)         { params.push(parseInt(semester, 10)); conds.push(`pa.semester = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT pa.id, pa.date, pa.submitted_at, pa.agenda, pa.location_name,
              pa.location_verified, pa.photo_url,
              ps.title AS session_title, ps.start_time::text, ps.end_time::text
       FROM plc_attendance pa
       JOIN plc_sessions ps ON ps.id = pa.session_id
       WHERE ${conds.join(' AND ')}
       ORDER BY pa.date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/plc/my-absences — teacher's own PLC absence records
router.get('/my-absences', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ab.id, ab.date, ab.reason, ab.status,
              ps.title AS session_title,
              ps.start_time::text, ps.end_time::text
       FROM plc_absences ab
       JOIN plc_sessions ps ON ps.id = ab.session_id
       WHERE ab.school_id = $1 AND ab.teacher_id = $2
       ORDER BY ab.date DESC
       LIMIT 100`,
      [req.schoolId, req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Admin: attendance records ──────────────────────────────────

// GET /api/plc/attendance
router.get('/attendance', adminOnly, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const { date, teacherId, sessionId, from, to } = req.query;

    const conds  = ['pa.school_id = $1'];
    const params = [req.schoolId];
    if (date)      { params.push(date);      conds.push(`pa.date = $${params.length}`); }
    if (from)      { params.push(from);      conds.push(`pa.date >= $${params.length}`); }
    if (to)        { params.push(to);        conds.push(`pa.date <= $${params.length}`); }
    if (teacherId) { params.push(teacherId); conds.push(`pa.teacher_id = $${params.length}`); }
    if (sessionId) { params.push(sessionId); conds.push(`pa.session_id = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT pa.id, pa.date, pa.submitted_at, pa.agenda, pa.photo_url,
              pa.location_name, pa.location_verified, pa.gps_coordinates, pa.photo_size_kb,
              te.id AS teacher_id, te.name AS teacher_name,
              ps.title AS session_title
       FROM plc_attendance pa
       JOIN teachers te ON te.id = pa.teacher_id
       JOIN plc_sessions ps ON ps.id = pa.session_id
       WHERE ${conds.join(' AND ')}
       ORDER BY pa.date DESC, pa.submitted_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// DELETE /api/plc/attendance/:id
router.delete('/attendance/:id', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT pa.*, te.name AS teacher_name FROM plc_attendance pa
       JOIN teachers te ON te.id = pa.teacher_id
       WHERE pa.id = $1 AND pa.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Record not found' });
    const record = rows[0];

    await pool.query('DELETE FROM plc_attendance WHERE id = $1', [req.params.id]);

    await logAudit(req.schoolId, 'PLC_ATTENDANCE_DELETED', req.user.id, req.user.name, 'plc_attendance', req.params.id, {
      teacher_name: record.teacher_name, date: record.date,
    });

    res.json({ message: 'PLC attendance record deleted' });
  } catch (err) { next(err); }
});

// ── Admin: absence reports ─────────────────────────────────────

// GET /api/plc/absences
router.get('/absences', adminOnly, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const { date, teacherId, from, to } = req.query;

    const conds  = ['ab.school_id = $1'];
    const params = [req.schoolId];
    if (date)      { params.push(date);      conds.push(`ab.date = $${params.length}`); }
    if (from)      { params.push(from);      conds.push(`ab.date >= $${params.length}`); }
    if (to)        { params.push(to);        conds.push(`ab.date <= $${params.length}`); }
    if (teacherId) { params.push(teacherId); conds.push(`ab.teacher_id = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT ab.id, ab.date, ab.status, ab.reason, ab.detected_at,
              te.id AS teacher_id, te.name AS teacher_name,
              ps.title AS session_title, ps.start_time::text, ps.end_time::text
       FROM plc_absences ab
       JOIN teachers te ON te.id = ab.teacher_id
       JOIN plc_sessions ps ON ps.id = ab.session_id
       WHERE ${conds.join(' AND ')}
       ORDER BY ab.date DESC, te.name ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// DELETE /api/plc/absences/:id
router.delete('/absences/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM plc_absences WHERE id = $1 AND school_id = $2',
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Record not found' });
    res.json({ message: 'PLC absence cleared' });
  } catch (err) { next(err); }
});

// GET /api/plc/summary — admin: per-teacher PLC attendance summary
router.get('/summary', adminOnly, async (req, res, next) => {
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
      if (!yearId) yearId = ayRows[0]?.id || null;
      if (!useAll && sem === null) sem = ayRows[0]?.current_semester || null;
    }

    const { rows } = await pool.query(`
      WITH att AS (
        SELECT teacher_id, COUNT(*) AS present_count
        FROM plc_attendance
        WHERE school_id = $1
          AND ($2::uuid IS NULL OR academic_year_id = $2::uuid OR academic_year_id IS NULL)
          AND ($3::int  IS NULL OR semester = $3::int         OR semester          IS NULL)
        GROUP BY teacher_id
      ),
      dr AS (
        SELECT
          COALESCE(MIN(date), CURRENT_DATE - INTERVAL '365 days') AS min_date,
          COALESCE(MAX(date), CURRENT_DATE) AS max_date
        FROM plc_attendance
        WHERE school_id = $1
          AND ($2::uuid IS NULL OR academic_year_id = $2::uuid OR academic_year_id IS NULL)
          AND ($3::int  IS NULL OR semester = $3::int         OR semester          IS NULL)
      ),
      abs AS (
        SELECT ab.teacher_id, COUNT(*) AS absent_count
        FROM plc_absences ab, dr
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

module.exports = router;
