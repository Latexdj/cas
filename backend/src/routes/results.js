const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// GET /api/results?academic_year_id=&semester=&class_name=
// Returns calculated results (CA, exam, total, grade, position) for all students in a class
router.get('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, class_name } = req.query;
    if (!academic_year_id || !semester || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, class_name are required' });
    }

    const [schoolRow, modesRow, boundariesRow, studentsRow] = await Promise.all([
      pool.query(`SELECT ca_percentage FROM schools WHERE id = $1`, [req.schoolId]),
      pool.query(
        `SELECT id, name, ca_contribution FROM assessment_modes WHERE school_id = $1`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT exam_body, grade, min_pct, max_pct, remark
         FROM grade_boundaries WHERE school_id = $1 ORDER BY exam_body, sort_order DESC`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT s.id, s.name, s.student_code, p.exam_body
         FROM students s
         LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.school_id = $1 AND s.status = 'Active'
           AND LOWER(s.class_name) = LOWER($2)
         ORDER BY s.name`,
        [req.schoolId, class_name]
      ),
    ]);

    const caPercentage = parseFloat(schoolRow.rows[0]?.ca_percentage) || 30;
    const examPercentage = 100 - caPercentage;
    const modes = modesRow.rows;
    const boundaries = boundariesRow.rows;
    const students = studentsRow.rows;

    // Total configured CA contribution across all modes
    const totalConfiguredCA = modes.reduce((s, m) => s + parseFloat(m.ca_contribution), 0) || caPercentage;

    // Get all CA assessments for this class/year/semester
    const { rows: assessments } = await pool.query(
      `SELECT a.id, a.subject, a.mode_id, a.max_score,
              sc.student_id, sc.score, sc.absent
       FROM assessments a
       JOIN assessment_scores sc ON sc.assessment_id = a.id
       WHERE a.school_id = $1
         AND a.academic_year_id = $2
         AND a.semester = $3
         AND LOWER(a.class_name) = LOWER($4)
         AND sc.score IS NOT NULL
         AND sc.absent = false`,
      [req.schoolId, academic_year_id, parseInt(semester), class_name]
    );

    // Get all exam scores for this class/year/semester
    const { rows: examScores } = await pool.query(
      `SELECT student_id, subject, score, max_score
       FROM exam_scores
       WHERE school_id = $1
         AND academic_year_id = $2
         AND semester = $3
         AND LOWER(class_name) = LOWER($4)
         AND score IS NOT NULL`,
      [req.schoolId, academic_year_id, parseInt(semester), class_name]
    );

    // Group assessments by student → subject → mode → [scores]
    const caData = {}; // { [studentId]: { [subject]: { [modeId]: [{ score, max_score }] } } }
    for (const a of assessments) {
      if (!caData[a.student_id]) caData[a.student_id] = {};
      if (!caData[a.student_id][a.subject]) caData[a.student_id][a.subject] = {};
      if (!caData[a.student_id][a.subject][a.mode_id]) caData[a.student_id][a.subject][a.mode_id] = [];
      caData[a.student_id][a.subject][a.mode_id].push({ score: parseFloat(a.score), max_score: parseFloat(a.max_score) });
    }

    // Group exam scores by student → subject
    const examData = {}; // { [studentId]: { [subject]: { score, max_score } } }
    for (const e of examScores) {
      if (!examData[e.student_id]) examData[e.student_id] = {};
      examData[e.student_id][e.subject] = { score: parseFloat(e.score), max_score: parseFloat(e.max_score) };
    }

    // Collect all subjects present (from assessments + exam scores)
    const allSubjects = new Set();
    for (const a of assessments) allSubjects.add(a.subject);
    for (const e of examScores) allSubjects.add(e.subject);

    // Grade lookup
    function getGrade(total, examBody) {
      const body = examBody || 'WAEC';
      const bodyBounds = boundaries.filter(b => b.exam_body === body);
      for (const b of bodyBounds) {
        if (total >= parseFloat(b.min_pct) && total <= parseFloat(b.max_pct)) {
          return { grade: b.grade, remark: b.remark };
        }
      }
      return { grade: '-', remark: '-' };
    }

    // Calculate per-student, per-subject results
    const subjectResults = {}; // { [subject]: [{ student_id, ca_score, exam_score, total }] }
    for (const subject of allSubjects) {
      subjectResults[subject] = [];
      for (const st of students) {
        // CA calculation
        let caScore = 0;
        const studentSubjectModes = caData[st.id]?.[subject] || {};
        for (const mode of modes) {
          const modeScores = studentSubjectModes[mode.id] || [];
          if (modeScores.length === 0) continue;
          // Average percentage across instances of this mode
          const avgPct = modeScores.reduce((sum, s) => sum + (s.score / s.max_score * 100), 0) / modeScores.length;
          // Contribution = avgPct * modeContribution / 100
          caScore += (avgPct * parseFloat(mode.ca_contribution)) / 100;
        }
        // Scale CA to caPercentage if contributions don't sum to caPercentage
        const scaledCA = totalConfiguredCA > 0 ? (caScore / totalConfiguredCA) * caPercentage : caScore;

        // Exam score
        const examEntry = examData[st.id]?.[subject];
        const examScore = examEntry ? (examEntry.score / examEntry.max_score) * examPercentage : null;

        const total = (examScore != null) ? Math.round((scaledCA + examScore) * 10) / 10 : null;

        subjectResults[subject].push({ student_id: st.id, ca_score: Math.round(scaledCA * 10) / 10, exam_score: examScore != null ? Math.round(examScore * 10) / 10 : null, total });
      }

      // Assign subject positions (rank by total, descending)
      const ranked = subjectResults[subject]
        .filter(r => r.total != null)
        .sort((a, b) => b.total - a.total);
      let pos = 1;
      for (let i = 0; i < ranked.length; i++) {
        if (i > 0 && ranked[i].total < ranked[i - 1].total) pos = i + 1;
        ranked[i].subject_position = pos;
        ranked[i].class_size = ranked.length;
      }
      for (const r of subjectResults[subject]) {
        if (r.subject_position == null) { r.subject_position = null; r.class_size = ranked.length; }
      }
    }

    // Build final result per student
    const results = students.map(st => {
      const subjectRows = [];
      let totalSum = 0;
      let subjectCount = 0;

      for (const subject of allSubjects) {
        const row = subjectResults[subject].find(r => r.student_id === st.id);
        if (!row) continue;
        const gradeInfo = row.total != null ? getGrade(row.total, st.exam_body) : { grade: '-', remark: '-' };
        subjectRows.push({
          subject,
          ca_score:        row.ca_score,
          exam_score:      row.exam_score,
          total:           row.total,
          grade:           gradeInfo.grade,
          remark:          gradeInfo.remark,
          subject_position: row.subject_position,
          class_size:       row.class_size,
        });
        if (row.total != null) { totalSum += row.total; subjectCount++; }
      }

      const average = subjectCount > 0 ? Math.round((totalSum / subjectCount) * 10) / 10 : null;
      const overallGrade = average != null ? getGrade(average, st.exam_body) : { grade: '-', remark: '-' };

      return {
        student_id:    st.id,
        student_code:  st.student_code,
        name:          st.name,
        exam_body:     st.exam_body,
        subjects:      subjectRows.sort((a, b) => a.subject.localeCompare(b.subject)),
        average,
        overall_grade: overallGrade.grade,
        ca_percentage: caPercentage,
        exam_percentage: examPercentage,
      };
    });

    // Assign class positions
    const rankedStudents = results.filter(r => r.average != null).sort((a, b) => b.average - a.average);
    let classPos = 1;
    for (let i = 0; i < rankedStudents.length; i++) {
      if (i > 0 && rankedStudents[i].average < rankedStudents[i - 1].average) classPos = i + 1;
      rankedStudents[i].class_position = classPos;
      rankedStudents[i].class_total = rankedStudents.length;
    }

    res.json(results);
  } catch (err) { next(err); }
});

// GET /api/results/student/:student_id?academic_year_id=&semester=
router.get('/student/:student_id', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'academic_year_id and semester are required' });
    }

    const { rows: [student] } = await pool.query(
      `SELECT s.id, s.name, s.student_code, s.class_name, p.exam_body
       FROM students s
       LEFT JOIN programs p ON p.id = s.program_id
       WHERE s.id = $1 AND s.school_id = $2`,
      [req.params.student_id, req.schoolId]
    );
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Reuse the class results endpoint logic via a redirect-friendly helper query
    const { rows: classResults } = await pool.query(
      `SELECT 1 FROM students WHERE id = $1 AND school_id = $2`,
      [req.params.student_id, req.schoolId]
    );
    if (!classResults.length) return res.status(403).json({ error: 'Access denied' });

    // Forward to the class results logic
    req.query.class_name = student.class_name;
    req.query.student_filter = req.params.student_id;
    // Re-use the main GET / handler by building the URL and fetching internally would be complex;
    // instead, let the frontend call GET /api/results?class_name=... and filter client-side,
    // or use this endpoint for the report card.
    res.json({ student, message: 'Use GET /api/results?class_name= to get full class results' });
  } catch (err) { next(err); }
});

module.exports = router;
