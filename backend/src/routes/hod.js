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
//   (a) departments table — teacher is head_teacher_id of a department  [primary path]
//   (b) clearance office with office_type = 'hod'  [fallback for legacy assignments]
async function hodOnly(req, res, next) {
  try {
    const [{ rows: deptRows }, { rows: officeRows }] = await Promise.all([
      // Primary: Departments page assignment
      pool.query(
        `SELECT d.name AS dept_name
         FROM departments d
         WHERE d.school_id = $1 AND d.head_teacher_id = $2
         LIMIT 1`,
        [req.schoolId, req.user.id]
      ),
      // Fallback: legacy clearance-office HOD assignment
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
    ]);

    if (!deptRows.length && !officeRows.length)
      return res.status(403).json({ error: 'HOD access only' });

    if (deptRows.length) {
      // Departments page HOD — always a subject HOD; no programme name lookup
      req.hodDept       = deptRows[0].dept_name;
      req.programmeId   = null;
      req.programmeName = deptRows[0].dept_name;
      req.isSubjectHod  = true;
    } else {
      // clearance-office path
      const { rows: tRows } = await pool.query(
        `SELECT department FROM teachers WHERE id = $1 AND school_id = $2 LIMIT 1`,
        [req.user.id, req.schoolId]
      );
      req.hodDept       = tRows[0]?.department ?? null;
      req.programmeId   = officeRows[0]?.linked_programme_id ?? null;
      req.programmeName = officeRows[0]?.programme_name ?? req.hodDept;

      // Only on clearance-office path: fallback to matching dept name against programme names
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
      req.isSubjectHod = !req.programmeId;
    }
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
      // Subject HOD: classes that any teacher in this department teaches
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
             AND LOWER(te.department) = LOWER($2)`,
          [req.schoolId, dept]
        )
      // Programme HOD: students with matching program_id
      : pool.query(
          `SELECT COUNT(DISTINCT class_name)::int AS class_count,
                  COUNT(*)::int                   AS student_count
           FROM students WHERE school_id = $1 AND program_id = $2 AND status = 'Active'`,
          [req.schoolId, req.programmeId]
        );

    const absenceQuery = pool.query(
      `SELECT COUNT(*)::int AS count FROM absences ab
       JOIN teachers t ON t.id = ab.teacher_id
       WHERE ab.school_id = $1
         AND LOWER(t.department) = LOWER($2)
         AND ab.status NOT IN ('Made Up','Cleared','Verified','Excused')`,
      [req.schoolId, dept]
    );

    const remedialQuery = pool.query(
      `SELECT COUNT(*)::int AS count FROM remedial_lessons rl
       JOIN teachers t ON t.id = rl.teacher_id
       WHERE rl.school_id = $1
         AND LOWER(t.department) = LOWER($2)
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

    const { rows } = await pool.query(
      `SELECT
         t.id, t.name, t.email, t.phone, t.teacher_code,
         COUNT(DISTINCT ab.id) FILTER (
           WHERE ab.status NOT IN ('Made Up','Cleared','Verified','Excused')
         )::int AS outstanding_absences,
         COUNT(DISTINCT rl.id) FILTER (
           WHERE rl.status IN ('Scheduled','Completed')
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
       LEFT JOIN assessments ass
         ON ass.teacher_id = t.id AND ass.school_id = t.school_id
         AND ass.academic_year_id = $3 AND ass.semester = $4
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

    // Absences are scoped to the department via the teachers JOIN below
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

// ── GET /api/hod/results ─────────────────────────────────────────────────────
// GET /api/hod/results?academic_year_id=&semester=&class_name=
router.get('/results', hodOnly, async (req, res, next) => {
  try {
    const { academic_year_id, semester, class_name } = req.query;
    if (!academic_year_id || !semester || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, and class_name are required' });
    }

    // Verify this class belongs to HOD's dept/programme
    if (req.programmeId) {
      const { rows } = await pool.query(
        `SELECT 1 FROM students WHERE school_id=$1 AND class_name=$2 AND program_id=$3 AND status='Active' LIMIT 1`,
        [req.schoolId, class_name, req.programmeId]
      );
      if (!rows.length) return res.status(403).json({ error: 'Class not in your programme.' });
    }
    // Subject HODs don't have a programme restriction — they can see any class that has their subject

    // Get CA settings
    const { rows: schoolRows } = await pool.query('SELECT ca_percentage FROM schools WHERE id=$1', [req.schoolId]);
    const caPercentage = schoolRows[0]?.ca_percentage ?? 30;
    const examPercentage = 100 - caPercentage;

    const { rows: students } = await pool.query(
      `SELECT s.id, s.student_code, s.name, s.gender,
              p.name AS program_name, p.exam_body
       FROM students s LEFT JOIN programs p ON p.id=s.program_id
       WHERE s.school_id=$1 AND s.class_name=$2 AND s.status='Active' ORDER BY s.name`,
      [req.schoolId, class_name]
    );
    if (!students.length) return res.json([]);

    const { rows: boundaries } = await pool.query(
      'SELECT * FROM grade_boundaries WHERE school_id=$1 ORDER BY sort_order, min_pct DESC',
      [req.schoolId]
    );
    const { rows: modes } = await pool.query(
      'SELECT * FROM assessment_modes WHERE school_id=$1',
      [req.schoolId]
    );
    const { rows: assessments } = await pool.query(
      'SELECT id, subject, mode_id, max_score FROM assessments WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND class_name=$4',
      [req.schoolId, academic_year_id, parseInt(semester), class_name]
    );
    const { rows: caScores } = await pool.query(
      `SELECT asc2.assessment_id, asc2.student_id, asc2.score, asc2.absent
       FROM assessment_scores asc2 JOIN assessments a ON a.id=asc2.assessment_id
       WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3 AND a.class_name=$4`,
      [req.schoolId, academic_year_id, parseInt(semester), class_name]
    );
    const { rows: examScores } = await pool.query(
      'SELECT student_id, subject, score, max_score FROM exam_scores WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND class_name=$4',
      [req.schoolId, academic_year_id, parseInt(semester), class_name]
    );

    const modeMap = new Map(modes.map(m => [m.id, m]));
    const boundaryList = boundaries;

    function getGrade(pct, examBody) {
      const bounds = boundaryList.filter(b => b.exam_body === (examBody || 'WAEC'));
      for (const b of bounds) {
        if (pct >= parseFloat(b.min_pct) && pct <= parseFloat(b.max_pct)) return { grade: b.grade, remark: b.remark };
      }
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

    const caByStudent = {};
    for (const s of caScores) (caByStudent[s.student_id] ??= {})[s.assessment_id] = s;
    const examByStudent = {};
    for (const e of examScores) (examByStudent[e.student_id] ??= {})[e.subject] = e;

    const allSubjects = [...new Set([...assessments.map(a=>a.subject), ...examScores.map(e=>e.subject)])].sort();
    const totalConfiguredCA = modes.reduce((s, m) => s + parseFloat(m.ca_contribution || 0), 0);

    const results = students.map(student => {
      const examBody = student.exam_body || 'WAEC';
      const subjectResults = [];

      for (const subject of allSubjects) {
        const subAssessments = assessments.filter(a => a.subject === subject);
        const examEntry = (examByStudent[student.id] ?? {})[subject];
        const modeGroups = {};
        for (const a of subAssessments) (modeGroups[a.mode_id] ??= []).push(a);

        let caScore = null;
        if (Object.keys(modeGroups).length) {
          let wSum = 0; let hasCA = false;
          for (const [modeId, mas] of Object.entries(modeGroups)) {
            const mode = modeMap.get(modeId); if (!mode) continue;
            const scores = mas.map(a => {
              const sc = (caByStudent[student.id]??{})[a.id];
              if (!sc||sc.absent||sc.score===null) return null;
              return (parseFloat(sc.score)/parseFloat(a.max_score))*100;
            }).filter(s=>s!==null);
            if (scores.length) { hasCA=true; wSum += (scores.reduce((a,b)=>a+b,0)/scores.length)*parseFloat(mode.ca_contribution||0)/100; }
          }
          if (hasCA) caScore = totalConfiguredCA>0 ? (wSum/totalConfiguredCA)*caPercentage : wSum;
        }

        let examScore = null;
        if (examEntry?.score != null) examScore = (parseFloat(examEntry.score)/parseFloat(examEntry.max_score||100))*examPercentage;

        if (caScore === null && examScore === null) continue;
        const roundedCA   = caScore   !== null ? Math.round(caScore   * 10) / 10 : null;
        const roundedExam = examScore !== null ? Math.round(examScore * 10) / 10 : null;
        const total = Math.round(((caScore??0)+(examScore??0))*10)/10;
        const { grade, remark } = getGrade(total, examBody);
        subjectResults.push({ subject, ca_score: roundedCA, exam_score: roundedExam, total, grade, remark });
      }

      const withTotals = subjectResults.filter(s=>s.total!==null);
      const average = withTotals.length ? Math.round((withTotals.reduce((s,sub)=>s+sub.total,0)/withTotals.length)*10)/10 : null;
      return { student_id: student.id, student_code: student.student_code, name: student.name,
               gender: student.gender, program_name: student.program_name, exam_body: examBody,
               subjects: subjectResults, average };
    });

    const sorted = [...results].filter(r=>r.average!==null).sort((a,b)=>b.average-a.average);
    let pos = 1;
    for (let i=0;i<sorted.length;i++) {
      if (i>0 && sorted[i].average!==sorted[i-1].average) pos=i+1;
      const r=results.find(x=>x.student_id===sorted[i].student_id);
      if (r) r.class_position=pos;
    }
    results.forEach(r=>{ r.class_total=sorted.length; r.class_position=r.class_position??null; });

    res.json(results);
  } catch (err) { next(err); }
});

module.exports = router;
