const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// Only allow students
function studentOnly(req, res, next) {
  if (req.user?.role !== 'student') {
    return res.status(403).json({ error: 'Student access only' });
  }
  next();
}
router.use(studentOnly);

// ── Shared helpers ───────────────────────────────────────────────────────────

async function getStudentProfile(schoolId, studentId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.student_code, s.name, s.class_name, s.status,
            s.program_id, p.name AS program_name, p.exam_body,
            s.gender, s.picture_url, s.date_of_birth, s.hometown,
            s.residential_address, s.mobile_number, s.house,
            s.residential_status, s.guardian_name, s.guardian_mobile,
            s.guardian_occupation, s.religion,
            DATE_PART('year', AGE(s.date_of_birth))::integer AS age
     FROM students s
     LEFT JOIN programs p ON p.id = s.program_id
     WHERE s.id = $1 AND s.school_id = $2 AND s.status = 'Active'`,
    [studentId, schoolId]
  );
  return rows[0] || null;
}

function getGrade(total, boundaries, examBody) {
  const relevant = boundaries
    .filter(b => !examBody || b.exam_body === examBody)
    .sort((a, b) => b.min_pct - a.min_pct);
  for (const b of relevant) {
    if (total >= b.min_pct) return { grade: b.grade, remark: b.remark };
  }
  return { grade: 'N/A', remark: '' };
}

// ── GET /api/student/profile ─────────────────────────────────────────────────

router.get('/profile', async (req, res, next) => {
  try {
    const student = await getStudentProfile(req.schoolId, req.user.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Attach form teacher for current year
    const { rows: ftRows } = await pool.query(
      `SELECT t.name AS teacher_name, t.phone AS teacher_phone
       FROM form_teacher_assignments fta
       JOIN teachers t ON t.id = fta.teacher_id
       JOIN academic_years ay ON ay.id = fta.academic_year_id
       WHERE fta.school_id = $1 AND ay.is_current = true
         AND LOWER(fta.class_name) = LOWER($2)
       LIMIT 1`,
      [req.schoolId, student.class_name]
    );
    res.json({ ...student, form_teacher: ftRows[0] ?? null });
  } catch (err) { next(err); }
});

// ── GET /api/student/school-profile ─────────────────────────────────────────

router.get('/school-profile', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT name, address, logo_url FROM schools WHERE id = $1`,
      [req.schoolId]
    );
    res.json(rows[0] ?? {});
  } catch (err) { next(err); }
});

// ── GET /api/student/results?academic_year_id=&semester= ─────────────────────

