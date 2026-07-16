'use strict';
const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcrypt');
const pool    = require('../config/db');
const ExcelJS = require('exceljs');

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (payload.type !== 'management') return res.status(403).json({ error: 'Management access required' });
    req.user     = payload;
    req.schoolId = payload.schoolId;
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

router.use(auth);

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }

// ── 1. Snapshot ───────────────────────────────────────────────────────────────
router.get('/snapshot', async (req, res, next) => {
  try {
    const sid  = req.schoolId;
    const date = today();
    const dow  = new Date().getDay(); // 0=Sun

    const [teacherRes, absenceRes, leaveRes, exeatRes, studentRes] = await Promise.all([
      // Teachers with a slot today
      pool.query(`
        SELECT COUNT(DISTINCT t.id)::int AS total,
               COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN t.id END)::int AS submitted
        FROM teachers t
        JOIN timetable tt ON tt.teacher_id = t.id AND tt.school_id = $1
          AND tt.day_of_week = $2
        LEFT JOIN attendance a ON a.teacher_id = t.id AND a.school_id = $1 AND a.date = $3
        WHERE t.school_id = $1 AND t.status = 'Active'
      `, [sid, dow, date]),

      // Auto-absences today
      pool.query(`
        SELECT COUNT(*)::int AS cnt FROM absences
        WHERE school_id = $1 AND date = $2 AND is_auto_generated = true
          AND status NOT IN ('Excused','Made Up','Verified')
      `, [sid, date]),

      // Pending leave requests
      pool.query(`
        SELECT COUNT(*)::int AS cnt FROM teacher_excuses
        WHERE school_id = $1 AND status = 'Pending'
      `, [sid]),

      // Active exeats
      pool.query(`
        SELECT COUNT(*)::int AS cnt FROM exeats
        WHERE school_id = $1 AND status = 'active'
      `, [sid]),

      // Active students
      pool.query(`
        SELECT COUNT(*)::int AS total FROM students
        WHERE school_id = $1 AND status = 'Active'
      `, [sid]),
    ]);

    const teachers  = teacherRes.rows[0];
    const scheduled = teachers.total;
    const submitted = teachers.submitted;
    const rate      = scheduled > 0 ? Math.round((submitted / scheduled) * 100) : null;

    res.json({
      teacherAttendanceRate: rate,
      teachersScheduledToday: scheduled,
      teachersSubmittedToday:  submitted,
      autoAbsencesToday:   absenceRes.rows[0].cnt,
      pendingLeaves:       leaveRes.rows[0].cnt,
      activeExeats:        exeatRes.rows[0].cnt,
      activeStudents:      studentRes.rows[0].total,
    });
  } catch (err) { next(err); }
});

// ── 2. Classroom Occupancy ────────────────────────────────────────────────────
router.get('/occupancy', async (req, res, next) => {
  try {
    const sid  = req.schoolId;
    const date = req.query.date || today();
    const dow  = new Date(date + 'T12:00:00').getDay();

    const [slotRes, attRes, absRes] = await Promise.all([
      pool.query(`
        SELECT tt.id, tt.start_time, tt.end_time, tt.subject, tt.class_names,
               t.id AS teacher_id, t.name AS teacher_name, t.teacher_code, t.phone AS teacher_phone
        FROM timetable tt
        JOIN teachers t ON t.id = tt.teacher_id
        WHERE tt.school_id = $1 AND tt.day_of_week = $2 AND t.status = 'Active'
        ORDER BY tt.start_time, tt.class_names
      `, [sid, dow]),

      pool.query(`
        SELECT teacher_id, subject, class_names, submitted_at
        FROM attendance WHERE school_id = $1 AND date = $2
      `, [sid, date]),

      pool.query(`
        SELECT teacher_id, subject FROM absences
        WHERE school_id = $1 AND date = $2
          AND is_auto_generated = true
          AND status NOT IN ('Excused','Made Up','Verified')
      `, [sid, date]),
    ]);

    const now = new Date();
    const slots = slotRes.rows.map(slot => {
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      const slotDate  = new Date(date);
      const startDt   = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), sh, sm);
      const endDt     = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), eh, em);

      const submitted = attRes.rows.some(a =>
        a.teacher_id === slot.teacher_id &&
        a.subject.toLowerCase() === slot.subject.toLowerCase()
      );
      const absent = absRes.rows.some(a =>
        a.teacher_id === slot.teacher_id &&
        a.subject.toLowerCase() === slot.subject.toLowerCase()
      );

      let status;
      if (submitted)              status = 'confirmed';
      else if (absent)            status = 'absent';
      else if (now < startDt)     status = 'upcoming';
      else if (now <= endDt)      status = 'ongoing';
      else                        status = 'not_submitted';

      return {
        id:          slot.id,
        startTime:   slot.start_time,
        endTime:     slot.end_time,
        subject:     slot.subject,
        classNames:  slot.class_names,
        teacherId:    slot.teacher_id,
        teacherName:  slot.teacher_name,
        teacherCode:  slot.teacher_code,
        teacherPhone: slot.teacher_phone ?? null,
        status,
      };
    });

    res.json({ date, slots });
  } catch (err) { next(err); }
});

// ── 3. Academic Years (for frontend dropdowns) ────────────────────────────────
router.get('/academic-years', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, is_current, current_semester
       FROM academic_years WHERE school_id = $1 ORDER BY name DESC`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── shared helper: resolve academic year + semester from query params ─────────
async function resolveYearSem(schoolId, query) {
  const { academic_year_id, semester } = query;
  const useAll = semester === 'all' || semester === '0';
  let yearId = academic_year_id?.trim() || null;
  let sem    = useAll ? null : (semester ? parseInt(semester, 10) : null);
  if (!yearId || (!useAll && sem === null)) {
    const { rows } = await pool.query(
      `SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`,
      [schoolId]
    );
    if (!yearId) yearId = rows[0]?.id || null;
    if (!useAll && sem === null) sem = rows[0]?.current_semester || null;
  }
  return [yearId || null, sem || null];
}

// ── 3. Teacher Class Attendance Summary ───────────────────────────────────────
router.get('/teacher-attendance', async (req, res, next) => {
  try {
    const [yearId, sem] = await resolveYearSem(req.schoolId, req.query);

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
        t.id, t.name,
        COALESCE(t.department, '—') AS department,
        (COALESCE(att.present_periods, 0) + COALESCE(abs.made_up_periods, 0))::int AS present_periods,
        COALESCE(abs.absent_periods, 0)::int                                        AS absent_periods,
        COALESCE(abs.excused_periods, 0)::int                                       AS excused_periods,
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
    `, [req.schoolId, yearId, sem]);

    res.json(rows);
  } catch (err) { next(err); }
});

