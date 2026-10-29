const router = require('express').Router();
const pool   = require('../config/db');
const crypto = require('crypto');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { verifyLocation } = require('../services/geo.service');
const { uploadPhoto, uploadDocument } = require('../services/storage.service');
const { logAudit }       = require('../services/audit.service');
const { getScopeContext, eventCoversTeacher } = require('../services/eventScope.service');
const {
  notifyPendingAttendanceSubmitted, notifyPendingAttendanceApproved, notifyPendingAttendanceRejected,
} = require('../services/notification.service');

router.use(authenticate, requireActiveSubscription);

const AUDIENCE_TYPES = ['school', 'department', 'teachers'];

// Validates the audience fields of a meeting create/update request. Returns
// { error } on failure, otherwise { audienceType, audienceDepartmentId, teacherIds }.
async function resolveAudience(schoolId, body) {
  const audienceType = body.audienceType || 'school';
  if (!AUDIENCE_TYPES.includes(audienceType)) {
    return { error: `audienceType must be one of: ${AUDIENCE_TYPES.join(', ')}` };
  }
  if (audienceType === 'department') {
    if (!body.audienceDepartmentId) return { error: 'audienceDepartmentId is required for a department-scoped meeting' };
    const { rowCount } = await pool.query(
      `SELECT 1 FROM departments WHERE id = $1 AND school_id = $2`,
      [body.audienceDepartmentId, schoolId]
    );
    if (!rowCount) return { error: 'Department not found' };
    return { audienceType, audienceDepartmentId: body.audienceDepartmentId, teacherIds: [] };
  }
  if (audienceType === 'teachers') {
    const teacherIds = Array.isArray(body.teacherIds) ? body.teacherIds.filter(Boolean) : [];
    if (!teacherIds.length) return { error: 'teacherIds must be a non-empty array for a selected-teachers meeting' };
    const { rows } = await pool.query(
      `SELECT id FROM teachers WHERE id = ANY($1::uuid[]) AND school_id = $2 AND status = 'Active'`,
      [teacherIds, schoolId]
    );
    if (rows.length !== teacherIds.length) return { error: 'One or more selected teachers were not found' };
    return { audienceType, audienceDepartmentId: null, teacherIds };
  }
  return { audienceType: 'school', audienceDepartmentId: null, teacherIds: [] };
}

// True if `teacherId` is expected to attend `meeting` (a row with audience_type /
// audience_department_id columns). `inviteeSets` is a Map<meetingId, Set<teacherId>>,
// only needed for audience_type='teachers' meetings.
function meetingCoversTeacher(meeting, teacherId, scopeCtx, inviteeSets) {
  if (meeting.audience_type === 'teachers') {
    return !!inviteeSets?.get(meeting.id)?.has(teacherId);
  }
  return eventCoversTeacher(
    { scope_type: meeting.audience_type, scope_department_id: meeting.audience_department_id },
    teacherId, scopeCtx
  );
}

async function replaceInvitees(client, meetingId, teacherIds) {
  await client.query(`DELETE FROM meeting_invitees WHERE meeting_id = $1`, [meetingId]);
  if (!teacherIds.length) return;
  await client.query(
    `INSERT INTO meeting_invitees (meeting_id, teacher_id) SELECT $1, t.id FROM UNNEST($2::uuid[]) AS t(id)`,
    [meetingId, teacherIds]
  );
}

// â”€â”€ QR helpers (same secret mechanism as classroom-qr / plc) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Repeat-schedule helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Generate an array of ISO date strings (YYYY-MM-DD) for a repeat schedule.
 * 'daily'  â†’ every Monâ€“Fri between startDate and endDate (inclusive)
 * 'weekly' â†’ the same day-of-week as startDate, once per week until endDate
 * Returns at most MAX_INSTANCES entries.
 */
const MAX_INSTANCES = 200;

