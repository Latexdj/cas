const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { runAbsenceCheck } = require('../jobs/absenceCheck');
const { getWeekNumber }   = require('../services/geo.service');
const { uploadFile }      = require('../services/storage.service');
const { sendTeacherCredentials } = require('../services/email.service');
const { getEnabledModules } = require('../services/modules.service');

// Public deployment-check endpoint (no auth needed)
router.get('/version', (_req, res) => res.json({ version: '2', has_settings: true }));

// GET /api/admin/test-email — sends a test email to ADMIN_EMAIL to verify SMTP works
router.get('/test-email', async (_req, res) => {
  const { sendTestEmail } = require('../services/email.service');
  try {
    const result = await sendTestEmail();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(authenticate, requireActiveSubscription, adminOnly);

// GET /api/admin/modules — list enabled module keys for current school
router.get('/modules', async (req, res, next) => {
  try {
    const modules = await getEnabledModules(req.schoolId);
    res.json(modules);
  } catch (err) { next(err); }
});

// GET /api/admin/school-profile — name, address, logo for report cards
router.get('/school-profile', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT name, address, logo_url FROM schools WHERE id = $1`,
      [req.schoolId]
    );
    res.json(rows[0] ?? {});
  } catch (err) { next(err); }
});

// GET /api/admin/stats — dashboard counters
router.get('/stats', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM attendance
          WHERE school_id = $2 AND date = $1)::int          AS today_attendance,
        (SELECT COUNT(*) FROM absences
          WHERE school_id = $2 AND date = $1
            AND status != 'Excused')::int                   AS today_absences,
        (SELECT COUNT(*) FROM teachers
          WHERE school_id = $2 AND status = 'Active')::int  AS total_teachers,
        (SELECT COUNT(*) FROM attendance
          WHERE school_id = $2
            AND date >= DATE_TRUNC('week', CURRENT_DATE))::int AS week_attendance,
        (SELECT COUNT(*) FROM absences
          WHERE school_id = $2
            AND status IN ('Absent','Remedial Scheduled'))::int AS outstanding_absences,
        (SELECT COUNT(*) FROM remedial_lessons
          WHERE school_id = $2
            AND status = 'Scheduled')::int                  AS pending_remedials
    `, [today, req.schoolId]);

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/classroom-status
// Real-time classroom occupancy: one entry per distinct class_names in timetable.
// occupied = scheduled right now AND attendance submitted
// vacant   = everything else
router.get('/classroom-status', async (req, res, next) => {
  try {
    const jsDay     = new Date().getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const nowTime   = new Date().toTimeString().slice(0, 5);

    const { rows } = await pool.query(`
      WITH
      all_classrooms AS (
        -- Split every timetable entry's class_names to get unique individual classrooms
        SELECT DISTINCT TRIM(cls) AS class_name
        FROM timetable,
             LATERAL unnest(string_to_array(class_names, ',')) AS cls
        WHERE school_id = $1
      ),
      active_now_entries AS (
        -- Timetable entries running right now, with their attendance status
        SELECT DISTINCT ON (tt.id)
          tt.class_names,
          tt.subject,
          tt.start_time::text,
          tt.end_time::text,
          te.name  AS teacher_name,
          te.phone AS teacher_phone,
          a.id     AS attendance_id,
          a.submitted_at
        FROM timetable tt
        JOIN teachers te ON te.id = tt.teacher_id AND te.status = 'Active'
        LEFT JOIN attendance a
          ON  a.school_id  = $1
          AND a.teacher_id = tt.teacher_id
          AND a.date       = CURRENT_DATE
          AND LOWER(a.subject) = LOWER(tt.subject)
          AND LOWER(REPLACE(a.class_names, ' ', '')) = LOWER(REPLACE(tt.class_names, ' ', ''))
        WHERE tt.school_id  = $1
          AND tt.day_of_week = $2
          AND $3::time BETWEEN tt.start_time AND tt.end_time
      ),
      active_now AS (
        -- Explode active entries so each individual classroom gets its own row
        SELECT DISTINCT ON (TRIM(cls))
          TRIM(cls)       AS class_name,
          ane.subject,
          ane.start_time,
          ane.end_time,
          ane.teacher_name,
          ane.teacher_phone,
          ane.attendance_id,
          ane.submitted_at
        FROM active_now_entries ane,
             LATERAL unnest(string_to_array(ane.class_names, ',')) AS cls
        ORDER BY TRIM(cls), ane.start_time
      )
      SELECT
        ac.class_name,
        CASE
          WHEN an.attendance_id IS NOT NULL THEN 'occupied'
          ELSE 'vacant'
        END                           AS status,
        (an.class_name IS NOT NULL)   AS in_current_period,
        an.subject,
        an.start_time,
        an.end_time,
        an.teacher_name,
        an.teacher_phone,
        an.submitted_at
      FROM all_classrooms ac
      LEFT JOIN active_now an ON an.class_name = ac.class_name
      ORDER BY
        CASE
          WHEN an.attendance_id IS NOT NULL THEN 1
          WHEN an.class_name    IS NOT NULL THEN 2
          ELSE 3
        END,
        ac.class_name
    `, [req.schoolId, dayOfWeek, nowTime]);

    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/admin/reports/absences?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/reports/absences', async (req, res, next) => {
  try {
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const to   = req.query.to   || from;

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(from) || !dateRe.test(to))
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD dates' });
    const rangeDays = (new Date(to) - new Date(from)) / 86400000;
    if (rangeDays < 0)
      return res.status(400).json({ error: 'from must not be after to' });
    if (rangeDays > 365)
      return res.status(400).json({ error: 'Date range cannot exceed 365 days' });

    const { rows } = await pool.query(`
      SELECT
        ab.date, ab.subject, ab.class_name, ab.scheduled_period,
        ab.status, ab.reason, ab.is_auto_generated,
        te.name AS teacher_name, te.email AS teacher_email
      FROM absences ab
      JOIN teachers te ON te.id = ab.teacher_id
      WHERE ab.school_id = $1 AND ab.date BETWEEN $2 AND $3
      ORDER BY ab.date, te.name
    `, [req.schoolId, from, to]);

    res.json({ from, to, total: rows.length, records: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/reports/remedial?status=&from=&to=
router.get('/reports/remedial', async (req, res, next) => {
  try {
    const { status, from, to } = req.query;

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !dateRe.test(from)) return res.status(400).json({ error: 'from must be a YYYY-MM-DD date' });
    if (to   && !dateRe.test(to))   return res.status(400).json({ error: 'to must be a YYYY-MM-DD date' });
    if (from && to) {
      const rangeDays = (new Date(to) - new Date(from)) / 86400000;
      if (rangeDays < 0)   return res.status(400).json({ error: 'from must not be after to' });
      if (rangeDays > 365) return res.status(400).json({ error: 'Date range cannot exceed 365 days' });
    }

    const conditions = [`rl.school_id = $1`];
    const params = [req.schoolId];

    if (status) { params.push(status); conditions.push(`rl.status = $${params.length}`); }
    if (from)   { params.push(from);   conditions.push(`rl.remedial_date >= $${params.length}`); }
    if (to)     { params.push(to);     conditions.push(`rl.remedial_date <= $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT
        rl.original_absence_date, rl.remedial_date, rl.remedial_time,
        rl.subject, rl.class_name, rl.duration_periods,
        rl.status, rl.verified_by, rl.verified_at, rl.notes,
        te.name AS teacher_name
      FROM remedial_lessons rl
      JOIN teachers te ON te.id = rl.teacher_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY rl.remedial_date DESC
    `, params);

    res.json({ total: rows.length, records: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/reports/weekly-summary
router.get('/reports/weekly-summary', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        te.name   AS teacher_name,
        a.week_number,
        MIN(a.date)::text   AS week_start,
        COUNT(*)::int       AS sessions,
        SUM(a.periods)::int AS total_periods
      FROM attendance a
      JOIN teachers te ON te.id = a.teacher_id
      WHERE a.school_id = $1
      GROUP BY te.name, a.week_number
      ORDER BY a.week_number DESC, te.name
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/run-absence-check — trigger the cron job manually
router.post('/run-absence-check', async (req, res, next) => {
  try {
    const result = await runAbsenceCheck(req.schoolId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/absence-conflicts — find false absences matching any of 3 conditions
router.get('/absence-conflicts', adminOnly, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const params = [req.schoolId];
    const dateFilter = [];
    if (from) { params.push(from); dateFilter.push(`ab.date >= $${params.length}`); }
    if (to)   { params.push(to);   dateFilter.push(`ab.date <= $${params.length}`); }
    const dateWhere = dateFilter.length ? 'AND ' + dateFilter.join(' AND ') : '';

    const { rows } = await pool.query(`
      WITH flagged AS (
        -- Condition 1: attendance record also exists for same teacher/subject/class/date
        SELECT ab.id, 'Attendance submitted' AS flag_reason, NULL::text AS flag_detail
        FROM absences ab
        WHERE ab.school_id = $1 ${dateWhere}
          AND ab.status NOT IN ('Excused', 'Made Up', 'Verified')
          AND EXISTS (
            SELECT 1 FROM attendance att
            WHERE att.school_id = ab.school_id
              AND att.teacher_id = ab.teacher_id
              AND att.date = ab.date
              AND LOWER(att.subject) = LOWER(ab.subject)
              AND EXISTS (
                SELECT 1
                FROM unnest(string_to_array(att.class_names, ',')) AS cls
                WHERE trim(lower(cls)) = trim(lower(ab.class_name))
              )
          )

        UNION ALL

        -- Condition 2: school calendar event (holiday / school event) on that date
        SELECT ab.id, 'School event' AS flag_reason, sc.name AS flag_detail
        FROM absences ab
        JOIN school_calendar sc ON sc.school_id = ab.school_id AND sc.date = ab.date
        WHERE ab.school_id = $1 ${dateWhere}
          AND ab.status NOT IN ('Excused', 'Made Up', 'Verified')

        UNION ALL

        -- Condition 3: teacher has an approved excuse covering that date
        SELECT ab.id, 'Teacher excused' AS flag_reason,
               tex.date_from::text || ' – ' || tex.date_to::text AS flag_detail
        FROM absences ab
        JOIN teacher_excuses tex
          ON tex.teacher_id = ab.teacher_id
         AND tex.school_id  = ab.school_id
         AND tex.status     = 'Approved'
         AND tex.date_from <= ab.date
         AND tex.date_to   >= ab.date
        WHERE ab.school_id = $1 ${dateWhere}
          AND ab.status NOT IN ('Excused', 'Made Up', 'Verified')
      ),
      aggregated AS (
        SELECT id,
               array_agg(flag_reason || COALESCE(': ' || flag_detail, '') ORDER BY flag_reason) AS flags
        FROM flagged
        GROUP BY id
      )
      SELECT
        ab.id,
        ab.date::text,
        te.id   AS teacher_id,
        te.name AS teacher_name,
        ab.subject,
        ab.class_name,
        ab.scheduled_period,
        ab.is_auto_generated,
        ab.reason AS recorded_reason,
        agg.flags
      FROM aggregated agg
      JOIN absences  ab ON ab.id  = agg.id
      JOIN teachers  te ON te.id  = ab.teacher_id
      ORDER BY ab.date DESC, te.name
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/admin/absence-conflicts/clear — delete validated false absences
router.post('/absence-conflicts/clear', adminOnly, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: 'ids array is required' });

    // Re-validate server-side: only delete absences that still match at least one condition
    // Never touch absences already resolved (Excused/Made Up/Verified) — those power the summary counts
    const { rows } = await pool.query(`
      DELETE FROM absences
      WHERE id = ANY($1) AND school_id = $2
        AND status NOT IN ('Excused', 'Made Up', 'Verified')
        AND (
          EXISTS (
            SELECT 1 FROM attendance att
            WHERE att.school_id = absences.school_id
              AND att.teacher_id = absences.teacher_id
              AND att.date = absences.date
              AND LOWER(att.subject) = LOWER(absences.subject)
              AND EXISTS (
                SELECT 1
                FROM unnest(string_to_array(att.class_names, ',')) AS cls
                WHERE trim(lower(cls)) = trim(lower(absences.class_name))
              )
          )
          OR EXISTS (
            SELECT 1 FROM school_calendar sc
            WHERE sc.school_id = absences.school_id AND sc.date = absences.date
          )
          OR EXISTS (
            SELECT 1 FROM teacher_excuses tex
            WHERE tex.teacher_id = absences.teacher_id
              AND tex.school_id  = absences.school_id
              AND tex.status     = 'Approved'
              AND tex.date_from <= absences.date
              AND tex.date_to   >= absences.date
          )
        )
      RETURNING id
    `, [ids, req.schoolId]);

    res.json({ cleared: rows.length, ids: rows.map(r => r.id) });
  } catch (err) { next(err); }
});

// GET /api/admin/settings — return school info + theme colors + scheduling config
router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, code, email, phone, address, primary_color, accent_color, logo_url,
              period_duration_minutes, ca_percentage,
              school_type, school_category, motto, region, district,
              admission_prefix, admission_year,
              school_latitude, school_longitude, school_gps_radius,
              vision, mission, core_values
       FROM schools WHERE id = $1`,
      [req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'School not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/admin/settings/info — update general school information
router.patch('/settings/info', adminOnly, async (req, res, next) => {
  try {
    const { name, address, phone, email, school_type, school_category, motto, region, district, admission_prefix, admission_year, school_latitude, school_longitude, school_gps_radius, vision, mission, core_values } = req.body;
    const fields = [];
    const vals   = [req.schoolId];
    const add    = (col, val) => { if (val !== undefined) { fields.push(`${col}=$${vals.length + 1}`); vals.push(val || null); } };
    add('name',              name);
    add('address',           address);
    add('phone',             phone);
    add('email',             email);
    add('school_type',       school_type);
    add('school_category',   school_category);
    add('motto',             motto);
    add('region',            region);
    add('district',          district);
    add('admission_prefix',  admission_prefix);
    add('admission_year',    admission_year);
    add('vision',            vision);
    add('mission',           mission);
    add('core_values',       core_values);
    add('school_latitude',   school_latitude  !== undefined ? (school_latitude  === '' ? null : parseFloat(school_latitude))  : undefined);
    add('school_longitude',  school_longitude !== undefined ? (school_longitude === '' ? null : parseFloat(school_longitude)) : undefined);
    add('school_gps_radius', school_gps_radius !== undefined ? (school_gps_radius === '' ? null : parseInt(school_gps_radius, 10)) : undefined);
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    const { rows } = await pool.query(
      `UPDATE schools SET ${fields.join(', ')} WHERE id=$1
       RETURNING id, name, code, email, phone, address, school_type, school_category, motto, region, district`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'School not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/admin/settings/scheduling — update period duration and/or CA percentage
router.patch('/settings/scheduling', adminOnly, async (req, res, next) => {
  try {
    const { period_duration_minutes, ca_percentage } = req.body;
    if (period_duration_minutes !== undefined) {
      const mins = parseInt(period_duration_minutes, 10);
      if (!mins || mins < 1 || mins > 480) {
        return res.status(400).json({ error: 'period_duration_minutes must be between 1 and 480.' });
      }
      await pool.query(
        `UPDATE schools SET period_duration_minutes = $1 WHERE id = $2`,
        [mins, req.schoolId]
      );
    }
    if (ca_percentage !== undefined) {
      const pct = parseInt(ca_percentage, 10);
      if (!pct || pct < 1 || pct > 99) {
        return res.status(400).json({ error: 'ca_percentage must be between 1 and 99.' });
      }
      await pool.query(
        `UPDATE schools SET ca_percentage = $1 WHERE id = $2`,
        [pct, req.schoolId]
      );
    }
    const { rows } = await pool.query(
      `SELECT period_duration_minutes, ca_percentage FROM schools WHERE id = $1`,
      [req.schoolId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/admin/settings — update school theme colors
router.patch('/settings', async (req, res, next) => {
  try {
    const { primary_color, accent_color } = req.body;
    if (!primary_color || !accent_color)
      return res.status(400).json({ error: 'primary_color and accent_color required' });
    // Validate hex color format
    const hexRe = /^#[0-9A-Fa-f]{6}$/;
    if (!hexRe.test(primary_color) || !hexRe.test(accent_color))
      return res.status(400).json({ error: 'Colors must be valid hex codes (e.g. #1A2B3C)' });

    const { rows } = await pool.query(
      `UPDATE schools SET primary_color = $1, accent_color = $2, updated_at = now()
       WHERE id = $3 RETURNING primary_color, accent_color`,
      [primary_color, accent_color, req.schoolId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/admin/settings/logo — upload / replace school logo
router.patch('/settings/logo', async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
    const filePath = `school-logos/${req.schoolId}`;
    const logoUrl  = await uploadFile(imageBase64, filePath, { upsert: true });
    await pool.query(
      `UPDATE schools SET logo_url = $1, updated_at = now() WHERE id = $2`,
      [logoUrl, req.schoolId]
    );
    res.json({ logo_url: logoUrl });
  } catch (err) { next(err); }
});

// GET /api/admin/reports/teacher-summary
// Optional: ?academic_year_id=X&semester=1|2|all  (defaults to current year + current semester)
router.get('/reports/teacher-summary', async (req, res, next) => {
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
        SELECT teacher_id, COALESCE(SUM(periods), 0) AS present_periods
        FROM attendance
        WHERE school_id = $1
          AND ($2::uuid IS NULL OR academic_year_id = $2::uuid)
          AND ($3::int  IS NULL OR semester = $3::int)
        GROUP BY teacher_id
      ),
      dr AS (
        SELECT
          COALESCE(MIN(date), CURRENT_DATE - INTERVAL '365 days') AS min_date,
          COALESCE(MAX(date), CURRENT_DATE) AS max_date
        FROM attendance
        WHERE school_id = $1
          AND ($2::uuid IS NULL OR academic_year_id = $2::uuid)
          AND ($3::int  IS NULL OR semester = $3::int)
      ),
      abs AS (
        SELECT
          ab.teacher_id,
          COUNT(*) FILTER (WHERE ab.status NOT IN ('Excused','Made Up','Verified')) AS absent_periods,
          COUNT(*) FILTER (WHERE ab.status  = 'Excused')                            AS excused_periods,
          COUNT(*) FILTER (WHERE ab.status IN ('Made Up','Verified'))               AS made_up_periods
        FROM absences ab, dr
        WHERE ab.school_id = $1
          AND ab.date >= dr.min_date
          AND ab.date <= dr.max_date
        GROUP BY ab.teacher_id
      )
      SELECT
        t.id,
        t.name,
        COALESCE(t.department, '—') AS department,
        (COALESCE(att.present_periods, 0) + COALESCE(abs.made_up_periods, 0))::int AS present_periods,
        COALESCE(abs.absent_periods, 0)::int                                        AS absent_periods,
        COALESCE(abs.excused_periods, 0)::int                                       AS excused_periods,
        COALESCE(abs.made_up_periods, 0)::int                                       AS made_up_periods,
        (COALESCE(att.present_periods, 0) + COALESCE(abs.made_up_periods, 0) + COALESCE(abs.absent_periods, 0))::int AS total_scheduled,
        CASE
          WHEN (COALESCE(att.present_periods, 0) + COALESCE(abs.made_up_periods, 0) + COALESCE(abs.absent_periods, 0)) = 0 THEN NULL
          ELSE ROUND(
            100.0 * (COALESCE(att.present_periods, 0) + COALESCE(abs.made_up_periods, 0)) /
            NULLIF(COALESCE(att.present_periods, 0) + COALESCE(abs.made_up_periods, 0) + COALESCE(abs.absent_periods, 0), 0), 1)
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

// PATCH /api/admin/teachers/:id/reset-pin — set a new PIN for a teacher
router.patch('/teachers/:id/reset-pin', async (req, res, next) => {
  try {
    const rawPin = req.body.pin ? String(req.body.pin).trim() : null;
    if (rawPin && !/^\d{4,8}$/.test(rawPin))
      return res.status(400).json({ error: 'PIN must be 4–8 digits' });

    const newPin = rawPin || (process.env.DEFAULT_TEACHER_PIN || '1234');
    const pinHash = await bcrypt.hash(newPin, 12);

    const { rowCount } = await pool.query(
      `UPDATE teachers SET pin_hash = $1, updated_at = now() WHERE id = $2 AND school_id = $3`,
      [pinHash, req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ message: 'PIN reset successfully', pin: newPin });
  } catch (err) { next(err); }
});

// POST /api/admin/teachers/:id/send-credentials
// Generates a fresh random 6-digit PIN, saves it, and emails it to the teacher.
router.post('/teachers/:id/send-credentials', async (req, res, next) => {
  try {
    const { rows: teachers } = await pool.query(
      `SELECT id, name, email, teacher_code FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!teachers.length) return res.status(404).json({ error: 'Teacher not found' });
    const teacher = teachers[0];
    if (!teacher.email) return res.status(400).json({ error: 'Teacher has no email address on record.' });

    const { rows: schools } = await pool.query(
      `SELECT name, code FROM schools WHERE id = $1`, [req.schoolId]
    );
    const school = schools[0];

    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const pinHash = await bcrypt.hash(pin, 12);
    await pool.query(
      `UPDATE teachers SET pin_hash = $1, updated_at = now() WHERE id = $2`,
      [pinHash, teacher.id]
    );

    // Respond immediately so the browser never times out — email goes in background
    res.json({ message: 'Credentials sent', email: teacher.email, pin });

    sendTeacherCredentials(teacher, school, pin).catch(err =>
      console.error('[send-credentials] Email failed for', teacher.email, '—', err.message)
    );
  } catch (err) { next(err); }
});

// POST /api/admin/teachers/send-credentials-bulk
// Sends credentials to all active teachers who have email addresses.
router.post('/teachers/send-credentials-bulk', async (req, res, next) => {
  try {
    const { rows: schools } = await pool.query(
      `SELECT name, code FROM schools WHERE id = $1`, [req.schoolId]
    );
    const school = schools[0];

    const { rows: teachers } = await pool.query(
      `SELECT id, name, email, teacher_code FROM teachers
       WHERE school_id = $1 AND status = 'Active' AND email IS NOT NULL AND email != ''`,
      [req.schoolId]
    );

    // Reset all PINs first, then fire emails in background
    const queue = [];
    for (const teacher of teachers) {
      try {
        const pin = String(Math.floor(100000 + Math.random() * 900000));
        const pinHash = await bcrypt.hash(pin, 12);
        await pool.query(
          `UPDATE teachers SET pin_hash = $1, updated_at = now() WHERE id = $2`,
          [pinHash, teacher.id]
        );
        queue.push({ teacher, pin });
      } catch (e) {
        console.error('[bulk-credentials] PIN reset failed for', teacher.name, e.message);
      }
    }

    const skipped = (await pool.query(
      `SELECT COUNT(*) FROM teachers WHERE school_id = $1 AND status = 'Active' AND (email IS NULL OR email = '')`,
      [req.schoolId]
    )).rows[0].count;

    // Respond immediately, send emails in background
    res.json({ sent: queue.length, failed: 0, skipped: Number(skipped), errors: [] });

    for (const { teacher, pin } of queue) {
      sendTeacherCredentials(teacher, school, pin).catch(err =>
        console.error('[bulk-credentials] Email failed for', teacher.email, '—', err.message)
      );
    }
  } catch (err) { next(err); }
});

// POST /api/admin/attendance — manually record attendance on behalf of a teacher
router.post('/attendance', async (req, res, next) => {
  try {
    const { teacherId, subject, classNames, periods, date, topic, locationName } = req.body;

    const missing = ['teacherId', 'subject', 'classNames', 'periods', 'date', 'topic'].filter(f => !req.body[f]);
    if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const { rows: teacherCheck } = await pool.query(
      `SELECT id FROM teachers WHERE id = $1 AND school_id = $2 AND status = 'Active'`,
      [teacherId, req.schoolId]
    );
    if (!teacherCheck.length)
      return res.status(400).json({ error: 'Teacher not found in this school' });

    // Resolve current academic year
    const { rows: ayRows } = await pool.query(
      `SELECT id, current_semester FROM academic_years
       WHERE school_id = $1 AND is_current = true LIMIT 1`,
      [req.schoolId]
    );
    if (!ayRows.length) return res.status(400).json({ error: 'No current academic year configured' });
    const { id: yearId, current_semester: sem } = ayRows[0];

    // Duplicate check: same teacher + subject + date AND at least one overlapping class
    const { rows: dupRows } = await pool.query(
      `SELECT id FROM attendance
       WHERE school_id = $1 AND date = $2 AND teacher_id = $3 AND LOWER(subject) = LOWER($4)
         AND EXISTS (
           SELECT 1
           FROM unnest(string_to_array(class_names, ',')) AS ec
          CROSS JOIN unnest(string_to_array($5, ','))    AS nc
           WHERE trim(lower(ec)) = trim(lower(nc))
         )`,
      [req.schoolId, date, teacherId, subject, classNames]
    );
    if (dupRows.length)
      return res.status(409).json({ error: 'Attendance already recorded for this teacher, subject, and class on that date' });

    // Resolve location id if name provided
    let locationId = null;
    if (locationName) {
      const { rows: locRows } = await pool.query(
        `SELECT id FROM locations WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [req.schoolId, locationName]
      );
      if (locRows.length) locationId = locRows[0].id;
    }

    const weekNumber = getWeekNumber(new Date(date + 'T12:00:00'));

    const { rows } = await pool.query(
      `INSERT INTO attendance
         (school_id, date, academic_year_id, semester, teacher_id,
          subject, class_names, periods, topic, gps_coordinates,
          photo_url, week_number, location_id, location_name,
          location_verified, location_verification_message, photo_size_kb)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        req.schoolId, date, yearId, sem, teacherId,
        subject, classNames, parseInt(periods, 10), topic || null, null,
        null, weekNumber, locationId, locationName || null,
        false, 'Manual entry by admin', null,
      ]
    );
    // Clear any auto-generated absence records for this teacher/subject/date
    await pool.query(
      `DELETE FROM absences
       WHERE school_id = $1 AND teacher_id = $2 AND date = $3
         AND LOWER(subject) = LOWER($4)`,
      [req.schoolId, teacherId, date, subject]
    );

    const classQueue = classNames.split(',').map(c => c.trim()).filter(Boolean);
    res.status(201).json({ message: 'Attendance recorded manually', id: rows[0].id, classQueue });
  } catch (err) { next(err); }
});

module.exports = router;