router.get('/results', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester)
      return res.status(400).json({ error: 'academic_year_id and semester are required' });

    const student = await getStudentProfile(req.schoolId, req.user.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const semInt = parseInt(semester);
    const className = student.class_name;

    const [schoolRow, modesRow, boundariesRow] = await Promise.all([
      pool.query(`SELECT ca_percentage FROM schools WHERE id = $1`, [req.schoolId]),
      pool.query(`SELECT id, name, ca_contribution FROM assessment_modes WHERE school_id = $1`, [req.schoolId]),
      pool.query(
        `SELECT exam_body, grade, min_pct, max_pct, remark
         FROM grade_boundaries WHERE school_id = $1 ORDER BY exam_body, sort_order DESC`,
        [req.schoolId]
      ),
    ]);

    const caPercentage  = parseFloat(schoolRow.rows[0]?.ca_percentage) || 30;
    const examPct       = 100 - caPercentage;
    const modes         = modesRow.rows;
    const boundaries    = boundariesRow.rows;
    const totalConfigCA = modes.reduce((s, m) => s + parseFloat(m.ca_contribution), 0) || caPercentage;

    const [{ rows: assessments }, { rows: examScores }, { rows: imported }] = await Promise.all([
      pool.query(
        `SELECT a.subject, a.mode_id, a.max_score, sc.score
         FROM assessments a
         JOIN assessment_scores sc ON sc.assessment_id = a.id
         WHERE a.school_id = $1 AND a.academic_year_id = $2 AND a.semester = $3
           AND LOWER(a.class_name) = LOWER($4)
           AND sc.student_id = $5
           AND sc.score IS NOT NULL AND sc.absent = false`,
        [req.schoolId, academic_year_id, semInt, className, student.id]
      ),
      pool.query(
        `SELECT subject, score, max_score
         FROM exam_scores
         WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3
           AND LOWER(class_name) = LOWER($4) AND student_id = $5
           AND score IS NOT NULL`,
        [req.schoolId, academic_year_id, semInt, className, student.id]
      ),
      pool.query(
        `SELECT subject, class_score AS ca_score, exam_score, total_score
         FROM results_import
         WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3
           AND student_id = $4`,
        [req.schoolId, academic_year_id, semInt, student.id]
      ),
    ]);

    // Build subject map
    const subjectMap = {};

    // CA per subject
    for (const row of assessments) {
      if (!subjectMap[row.subject]) subjectMap[row.subject] = { caRaw: 0, caMaxRaw: 0, exam: null, examMax: null, imported: false };
      const modeContrib = modes.find(m => m.id === row.mode_id)?.ca_contribution ?? 0;
      const scaledScore = row.max_score > 0 ? (parseFloat(row.score) / parseFloat(row.max_score)) * modeContrib : 0;
      subjectMap[row.subject].caRaw    += scaledScore;
      subjectMap[row.subject].caMaxRaw += modeContrib;
    }

    // Exam scores
    for (const row of examScores) {
      if (!subjectMap[row.subject]) subjectMap[row.subject] = { caRaw: 0, caMaxRaw: 0, exam: null, examMax: null, imported: false };
      subjectMap[row.subject].exam    = parseFloat(row.score);
      subjectMap[row.subject].examMax = parseFloat(row.max_score);
    }

    // Imported fallback
    for (const row of imported) {
      if (!subjectMap[row.subject] || (subjectMap[row.subject].caMaxRaw === 0 && subjectMap[row.subject].exam === null)) {
        subjectMap[row.subject] = {
          caRaw: row.ca_score ?? null,
          caMaxRaw: null,
          exam:  row.exam_score ?? null,
          examMax: null,
          total: row.total_score ?? null,
          imported: true,
        };
      }
    }

    const subjects = [];
    for (const [subject, d] of Object.entries(subjectMap)) {
      let caScore, examScore, total;
      if (d.imported && d.total !== undefined) {
        caScore   = d.caRaw;
        examScore = d.exam;
        total     = d.total;
      } else {
        caScore   = d.caMaxRaw > 0 ? (d.caRaw / d.caMaxRaw) * caPercentage : null;
        examScore = d.exam !== null && d.examMax > 0 ? (d.exam / d.examMax) * examPct : null;
        total     = caScore !== null && examScore !== null ? caScore + examScore : null;
      }

      const { grade, remark } = total !== null
        ? getGrade(total, boundaries, student.exam_body)
        : { grade: 'N/A', remark: '' };

      subjects.push({
        subject,
        ca_score:    caScore   !== null ? Math.round(caScore   * 10) / 10 : null,
        exam_score:  examScore !== null ? Math.round(examScore * 10) / 10 : null,
        total:       total     !== null ? Math.round(total     * 10) / 10 : null,
        grade,
        remark,
        is_imported: d.imported,
      });
    }

    subjects.sort((a, b) => a.subject.localeCompare(b.subject));

    const validTotals = subjects.filter(s => s.total !== null).map(s => s.total);
    const average = validTotals.length
      ? Math.round(validTotals.reduce((a, b) => a + b, 0) / validTotals.length * 10) / 10
      : null;
    const { grade: overallGrade } = average !== null
      ? getGrade(average, boundaries, student.exam_body)
      : { grade: 'N/A' };

    // Class position
    let class_position = null, class_total = null;
    if (average !== null) {
      const { rows: classmates } = await pool.query(
        `SELECT id FROM students WHERE school_id = $1 AND LOWER(class_name) = LOWER($2) AND status = 'Active'`,
        [req.schoolId, className]
      );
      class_total = classmates.length;

      const peerResults = await Promise.all(classmates.map(async (cm) => {
        if (cm.id === student.id) return average;
        const [caR, exR, impR] = await Promise.all([
          pool.query(
            `SELECT a.mode_id, a.max_score, sc.score FROM assessments a
             JOIN assessment_scores sc ON sc.assessment_id = a.id
             WHERE a.school_id = $1 AND a.academic_year_id = $2 AND a.semester = $3
               AND LOWER(a.class_name) = LOWER($4) AND sc.student_id = $5
               AND sc.score IS NOT NULL AND sc.absent = false`,
            [req.schoolId, academic_year_id, semInt, className, cm.id]
          ),
          pool.query(
            `SELECT subject, score, max_score FROM exam_scores
             WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3
               AND LOWER(class_name) = LOWER($4) AND student_id = $5 AND score IS NOT NULL`,
            [req.schoolId, academic_year_id, semInt, className, cm.id]
          ),
          pool.query(
            `SELECT subject, total_score FROM results_import
             WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3 AND student_id = $4`,
            [req.schoolId, academic_year_id, semInt, cm.id]
          ),
        ]);
        const subMap = {};
        for (const r of caR.rows) {
          if (!subMap[r.subject]) subMap[r.subject] = { caRaw: 0, caMaxRaw: 0, exam: null, examMax: null };
          const mc = modes.find(m => m.id === r.mode_id)?.ca_contribution ?? 0;
          subMap[r.subject].caRaw    += r.max_score > 0 ? (parseFloat(r.score) / parseFloat(r.max_score)) * mc : 0;
          subMap[r.subject].caMaxRaw += mc;
        }
        for (const r of exR.rows) {
          if (!subMap[r.subject]) subMap[r.subject] = { caRaw: 0, caMaxRaw: 0, exam: null, examMax: null };
          subMap[r.subject].exam    = parseFloat(r.score);
          subMap[r.subject].examMax = parseFloat(r.max_score);
        }
        for (const r of impR.rows) {
          if (!subMap[r.subject]) subMap[r.subject] = { caRaw: 0, caMaxRaw: 0, exam: null, examMax: null, total: r.total_score, imported: true };
        }
        const tots = Object.entries(subMap).map(([, d]) => {
          if (d.imported && d.total != null) return d.total;
          const ca = d.caMaxRaw > 0 ? (d.caRaw / d.caMaxRaw) * caPercentage : null;
          const ex = d.exam !== null && d.examMax > 0 ? (d.exam / d.examMax) * examPct : null;
          return ca !== null && ex !== null ? ca + ex : null;
        }).filter(t => t !== null);
        return tots.length ? tots.reduce((a, b) => a + b, 0) / tots.length : null;
      }));

      const validPeers = peerResults.filter(a => a !== null);
      class_position = validPeers.filter(a => a > average).length + 1;
    }

    // Remarks from form teacher (if any)
    const { rows: remarkRows } = await pool.query(
      `SELECT attitude, conduct, general_remarks
       FROM report_remarks
       WHERE school_id = $1 AND student_id = $2 AND academic_year_id = $3 AND semester = $4
       LIMIT 1`,
      [req.schoolId, student.id, academic_year_id, semInt]
    );

    res.json({
      student: {
        id: student.id, name: student.name, student_code: student.student_code,
        class_name: className, program_name: student.program_name, picture_url: student.picture_url,
      },
      subjects,
      average,
      overall_grade: overallGrade,
      class_position,
      class_total,
      remarks: remarkRows[0] ?? null,
    });
  } catch (err) { next(err); }
});