// ── 3b. PLC Attendance Summary (combines dedicated plc_attendance + meetings of type PLC) ──
router.get('/plc-summary', async (req, res, next) => {
  try {
    const [yearId, sem] = await resolveYearSem(req.schoolId, req.query);

    const { rows } = await pool.query(`
      WITH
      -- Present: dedicated PLC session submissions
      plc_att AS (
        SELECT teacher_id, COUNT(*) AS cnt
        FROM plc_attendance
        WHERE school_id = $1
          AND ($2::uuid IS NULL OR academic_year_id = $2::uuid OR academic_year_id IS NULL)
          AND ($3::int  IS NULL OR semester = $3::int         OR semester          IS NULL)
        GROUP BY teacher_id
      ),
      -- Present: meetings recorded with meeting_type = 'PLC'
      mtg_att AS (
        SELECT ma.teacher_id, COUNT(*) AS cnt
        FROM meeting_attendance ma
        JOIN meetings m ON m.id = ma.meeting_id
        WHERE ma.school_id = $1
          AND m.meeting_type = 'PLC'
          AND ($2::uuid IS NULL OR ma.academic_year_id = $2::uuid OR ma.academic_year_id IS NULL)
          AND ($3::int  IS NULL OR ma.semester = $3::int         OR ma.semester          IS NULL)
        GROUP BY ma.teacher_id
      ),
      -- Combined present counts
      att AS (
        SELECT teacher_id, SUM(cnt)::int AS present_count
        FROM (SELECT teacher_id, cnt FROM plc_att
              UNION ALL
              SELECT teacher_id, cnt FROM mtg_att) x
        GROUP BY teacher_id
      ),
      -- Date range across both sources (for scoping absences)
      dr AS (
        SELECT
          COALESCE(
            LEAST(
              (SELECT MIN(date) FROM plc_attendance
               WHERE school_id = $1
                 AND ($2::uuid IS NULL OR academic_year_id = $2::uuid OR academic_year_id IS NULL)
                 AND ($3::int  IS NULL OR semester = $3::int         OR semester          IS NULL)),
              (SELECT MIN(ma.date) FROM meeting_attendance ma
               JOIN meetings m ON m.id = ma.meeting_id
               WHERE ma.school_id = $1 AND m.meeting_type = 'PLC'
                 AND ($2::uuid IS NULL OR ma.academic_year_id = $2::uuid OR ma.academic_year_id IS NULL)
                 AND ($3::int  IS NULL OR ma.semester = $3::int         OR ma.semester          IS NULL))
            ), CURRENT_DATE - INTERVAL '365 days') AS min_date,
          COALESCE(
            GREATEST(
              (SELECT MAX(date) FROM plc_attendance
               WHERE school_id = $1
                 AND ($2::uuid IS NULL OR academic_year_id = $2::uuid OR academic_year_id IS NULL)
                 AND ($3::int  IS NULL OR semester = $3::int         OR semester          IS NULL)),
              (SELECT MAX(ma.date) FROM meeting_attendance ma
               JOIN meetings m ON m.id = ma.meeting_id
               WHERE ma.school_id = $1 AND m.meeting_type = 'PLC'
                 AND ($2::uuid IS NULL OR ma.academic_year_id = $2::uuid OR ma.academic_year_id IS NULL)
                 AND ($3::int  IS NULL OR ma.semester = $3::int         OR ma.semester          IS NULL))
            ), CURRENT_DATE) AS max_date
      ),
      -- Absent: dedicated plc_absences
      plc_abs AS (
        SELECT ab.teacher_id, COUNT(*) AS cnt
        FROM plc_absences ab, dr
        WHERE ab.school_id = $1
          AND ab.date >= dr.min_date AND ab.date <= dr.max_date
        GROUP BY ab.teacher_id
      ),
      -- Absent: meeting_absences for PLC-type meetings
      mtg_abs AS (
        SELECT ab.teacher_id, COUNT(*) AS cnt
        FROM meeting_absences ab
        JOIN meetings m ON m.id = ab.meeting_id, dr
        WHERE ab.school_id = $1
          AND m.meeting_type = 'PLC'
          AND ab.date >= dr.min_date AND ab.date <= dr.max_date
        GROUP BY ab.teacher_id
      ),
      abs AS (
        SELECT teacher_id, SUM(cnt)::int AS absent_count
        FROM (SELECT teacher_id, cnt FROM plc_abs
              UNION ALL
              SELECT teacher_id, cnt FROM mtg_abs) x
        GROUP BY teacher_id
      )
      SELECT
        t.id, t.name,
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
    `, [req.schoolId, yearId, sem]);

    res.json(rows);
  } catch (err) { next(err); }
});

// ── 3c. Meeting Attendance Summary (Morning Briefing / Staff Meeting / etc.) ──
router.get('/meetings-summary', async (req, res, next) => {
  try {
    const [yearId, sem] = await resolveYearSem(req.schoolId, req.query);
    const type = req.query.type || null;

    const { rows } = await pool.query(`
      WITH att AS (
        SELECT ma.teacher_id, COUNT(*) AS present_count
        FROM meeting_attendance ma
        JOIN meetings m ON m.id = ma.meeting_id
        WHERE ma.school_id = $1
          AND ($4::text IS NULL OR m.meeting_type = $4::text)
          AND ($2::uuid IS NULL OR ma.academic_year_id = $2::uuid OR ma.academic_year_id IS NULL)
          AND ($3::int  IS NULL OR ma.semester = $3::int         OR ma.semester          IS NULL)
        GROUP BY ma.teacher_id
      ),
      dr AS (
        SELECT
          COALESCE(MIN(ma.date), CURRENT_DATE - INTERVAL '365 days') AS min_date,
          COALESCE(MAX(ma.date), CURRENT_DATE) AS max_date
        FROM meeting_attendance ma
        JOIN meetings m ON m.id = ma.meeting_id
        WHERE ma.school_id = $1
          AND ($4::text IS NULL OR m.meeting_type = $4::text)
          AND ($2::uuid IS NULL OR ma.academic_year_id = $2::uuid OR ma.academic_year_id IS NULL)
          AND ($3::int  IS NULL OR ma.semester = $3::int         OR ma.semester          IS NULL)
      ),
      abs AS (
        SELECT ab.teacher_id, COUNT(*) AS absent_count
        FROM meeting_absences ab
        JOIN meetings m ON m.id = ab.meeting_id, dr
        WHERE ab.school_id = $1
          AND ($4::text IS NULL OR m.meeting_type = $4::text)
          AND ab.date >= dr.min_date
          AND ab.date <= dr.max_date
        GROUP BY ab.teacher_id
      )
      SELECT
        t.id, t.name,
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
    `, [req.schoolId, yearId, sem, type]);

    res.json(rows);
  } catch (err) { next(err); }
});

