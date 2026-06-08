const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// Middleware — ensure caller is an HOD (has a clearance office with office_type = 'hod')
// Attaches hodDept (string) and programmeId (uuid|null) to req.
async function hodOnly(req, res, next) {
  try {
    const { rows: officeRows } = await pool.query(
      `SELECT co.linked_programme_id, p.name AS programme_name
       FROM clearance_office_staff cos
       JOIN clearance_offices co ON co.id = cos.office_id
       LEFT JOIN programs p ON p.id = co.linked_programme_id
       WHERE cos.school_id = $1 AND cos.teacher_id = $2
         AND co.office_type = 'hod' AND co.is_active = true
       LIMIT 1`,
      [req.schoolId, req.user.id]
    );

    if (!officeRows.length) {
      return res.status(403).json({ error: 'HOD access only' });
    }

    // HOD's own department from their teacher record
    const { rows: tRows } = await pool.query(
      `SELECT department FROM teachers WHERE id = $1 AND school_id = $2 LIMIT 1`,
      [req.user.id, req.schoolId]
    );

    req.hodDept      = tRows[0]?.department ?? null;
    req.programmeId  = officeRows[0].linked_programme_id ?? null;
    req.programmeName = officeRows[0].programme_name ?? req.hodDept;

    // If no linked_programme_id, try to resolve by matching dept name to a programme
    if (!req.programmeId && req.hodDept) {
      const { rows: pRows } = await pool.query(
        `SELECT id, name FROM programs WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [req.schoolId, req.hodDept]
      );
      if (pRows.length) {
        req.programmeId   = pRows[0].id;
        req.programmeName = pRows[0].name;
      }
    }

    next();
  } catch (err) { next(err); }
}

// Helper — current academic year + semester
async function getCurrentYear(schoolId) {
  const { rows } = await pool.query(
    `SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`,
    [schoolId]
  );
  return rows[0] ?? null;
}

// ── GET /api/hod/overview ────────────────────────────────────────────────────
router.get('/overview', hodOnly, async (req, res, next) => {
  try {
    const ay = await getCurrentYear(req.schoolId);

    const [teacherRes, classRes, absenceRes, remedialRes, assessRes] = await Promise.all([
      // Total teachers in dept
      pool.query(
        `SELECT COUNT(*)::int AS count FROM teachers
         WHERE school_id = $1 AND LOWER(department) = LOWER($2) AND status = 'Active'`,
        [req.schoolId, req.hodDept ?? '']
      ),
      // Total classes + students in programme
      req.programmeId
        ? pool.query(
            `SELECT COUNT(DISTINCT class_name)::int AS class_count,
                    COUNT(*)::int AS student_count
             FROM students WHERE school_id = $1 AND program_id = $2 AND status = 'Active'`,
            [req.schoolId, req.programmeId]
          )
        : Promise.resolve({ rows: [{ class_count: 0, student_count: 0 }] }),
      // Outstanding absences (dept)
      pool.query(
        `SELECT COUNT(*)::int AS count FROM absences ab
         JOIN teachers t ON t.id = ab.teacher_id
         WHERE ab.school_id = $1
           AND LOWER(t.department) = LOWER($2)
           AND ab.status NOT IN ('Made Up','Cleared','Verified','Excused')`,
        [req.schoolId, req.hodDept ?? '']
      ),
      // Pending remedials (Scheduled + Completed not yet Verified)
      pool.query(
        `SELECT COUNT(*)::int AS count FROM remedial_lessons rl
         JOIN teachers t ON t.id = rl.teacher_id
         WHERE rl.school_id = $1
           AND LOWER(t.department) = LOWER($2)
           AND rl.status IN ('Scheduled','Completed')`,
        [req.schoolId, req.hodDept ?? '']
      ),
      // Assessments this semester
      ay
        ? pool.query(
            `SELECT COUNT(a.id)::int AS total,
                    COUNT(a.id) FILTER (
                      WHERE EXISTS (SELECT 1 FROM assessment_scores WHERE assessment_id = a.id)
                    )::int AS with_scores
             FROM assessments a
             JOIN teachers t ON t.id = a.teacher_id
             WHERE a.school_id = $1
               AND LOWER(t.department) = LOWER($2)
               AND a.academic_year_id = $3
               AND a.semester = $4`,
            [req.schoolId, req.hodDept ?? '', ay.id, ay.current_semester]
          )
        : Promise.resolve({ rows: [{ total: 0, with_scores: 0 }] }),
    ]);

    res.json({
      programme_name:      req.programmeName,
      department:          req.hodDept,
      teacher_count:       teacherRes.rows[0].count,
      class_count:         classRes.rows[0].class_count,
      student_count:       classRes.rows[0].student_count,
      outstanding_absences: absenceRes.rows[0].count,
      pending_remedials:   remedialRes.rows[0].count,
      assessments_total:   assessRes.rows[0].total,
      assessments_scored:  assessRes.rows[0].with_scores,
    });
  } catch (err) { next(err); }
});

// ── GET /api/hod/classes ─────────────────────────────────────────────────────
router.get('/classes', hodOnly, async (req, res, next) => {
  try {
    if (!req.programmeId) return res.json([]);
    const ay = await getCurrentYear(req.schoolId);

    const { rows } = await pool.query(
      `SELECT
         s.class_name,
         COUNT(s.id)::int        AS student_count,
         t.id                    AS form_teacher_id,
         t.name                  AS form_teacher_name,
         t.phone                 AS form_teacher_phone,
         t.email                 AS form_teacher_email
       FROM students s
       LEFT JOIN form_teacher_assignments fta
         ON fta.school_id = s.school_id
         AND LOWER(fta.class_name) = LOWER(s.class_name)
         AND fta.academic_year_id = $3
       LEFT JOIN teachers t ON t.id = fta.teacher_id
       WHERE s.school_id = $1 AND s.program_id = $2 AND s.status = 'Active'
       GROUP BY s.class_name, t.id, t.name, t.phone, t.email
       ORDER BY s.class_name`,
      [req.schoolId, req.programmeId, ay?.id ?? '00000000-0000-0000-0000-000000000000']
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/hod/teachers ────────────────────────────────────────────────────
router.get('/teachers', hodOnly, async (req, res, next) => {
  try {
    if (!req.hodDept) return res.json([]);
    const ay = await getCurrentYear(req.schoolId);

    const { rows } = await pool.query(
      `SELECT
         t.id, t.name, t.email, t.phone, t.teacher_code,
         -- Outstanding absences
         COUNT(DISTINCT ab.id) FILTER (
           WHERE ab.status NOT IN ('Made Up','Cleared','Verified','Excused')
         )::int AS outstanding_absences,
         -- Pending remedials
         COUNT(DISTINCT rl.id) FILTER (
           WHERE rl.status IN ('Scheduled','Completed')
         )::int AS pending_remedials,
         -- Last attendance submission
         MAX(a.date)::text AS last_attendance_date,
         -- Assessments this semester
         COUNT(DISTINCT ass.id)::int AS assessments_total,
         COUNT(DISTINCT ass.id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM assessment_scores sc WHERE sc.assessment_id = ass.id
           )
         )::int AS assessments_with_scores,
         -- Form class assignment
         fta.class_name AS form_class
       FROM teachers t
       LEFT JOIN absences ab
         ON ab.teacher_id = t.id AND ab.school_id = t.school_id
       LEFT JOIN remedial_lessons rl
         ON rl.teacher_id = t.id AND rl.school_id = t.school_id
       LEFT JOIN attendance a
         ON a.teacher_id = t.id AND a.school_id = t.school_id
       LEFT JOIN assessments ass
         ON ass.teacher_id = t.id AND ass.school_id = t.school_id
         AND ass.academic_year_id = $3 AND ass.semester = $4
       LEFT JOIN form_teacher_assignments fta
         ON fta.teacher_id = t.id AND fta.school_id = t.school_id
         AND fta.academic_year_id = $3
       WHERE t.school_id = $1 AND LOWER(t.department) = LOWER($2) AND t.status = 'Active'
       GROUP BY t.id, t.name, t.email, t.phone, t.teacher_code, fta.class_name
       ORDER BY t.name`,
      [req.schoolId, req.hodDept, ay?.id ?? '00000000-0000-0000-0000-000000000000', ay?.current_semester ?? 1]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/hod/absences ────────────────────────────────────────────────────
router.get('/absences', hodOnly, async (req, res, next) => {
  try {
    if (!req.hodDept) return res.json([]);
    const { teacherId, status } = req.query;
    const params  = [req.schoolId, req.hodDept];
    const filters = [];
    if (teacherId) { params.push(teacherId); filters.push(`ab.teacher_id = $${params.length}`); }
    if (status)    { params.push(status);    filters.push(`ab.status = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT ab.id, ab.date::text AS date, ab.subject, ab.class_name,
              ab.status, ab.reason, ab.periods_lost, ab.scheduled_period,
              t.id AS teacher_id, t.name AS teacher_name
       FROM absences ab
       JOIN teachers t ON t.id = ab.teacher_id
       WHERE ab.school_id = $1 AND LOWER(t.department) = LOWER($2)
         ${filters.length ? 'AND ' + filters.join(' AND ') : ''}
       ORDER BY ab.date DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