// ── GET /api/student/results/class ───────────────────────────────────────────
// Returns anonymised class averages (overall + per-subject) for the student's class.

router.get('/results/class', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester)
      return res.status(400).json({ error: 'academic_year_id and semester are required' });

    const student = await getStudentProfile(req.schoolId, req.user.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const semInt = parseInt(semester);
    const className = student.class_name;

    // Class average per subject from exam scores
    const { rows: subjectAvgs } = await pool.query(
      `SELECT es.subject,
              ROUND(AVG(es.score / NULLIF(es.max_score, 0) * 100)::numeric, 1) AS class_avg,
              COUNT(DISTINCT es.student_id) AS scored_count
       FROM exam_scores es
       JOIN students s ON s.id = es.student_id
       WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3
         AND LOWER(es.class_name)=LOWER($4) AND s.status='Active'
       GROUP BY es.subject
       ORDER BY es.subject`,
      [req.schoolId, academic_year_id, semInt, className]
    );

    // Overall class average
    const withAvg = subjectAvgs.filter(r => r.class_avg !== null);
    const classAvg = withAvg.length
      ? Math.round(withAvg.reduce((s, r) => s + parseFloat(r.class_avg), 0) / withAvg.length * 10) / 10
      : null;

    res.json({
      class_name: className,
      class_avg: classAvg,
      subjects: subjectAvgs.map(r => ({
        subject: r.subject,
        class_avg: r.class_avg !== null ? parseFloat(r.class_avg) : null,
        scored_count: parseInt(r.scored_count),
      })),
    });
  } catch (err) { next(err); }
});

