// Shared class-results computation extracted from results.js for reuse by ai-remarks.js.
// Returns the same result shape as GET /api/results, scoped to one class.
const pool = require('../config/db');

async function computeClassResults(schoolId, academicYearId, semester) {
  const sem = parseInt(semester);

  // Resolve class_name from caller — see computeStudentResult wrapper below.
  // This function is intentionally internal; callers use computeStudentResult.
  throw new Error('Call computeStudentResult instead.');
}

// computeStudentResult(schoolId, studentId, academicYearId, semester)
// Returns enriched data for ONE student: subjects, grades, positions, attendance.
// Runs the full class calculation (needed for position ranking) then filters to the student.
async function computeStudentResult(schoolId, studentId, academicYearId, semester) {
  const sem = parseInt(semester);

  // Look up the student's class and name
  const { rows: stMeta } = await pool.query(
    `SELECT s.id, s.name, s.class_name, p.exam_body
     FROM students s
     LEFT JOIN programs p ON p.id = s.program_id
     WHERE s.id = $1 AND s.school_id = $2 LIMIT 1`,
    [studentId, schoolId]
  );
  if (!stMeta.length) return null;
  const { class_name, name: student_name, exam_body: studentExamBody } = stMeta[0];

  // Fetch all class-level data in parallel
  const [schoolRow, modesRow, boundariesRow, studentsRow, assessmentsRow, examScoresRow, importedRes, attRes] =
    await Promise.all([
      pool.query(`SELECT ca_percentage FROM schools WHERE id = $1`, [schoolId]),
      pool.query(`SELECT id, ca_contribution FROM assessment_modes WHERE school_id = $1`, [schoolId]),
      pool.query(
        `SELECT exam_body, grade, min_pct, max_pct, remark
         FROM grade_boundaries WHERE school_id = $1 ORDER BY exam_body, sort_order DESC`,
        [schoolId]
      ),
      pool.query(
        `SELECT s.id, s.name, p.exam_body
         FROM students s
         LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.school_id = $1 AND s.status = 'Active' AND LOWER(s.class_name) = LOWER($2)
         ORDER BY s.name`,
        [schoolId, class_name]
      ),
      pool.query(
        `SELECT a.subject, a.mode_id, a.max_score, sc.student_id, sc.score
         FROM assessments a
         JOIN assessment_scores sc ON sc.assessment_id = a.id
         WHERE a.school_id = $1 AND a.academic_year_id = $2 AND a.semester = $3
           AND LOWER(a.class_name) = LOWER($4)
           AND sc.score IS NOT NULL AND sc.absent = false`,
        [schoolId, academicYearId, sem, class_name]
      ),
      pool.query(
        `SELECT student_id, subject, score, max_score FROM exam_scores
         WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3
           AND LOWER(class_name) = LOWER($4) AND score IS NOT NULL`,
        [schoolId, academicYearId, sem, class_name]
      ),
      pool.query(
        `SELECT s.id FROM students s
         WHERE s.school_id = $1 AND s.status = 'Active' AND LOWER(s.class_name) = LOWER($2)`,
        [schoolId, class_name]
      ).then(async ({ rows: classRows }) => {
        const ids = classRows.map(r => r.id);
        if (!ids.length) return { rows: [] };
        return pool.query(
          `SELECT student_id, subject, class_score, exam_score, total_score, grade, remarks
           FROM results_import
           WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3 AND student_id = ANY($4)`,
          [schoolId, academicYearId, sem, ids]
        );
      }),
      pool.query(
        `SELECT sar.student_id,
                COUNT(*)::int                                         AS total,
                COUNT(*) FILTER (WHERE sar.status = 'Present')::int  AS present,
                COUNT(*) FILTER (WHERE sar.status = 'Late')::int     AS late,
                COUNT(*) FILTER (WHERE sar.status = 'Absent')::int   AS absent
         FROM student_attendance_records sar
         JOIN student_attendance_sessions sas ON sas.id = sar.session_id
         WHERE sas.school_id = $1 AND sas.academic_year_id = $2 AND sas.semester = $3
           AND LOWER(sas.class_name) = LOWER($4)
         GROUP BY sar.student_id`,
        [schoolId, academicYearId, sem, class_name]
      ),
    ]);

  const caPercentage    = parseFloat(schoolRow.rows[0]?.ca_percentage) || 30;
  const examPercentage  = 100 - caPercentage;
  const modes           = modesRow.rows;
  const boundaries      = boundariesRow.rows;
  const students        = studentsRow.rows;
  const assessments     = assessmentsRow.rows;
  const examScores      = examScoresRow.rows;
  const importedRows    = importedRes.rows;
  const attRows         = attRes.rows;
  const totalConfiguredCA = modes.reduce((s, m) => s + parseFloat(m.ca_contribution), 0) || caPercentage;

  function getGrade(total, examBody) {
    const body = examBody || 'WAEC';
    const bodyBounds = boundaries
      .filter(b => b.exam_body === body)
      .sort((a, b) => parseFloat(b.min_pct) - parseFloat(a.min_pct));
    if (bodyBounds.length) {
      for (const b of bodyBounds) {
        if (total >= parseFloat(b.min_pct)) return { grade: b.grade, remark: b.remark };
      }
    }
    if (body === 'CTVET') {
      const grade  = total >= 75 ? 'A' : total >= 70 ? 'B+' : total >= 65 ? 'B-' : total >= 55 ? 'C+' : total >= 50 ? 'C-' : total >= 45 ? 'D' : total >= 40 ? 'E' : 'F';
      const remark = total >= 75 ? 'DISTINCTION' : total >= 65 ? 'UPPER CREDIT' : total >= 55 ? 'CREDIT' : total >= 50 ? 'LOWER CREDIT' : total >= 40 ? 'PASS' : 'FAIL';
      return { grade, remark };
    }
    const grade  = total >= 75 ? 'A1' : total >= 70 ? 'B2' : total >= 65 ? 'B3' : total >= 60 ? 'C4' : total >= 55 ? 'C5' : total >= 50 ? 'C6' : total >= 45 ? 'D7' : total >= 40 ? 'E8' : 'F9';
    const remark = total >= 75 ? 'EXCELLENT' : total >= 70 ? 'VERY GOOD' : total >= 65 ? 'GOOD' : total >= 50 ? 'CREDIT' : total >= 40 ? 'PASS' : 'FAIL';
    return { grade, remark };
  }

  // Build lookup tables
  const importedData = {};
  for (const r of importedRows) {
    if (!importedData[r.student_id]) importedData[r.student_id] = {};
    importedData[r.student_id][r.subject] = {
      class_score: r.class_score != null ? parseFloat(r.class_score) : null,
      exam_score:  r.exam_score  != null ? parseFloat(r.exam_score)  : null,
      total_score: r.total_score != null ? parseFloat(r.total_score) : null,
      grade:       r.grade   || '-',
      remarks:     r.remarks || '-',
    };
  }

  const caData = {};
  for (const a of assessments) {
    if (!caData[a.student_id]) caData[a.student_id] = {};
    if (!caData[a.student_id][a.subject]) caData[a.student_id][a.subject] = {};
    if (!caData[a.student_id][a.subject][a.mode_id]) caData[a.student_id][a.subject][a.mode_id] = [];
    caData[a.student_id][a.subject][a.mode_id].push({ score: parseFloat(a.score), max_score: parseFloat(a.max_score) });
  }

  const examData = {};
  for (const e of examScores) {
    if (!examData[e.student_id]) examData[e.student_id] = {};
    examData[e.student_id][e.subject] = { score: parseFloat(e.score), max_score: parseFloat(e.max_score) };
  }

  const allSubjects = new Set();
  for (const a of assessments)  allSubjects.add(a.subject);
  for (const e of examScores)   allSubjects.add(e.subject);
  for (const r of importedRows) allSubjects.add(r.subject);

  // Per-subject calculation and ranking across the full class
  const subjectResults = {};
  for (const subject of allSubjects) {
    subjectResults[subject] = [];
    for (const st of students) {
      const hasLiveCA   = !!(caData[st.id]?.[subject]);
      const hasLiveExam = !!(examData[st.id]?.[subject]);
      const hasImport   = !!(importedData[st.id]?.[subject]);
      if (!hasLiveCA && !hasLiveExam && hasImport) {
        const imp = importedData[st.id][subject];
        subjectResults[subject].push({ student_id: st.id, ca_score: imp.class_score, exam_score: imp.exam_score, total: imp.total_score, grade: imp.grade, remark: imp.remarks, is_imported: true });
      } else {
        let caScore = 0;
        const modeMap = caData[st.id]?.[subject] || {};
        for (const mode of modes) {
          const modeScores = modeMap[mode.id] || [];
          if (!modeScores.length) continue;
          const avgPct = modeScores.reduce((sum, s) => sum + Math.min(100, s.score / s.max_score * 100), 0) / modeScores.length;
          caScore += (avgPct * parseFloat(mode.ca_contribution)) / 100;
        }
        const scaledCA    = totalConfiguredCA > 0 ? (caScore / totalConfiguredCA) * caPercentage : caScore;
        const examEntry   = examData[st.id]?.[subject];
        const examScoreVal = examEntry ? Math.min(1, examEntry.score / examEntry.max_score) * examPercentage : null;
        const total       = examScoreVal != null ? Math.round(scaledCA + examScoreVal) : null;
        subjectResults[subject].push({ student_id: st.id, ca_score: Math.round(scaledCA * 10) / 10, exam_score: examScoreVal != null ? Math.round(examScoreVal * 10) / 10 : null, total, is_imported: false });
      }
    }
    // Rank within subject
    const ranked = subjectResults[subject].filter(r => r.total != null).sort((a, b) => b.total - a.total);
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

  // Build per-student rows
  const results = students.map(st => {
    const subjectRows = [];
    let totalSum = 0, subjectCount = 0;
    for (const subject of allSubjects) {
      const row = subjectResults[subject].find(r => r.student_id === st.id);
      if (!row) continue;
      const gradeInfo = row.is_imported
        ? { grade: row.grade, remark: row.remark }
        : (row.total != null ? getGrade(row.total, st.exam_body) : { grade: '-', remark: '-' });
      subjectRows.push({ subject, ca_score: row.ca_score, exam_score: row.exam_score, total: row.total, grade: gradeInfo.grade, subject_position: row.subject_position, class_size: row.class_size });
      if (row.total != null) { totalSum += row.total; subjectCount++; }
    }
    const average      = subjectCount > 0 ? Math.round((totalSum / subjectCount) * 10) / 10 : null;
    const overallGrade = average != null ? getGrade(average, st.exam_body) : { grade: '-', remark: '-' };
    return { student_id: st.id, subjects: subjectRows.sort((a, b) => a.subject.localeCompare(b.subject)), average, overall_grade: overallGrade.grade };
  });

  // Class position ranking
  const rankedStudents = results.filter(r => r.average != null).sort((a, b) => b.average - a.average);
  let classPos = 1;
  for (let i = 0; i < rankedStudents.length; i++) {
    if (i > 0 && rankedStudents[i].average < rankedStudents[i - 1].average) classPos = i + 1;
    rankedStudents[i].class_position = classPos;
    rankedStudents[i].class_total    = rankedStudents.length;
  }

  // Attach attendance
  const attMap = {};
  for (const r of attRows) attMap[r.student_id] = { present: r.present, late: r.late, absent: r.absent };
  for (const r of results) r.attendance = attMap[r.student_id] ?? { present: 0, late: 0, absent: 0 };

  // Return only the target student (but positions are computed across the full class)
  const target = results.find(r => r.student_id === studentId);
  return target
    ? { ...target, student_name, class_name }
    : null;
}

module.exports = { computeStudentResult };
