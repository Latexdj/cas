const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// Middleware — verify HOD and attach context to req:
//   req.hodDept      — teacher's department string
//   req.programmeId  — UUID if a programme is linked, null for subject HODs
//   req.programmeName — display name
//   req.isSubjectHod — true when department is a subject (Maths, English…), not a programme
//
// Access is granted via EITHER:
//   (a) a clearance office with office_type = 'hod'  (programme HODs who do clearance)
//   (b) a responsibility assignment with module_key = 'hod'  (subject HODs — no clearance)
async function hodOnly(req, res, next) {
  try {
    const [{ rows: officeRows }, { rows: respRows }] = await Promise.all([
      pool.query(
        `SELECT co.linked_programme_id, p.name AS programme_name
         FROM clearance_office_staff cos
         JOIN clearance_offices co ON co.id = cos.office_id
         LEFT JOIN programs p ON p.id = co.linked_programme_id
         WHERE cos.school_id = $1 AND cos.teacher_id = $2
           AND co.office_type = 'hod' AND co.is_active = true
         LIMIT 1`,
        [req.schoolId, req.user.id]
      ),
      pool.query(
        `SELECT 1 FROM teacher_responsibility_assignments tra
         JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
         WHERE tra.teacher_id = $1 AND tr.school_id = $2 AND tr.module_key = 'hod'
         LIMIT 1`,
        [req.user.id, req.schoolId]
      ),
    ]);

    if (!officeRows.length && !respRows.length)
      return res.status(403).json({ error: 'HOD access only' });

    const { rows: tRows } = await pool.query(
      `SELECT department FROM teachers WHERE id = $1 AND school_id = $2 LIMIT 1`,
      [req.user.id, req.schoolId]
    );

    req.hodDept      = tRows[0]?.department ?? null;
    req.programmeId  = officeRows[0]?.linked_programme_id ?? null;
    req.programmeName = officeRows[0]?.programme_name ?? req.hodDept;

    // Try to match department name to a programme (programme HODs without explicit link)
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

    // Subject HOD = no programme found — department IS the subject name
    req.isSubjectHod = !req.programmeId;
    next();
  } catch (err) { next(err); }
}

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
    const ay   = await getCurrentYear(req.schoolId);
    const dept = req.hodDept ?? '';

    // Class + student count differs by HOD type
    const classStudentQuery = req.isSubjectHod
      // Subject HOD: classes that dept teachers teach this subject on the timetable
      ? pool.query(
          `SELECT
             COUNT(DISTINCT LOWER(TRIM(cls)))::int AS class_count,
             COUNT(DISTINCT s.id)::int             AS student_count
           FROM timetable tt
           JOIN teachers te ON te.id = tt.teacher_id
           CROSS JOIN LATERAL unnest(string_to_array(tt.class_names, ',')) AS cls
           LEFT JOIN students s
             ON s.school_id = tt.school_id
             AND LOWER(s.class_name) = LOWER(TRIM(cls))
             AND s.status = 'Active'
           WHERE tt.school_id = $1
             AND LOWER(te.department) = LOWER($2)
             AND LOWER(tt.subject)    = LOWER($2)`,
          [req.schoolId, dept]
        )
      // Programme HOD: students with matching program_id
      : pool.query(
          `SELECT COUNT(DISTINCT class_name)::int AS class_count,
                  COUNT(*)::int                   AS student_count
           FROM students WHERE school_id = $1 AND program_id = $2 AND status = 'Active'`,
          [req.schoolId, req.programmeId]
        );

    // For subject HODs, filter absences and assessments by subject too
    const absenceQuery = pool.query(
      `SELECT COUNT(*)::int AS count FROM absences ab
       JOIN teachers t ON t.id = ab.teacher_id
       WHERE ab.school_id = $1
         AND LOWER(t.department) = LOWER($2)
         ${req.isSubjectHod ? `AND LOWER(ab.subject) = LOWER($2)` : ''}
         AND ab.status NOT IN ('Made Up','Cleared','Verified','Excused')`,
      [req.schoolId, dept]
    );

    const remedialQuery = pool.query(
      `SELECT COUNT(*)::int AS count FROM remedial_lessons rl
       JOIN teachers t ON t.id = rl.teacher_id
       WHERE rl.school_id = $1
         AND LOWER(t.department) = LOWER($2)
         ${req.isSubjectHod ? `AND LOWER(rl.subject) = LOWER($2)` : ''}
         AND rl.status IN ('Scheduled','Completed')`,
      [req.schoolId, dept]
    );

    const assessQuery = ay
      ? pool.query(
          `SELECT COUNT(a.id)::int AS total,
                  COUNT(a.id) FILTER (
                    WHERE EXISTS (SELECT 1 FROM assessment_scores WHERE assessment_id = a.id)
                  )::int AS with_scores
           FROM assessments a
           JOIN teachers t ON t.id = a.teacher_id
           WHERE a.school_id = $1
             AND LOWER(t.department) = LOWER($2)
             ${req.isSubjectHod ? `AND LOWER(a.subject) = LOWER($2)` : ''}
             AND a.academic_year_id = $3
             AND a.semester = $4`,
          [req.schoolId, dept, ay.id, ay.current_semester]
        )
      : Promise.resolve({ rows: [{ total: 0, with_scores: 0 }] });

    const teacherQuery = pool.query(
      `SELECT COUNT(*)::int AS count FROM teachers
       WHERE school_id = $1 AND LOWER(department) = LOWER($2) AND status = 'Active'`,
      [req.schoolId, dept]
    );

    const [teacherRes, classRes, absenceRes, remedialRes, assessRes] = await Promise.all([
      teacherQuery, classStudentQuery, absenceQuery, remedialQuery, assessQuery,
    ]);

    res.json({
      hod_type:            req.isSubjectHod ? 'subject' : 'programme',
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
    const dept = req.hodDept ?? '';
    const ay   = await getCurrentYear(req.schoolId);

    if (req.isSubjectHod) {
      // Subject HOD: derive classes from timetable — one row per class showing the subject teacher
      const { rows } = await pool.query(
        `SELECT
           TRIM(cls)               AS class_name,
           te.id                   AS teacher_id,
           te.name                 AS teacher_name,
           te.phone                AS teacher_phone,
           te.email                AS teacher_email,
           COUNT(DISTINCT s.id)::int AS student_count
         FROM timetable tt
         JOIN teachers te ON te.id = tt.teacher_id
         CROSS JOIN LATERAL unnest(string_to_array(tt.class_names, ',')) AS cls
         LEFT JOIN students s
           ON s.school_id = tt.school_id
           AND LOWER(s.class_name) = LOWER(TRIM(cls))
           AND s.status = 'Active'
         WHERE tt.school_id = $1
           AND LOWER(te.department) = LOWER($2)
           AND LOWER(tt.subject)    = LOWER($2)
         GROUP BY TRIM(cls), te.id, te.name, te.phone, te.email
         ORDER BY TRIM(cls)`,
        [req.schoolId, dept]
      );
      return res.json(rows);
    }

    // Programme HOD: derive classes from students, show form teacher
    const { rows } = await pool.query(
      `SELECT
         s.class_name,
         COUNT(s.id)::int  AS student_count,
         t.id              AS form_teacher_id,
         t.name            AS form_teacher_name,
         t.phone           AS form_teacher_phone,
         t.email           AS form_teacher_email
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
    const ay   = await getCurrentYear(req.schoolId);
    const dept = req.hodDept;

    // For subject HODs, scope absences, remedials, attendance, and assessments to their subject
    const subjectFilter = req.isSubjectHod ? `AND LOWER($5) = LOWER($5)` : ''; // placeholder — handled inline below

    const { rows } = await pool.query(
      `SELECT
         t.id, t.name, t.email, t.phone, t.teacher_code,
         COUNT(DISTINCT ab.id) FILTER (
           WHERE ab.status NOT IN ('Made Up','Cleared','Verified','Excused')
             ${req.isSubjectHod ? `AND LOWER(ab.subject) = LOWER($2)` : ''}
         )::int AS outstanding_absences,
         COUNT(DISTINCT rl.id) FILTER (
           WHERE rl.status IN ('Scheduled','Completed')
             ${req.isSubjectHod ? `AND LOWER(rl.subject) = LOWER($2)` : ''}
         )::int AS pending_remedials,
         MAX(a.date)::text AS last_attendance_date,
         COUNT(DISTINCT ass.id)::int AS assessments_total,
         COUNT(DISTINCT ass.id) FILTER (
           WHERE EXISTS (SELECT 1 FROM assessment_scores sc WHERE sc.assessment_id = ass.id)
         )::int AS assessments_with_scores,
         fta.class_name AS form_class
       FROM teachers t
       LEFT JOIN absences ab
         ON ab.teacher_id = t.id AND ab.school_id = t.school_id
       LEFT JOIN remedial_lessons rl
         ON rl.teacher_id = t.id AND rl.school_id = t.school_id
       LEFT JOIN attendance a
         ON a.teacher_id = t.id AND a.school_id = t.school_id
         ${req.isSubjectHod ? `AND LOWER(a.subject) = LOWER($2)` : ''}
       LEFT JOIN assessments ass
         ON ass.teacher_id = t.id AND ass.school_id = t.school_id
         AND ass.academic_year_id = $3 AND ass.semester = $4
         ${req.isSubjectHod ? `AND LOWER(ass.subject) = LOWER($2)` : ''}
       LEFT JOIN form_teacher_assignments fta
         ON fta.teacher_id = t.id AND fta.school_id = t.school_id
         AND fta.academic_year_id = $3
       WHERE t.school_id = $1 AND LOWER(t.department) = LOWER($2) AND t.status = 'Active'
       GROUP BY t.id, t.name, t.email, t.phone, t.teacher_code, fta.class_name
       ORDER BY t.name`,
      [req.schoolId, dept, ay?.id ?? '00000000-0000-0000-0000-000000000000', ay?.current_semester ?? 1]
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

    // Subject HODs only see absences for their subject
    if (req.isSubjectHod) filters.push(`LOWER(ab.subject) = LOWER($2)`);
    if (teacherId) { params.push(teacherId); filters.push(`ab.teacher_id = $${params.length}`); }
    if (status)    { params.push(status);    filters.push(`ab.status = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT ab.id, ab.date::text AS date, ab.subject, ab.class_name,
              ab.status, ab.reason, ab.periods_lost,
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