// ── GET /api/student/results/history ─────────────────────────────────────────
// Returns per-semester summary for performance graph

router.get('/results/history', async (req, res, next) => {
  try {
    const student = await getStudentProfile(req.schoolId, req.user.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const [schoolRow, modesRow, boundariesRow, yearsRow] = await Promise.all([
      pool.query(`SELECT ca_percentage FROM schools WHERE id = $1`, [req.schoolId]),
      pool.query(`SELECT id, name, ca_contribution FROM assessment_modes WHERE school_id = $1`, [req.schoolId]),
      pool.query(`SELECT exam_body, grade, min_pct, max_pct, remark FROM grade_boundaries WHERE school_id = $1 ORDER BY exam_body, sort_order DESC`, [req.schoolId]),
      pool.query(`SELECT id, name FROM academic_years WHERE school_id = $1 ORDER BY name ASC`, [req.schoolId]),
    ]);

    const caPercentage  = parseFloat(schoolRow.rows[0]?.ca_percentage) || 30;
    const examPct       = 100 - caPercentage;
    const modes         = modesRow.rows;
    const boundaries    = boundariesRow.rows;
    const years         = yearsRow.rows;

    const [{ rows: allCA }, { rows: allExam }, { rows: allImported }] = await Promise.all([
      pool.query(
        `SELECT a.academic_year_id, a.semester, a.subject, a.mode_id, a.max_score, sc.score
         FROM assessments a
         JOIN assessment_scores sc ON sc.assessment_id = a.id
         WHERE a.school_id = $1 AND sc.student_id = $2
           AND sc.score IS NOT NULL AND sc.absent = false`,
        [req.schoolId, student.id]
      ),
      pool.query(
        `SELECT academic_year_id, semester, subject, score, max_score
         FROM exam_scores
         WHERE school_id = $1 AND student_id = $2 AND score IS NOT NULL`,
        [req.schoolId, student.id]
      ),
      pool.query(
        `SELECT academic_year_id, semester, subject, total_score
         FROM results_import WHERE school_id = $1 AND student_id = $2`,
        [req.schoolId, student.id]
      ),
    ]);

    // Group by year+semester
    const periodMap = {};
    const addPeriod = (yId, sem) => {
      const key = `${yId}__${sem}`;
      if (!periodMap[key]) periodMap[key] = { year_id: yId, semester: sem, subjects: {} };
      return periodMap[key];
    };

    for (const r of allCA) {
      const p = addPeriod(r.academic_year_id, r.semester);
      const sub = r.subject;
      if (!p.subjects[sub]) p.subjects[sub] = { caRaw: 0, caMaxRaw: 0, exam: null, examMax: null };
      const mc = modes.find(m => m.id === r.mode_id)?.ca_contribution ?? 0;
      p.subjects[sub].caRaw    += r.max_score > 0 ? (parseFloat(r.score) / parseFloat(r.max_score)) * mc : 0;
      p.subjects[sub].caMaxRaw += mc;
    }
    for (const r of allExam) {
      const p = addPeriod(r.academic_year_id, r.semester);
      if (!p.subjects[r.subject]) p.subjects[r.subject] = { caRaw: 0, caMaxRaw: 0, exam: null, examMax: null };
      p.subjects[r.subject].exam    = parseFloat(r.score);
      p.subjects[r.subject].examMax = parseFloat(r.max_score);
    }
    for (const r of allImported) {
      const p = addPeriod(r.academic_year_id, r.semester);
      if (!p.subjects[r.subject]) p.subjects[r.subject] = { imported: true, total: r.total_score };
    }

    const history = [];
    for (const [, p] of Object.entries(periodMap)) {
      const yearInfo = years.find(y => y.id === p.year_id);
      if (!yearInfo) continue;
      const tots = Object.values(p.subjects).map(d => {
        if (d.imported && d.total != null) return d.total;
        const ca = d.caMaxRaw > 0 ? (d.caRaw / d.caMaxRaw) * caPercentage : null;
        const ex = d.exam !== null && d.examMax > 0 ? (d.exam / d.examMax) * examPct : null;
        return ca !== null && ex !== null ? ca + ex : null;
      }).filter(t => t !== null);

      if (!tots.length) continue;
      const avg = Math.round(tots.reduce((a, b) => a + b, 0) / tots.length * 10) / 10;
      const { grade } = getGrade(avg, boundaries, student.exam_body);
      history.push({
        year_id: p.year_id, academic_year: yearInfo.name,
        semester: p.semester,
        label: `${yearInfo.name} S${p.semester}`,
        average: avg, grade,
        subject_count: tots.length,
      });
    }

    history.sort((a, b) => {
      const ya = years.findIndex(y => y.id === a.year_id);
      const yb = years.findIndex(y => y.id === b.year_id);
      return ya !== yb ? ya - yb : a.semester - b.semester;
    });

    res.json(history);
  } catch (err) { next(err); }
});

// ── GET /api/student/attendance?academic_year_id=&semester= ──────────────────

router.get('/attendance', async (req, res, next) => {
  try {
    const student = await getStudentProfile(req.schoolId, req.user.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { academic_year_id, semester } = req.query;
    const conds = ['s.school_id = $1', 'r.student_id = $2'];
    const params = [req.schoolId, student.id];

    if (academic_year_id) { params.push(academic_year_id); conds.push(`s.academic_year_id = $${params.length}`); }
    if (semester)         { params.push(parseInt(semester)); conds.push(`s.semester = $${params.length}`); }

    const { rows: sessions } = await pool.query(
      `SELECT s.id, s.date::text, s.subject, s.class_name, s.semester,
              s.academic_year_id, t.name AS teacher_name,
              r.status
       FROM student_attendance_records r
       JOIN student_attendance_sessions s ON s.id = r.session_id
       LEFT JOIN teachers t ON t.id = s.teacher_id
       WHERE ${conds.join(' AND ')}
       ORDER BY s.date DESC, s.created_at DESC`,
      params
    );

    const present = sessions.filter(s => s.status === 'Present').length;
    const absent  = sessions.filter(s => s.status === 'Absent').length;
    const late    = sessions.filter(s => s.status === 'Late').length;
    const total   = sessions.length;
    const rate    = total > 0 ? Math.round(((present + late * 0.5) / total) * 100 * 10) / 10 : null;

    res.json({
      summary: { present, absent, late, total, rate },
      sessions,
    });
  } catch (err) { next(err); }
});

// ── GET /api/student/timetable ────────────────────────────────────────────────

router.get('/timetable', async (req, res, next) => {
  try {
    const student = await getStudentProfile(req.schoolId, req.user.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { rows } = await pool.query(
      `SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.subject, tt.class_names,
              te.name AS teacher_name
       FROM timetable tt
       JOIN teachers te ON te.id = tt.teacher_id
       WHERE tt.school_id = $1
         AND (
           tt.class_names ILIKE $2
           OR tt.class_names ILIKE $3
           OR tt.class_names ILIKE $4
         )
       ORDER BY tt.day_of_week, tt.start_time`,
      [
        req.schoolId,
        student.class_name,
        `%,${student.class_name}%`,
        `${student.class_name},%`,
      ]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/student/calendar ─────────────────────────────────────────────────

router.get('/calendar', async (req, res, next) => {
  try {
    const conds  = ['school_id = $1'];
    const params = [req.schoolId];
    if (req.query.from) { params.push(req.query.from); conds.push(`date >= $${params.length}`); }
    if (req.query.to)   { params.push(req.query.to);   conds.push(`date <= $${params.length}`); }
    if (req.query.year) { params.push(req.query.year); conds.push(`EXTRACT(YEAR FROM date) = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT id, date::text, name, type, notes FROM school_calendar WHERE ${conds.join(' AND ')} ORDER BY date ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/student/academic-years ──────────────────────────────────────────

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

// ── POST /api/student/change-pin ──────────────────────────────────────────────

router.post('/change-pin', async (req, res, next) => {
  try {
    const { currentPin, newPin } = req.body;
    if (!currentPin || !newPin) return res.status(400).json({ error: 'currentPin and newPin required' });
    if (String(newPin).length < 4) return res.status(400).json({ error: 'PIN must be at least 4 characters' });

    const { rows } = await pool.query(
      `SELECT pin_hash FROM students WHERE id = $1 AND school_id = $2`,
      [req.user.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });

    const valid = await bcrypt.compare(String(currentPin), rows[0].pin_hash);
    if (!valid) return res.status(401).json({ error: 'Current PIN is incorrect' });

    const hash = await bcrypt.hash(String(newPin), 12);
    await pool.query(
      `UPDATE students SET pin_hash = $1, updated_at = now() WHERE id = $2`,
      [hash, req.user.id]
    );
    res.json({ message: 'PIN changed successfully' });
  } catch (err) { next(err); }
});

// ── GET /api/student/clearance ───────────────────────────────────────────────

router.get('/clearance', async (req, res, next) => {
  try {
    const { rows: clRows } = await pool.query(
      `SELECT sc.id, sc.is_fully_cleared, sc.initiated_at, sc.fully_cleared_at
       FROM student_clearances sc
       WHERE sc.student_id = $1 AND sc.school_id = $2`,
      [req.user.id, req.schoolId]
    );
    if (!clRows.length) return res.json({ status: 'not_initiated', items: [] });

    const clearance = clRows[0];
    const { rows: items } = await pool.query(
      `SELECT sci.id, sci.office_id, sci.status, sci.notes, sci.actioned_at,
              co.name AS office_name, co.office_type, co.sort_order
       FROM student_clearance_items sci
       JOIN clearance_offices co ON co.id = sci.office_id
       WHERE sci.clearance_id = $1
       ORDER BY co.sort_order, co.name`,
      [clearance.id]
    );

    res.json({
      status: clearance.is_fully_cleared ? 'fully_cleared'
            : items.some(i => i.status === 'not_cleared') ? 'action_required'
            : 'in_progress',
      initiated_at:    clearance.initiated_at,
      fully_cleared_at: clearance.fully_cleared_at,
      items,
    });
  } catch (err) { next(err); }
});

// ── Library ───────────────────────────────────────────────────────────────────

router.get('/library/books', async (req, res, next) => {
  try {
    const { search, subject, category } = req.query;
    const conditions = ['school_id = $1', 'total_copies > 0'];
    const params = [req.schoolId];
    let p = 2;
    if (search) {
      conditions.push(`(LOWER(title) LIKE $${p} OR LOWER(author) LIKE $${p})`);
      params.push(`%${search.toLowerCase()}%`);
      p++;
    }
    if (subject)  { conditions.push(`LOWER(subject) = LOWER($${p})`); params.push(subject); p++; }
    if (category) { conditions.push(`category = $${p}`); params.push(category); p++; }
    const { rows } = await pool.query(
      `SELECT id, title, author, isbn, subject, category, level, cover_url, total_copies, available_copies
       FROM library_books WHERE ${conditions.join(' AND ')} ORDER BY title`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/library/my-loans', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ll.id, ll.status, ll.issued_at, ll.due_date, ll.returned_at,
              ll.fine_amount, ll.fine_paid,
              lb.title AS book_title, lb.author, lb.cover_url,
              lc.copy_number,
              (ll.due_date < CURRENT_DATE AND ll.status = 'active')::boolean AS is_overdue
       FROM library_loans ll
       JOIN library_books lb ON lb.id = ll.book_id
       JOIN library_copies lc ON lc.id = ll.copy_id
       WHERE ll.student_id = $1 AND ll.school_id = $2
       ORDER BY ll.issued_at DESC`,
      [req.user.id, req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/library/resources', async (req, res, next) => {
  try {
    const { resource_type, subject, academic_year } = req.query;
    const conditions = ['school_id = $1'];
    const params = [req.schoolId];
    let p = 2;
    if (resource_type) { conditions.push(`resource_type = $${p}`); params.push(resource_type); p++; }
    if (subject)       { conditions.push(`LOWER(subject) = LOWER($${p})`); params.push(subject); p++; }
    if (academic_year) { conditions.push(`academic_year = $${p}`); params.push(academic_year); p++; }
    const { rows } = await pool.query(
      `SELECT id, title, subject, resource_type, academic_year, level,
              file_url, file_name, file_size_kb, download_count, created_at
       FROM library_resources WHERE ${conditions.join(' AND ')}
       ORDER BY resource_type, subject, title`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/library/resources/:id/download', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE library_resources
       SET download_count = download_count + 1
       WHERE id = $1 AND school_id = $2
       RETURNING id, file_url, file_name, download_count`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Resource not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── GET /api/student/fees ─────────────────────────────────────────────────────

router.get('/fees', async (req, res, next) => {
  try {
    const { rows: modRows } = await pool.query(
      `SELECT enabled FROM school_modules WHERE school_id=$1 AND module_key='fees'`,
      [req.schoolId]
    );
    if (modRows.length > 0 && !modRows[0].enabled) {
      return res.status(403).json({ error: 'Fees module not enabled.' });
    }

    const sid       = req.schoolId;
    const studentId = req.user.id;

    const [billsRes, paymentsRes] = await Promise.all([
      pool.query(
        `SELECT sb.id, sb.label, sb.amount, sb.due_date, sb.created_at,
                fi.name AS fee_item_name, fs.name AS schedule_name,
                COALESCE(p.paid, 0) AS amount_paid,
                sb.amount - COALESCE(p.paid, 0) AS balance
         FROM student_bills sb
         LEFT JOIN fee_items fi ON fi.id = sb.fee_item_id
         LEFT JOIN fee_schedules fs ON fs.id = sb.fee_schedule_id
         LEFT JOIN (
           SELECT bill_id, SUM(amount) AS paid
           FROM fee_payments WHERE school_id=$1 GROUP BY bill_id
         ) p ON p.bill_id = sb.id
         WHERE sb.student_id = $2 AND sb.school_id = $1
         ORDER BY sb.created_at DESC`,
        [sid, studentId]
      ),
      pool.query(
        `SELECT fp.id, fp.amount, fp.payment_date, fp.payment_method,
                fp.receipt_number, fp.notes,
                fi.name AS fee_item_name, sb.label AS bill_label
         FROM fee_payments fp
         JOIN student_bills sb ON sb.id = fp.bill_id
         LEFT JOIN fee_items fi ON fi.id = sb.fee_item_id
         WHERE fp.student_id = $2 AND fp.school_id = $1
         ORDER BY fp.payment_date DESC, fp.created_at DESC`,
        [sid, studentId]
      ),
    ]);

    const bills    = billsRes.rows.map(b => ({
      ...b, amount: Number(b.amount), amount_paid: Number(b.amount_paid), balance: Number(b.balance),
    }));
    const payments = paymentsRes.rows.map(p => ({ ...p, amount: Number(p.amount) }));

    const total_billed = bills.reduce((s, b) => s + b.amount, 0);
    const total_paid   = bills.reduce((s, b) => s + b.amount_paid, 0);

    res.json({
      summary: { total_billed, total_paid, outstanding: total_billed - total_paid },
      bills,
      payments,
    });
  } catch (err) { next(err); }
});

module.exports = router;