function generateRepeatDates(startDate, endDate, repeat) {
  const dates  = [];
  const cursor = new Date(startDate + 'T00:00:00Z');
  const end    = new Date(endDate   + 'T00:00:00Z');

  if (repeat === 'daily') {
    // Monâ€“Fri only
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

// â”€â”€ Admin: meetings CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/meetings â€” list meetings with optional ?type=&from=&to= filters
router.get('/', adminOnly, async (req, res, next) => {
  try {
    const { type, from, to } = req.query;
    const conds  = ['m.school_id = $1'];
    const params = [req.schoolId];

    if (type) { params.push(type); conds.push(`m.meeting_type = $${params.length}`); }
    if (from) { params.push(from); conds.push(`m.date >= $${params.length}`); }
    if (to)   { params.push(to);   conds.push(`m.date <= $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT m.id, m.title, m.meeting_type, m.date::text AS date,
              m.start_time, m.end_time, m.location_id, m.is_active,
              m.minutes_url, m.minutes_filename, m.minutes_uploaded_at,
              m.audience_type, m.audience_department_id, m.other_attendees,
              d.name AS audience_department_name,
              (SELECT COUNT(*)::int FROM meeting_invitees mi WHERE mi.meeting_id = m.id) AS invitee_count,
              m.created_at, m.updated_at,
              l.name AS location_name, l.has_coordinates
       FROM meetings m
       LEFT JOIN locations l ON l.id = m.location_id
       LEFT JOIN departments d ON d.id = m.audience_department_id
       WHERE ${conds.join(' AND ')}
       ORDER BY m.date DESC, m.start_time`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/meetings/:id/invitees â€” teacher IDs on a 'teachers'-audience meeting
router.get('/:id/invitees', adminOnly, async (req, res, next) => {
  try {
    const { rowCount: exists } = await pool.query(
      `SELECT 1 FROM meetings WHERE id = $1 AND school_id = $2`, [req.params.id, req.schoolId]
    );
    if (!exists) return res.status(404).json({ error: 'Meeting not found' });
    const { rows } = await pool.query(
      `SELECT teacher_id FROM meeting_invitees WHERE meeting_id = $1`, [req.params.id]
    );
    res.json(rows.map(r => r.teacher_id));
  } catch (err) { next(err); }
});

// POST /api/meetings â€” create one or many (with repeat support)
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const {
      title, meeting_type, date, start_time, end_time, location_id,
      repeat = 'none', repeat_end_date, other_attendees,
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

    const audience = await resolveAudience(req.schoolId, req.body);
    if (audience.error) return res.status(400).json({ error: audience.error });

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
             (school_id, title, meeting_type, date, start_time, end_time, location_id,
              audience_type, audience_department_id, other_attendees)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [req.schoolId, title, meeting_type, d, start_time, end_time, location_id,
           audience.audienceType, audience.audienceDepartmentId, other_attendees?.trim() || null]
        );
        inserted.push(rows[0]);
        if (audience.audienceType === 'teachers') {
          await replaceInvitees(client, rows[0].id, audience.teacherIds);
        }
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

// POST /api/meetings/:id/minutes â€” admin uploads meeting minutes
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

// DELETE /api/meetings/:id/minutes â€” admin removes meeting minutes
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

// PUT /api/meetings/:id â€” update meeting
router.put('/:id', adminOnly, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { title, meeting_type, date, start_time, end_time, location_id, is_active, other_attendees } = req.body;

    if (meeting_type) {
      const VALID_TYPES = ['PLC', 'Morning Briefing', 'Staff Meeting', 'PTA', 'Other'];
      if (!VALID_TYPES.includes(meeting_type)) {
        return res.status(400).json({ error: `meeting_type must be one of: ${VALID_TYPES.join(', ')}` });
      }
    }

    const { rowCount: exists } = await client.query(
      `SELECT 1 FROM meetings WHERE id = $1 AND school_id = $2`, [req.params.id, req.schoolId]
    );
    if (!exists) return res.status(404).json({ error: 'Meeting not found' });

    // Audience is a cohesive tri-state — if the request touches it at all,
    // re-resolve and overwrite all three columns rather than COALESCE-merging,
    // so switching e.g. 'department' -> 'school' actually clears the department.
    const touchingAudience = 'audienceType' in req.body;
    let audience = null;
    if (touchingAudience) {
      audience = await resolveAudience(req.schoolId, req.body);
      if (audience.error) return res.status(400).json({ error: audience.error });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE meetings SET
         title                   = COALESCE($1, title),
         meeting_type            = COALESCE($2, meeting_type),
         date                    = COALESCE($3, date),
         start_time              = COALESCE($4, start_time),
         end_time                = COALESCE($5, end_time),
         location_id             = COALESCE($6, location_id),
         is_active               = COALESCE($7, is_active),
         other_attendees         = CASE WHEN $10 THEN $11 ELSE other_attendees END,
         audience_type           = CASE WHEN $8 THEN $12 ELSE audience_type END,
         audience_department_id  = CASE WHEN $8 THEN $13 ELSE audience_department_id END,
         updated_at              = now()
       WHERE id = $9 AND school_id = $14
       RETURNING *`,
      [
        title ?? null, meeting_type ?? null, date ?? null,
        start_time ?? null, end_time ?? null, location_id ?? null,
        is_active ?? null,
        touchingAudience, req.params.id,
        'other_attendees' in req.body, other_attendees?.trim() || null,
        audience?.audienceType ?? null, audience?.audienceDepartmentId ?? null,
        req.schoolId,
      ]
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Meeting not found' }); }

    if (touchingAudience) {
      await replaceInvitees(client, req.params.id, audience.audienceType === 'teachers' ? audience.teacherIds : []);
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
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

// GET /api/meetings/:id/token â€” returns QR token for client-side rendering
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

// GET /api/meetings/summary â€” per-teacher meeting attendance summary
router.get('/summary', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    const useAll = semester === 'all' || semester === '0';
    let yearId = academic_year_id?.trim() || null;
    let sem    = useAll ? null : (semester ? parseInt(semester, 10) : null);

    if (!yearId || (!useAll && sem === null)) {
      const { rows: ayRows } = await pool.query(
        `SELECT id, current_semester FROM academic_years
         WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
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
          AND verification_status = 'verified'
          AND ($2::uuid IS NULL OR academic_year_id = $2::uuid OR academic_year_id IS NULL)
          AND ($3::int  IS NULL OR semester = $3::int         OR semester          IS NULL)
        GROUP BY teacher_id
      ),
      abs AS (
        SELECT ab.teacher_id, COUNT(*) AS absent_count
        FROM meeting_absences ab
        WHERE ab.school_id = $1
          AND ($2::uuid IS NULL OR ab.academic_year_id = $2::uuid)
        GROUP BY ab.teacher_id
      )
      SELECT
        t.id,
        t.name,
        COALESCE(t.department, 'â€”') AS department,
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

// GET /api/meetings/report â€” admin: flat attendance/absence/excused rows for
// a date range, one row per active teacher per meeting occurrence. Absence
// is computed live (same eligibility rules as POST /:id/generate-absences)
// rather than read from meeting_absences, so the report is accurate even for
// meetings nobody ever ran that manual step on. Powers the Excel/PDF export
// with a gender breakdown on the admin-portal Meetings "Report" tab.
router.get('/report', adminOnly, async (req, res, next) => {
  try {
    const { from, to, type } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

    const { rows } = await pool.query(
      `WITH mtgs AS (
         SELECT id, date, meeting_type, title, audience_type, audience_department_id
         FROM meetings
         WHERE school_id = $1 AND date BETWEEN $2 AND $3
           AND ($4::text IS NULL OR meeting_type = $4)
       ),
       active_teachers AS (
         SELECT id, name, gender FROM teachers WHERE school_id = $1 AND status = 'Active'
       ),
       expected AS (
         SELECT m.id AS meeting_id, m.date, m.meeting_type, m.title AS meeting_title,
                t.id AS teacher_id, t.name AS teacher_name, t.gender
         FROM mtgs m JOIN active_teachers t ON true
         WHERE m.audience_type = 'school'
         UNION ALL
         SELECT m.id, m.date, m.meeting_type, m.title, t.id, t.name, t.gender
         FROM mtgs m
         JOIN department_teachers dt ON dt.department_id = m.audience_department_id
         JOIN active_teachers t ON t.id = dt.teacher_id
         WHERE m.audience_type = 'department'
         UNION ALL
         SELECT m.id, m.date, m.meeting_type, m.title, t.id, t.name, t.gender
         FROM mtgs m
         JOIN meeting_invitees mi ON mi.meeting_id = m.id
         JOIN active_teachers t ON t.id = mi.teacher_id
         WHERE m.audience_type = 'teachers'
       ),
       excused AS (
         SELECT teacher_id, date_from, date_to FROM teacher_excuses
         WHERE school_id = $1 AND status = 'Approved'
       )
       SELECT e.date::text, e.meeting_title, e.meeting_type, e.teacher_name,
              COALESCE(e.gender, 'Not Specified') AS gender,
              CASE
                WHEN a.teacher_id IS NOT NULL AND a.verification_status = 'verified' THEN 'Present'
                WHEN a.teacher_id IS NOT NULL AND a.verification_status = 'pending'  THEN 'Pending Review'
                WHEN ex.teacher_id IS NOT NULL THEN 'Excused'
                ELSE 'Absent'
              END AS status
       FROM expected e
       LEFT JOIN meeting_attendance a
         ON a.meeting_id = e.meeting_id AND a.teacher_id = e.teacher_id AND a.date = e.date
       LEFT JOIN excused ex ON ex.teacher_id = e.teacher_id AND e.date BETWEEN ex.date_from AND ex.date_to
       ORDER BY e.date, e.meeting_title, e.teacher_name`,
      [req.schoolId, from, to, type || null]
    );

    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/meetings/attendance â€” admin list attendance records
router.get('/attendance', adminOnly, async (req, res, next) => {
  try {
    const { from, to, type, verification_status } = req.query;
    const conds  = ['ma.school_id = $1'];
    const params = [req.schoolId];
    if (from) { params.push(from); conds.push(`ma.date >= $${params.length}`); }
    if (to)   { params.push(to);   conds.push(`ma.date <= $${params.length}`); }
    if (type) { params.push(type); conds.push(`m.meeting_type = $${params.length}`); }
    if (verification_status) { params.push(verification_status); conds.push(`ma.verification_status = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT ma.id, ma.date, ma.submitted_at, ma.notes, ma.location_name,
              ma.location_verified, ma.gps_coordinates, ma.photo_url,
              ma.verification_status, ma.pending_reason, ma.reviewed_by_name, ma.reviewed_at, ma.review_note,
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

// GET /api/meetings/absences â€” admin list absence records
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

// POST /api/meetings/attendance/manual â€” admin manually records attendance for a teacher
router.post('/attendance/manual', adminOnly, async (req, res, next) => {
  try {
    const { meetingId, teacherId, date, notes } = req.body;
    if (!meetingId || !teacherId || !date) {
      return res.status(400).json({ error: 'meetingId, teacherId, and date are required' });
    }

    const { rows: mtgRows } = await pool.query(
      `SELECT m.id, m.title, m.meeting_type, l.name AS location_name
       FROM meetings m
       LEFT JOIN locations l ON l.id = m.location_id
       WHERE m.id = $1 AND m.school_id = $2`,
      [meetingId, req.schoolId]
    );
    if (!mtgRows.length) return res.status(404).json({ error: 'Meeting not found' });
    const meeting = mtgRows[0];

    const { rows: tRows } = await pool.query(
      'SELECT id, name FROM teachers WHERE id = $1 AND school_id = $2 AND status = $3',
      [teacherId, req.schoolId, 'Active']
    );
    if (!tRows.length) return res.status(404).json({ error: 'Teacher not found' });

    const { rows: ayRows } = await pool.query(
      'SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1',
      [req.schoolId]
    );
    const yearId = ayRows[0]?.id ?? null;
    const sem    = ayRows[0]?.current_semester ?? null;

    // Check for duplicate entry first â€” return a clear error instead of relying
    // on ON CONFLICT (which requires the UNIQUE constraint to exist on all envs)
    const { rows: existing } = await pool.query(
      'SELECT id FROM meeting_attendance WHERE meeting_id = $1 AND teacher_id = $2 AND date = $3',
      [meetingId, teacherId, date]
    );
    if (existing.length) {
      return res.status(409).json({
        error: `${tRows[0].name} already has an attendance record for this meeting on ${date}.`,
      });
    }

    const { rows: inserted } = await pool.query(
      `INSERT INTO meeting_attendance
         (school_id, meeting_id, teacher_id, date, academic_year_id, semester,
          notes, location_name, location_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false)
       RETURNING *`,
      [
        req.schoolId, meetingId, teacherId, date, yearId, sem,
        notes?.trim() || 'Manually recorded by admin',
        meeting.location_name || null,
      ]
    );

    // Clear any auto-generated absence for this teacher/meeting/date
    await pool.query(
      'DELETE FROM meeting_absences WHERE meeting_id = $1 AND teacher_id = $2 AND date = $3',
      [meetingId, teacherId, date]
    );

    await logAudit(
      req.schoolId, 'MEETING_ATTENDANCE_MANUAL', req.user.id, req.user.name,
      'meeting_attendance', inserted[0].id,
      { teacher: tRows[0].name, meeting: meeting.title, date, notes: notes?.trim() || null }
    );

    res.status(201).json(inserted[0]);
  } catch (err) { next(err); }
});

// GET /api/meetings/:id/attendees â€” teacher IDs already recorded for a meeting+date
router.get('/:id/attendees', adminOnly, async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param is required' });
    const { rows } = await pool.query(
      `SELECT teacher_id FROM meeting_attendance
       WHERE meeting_id = $1 AND school_id = $2 AND date = $3`,
      [req.params.id, req.schoolId, date]
    );
    res.json(rows.map(r => r.teacher_id));
  } catch (err) { next(err); }
});

// POST /api/meetings/attendance/manual-bulk â€” record attendance for multiple teachers at once
router.post('/attendance/manual-bulk', adminOnly, async (req, res, next) => {
  try {
    const { meetingId, date, teacherIds, notes } = req.body;
    if (!meetingId || !date || !Array.isArray(teacherIds) || teacherIds.length === 0) {
      return res.status(400).json({ error: 'meetingId, date, and teacherIds[] are required' });
    }

    const { rows: mtgRows } = await pool.query(
      `SELECT m.id, m.title, l.name AS location_name
       FROM meetings m LEFT JOIN locations l ON l.id = m.location_id
       WHERE m.id = $1 AND m.school_id = $2`,
      [meetingId, req.schoolId]
    );
    if (!mtgRows.length) return res.status(404).json({ error: 'Meeting not found' });
    const meeting = mtgRows[0];

    const { rows: ayRows } = await pool.query(
      'SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1',
      [req.schoolId]
    );
    const yearId = ayRows[0]?.id ?? null;
    const sem    = ayRows[0]?.current_semester ?? null;
    const resolvedNotes = notes?.trim() || 'Manually recorded by admin (bulk)';

    let inserted = 0, skipped = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Active teachers among the requested IDs that belong to this school
      const { rows: activeTeachers } = await client.query(
        `SELECT id FROM teachers WHERE id = ANY($1::uuid[]) AND school_id = $2 AND status = 'Active'`,
        [teacherIds, req.schoolId]
      );
      const activeIds = activeTeachers.map(t => t.id);

      // Of those, exclude any already recorded for this meeting+date
      const { rows: existingRows } = activeIds.length
        ? await client.query(
            `SELECT teacher_id FROM meeting_attendance
             WHERE meeting_id = $1 AND date = $2 AND teacher_id = ANY($3::uuid[])`,
            [meetingId, date, activeIds]
          )
        : { rows: [] };
      const existingIds = new Set(existingRows.map(r => r.teacher_id));
      const toInsert = activeIds.filter(id => !existingIds.has(id));

      if (toInsert.length) {
        await client.query(
          `INSERT INTO meeting_attendance
             (school_id, meeting_id, teacher_id, date, academic_year_id, semester,
              notes, location_name, location_verified)
           SELECT $1, $2, t.id, $3, $4, $5, $6, $7, false
           FROM UNNEST($8::uuid[]) AS t(id)`,
          [req.schoolId, meetingId, date, yearId, sem,
           resolvedNotes, meeting.location_name || null, toInsert]
        );

        await client.query(
          `DELETE FROM meeting_absences
           WHERE meeting_id = $1 AND date = $2 AND teacher_id = ANY($3::uuid[])`,
          [meetingId, date, toInsert]
        );
      }

      inserted = toInsert.length;
      skipped  = teacherIds.length - inserted;

      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    await logAudit(
      req.schoolId, 'MEETING_ATTENDANCE_BULK', req.user.id, req.user.name,
      'meeting_attendance', meetingId,
      { meeting: meeting.title, date, inserted, skipped }
    );

    res.status(201).json({ inserted, skipped });
  } catch (err) { next(err); }
});

// POST /api/meetings/:id/generate-absences â€” mark absent all teachers with no attendance for this meeting+date
router.post('/:id/generate-absences', adminOnly, async (req, res, next) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const { rows: mtgRows } = await pool.query(
      'SELECT id, title, audience_type, audience_department_id FROM meetings WHERE id = $1 AND school_id = $2',
      [req.params.id, req.schoolId]
    );
    if (!mtgRows.length) return res.status(404).json({ error: 'Meeting not found' });
    const meeting = mtgRows[0];

    const { rows: allTeachers } = await pool.query(
      "SELECT id FROM teachers WHERE school_id = $1 AND status = 'Active'",
      [req.schoolId]
    );
    const scopeCtx = meeting.audience_type === 'department' ? await getScopeContext(req.schoolId) : null;
    let inviteeSets = null;
    if (meeting.audience_type === 'teachers') {
      const { rows: inv } = await pool.query(
        `SELECT teacher_id FROM meeting_invitees WHERE meeting_id = $1`, [req.params.id]
      );
      inviteeSets = new Map([[meeting.id, new Set(inv.map(r => r.teacher_id))]]);
    }
    const teachers = allTeachers.filter(t => meetingCoversTeacher(meeting, t.id, scopeCtx, inviteeSets));

    const { rows: attended } = await pool.query(
      'SELECT teacher_id FROM meeting_attendance WHERE meeting_id = $1 AND date = $2',
      [req.params.id, date]
    );
    const attendedIds = new Set(attended.map(r => r.teacher_id));

    const { rows: excused } = await pool.query(
      `SELECT DISTINCT teacher_id FROM teacher_excuses
       WHERE school_id = $1 AND status = 'Approved'
         AND date_from <= $2 AND date_to >= $2`,
      [req.schoolId, date]
    );
    const excusedIds = new Set(excused.map(r => r.teacher_id));

    const { rows: ayRows } = await pool.query(
      `SELECT id FROM academic_years WHERE school_id = $1
       ORDER BY CASE WHEN start_date IS NOT NULL AND end_date IS NOT NULL THEN 0 ELSE 1 END,
                is_current DESC, name DESC LIMIT 1`,
      [req.schoolId]
    );
    const academicYearId = ayRows[0]?.id ?? null;

    const now = new Date().toTimeString().slice(0, 5);
    let inserted = 0, skipped = 0;

    for (const teacher of teachers) {
      if (attendedIds.has(teacher.id) || excusedIds.has(teacher.id)) { skipped++; continue; }
      const { rowCount } = await pool.query(
        `INSERT INTO meeting_absences
           (school_id, meeting_id, teacher_id, date, status, detected_at, reason, academic_year_id)
         VALUES ($1,$2,$3,$4,'Absent',$5::time,'Manually generated by admin',$6)
         ON CONFLICT (meeting_id, teacher_id, date) DO NOTHING`,
        [req.schoolId, req.params.id, teacher.id, date, now, academicYearId]
      );
      if (rowCount > 0) inserted++; else skipped++;
    }

    await logAudit(
      req.schoolId, 'MEETING_ABSENCES_GENERATED', req.user.id, req.user.name,
      'meeting_absences', req.params.id,
      { meeting: meeting.title, date, inserted, skipped }
    );

    res.json({ inserted, skipped });
  } catch (err) { next(err); }
});

// DELETE /api/meetings/attendance/:id â€” admin delete attendance record
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

// PATCH /api/meetings/attendance/:id/approve-pending â€” admin approves a GPS-pending meeting submission
router.patch('/attendance/:id/approve-pending', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE meeting_attendance SET verification_status = 'verified', reviewed_by_name = $1, reviewed_at = now()
       WHERE id = $2 AND school_id = $3 AND verification_status = 'pending' RETURNING *`,
      [req.user.name, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No pending record found' });
    const record = rows[0];

    const { rows: ctx } = await pool.query(
      `SELECT te.name AS teacher_name, te.email AS teacher_email, m.title AS meeting_title, m.meeting_type
       FROM meeting_attendance ma
       JOIN teachers te ON te.id = ma.teacher_id
       JOIN meetings m ON m.id = ma.meeting_id
       WHERE ma.id = $1`,
      [record.id]
    );
    const teacher = { id: record.teacher_id, name: ctx[0]?.teacher_name || record.teacher_id, email: ctx[0]?.teacher_email };

    await logAudit(req.schoolId, 'MEETING_ATTENDANCE_PENDING_APPROVED', req.user.id, req.user.name, 'meeting_attendance', record.id, {
      teacher_name: teacher.name, date: record.date,
    });
    await notifyPendingAttendanceApproved(req.schoolId, teacher, `${ctx[0]?.meeting_type} meeting`, `${ctx[0]?.meeting_title} on ${record.date}`);

    res.json({ message: 'Submission approved â€” teacher now counted present', record });
  } catch (err) { next(err); }
});

// PATCH /api/meetings/attendance/:id/reject-pending â€” admin rejects a GPS-pending meeting
// submission: keeps the record for audit and restores the meeting absence
router.patch('/attendance/:id/reject-pending', adminOnly, async (req, res, next) => {
  try {
    const reason = req.body.reason?.trim();
    if (!reason) return res.status(400).json({ error: 'A reason is required to reject this submission' });

    const { rows } = await pool.query(
      `UPDATE meeting_attendance SET verification_status = 'rejected', reviewed_by_name = $1, reviewed_at = now(), review_note = $2
       WHERE id = $3 AND school_id = $4 AND verification_status = 'pending' RETURNING *`,
      [req.user.name, reason, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No pending record found' });
    const record = rows[0];

    const { rows: ctx } = await pool.query(
      `SELECT te.name AS teacher_name, te.email AS teacher_email, m.title AS meeting_title, m.meeting_type
       FROM meeting_attendance ma
       JOIN teachers te ON te.id = ma.teacher_id
       JOIN meetings m ON m.id = ma.meeting_id
       WHERE ma.id = $1`,
      [record.id]
    );

    await pool.query(
      `INSERT INTO meeting_absences (school_id, meeting_id, teacher_id, date, status, reason, detected_at, academic_year_id)
       VALUES ($1,$2,$3,$4,'Absent',$5,now()::time,$6)
       ON CONFLICT (meeting_id, teacher_id, date) DO UPDATE SET status = 'Absent', reason = EXCLUDED.reason`,
      [req.schoolId, record.meeting_id, record.teacher_id, record.date, `Pending submission rejected: ${reason}`, record.academic_year_id]
    );

    const teacher = { id: record.teacher_id, name: ctx[0]?.teacher_name || record.teacher_id, email: ctx[0]?.teacher_email };

    await logAudit(req.schoolId, 'MEETING_ATTENDANCE_PENDING_REJECTED', req.user.id, req.user.name, 'meeting_attendance', record.id, {
      teacher_name: teacher.name, date: record.date, reason,
    });
    await notifyPendingAttendanceRejected(req.schoolId, teacher, `${ctx[0]?.meeting_type} meeting`, `${ctx[0]?.meeting_title} on ${record.date}`, reason);

    res.json({ message: 'Submission rejected â€” teacher marked absent' });
  } catch (err) { next(err); }
});

// â”€â”€ Teacher: meeting attendance summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/meetings/my-summary â€” per-type attendance summary for current semester
router.get('/my-summary', async (req, res, next) => {
  try {
    // Resolve current academic year + semester
    const { rows: yearRows } = await pool.query(
      `SELECT id FROM academic_years
       WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
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
           AND ma.verification_status = 'verified'
           AND ($3::uuid IS NULL OR ma.academic_year_id = $3::uuid)
           AND ($4::int  IS NULL OR ma.semester         = $4::int)
         GROUP BY m.meeting_type
       ),
       abs AS (
         SELECT m.meeting_type, COUNT(*)::int AS absent
         FROM meeting_absences ab
         JOIN meetings m ON m.id = ab.meeting_id
         WHERE ab.school_id = $1
           AND ab.teacher_id = $2
           AND ($3::uuid IS NULL OR ab.academic_year_id = $3::uuid)
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

// â”€â”€ Teacher: today's meetings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/meetings/today â€” array of today's active meetings with submission status
router.get('/today', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { rows } = await pool.query(
      `SELECT
         m.id, m.title, m.meeting_type, m.date::text AS date,
         m.start_time, m.end_time, m.location_id, m.is_active,
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
         AND (
           m.audience_type = 'school'
           OR (m.audience_type = 'department' AND EXISTS (
                 SELECT 1 FROM department_teachers dt
                 WHERE dt.teacher_id = $2 AND dt.department_id = m.audience_department_id
               ))
           OR (m.audience_type = 'teachers' AND EXISTS (
                 SELECT 1 FROM meeting_invitees mi WHERE mi.meeting_id = m.id AND mi.teacher_id = $2
               ))
         )
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

// POST /api/meetings/verify-qr â€” teacher scans the venue QR for a meeting
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

// POST /api/meetings/submit â€” teacher submits meeting attendance
router.post('/submit', async (req, res, next) => {
  try {
    const { meetingId, notes, gpsCoordinates, imageBase64, photoSizeKb, submitPending, pendingReason } = req.body;
    const teacherId = req.user.id;
    const wantsPending = submitPending === true && String(pendingReason || '').trim().length > 0;

    if (!meetingId || (!gpsCoordinates && !wantsPending) || !imageBase64) {
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
    let verificationStatus = 'verified';
    if (meeting.has_coordinates) {
      const coords = gpsCoordinates ? gpsCoordinates.split(',').map(Number) : [NaN, NaN];
      const [lat, lng] = coords;
      if (isNaN(lat) || isNaN(lng)) {
        if (wantsPending) {
          verificationStatus = 'pending';
          locationMsg = 'Invalid GPS coordinates';
        } else {
          return res.status(400).json({ error: 'Invalid GPS coordinates.', locationFailure: true });
        }
      } else {
        const result = verifyLocation(meeting, lat, lng);
        if (!result.valid) {
          if (wantsPending) {
            verificationStatus = 'pending';
            locationMsg = result.message;
          } else {
            return res.status(400).json({
              error: `You do not appear to be at the meeting venue. ${result.message}`,
              locationFailure: true,
            });
          }
        } else {
          locationVerified = result.verified;
          locationMsg      = result.message;
        }
      }
    }

    // Academic year / semester
    const { rows: ayRows } = await pool.query(
      'SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1',
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
          notes, gps_coordinates, photo_url, photo_size_kb, location_name, location_verified,
          verification_status, pending_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        req.schoolId, meetingId, teacherId, today, yearId, sem,
        notes?.trim() || null, gpsCoordinates || null, photoUrl, photoSizeKb || null,
        meeting.location_name, locationVerified,
        verificationStatus, verificationStatus === 'pending' ? pendingReason.trim() : null,
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

    if (verificationStatus === 'pending') {
      const { rows: tRows2 } = await pool.query('SELECT email FROM teachers WHERE id = $1', [teacherId]);
      notifyPendingAttendanceSubmitted(
        req.schoolId, { id: teacherId, name: tName, email: tRows2[0]?.email }, `${meeting.meeting_type} meeting`,
        `${meeting.title} on ${today}`, pendingReason.trim()
      ).catch(() => {});
    }

    res.status(201).json({
      message: verificationStatus === 'pending'
        ? 'Meeting attendance submitted â€” pending admin review because location could not be verified'
        : 'Meeting attendance recorded',
      record: inserted[0],
      locationMessage: locationMsg,
    });
  } catch (err) { next(err); }
});

// GET /api/meetings/my-absences â€” teacher's own meeting absence records
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

// GET /api/meetings/my-history â€” teacher's own meeting attendance history
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
         ma.verification_status, ma.pending_reason, ma.reviewed_at, ma.review_note,
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