// ── 4. Leave Requests ─────────────────────────────────────────────────────────
router.get('/leaves', async (req, res, next) => {
  try {
    const status = req.query.status || '';
    const params = [req.schoolId];
    let   where  = 'te.school_id = $1';
    if (status) { params.push(status); where += ` AND te.status = $${params.length}`; }

    const { rows } = await pool.query(`
      SELECT te.id, te.reason, te.type, te.date_from, te.date_to, te.status,
             te.rejection_reason, te.approved_at, te.created_at,
             te.document_url, te.document_filename,
             t.name AS teacher_name, t.teacher_code, t.department
      FROM teacher_excuses te
      JOIN teachers t ON t.id = te.teacher_id
      WHERE ${where}
      ORDER BY te.created_at DESC
      LIMIT 200
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

router.patch('/leaves/:id/approve', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      UPDATE teacher_excuses
      SET status = 'Approved', approved_by = NULL, approved_at = now(), updated_at = now()
      WHERE id = $1 AND school_id = $2 AND status = 'Pending'
      RETURNING id, status, teacher_id, date_from, date_to
    `, [req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Request not found or already actioned' });

    // Retroactively excuse any absence records in the approved date range
    const { teacher_id, date_from, date_to } = rows[0];
    await pool.query(
      `UPDATE absences SET status = 'Excused', updated_at = now()
       WHERE school_id = $1 AND teacher_id = $2
         AND date BETWEEN $3 AND $4
         AND status = 'Absent' AND is_auto_generated = true`,
      [req.schoolId, teacher_id, date_from, date_to]
    );

    res.json({ id: rows[0].id, status: rows[0].status });
  } catch (err) { next(err); }
});

router.patch('/leaves/:id/reject', async (req, res, next) => {
  try {
    const reason = req.body?.reason?.trim();
    if (!reason) return res.status(400).json({ error: 'A reason is required when rejecting' });
    const { rows } = await pool.query(`
      UPDATE teacher_excuses
      SET status = 'Rejected', approved_by = NULL, approved_at = now(),
          updated_at = now(), rejection_reason = $1
      WHERE id = $2 AND school_id = $3 AND status = 'Pending'
      RETURNING id, status, rejection_reason
    `, [reason, req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Request not found or already actioned' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── 5. Exeat Usage ────────────────────────────────────────────────────────────
router.get('/exeats', async (req, res, next) => {
  try {
    const sid       = req.schoolId;
    const className = req.query.class || '';
    const params    = [sid];
    let   where     = 's.school_id = $1 AND s.status = \'Active\'';
    if (className) { params.push(className); where += ` AND s.class_name = $${params.length}`; }

    // Get school-wide quota limits
    const { rows: settings } = await pool.query(
      `SELECT COALESCE(max_internal, 5) AS max_internal, COALESCE(max_external, 2) AS max_external
       FROM exeat_settings WHERE school_id = $1`,
      [sid]
    );
    const quota = settings[0] ?? { max_internal: 5, max_external: 2 };

    const { rows } = await pool.query(`
      SELECT s.id, s.student_code, s.name, s.class_name, s.house,
             COUNT(e.id) FILTER (WHERE e.exeat_type = 'internal'
               AND e.status NOT IN ('cancelled','rejected'))::int AS internal_used,
             COUNT(e.id) FILTER (WHERE e.exeat_type = 'external'
               AND e.status NOT IN ('cancelled','rejected'))::int AS external_used
      FROM students s
      LEFT JOIN exeats e ON e.student_id = s.id AND e.school_id = s.school_id
      WHERE ${where}
      GROUP BY s.id
      ORDER BY s.class_name, s.name
    `, params);

    res.json({
      internal_quota: quota.max_internal,
      external_quota: quota.max_external,
      students: rows,
    });
  } catch (err) { next(err); }
});

// Update school-wide exeat quota (principal override)
router.patch('/exeat-settings', async (req, res, next) => {
  try {
    const { max_internal, max_external } = req.body;
    if (max_internal == null && max_external == null)
      return res.status(400).json({ error: 'Provide max_internal or max_external' });

    const { rows } = await pool.query(`
      INSERT INTO exeat_settings (school_id, max_internal, max_external, semester_start_date)
      VALUES ($1, COALESCE($2, 5), COALESCE($3, 2), now()::date)
      ON CONFLICT (school_id) DO UPDATE
        SET max_internal = COALESCE($2, exeat_settings.max_internal),
            max_external = COALESCE($3, exeat_settings.max_external),
            updated_at   = now()
      RETURNING max_internal, max_external
    `, [req.schoolId,
        max_internal != null ? parseInt(max_internal) : null,
        max_external != null ? parseInt(max_external) : null]);

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── 6. Clearance ──────────────────────────────────────────────────────────────
router.get('/clearance', async (req, res, next) => {
  try {
    const sid       = req.schoolId;
    const className = req.query.class   || '';
    const program   = req.query.program || '';
    const status    = req.query.status  || '';   // fully_cleared | in_progress | not_started

    const params = [sid];
    const conds  = ['s.school_id = $1', "s.status = 'Active'"];
    if (className) { params.push(className); conds.push(`s.class_name = $${params.length}`); }
    if (program)   { params.push(program);   conds.push(`p.name ILIKE $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT s.id, s.student_code, s.name, s.class_name,
             p.name AS program_name,
             sc.id  AS clearance_id,
             sc.is_fully_cleared,
             sc.fully_cleared_at,
             COUNT(sci.id)::int                                              AS total_offices,
             COUNT(sci.id) FILTER (WHERE sci.status = 'cleared')::int AS cleared_offices
      FROM students s
      LEFT JOIN programs p        ON p.id = s.program_id
      LEFT JOIN student_clearances sc ON sc.student_id = s.id AND sc.school_id = s.school_id
      LEFT JOIN student_clearance_items sci ON sci.clearance_id = sc.id
      WHERE ${conds.join(' AND ')}
      GROUP BY s.id, p.name, sc.id, sc.is_fully_cleared, sc.fully_cleared_at
      ORDER BY s.class_name, s.name
    `, params);

    const filtered = status === 'fully_cleared'
      ? rows.filter(r => r.is_fully_cleared)
      : status === 'in_progress'
        ? rows.filter(r => r.clearance_id && !r.is_fully_cleared)
        : status === 'not_started'
          ? rows.filter(r => !r.clearance_id)
          : rows;

    res.json(filtered);
  } catch (err) { next(err); }
});

router.get('/clearance/student/:id', async (req, res, next) => {
  try {
    const { rows: stu } = await pool.query(`
      SELECT s.id, s.student_code, s.name, s.class_name, p.name AS program_name
      FROM students s LEFT JOIN programs p ON p.id = s.program_id
      WHERE s.id = $1 AND s.school_id = $2
    `, [req.params.id, req.schoolId]);
    if (!stu.length) return res.status(404).json({ error: 'Student not found' });

    const { rows: sc } = await pool.query(`
      SELECT sc.id, sc.is_fully_cleared, sc.initiated_at, sc.fully_cleared_at
      FROM student_clearances sc
      WHERE sc.student_id = $1 AND sc.school_id = $2
    `, [req.params.id, req.schoolId]);

    let offices = [];
    if (sc.length) {
      const { rows } = await pool.query(`
        SELECT co.name AS office_name, co.office_type, sci.status,
               sci.actioned_at, sci.notes,
               COALESCE(t.name, ss.name) AS actioned_by_name
        FROM student_clearance_items sci
        JOIN clearance_offices co ON co.id = sci.office_id
        LEFT JOIN teachers     t  ON t.id  = sci.actioned_by_teacher_id
        LEFT JOIN school_staff ss ON ss.id = sci.actioned_by_school_staff_id
        WHERE sci.clearance_id = $1
        ORDER BY co.sort_order, co.name
      `, [sc[0].id]);
      offices = rows;
    }

    res.json({
      student: stu[0],
      clearance: sc[0] || null,
      offices,
    });
  } catch (err) { next(err); }
});

// ── 7. Personnel Records ──────────────────────────────────────────────────────

// Students JSON
router.get('/personnel/students', async (req, res, next) => {
  try {
    const sid     = req.schoolId;
    const params  = [sid];
    const conds   = ['s.school_id = $1'];
    if (req.query.class)   { params.push(req.query.class);   conds.push(`s.class_name = $${params.length}`); }
    if (req.query.status && req.query.status !== 'all') { params.push(req.query.status); conds.push(`s.status = $${params.length}`); }
    if (req.query.program) { params.push(req.query.program); conds.push(`p.name ILIKE $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT s.student_code, s.name, s.class_name, p.name AS program_name, s.status,
             s.gender, s.date_of_birth, s.residential_status, s.house,
             s.religion, s.religious_denomination,
             s.jhs_index_number, s.mobile_number, s.hometown, s.residential_address,
             s.ghana_card_number, s.nhia_number, s.aggregate,
             s.guardian_name, s.guardian_occupation, s.guardian_mobile,
             s.notes
      FROM students s
      LEFT JOIN programs p ON p.id = s.program_id
      WHERE ${conds.join(' AND ')}
      ORDER BY s.class_name, s.name
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

// Students Excel
router.get('/personnel/students/excel', async (req, res, next) => {
  try {
    const sid     = req.schoolId;
    const params  = [sid];
    const conds   = ['s.school_id = $1'];
    if (req.query.class)   { params.push(req.query.class);   conds.push(`s.class_name = $${params.length}`); }
    if (req.query.status && req.query.status !== 'all') { params.push(req.query.status); conds.push(`s.status = $${params.length}`); }
    if (req.query.program) { params.push(req.query.program); conds.push(`p.name ILIKE $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT s.student_code, s.name, s.class_name, p.name AS program_name, s.status,
             s.gender, s.date_of_birth, s.residential_status, s.house,
             s.religion, s.religious_denomination,
             s.jhs_index_number, s.mobile_number, s.hometown, s.residential_address,
             s.ghana_card_number, s.nhia_number, s.aggregate,
             s.guardian_name, s.guardian_occupation, s.guardian_mobile,
             s.notes
      FROM students s
      LEFT JOIN programs p ON p.id = s.program_id
      WHERE ${conds.join(' AND ')}
      ORDER BY s.class_name, s.name
    `, params);

    const wb  = new ExcelJS.Workbook();
    wb.creator = 'CAS Management Portal';
    const ws  = wb.addWorksheet('Students');
    const HDR_DARK = '0F4C35';
    const cols = [
      { header: 'Student ID',           key: 'student_code',         width: 14 },
      { header: 'Name',                 key: 'name',                  width: 28 },
      { header: 'Class',                key: 'class_name',            width: 10 },
      { header: 'Program',              key: 'program_name',          width: 22 },
      { header: 'Status',               key: 'status',                width: 12 },
      { header: 'Gender',               key: 'gender',                width: 10 },
      { header: 'Date of Birth',        key: 'date_of_birth',         width: 16 },
      { header: 'Residential Status',   key: 'residential_status',    width: 18 },
      { header: 'House',                key: 'house',                 width: 14 },
      { header: 'Religion',             key: 'religion',              width: 16 },
      { header: 'Denomination',         key: 'religious_denomination',width: 20 },
      { header: 'JHS Index No.',        key: 'jhs_index_number',      width: 18 },
      { header: 'Mobile No.',           key: 'mobile_number',         width: 16 },
      { header: 'Hometown',             key: 'hometown',              width: 18 },
      { header: 'Residential Address',  key: 'residential_address',   width: 28 },
      { header: 'Ghana Card No.',       key: 'ghana_card_number',     width: 20 },
      { header: 'NHIA No.',             key: 'nhia_number',           width: 16 },
      { header: 'Aggregate',            key: 'aggregate',             width: 12 },
      { header: 'Guardian Name',        key: 'guardian_name',         width: 22 },
      { header: 'Guardian Occupation',  key: 'guardian_occupation',   width: 22 },
      { header: 'Guardian Mobile',      key: 'guardian_mobile',       width: 16 },
      { header: 'Notes',                key: 'notes',                 width: 24 },
    ];
    ws.columns = cols.map(c => ({ key: c.key, width: c.width }));
    ws.views   = [{ state: 'frozen', ySplit: 1 }];

    const hdr = ws.getRow(1);
    hdr.height = 24;
    cols.forEach((c, i) => {
      const cell    = hdr.getCell(i + 1);
      cell.value    = c.header;
      cell.font     = { bold: true, color: { argb: 'FFFFFF' }, size: 10, name: 'Calibri' };
      cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    });

    rows.forEach((r, ri) => {
      const wr = ws.getRow(ri + 2);
      cols.forEach((c, ci) => {
        const cell    = wr.getCell(ci + 1);
        cell.value    = c.key === 'date_of_birth' && r[c.key]
          ? String(r[c.key]).slice(0, 10) : (r[c.key] ?? '');
        cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFFFFF' : 'F0FDF4' } };
        cell.font     = { size: 10, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', indent: 1 };
      });
    });

    const fname = `students_${req.query.class || 'all'}_${req.query.status || 'all'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// Teachers JSON
router.get('/personnel/teachers', async (req, res, next) => {
  try {
    const sid    = req.schoolId;
    const params = [sid];
    const conds  = ['school_id = $1'];
    if (req.query.status && req.query.status !== 'all') { params.push(req.query.status); conds.push(`status = $${params.length}`); }
    if (req.query.department) { params.push(`%${req.query.department}%`); conds.push(`department ILIKE $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT teacher_code, name, email, phone, department, rank, status, is_admin,
             gov_staff_id, gender, date_of_birth, registered_number, ntc_number, ssf_number,
             academic_qualification, professional_qualification, additional_responsibility,
             bank, bank_branch, account_number, religion, religious_denomination,
             hometown, residential_address, association, ghana_card_number,
             emergency_contact_name, emergency_contact_phone, notes
      FROM teachers WHERE ${conds.join(' AND ')}
      ORDER BY name
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

// Teachers Excel
router.get('/personnel/teachers/excel', async (req, res, next) => {
  try {
    const sid    = req.schoolId;
    const params = [sid];
    const conds  = ['school_id = $1'];
    if (req.query.status && req.query.status !== 'all') { params.push(req.query.status); conds.push(`status = $${params.length}`); }
    if (req.query.department) { params.push(`%${req.query.department}%`); conds.push(`department ILIKE $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT teacher_code, name, email, phone, department, rank, status, is_admin,
             gov_staff_id, gender, date_of_birth, registered_number, ntc_number, ssf_number,
             academic_qualification, professional_qualification, additional_responsibility,
             bank, bank_branch, account_number, religion, religious_denomination,
             hometown, residential_address, association, ghana_card_number,
             emergency_contact_name, emergency_contact_phone, notes
      FROM teachers WHERE ${conds.join(' AND ')}
      ORDER BY name
    `, params);

    const wb  = new ExcelJS.Workbook();
    wb.creator = 'CAS Management Portal';
    const ws  = wb.addWorksheet('Teachers');
    const HDR_DARK = '0F4C35';
    const cols = [
      { header: 'Teacher ID',              key: 'teacher_code',              width: 14 },
      { header: 'Name',                    key: 'name',                       width: 28 },
      { header: 'Email',                   key: 'email',                      width: 30 },
      { header: 'Phone',                   key: 'phone',                      width: 16 },
      { header: 'Department',              key: 'department',                 width: 24 },
      { header: 'GES Rank',               key: 'rank',                       width: 28 },
      { header: 'Status',                  key: 'status',                     width: 12 },
      { header: 'Is Admin',                key: 'is_admin',                   width: 10 },
      { header: 'Gov Staff ID',            key: 'gov_staff_id',               width: 16 },
      { header: 'Gender',                  key: 'gender',                     width: 10 },
      { header: 'Date of Birth',           key: 'date_of_birth',              width: 16 },
      { header: 'Registered No.',          key: 'registered_number',          width: 18 },
      { header: 'NTC No.',                 key: 'ntc_number',                 width: 16 },
      { header: 'SSF No.',                 key: 'ssf_number',                 width: 16 },
      { header: 'Academic Qualification',  key: 'academic_qualification',     width: 24 },
      { header: 'Professional Qual.',      key: 'professional_qualification', width: 22 },
      { header: 'Add. Responsibility',     key: 'additional_responsibility',  width: 24 },
      { header: 'Bank',                    key: 'bank',                       width: 20 },
      { header: 'Bank Branch',             key: 'bank_branch',                width: 20 },
      { header: 'Account No.',             key: 'account_number',             width: 18 },
      { header: 'Religion',                key: 'religion',                   width: 16 },
      { header: 'Denomination',            key: 'religious_denomination',     width: 20 },
      { header: 'Hometown',                key: 'hometown',                   width: 18 },
      { header: 'Residential Address',     key: 'residential_address',        width: 28 },
      { header: 'Association',             key: 'association',                width: 16 },
      { header: 'Ghana Card No.',          key: 'ghana_card_number',          width: 20 },
      { header: 'Emergency Contact',       key: 'emergency_contact_name',     width: 22 },
      { header: 'Emergency Phone',         key: 'emergency_contact_phone',    width: 20 },
      { header: 'Notes',                   key: 'notes',                      width: 24 },
    ];
    ws.columns = cols.map(c => ({ key: c.key, width: c.width }));
    ws.views   = [{ state: 'frozen', ySplit: 1 }];

    const hdr = ws.getRow(1);
    hdr.height = 24;
    cols.forEach((c, i) => {
      const cell     = hdr.getCell(i + 1);
      cell.value     = c.header;
      cell.font      = { bold: true, color: { argb: 'FFFFFF' }, size: 10, name: 'Calibri' };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    });

    rows.forEach((r, ri) => {
      const wr = ws.getRow(ri + 2);
      cols.forEach((c, ci) => {
        const cell    = wr.getCell(ci + 1);
        let   val     = r[c.key];
        if (c.key === 'date_of_birth' && val) val = String(val).slice(0, 10);
        else if (c.key === 'is_admin') val = val ? 'Yes' : 'No';
        cell.value     = val ?? '';
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFFFFF' : 'F0FDF4' } };
        cell.font      = { size: 10, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', indent: 1 };
      });
    });

    const fname = `teachers_${req.query.status || 'all'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// ── 8. Reports (reuse existing report SQL) ────────────────────────────────────
const STUDENT_REPORTS = {
  program_distribution: {
    label: 'Program Distribution', columns: ['Program','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(p.name,'No Program') AS "group",
      COUNT(*) FILTER (WHERE s.gender='Male') AS male,
      COUNT(*) FILTER (WHERE s.gender='Female') AS female,
      COUNT(*) AS total
      FROM students s LEFT JOIN programs p ON p.id=s.program_id
      WHERE s.school_id=$1 ${sc} GROUP BY p.name ORDER BY p.name NULLS LAST`,
  },
  program_residential: {
    label: 'Program Distribution by Residential Status',
    columns: ['Program','Day–Male','Day–Female','Boarding–Male','Boarding–Female','Total'],
    keys:    ['group','day_male','day_female','boarding_male','boarding_female','total'],
    sql: sc => `SELECT COALESCE(p.name,'No Program') AS "group",
      COUNT(*) FILTER (WHERE s.residential_status='Day' AND s.gender='Male') AS day_male,
      COUNT(*) FILTER (WHERE s.residential_status='Day' AND s.gender='Female') AS day_female,
      COUNT(*) FILTER (WHERE s.residential_status='Boarding' AND s.gender='Male') AS boarding_male,
      COUNT(*) FILTER (WHERE s.residential_status='Boarding' AND s.gender='Female') AS boarding_female,
      COUNT(*) AS total
      FROM students s LEFT JOIN programs p ON p.id=s.program_id
      WHERE s.school_id=$1 ${sc} GROUP BY p.name ORDER BY p.name NULLS LAST`,
  },
  class_distribution: {
    label: 'Class Distribution', columns: ['Class','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT s.class_name AS "group",
      COUNT(*) FILTER (WHERE s.gender='Male') AS male,
      COUNT(*) FILTER (WHERE s.gender='Female') AS female, COUNT(*) AS total
      FROM students s WHERE s.school_id=$1 ${sc} GROUP BY s.class_name ORDER BY s.class_name`,
  },
  house_distribution: {
    label: 'House Distribution',
    columns: ['House','Day–Male','Day–Female','Boarding–Male','Boarding–Female','Total'],
    keys:    ['group','day_male','day_female','boarding_male','boarding_female','total'],
    sql: sc => `SELECT COALESCE(s.house,'No House') AS "group",
      COUNT(*) FILTER (WHERE s.residential_status='Day' AND s.gender='Male') AS day_male,
      COUNT(*) FILTER (WHERE s.residential_status='Day' AND s.gender='Female') AS day_female,
      COUNT(*) FILTER (WHERE s.residential_status='Boarding' AND s.gender='Male') AS boarding_male,
      COUNT(*) FILTER (WHERE s.residential_status='Boarding' AND s.gender='Female') AS boarding_female,
      COUNT(*) AS total
      FROM students s WHERE s.school_id=$1 ${sc} GROUP BY s.house ORDER BY s.house NULLS LAST`,
  },
  religion_distribution: {
    label: 'Religion Distribution', columns: ['Religion','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(s.religion,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE s.gender='Male') AS male,
      COUNT(*) FILTER (WHERE s.gender='Female') AS female, COUNT(*) AS total
      FROM students s WHERE s.school_id=$1 ${sc} GROUP BY s.religion ORDER BY total DESC`,
  },
  denomination_distribution: {
    label: 'Religious Denomination Distribution', columns: ['Denomination','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(s.religious_denomination,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE s.gender='Male') AS male,
      COUNT(*) FILTER (WHERE s.gender='Female') AS female, COUNT(*) AS total
      FROM students s WHERE s.school_id=$1 ${sc} GROUP BY s.religious_denomination ORDER BY total DESC`,
  },
  age_distribution: {
    label: 'Age Distribution', columns: ['Age Group','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `WITH aged AS (
      SELECT s.gender,
        CASE
          WHEN s.date_of_birth IS NULL                       THEN 'Not Recorded'
          WHEN DATE_PART('year',AGE(s.date_of_birth)) < 14  THEN 'Under 14'
          WHEN DATE_PART('year',AGE(s.date_of_birth)) > 20  THEN '21 and above'
          ELSE DATE_PART('year',AGE(s.date_of_birth))::int::text
        END AS "group"
      FROM students s WHERE s.school_id=$1 ${sc}
    )
    SELECT "group",
      COUNT(*) FILTER (WHERE gender='Male') AS male,
      COUNT(*) FILTER (WHERE gender='Female') AS female,
      COUNT(*) AS total
    FROM aged GROUP BY "group"
    ORDER BY CASE "group"
      WHEN 'Under 14' THEN 0 WHEN '14' THEN 14 WHEN '15' THEN 15 WHEN '16' THEN 16
      WHEN '17' THEN 17 WHEN '18' THEN 18 WHEN '19' THEN 19 WHEN '20' THEN 20
      WHEN '21 and above' THEN 98 ELSE 99
    END`,
  },
  aggregate_distribution: {
    label: 'Aggregate Range Distribution', columns: ['Aggregate Range','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `WITH agg AS (
      SELECT s.gender,
        CASE
          WHEN s.aggregate IS NULL               THEN 'Not Recorded'
          WHEN s.aggregate BETWEEN 6  AND 12     THEN '6 – 12'
          WHEN s.aggregate BETWEEN 13 AND 18     THEN '13 – 18'
          WHEN s.aggregate BETWEEN 19 AND 24     THEN '19 – 24'
          WHEN s.aggregate BETWEEN 25 AND 30     THEN '25 – 30'
          WHEN s.aggregate BETWEEN 31 AND 36     THEN '31 – 36'
          ELSE '37 and above'
        END AS "group"
      FROM students s WHERE s.school_id=$1 ${sc}
    )
    SELECT "group",
      COUNT(*) FILTER (WHERE gender='Male') AS male,
      COUNT(*) FILTER (WHERE gender='Female') AS female,
      COUNT(*) AS total
    FROM agg GROUP BY "group"
    ORDER BY CASE "group"
      WHEN '6 – 12' THEN 1 WHEN '13 – 18' THEN 2 WHEN '19 – 24' THEN 3
      WHEN '25 – 30' THEN 4 WHEN '31 – 36' THEN 5 WHEN '37 and above' THEN 6 ELSE 99
    END`,
  },
};
const TEACHER_REPORTS = {
  gender_summary: {
    label: 'Gender Summary', columns: ['Gender','Count','Percentage'], keys: ['group','count','pct'], hasPercentage: true,
    sql: sc => `SELECT COALESCE(t.gender,'Not Specified') AS "group", COUNT(*) AS count
      FROM teachers t WHERE t.school_id=$1 ${sc} GROUP BY t.gender ORDER BY t.gender NULLS LAST`,
  },
  department_distribution: {
    label: 'Department Distribution', columns: ['Department','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(t.department,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE t.gender='Male') AS male,
      COUNT(*) FILTER (WHERE t.gender='Female') AS female, COUNT(*) AS total
      FROM teachers t WHERE t.school_id=$1 ${sc} GROUP BY t.department ORDER BY t.department NULLS LAST`,
  },
  rank_distribution: {
    label: 'GES Rank Distribution', columns: ['Rank','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(t.rank,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE t.gender='Male') AS male,
      COUNT(*) FILTER (WHERE t.gender='Female') AS female, COUNT(*) AS total
      FROM teachers t WHERE t.school_id=$1 ${sc} GROUP BY t.rank ORDER BY total DESC`,
  },
  qualification_distribution: {
    label: 'Qualification Distribution', columns: ['Qualification','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(t.academic_qualification,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE t.gender='Male') AS male,
      COUNT(*) FILTER (WHERE t.gender='Female') AS female, COUNT(*) AS total
      FROM teachers t WHERE t.school_id=$1 ${sc} GROUP BY t.academic_qualification ORDER BY total DESC`,
  },
  association_distribution: {
    label: 'Association Distribution', columns: ['Association','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(t.association,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE t.gender='Male') AS male,
      COUNT(*) FILTER (WHERE t.gender='Female') AS female, COUNT(*) AS total
      FROM teachers t WHERE t.school_id=$1 ${sc} GROUP BY t.association ORDER BY total DESC`,
  },
};

function buildTotals(keys, rows, hasPercentage) {
  const t = { group: 'TOTAL' };
  for (const k of keys.slice(1)) {
    if (k === 'pct') { t[k] = '100%'; continue; }
    t[k] = rows.reduce((s, r) => s + (parseInt(r[k]) || 0), 0);
  }
  return t;
}
function addPct(rows, keys) {
  const grand = rows.reduce((s, r) => s + (parseInt(r[keys[1]]) || 0), 0);
  return rows.map(r => ({ ...r, pct: grand ? ((parseInt(r[keys[1]])/grand)*100).toFixed(1)+'%' : '0%' }));
}

router.get('/reports', async (req, res, next) => {
  try {
    const { scope = 'students', type, status = 'active' } = req.query;
    const catalogue = scope === 'teachers' ? TEACHER_REPORTS : STUDENT_REPORTS;
    const report    = type ? catalogue[type] : Object.values(catalogue)[0];
    if (!report) return res.status(400).json({ error: 'Unknown report type' });

    const alias = scope === 'teachers' ? 't' : 's';
    const sc    = status === 'all' ? '' : `AND ${alias}.status='Active'`;
    const { rows } = await pool.query(report.sql(sc), [req.schoolId]);
    const data   = report.hasPercentage ? addPct(rows, report.keys) : rows;
    const totals = buildTotals(report.keys, data, report.hasPercentage);
    res.json({ label: report.label, columns: report.columns, keys: report.keys, rows: data, totals });
  } catch (err) { next(err); }
});

// ── Fees (read-only summary for management) ───────────────────────────────────

async function feesModuleEnabled(schoolId) {
  const { rows } = await pool.query(
    `SELECT enabled FROM school_modules WHERE school_id=$1 AND module_key='fees'`,
    [schoolId]
  );
  // No rows = legacy school, treat as enabled
  return rows.length === 0 || rows[0].enabled;
}

router.get('/fees/summary', async (req, res, next) => {
  try {
    if (!await feesModuleEnabled(req.schoolId)) {
      return res.status(403).json({ error: 'Accounts & Fees module is not enabled for this school.' });
    }
    const sid = req.schoolId;
    const { rows } = await pool.query(
      `SELECT
         COALESCE((SELECT SUM(sb.amount) FROM student_bills sb WHERE sb.school_id=$1),0)   AS total_billed,
         COALESCE((SELECT SUM(fp.amount) FROM fee_payments fp WHERE fp.school_id=$1),0)    AS total_collected,
         COALESCE((SELECT SUM(se.amount) FROM school_expenses se WHERE se.school_id=$1),0) AS total_expenses,
         (SELECT COUNT(DISTINCT sb2.student_id) FROM student_bills sb2 WHERE sb2.school_id=$1)::int AS students_with_bills`,
      [sid]
    );
    const r = rows[0];
    const total_billed    = Number(r.total_billed);
    const total_collected = Number(r.total_collected);
    const total_expenses  = Number(r.total_expenses);
    res.json({
      total_billed,
      total_collected,
      outstanding:      total_billed - total_collected,
      collection_rate:  total_billed > 0 ? Math.round((total_collected / total_billed) * 100) : 0,
      total_expenses,
      net_position:     total_collected - total_expenses,
      students_with_bills: r.students_with_bills,
    });
  } catch (err) { next(err); }
});

router.get('/fees/class-breakdown', async (req, res, next) => {
  try {
    if (!await feesModuleEnabled(req.schoolId)) {
      return res.status(403).json({ error: 'Accounts & Fees module is not enabled.' });
    }
    const { rows } = await pool.query(
      `SELECT
         s.class_name,
         COUNT(DISTINCT sb.student_id)::int AS students_billed,
         SUM(sb.amount)                     AS total_billed,
         COALESCE(SUM(p.paid), 0)           AS total_collected,
         SUM(sb.amount) - COALESCE(SUM(p.paid), 0) AS outstanding
       FROM student_bills sb
       JOIN students s ON s.id = sb.student_id
       LEFT JOIN (
         SELECT bill_id, SUM(amount) AS paid
         FROM fee_payments WHERE school_id=$1 GROUP BY bill_id
       ) p ON p.bill_id = sb.id
       WHERE sb.school_id = $1
       GROUP BY s.class_name
       ORDER BY s.class_name`,
      [req.schoolId]
    );
    res.json(rows.map(r => ({
      class_name:       r.class_name,
      students_billed:  r.students_billed,
      total_billed:     Number(r.total_billed),
      total_collected:  Number(r.total_collected),
      outstanding:      Number(r.outstanding),
      collection_rate:  Number(r.total_billed) > 0
        ? Math.round((Number(r.total_collected) / Number(r.total_billed)) * 100) : 0,
    })));
  } catch (err) { next(err); }
});

router.get('/fees/income-vs-expenditure', async (req, res, next) => {
  try {
    if (!await feesModuleEnabled(req.schoolId)) {
      return res.status(403).json({ error: 'Accounts & Fees module is not enabled.' });
    }
    const sid = req.schoolId;
    const [incomeRes, expenseRes, byCat] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM fee_payments WHERE school_id=$1`, [sid]),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM school_expenses WHERE school_id=$1`, [sid]),
      pool.query(
        `SELECT category, SUM(amount) AS total FROM school_expenses
         WHERE school_id=$1 GROUP BY category ORDER BY total DESC`,
        [sid]
      ),
    ]);
    const income      = Number(incomeRes.rows[0].total);
    const expenditure = Number(expenseRes.rows[0].total);
    res.json({ income, expenditure, net: income - expenditure, by_category: byCat.rows });
  } catch (err) { next(err); }
});

// ── Results (academic results for a class) ────────────────────────────────────
// GET /api/principal/results?academic_year_id=&semester=&class_name=
router.get('/results', async (req, res, next) => {
  try {
    const { academic_year_id, semester, class_name } = req.query;
    if (!academic_year_id || !semester || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, and class_name are required' });
    }

    // Get CA settings
    const { rows: schoolRows } = await pool.query(
      'SELECT ca_percentage FROM schools WHERE id = $1', [req.schoolId]
    );
    const caPercentage  = schoolRows[0]?.ca_percentage ?? 30;
    const examPercentage = 100 - caPercentage;

    // Get active students in class
    const { rows: students } = await pool.query(
      `SELECT s.id, s.student_code, s.name, s.gender, s.picture_url,
              p.name AS program_name, p.exam_body
       FROM students s
       LEFT JOIN programs p ON p.id = s.program_id
       WHERE s.school_id = $1 AND s.class_name = $2 AND s.status = 'Active'
       ORDER BY s.name`,
      [req.schoolId, class_name]
    );

    if (!students.length) return res.json([]);

    // Get grade boundaries
    const { rows: boundaries } = await pool.query(
      'SELECT * FROM grade_boundaries WHERE school_id = $1 ORDER BY sort_order, min_pct DESC',
      [req.schoolId]
    );

    // Get all assessment modes
    const { rows: modes } = await pool.query(
      'SELECT * FROM assessment_modes WHERE school_id = $1', [req.schoolId]
    );

    // Get all assessments for this class/year/semester
    const { rows: assessments } = await pool.query(
      `SELECT a.id, a.subject, a.mode_id, a.max_score
       FROM assessments a
       WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3 AND a.class_name=$4`,
      [req.schoolId, academic_year_id, parseInt(semester), class_name]
    );

    // Get all CA scores
    const { rows: caScores } = await pool.query(
      `SELECT asc2.assessment_id, asc2.student_id, asc2.score, asc2.absent
       FROM assessment_scores asc2
       JOIN assessments a ON a.id = asc2.assessment_id
       WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3 AND a.class_name=$4`,
      [req.schoolId, academic_year_id, parseInt(semester), class_name]
    );

    // Get all exam scores
    const { rows: examScores } = await pool.query(
      `SELECT student_id, subject, score, max_score
       FROM exam_scores
       WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND class_name=$4`,
      [req.schoolId, academic_year_id, parseInt(semester), class_name]
    );

    // Get imported results as fallback
    const { rows: imported } = await pool.query(
      `SELECT student_id, subject, class_score, exam_score, total_score, grade, remarks
       FROM results_import
       WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3`,
      [req.schoolId, academic_year_id, parseInt(semester)]
    );

    // Build lookup maps
    const modeMap = new Map(modes.map(m => [m.id, m]));
    const boundaryMap = new Map(); // exam_body → sorted boundaries
    for (const b of boundaries) {
      if (!boundaryMap.has(b.exam_body)) boundaryMap.set(b.exam_body, []);
      boundaryMap.get(b.exam_body).push(b);
    }

    function getGrade(pct, examBody) {
      const bounds = [...(boundaryMap.get(examBody) || boundaryMap.get('WAEC') || [])]
        .sort((a, b) => parseFloat(b.min_pct) - parseFloat(a.min_pct));
      for (const b of bounds) {
        if (pct >= parseFloat(b.min_pct)) {
          return { grade: b.grade, remark: b.remark };
        }
      }
      // Built-in WAEC defaults
      if (pct >= 75) return { grade: 'A1', remark: 'Excellent' };
      if (pct >= 70) return { grade: 'B2', remark: 'Very Good' };
      if (pct >= 65) return { grade: 'B3', remark: 'Good' };
      if (pct >= 60) return { grade: 'C4', remark: 'Credit' };
      if (pct >= 55) return { grade: 'C5', remark: 'Credit' };
      if (pct >= 50) return { grade: 'C6', remark: 'Credit' };
      if (pct >= 45) return { grade: 'D7', remark: 'Pass' };
      if (pct >= 40) return { grade: 'E8', remark: 'Pass' };
      return { grade: 'F9', remark: 'Fail' };
    }

    // Index scores by student
    const caByStudent = {};   // studentId → assessmentId → score
    for (const s of caScores) {
      (caByStudent[s.student_id] ??= {})[s.assessment_id] = s;
    }
    const examByStudent = {}; // studentId → subject → {score, max_score}
    for (const e of examScores) {
      (examByStudent[e.student_id] ??= {})[e.subject] = e;
    }
    const importedByStudent = {}; // studentId → subject → row
    for (const i of imported) {
      (importedByStudent[i.student_id] ??= {})[i.subject] = i;
    }

    // Get all subjects taught in this class this semester
    const subjectSet = new Set([
      ...assessments.map(a => a.subject),
      ...examScores.map(e => e.subject),
      ...imported.map(i => i.subject),
    ]);
    const allSubjects = [...subjectSet].sort();

    // Compute per-student results
    const results = students.map(student => {
      const examBody = student.exam_body || 'WAEC';
      const studentSubjects = [];

      for (const subject of allSubjects) {
        const subjectAssessments = assessments.filter(a => a.subject === subject);
        const examEntry = (examByStudent[student.id] ?? {})[subject];
        const importEntry = (importedByStudent[student.id] ?? {})[subject];

        // Group assessments by mode
        const modeGroups = {};
        for (const a of subjectAssessments) {
          (modeGroups[a.mode_id] ??= []).push(a);
        }

        // Calculate CA
        let caScore = null;
        const totalConfiguredCA = modes.reduce((s, m) => s + parseFloat(m.ca_contribution || 0), 0);
        let hasAnyCA = false;

        if (Object.keys(modeGroups).length > 0) {
          let weightedSum = 0;
          for (const [modeId, modeAssessments] of Object.entries(modeGroups)) {
            const mode = modeMap.get(modeId);
            if (!mode) continue;
            const scores = modeAssessments.map(a => {
              const sc = (caByStudent[student.id] ?? {})[a.id];
              if (!sc || sc.absent) return null;
              return (parseFloat(sc.score) / parseFloat(a.max_score)) * 100;
            }).filter(s => s !== null);
            if (scores.length) {
              hasAnyCA = true;
              const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
              weightedSum += avg * parseFloat(mode.ca_contribution || 0);
            }
          }
          if (hasAnyCA) {
            caScore = totalConfiguredCA > 0 ? (weightedSum / totalConfiguredCA) * caPercentage : weightedSum;
          }
        }

        // Calculate exam
        let examScore = null;
        if (examEntry?.score != null) {
          examScore = (parseFloat(examEntry.score) / parseFloat(examEntry.max_score || 100)) * examPercentage;
        }

        let total = null, grade = null, remark = null, isImported = false;

        if (caScore !== null || examScore !== null) {
          total = Math.round((caScore ?? 0) + (examScore ?? 0));
          const g = getGrade(total, examBody);
          grade = g.grade; remark = g.remark;
        } else if (importEntry) {
          total = parseFloat(importEntry.total_score) || null;
          grade = importEntry.grade;
          remark = importEntry.remarks;
          isImported = true;
        }

        if (total === null && !isImported) continue; // skip subjects with no data

        studentSubjects.push({ subject, ca_score: caScore, exam_score: examScore, total, grade, remark, is_imported: isImported });
      }

      const totalsWithValues = studentSubjects.filter(s => s.total !== null);
      const average = totalsWithValues.length
        ? Math.round((totalsWithValues.reduce((s, sub) => s + sub.total, 0) / totalsWithValues.length) * 10) / 10
        : null;

      return { student_id: student.id, student_code: student.student_code, name: student.name,
               gender: student.gender, picture_url: student.picture_url,
               program_name: student.program_name, exam_body: examBody,
               ca_percentage: caPercentage, exam_percentage: examPercentage,
               subjects: studentSubjects, average, subject_count: totalsWithValues.length };
    });

    // Assign class positions
    const sorted = [...results].filter(r => r.average !== null).sort((a, b) => b.average - a.average);
    let pos = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].average !== sorted[i-1].average) pos = i + 1;
      const r = results.find(x => x.student_id === sorted[i].student_id);
      if (r) r.class_position = pos;
    }
    const classTotal = sorted.length;
    results.forEach(r => { r.class_total = classTotal; r.class_position = r.class_position ?? null; });

    res.json(results);
  } catch (err) { next(err); }
});

module.exports = router;
