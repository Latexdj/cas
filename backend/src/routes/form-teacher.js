const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription, adminOnly } = require('../middleware/auth');
const { queryFlaggedStudents } = require('../utils/discipline-flags');

router.use(authenticate, requireActiveSubscription);

// Helper â€” look up teacher's form class assignment for a given year
async function getFormClass(schoolId, teacherId, academicYearId) {
  const { rows } = await pool.query(
    `SELECT fta.id, fta.class_name, fta.academic_year_id, ay.name AS academic_year
     FROM form_teacher_assignments fta
     JOIN academic_years ay ON ay.id = fta.academic_year_id
     WHERE fta.school_id = $1 AND fta.teacher_id = $2 AND fta.academic_year_id = $3`,
    [schoolId, teacherId, academicYearId]
  );
  return rows[0] || null;
}

// â”€â”€ Teacher-facing endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/form-teacher/assignment?academic_year_id=
// Returns this teacher's form class (uses current year if param omitted).
router.get('/assignment', async (req, res, next) => {
  try {
    let { academic_year_id } = req.query;
    if (!academic_year_id) {
      const { rows } = await pool.query(
        `SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
        [req.schoolId]
      );
      academic_year_id = rows[0]?.id;
    }
    if (!academic_year_id) return res.json(null);

    const assignment = await getFormClass(req.schoolId, req.user.id, academic_year_id);
    res.json(assignment || null);
  } catch (err) { next(err); }
});

// GET /api/form-teacher/students?academic_year_id=&semester=
// Students in form class with attendance summary and remarks status.
router.get('/students', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id) return res.status(400).json({ error: 'academic_year_id required' });

    const assignment = await getFormClass(req.schoolId, req.user.id, academic_year_id);
    if (!assignment) return res.status(404).json({ error: 'No form class assignment for this year' });

    const { class_name } = assignment;

    const { rows: students } = await pool.query(
      `SELECT s.id, s.student_code, s.name, s.gender, s.picture_url,
              s.residential_status, s.house, p.name AS program_name
       FROM students s
       LEFT JOIN programs p ON p.id = s.program_id
       WHERE s.school_id = $1 AND LOWER(s.class_name) = LOWER($2) AND s.status = 'Active'
       ORDER BY s.name`,
      [req.schoolId, class_name]
    );
    if (!students.length) return res.json([]);

    const studentIds = students.map(s => s.id);
    const semInt     = semester ? parseInt(semester) : null;

    // Attendance summary (present + late counts as "attended")
    const semClause  = semInt ? `AND s.semester = ${semInt}` : '';
    const { rows: attRows } = await pool.query(
      `SELECT
         r.student_id,
         COUNT(*)                                      AS total,
         COUNT(*) FILTER (WHERE r.status = 'Present') AS present,
         COUNT(*) FILTER (WHERE r.status = 'Absent')  AS absent,
         COUNT(*) FILTER (WHERE r.status = 'Late')    AS late
       FROM student_attendance_records r
       JOIN student_attendance_sessions s ON s.id = r.session_id
       WHERE s.school_id = $1 AND s.academic_year_id = $2 ${semClause}
         AND LOWER(s.class_name) = LOWER($3)
         AND r.student_id = ANY($4::uuid[])
       GROUP BY r.student_id`,
      [req.schoolId, academic_year_id, class_name, studentIds]
    );
    const attMap = {};
    for (const r of attRows) {
      const total   = parseInt(r.total);
      const present = parseInt(r.present);
      const late    = parseInt(r.late);
      attMap[r.student_id] = {
        present, absent: parseInt(r.absent), late, total,
        pct: total > 0 ? Math.round(((present + late) / total) * 100) : null,
      };
    }

    // Which students already have remarks saved for this semester
    const remarksSet = new Set();
    if (semInt) {
      const { rows: remRows } = await pool.query(
        `SELECT student_id FROM report_remarks
         WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3
           AND student_id = ANY($4::uuid[])`,
        [req.schoolId, academic_year_id, semInt, studentIds]
      );
      for (const r of remRows) remarksSet.add(r.student_id);
    }

    res.json(students.map(s => ({
      ...s,
      attendance:  attMap[s.id] ?? { present: 0, absent: 0, late: 0, total: 0, pct: null },
      has_remarks: remarksSet.has(s.id),
    })));
  } catch (err) { next(err); }
});

// GET /api/form-teacher/attendance?academic_year_id=&semester=
// Per-student attendance breakdown for the form class.
router.get('/attendance', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'academic_year_id and semester required' });
    }

    const assignment = await getFormClass(req.schoolId, req.user.id, academic_year_id);
    if (!assignment) return res.status(404).json({ error: 'No form class assignment' });

    const { class_name } = assignment;
    const { rows: students } = await pool.query(
      `SELECT id FROM students WHERE school_id = $1 AND LOWER(class_name) = LOWER($2) AND status = 'Active'`,
      [req.schoolId, class_name]
    );
    if (!students.length) return res.json([]);
    const studentIds = students.map(s => s.id);

    const { rows } = await pool.query(
      `SELECT
         r.student_id,
         st.name, st.student_code, st.picture_url, st.gender,
         COUNT(*)                                      AS total,
         COUNT(*) FILTER (WHERE r.status = 'Present') AS present,
         COUNT(*) FILTER (WHERE r.status = 'Absent')  AS absent,
         COUNT(*) FILTER (WHERE r.status = 'Late')    AS late
       FROM student_attendance_records r
       JOIN student_attendance_sessions s  ON s.id  = r.session_id
       JOIN students                   st ON st.id = r.student_id
       WHERE s.school_id = $1 AND s.academic_year_id = $2 AND s.semester = $3
         AND LOWER(s.class_name) = LOWER($4)
         AND r.student_id = ANY($5::uuid[])
       GROUP BY r.student_id, st.name, st.student_code, st.picture_url, st.gender
       ORDER BY st.name`,
      [req.schoolId, academic_year_id, parseInt(semester), class_name, studentIds]
    );

    res.json(rows.map(r => {
      const total = parseInt(r.total), present = parseInt(r.present), late = parseInt(r.late);
      return {
        student_id: r.student_id, name: r.name,
        student_code: r.student_code, picture_url: r.picture_url, gender: r.gender,
        present, absent: parseInt(r.absent), late, total,
        pct: total > 0 ? Math.round(((present + late) / total) * 100) : null,
      };
    }));
  } catch (err) { next(err); }
});

// GET /api/form-teacher/remarks?academic_year_id=&semester=
router.get('/remarks', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'academic_year_id and semester required' });
    }

    const assignment = await getFormClass(req.schoolId, req.user.id, academic_year_id);
    if (!assignment) return res.status(404).json({ error: 'No form class assignment' });

    const { rows } = await pool.query(
      `SELECT rr.student_id, rr.attitude, rr.conduct, rr.general_remarks
       FROM report_remarks rr
       JOIN students s ON s.id = rr.student_id
       WHERE rr.school_id = $1 AND rr.academic_year_id = $2 AND rr.semester = $3
         AND LOWER(s.class_name) = LOWER($4)`,
      [req.schoolId, academic_year_id, parseInt(semester), assignment.class_name]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/form-teacher/remarks
// Body: { academic_year_id, semester, remarks: [{ student_id, attitude, conduct, general_remarks }] }
router.post('/remarks', async (req, res, next) => {
  try {
    const { academic_year_id, semester, remarks } = req.body;
    if (!academic_year_id || !semester || !Array.isArray(remarks)) {
      return res.status(400).json({ error: 'academic_year_id, semester, remarks[] required' });
    }

    const assignment = await getFormClass(req.schoolId, req.user.id, academic_year_id);
    if (!assignment) return res.status(403).json({ error: 'No form class assignment' });

    for (const r of remarks) {
      await pool.query(
        `INSERT INTO report_remarks
           (school_id, student_id, academic_year_id, semester, attitude, conduct, general_remarks, ai_drafted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (school_id, student_id, academic_year_id, semester)
         DO UPDATE SET attitude=$5, conduct=$6, general_remarks=$7, ai_drafted=$8, updated_at=now()`,
        [req.schoolId, r.student_id, academic_year_id, parseInt(semester),
         r.attitude || null, r.conduct || null, r.general_remarks || null,
         r.ai_drafted === true]
      );
    }
    res.json({ saved: remarks.length });
  } catch (err) { next(err); }
});

// â”€â”€ Admin endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/form-teacher/admin/assignments?academic_year_id=
router.get('/admin/assignments', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id } = req.query;
    const params = [req.schoolId];
    let filter = '';
    if (academic_year_id) { params.push(academic_year_id); filter = `AND fta.academic_year_id = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT fta.id, fta.class_name, fta.teacher_id, fta.academic_year_id,
              t.name AS teacher_name, t.teacher_code, ay.name AS academic_year
       FROM form_teacher_assignments fta
       JOIN teachers t      ON t.id  = fta.teacher_id
       JOIN academic_years ay ON ay.id = fta.academic_year_id
       WHERE fta.school_id = $1 ${filter}
       ORDER BY ay.name DESC, fta.class_name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/form-teacher/admin/assignments
// Body: { teacher_id, class_name, academic_year_id }
router.post('/admin/assignments', adminOnly, async (req, res, next) => {
  try {
    const { teacher_id, class_name, academic_year_id } = req.body;
    if (!teacher_id || !class_name || !academic_year_id) {
      return res.status(400).json({ error: 'teacher_id, class_name, academic_year_id required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO form_teacher_assignments (school_id, teacher_id, class_name, academic_year_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (school_id, class_name, academic_year_id)
       DO UPDATE SET teacher_id = EXCLUDED.teacher_id, updated_at = now()
       RETURNING *`,
      [req.schoolId, teacher_id, class_name.trim(), academic_year_id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/form-teacher/admin/assignments/copy-from-year
// Body: { from_year_id, to_year_id }
// Copies assignments from one year to another. Skips classes already assigned in
// the target year (preserves any manual edits already made) and skips inactive teachers.
router.post('/admin/assignments/copy-from-year', adminOnly, async (req, res, next) => {
  try {
    const { from_year_id, to_year_id } = req.body;
    if (!from_year_id || !to_year_id) return res.status(400).json({ error: 'from_year_id and to_year_id required' });
    if (from_year_id === to_year_id) return res.status(400).json({ error: 'Cannot copy to the same year' });

    const { rows: source } = await pool.query(
      `SELECT fta.class_name, fta.teacher_id, t.status AS teacher_status
       FROM form_teacher_assignments fta
       JOIN teachers t ON t.id = fta.teacher_id AND t.school_id = fta.school_id
       WHERE fta.school_id = $1 AND fta.academic_year_id = $2`,
      [req.schoolId, from_year_id]
    );

    const { rows: existing } = await pool.query(
      `SELECT class_name FROM form_teacher_assignments WHERE school_id = $1 AND academic_year_id = $2`,
      [req.schoolId, to_year_id]
    );
    const existingClasses = new Set(existing.map(r => r.class_name));

    let copied = 0, skipped_existing = 0, skipped_inactive = 0;

    for (const row of source) {
      if (existingClasses.has(row.class_name)) { skipped_existing++; continue; }
      if (row.teacher_status !== 'Active') { skipped_inactive++; continue; }
      await pool.query(
        `INSERT INTO form_teacher_assignments (school_id, teacher_id, class_name, academic_year_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (school_id, class_name, academic_year_id) DO NOTHING`,
        [req.schoolId, row.teacher_id, row.class_name, to_year_id]
      );
      copied++;
    }

    res.json({ copied, skipped_existing, skipped_inactive });
  } catch (err) { next(err); }
});

// DELETE /api/form-teacher/admin/assignments/:id
router.delete('/admin/assignments/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM form_teacher_assignments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// GET /api/form-teacher/flagged-students
// Returns flagged students in this teacher's form class for the current year.
// Low + medium + high flags all visible (form master needs the full picture for their class).
router.get('/flagged-students', async (req, res, next) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teacher access only' });

    const { rows: ayRows } = await pool.query(
      `SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
      [req.schoolId]
    );
    const ayId = ayRows[0]?.id;
    if (!ayId) return res.json({ students: [], class_name: null });

    const assignment = await getFormClass(req.schoolId, req.user.id, ayId);
    if (!assignment) return res.json({ students: [], class_name: null });

    const students = await queryFlaggedStudents(pool, req.schoolId, assignment.class_name);
    res.json({ students, class_name: assignment.class_name });
  } catch (err) { next(err); }
});

// GET /api/form-teacher/student-letters/:student_id
// Returns discipline letters for a student in this teacher's form class.
// Scoped: only students in the teacher's current-year form class. Excludes pending_approval letters.
router.get('/student-letters/:student_id', async (req, res, next) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teacher access only' });

    const { rows: ayRows } = await pool.query(
      `SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
      [req.schoolId]
    );
    const ayId = ayRows[0]?.id;
    if (!ayId) return res.status(400).json({ error: 'No current academic year' });

    const assignment = await getFormClass(req.schoolId, req.user.id, ayId);
    if (!assignment) return res.status(403).json({ error: 'No form class assignment for this year' });

    const { rows: sRows } = await pool.query(
      `SELECT id, class_name, name FROM students WHERE id = $1 AND school_id = $2`,
      [req.params.student_id, req.schoolId]
    );
    if (!sRows.length) return res.status(404).json({ error: 'Student not found' });
    if (sRows[0].class_name.toLowerCase() !== assignment.class_name.toLowerCase())
      return res.status(403).json({ error: 'Student is not in your form class' });

    const { rows } = await pool.query(
      `SELECT sdl.id, sdl.ref_number, sdl.letter_type, sdl.offense_category, sdl.offense_other,
              sdl.subject, sdl.issued_date::text, sdl.status, sdl.created_at,
              sdl.acknowledged_at, sdl.resolved_at, sdl.resolution_notes,
              sdl.issued_by_name, sdl.semester,
              ay.name AS academic_year_name
       FROM student_disciplinary_letters sdl
       LEFT JOIN academic_years ay ON ay.id = sdl.academic_year_id
       WHERE sdl.student_id = $1
         AND sdl.school_id  = $2
         AND sdl.status    != 'pending_approval'
       ORDER BY sdl.issued_date DESC`,
      [req.params.student_id, req.schoolId]
    );
    res.json({ student_name: sRows[0].name, class_name: sRows[0].class_name, letters: rows });
  } catch (err) { next(err); }
});

module.exports = router;

