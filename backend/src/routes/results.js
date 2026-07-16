const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription, adminOnly } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// GET /api/results?academic_year_id=&semester=&class_name=
// Returns calculated results (CA, exam, total, grade, position) for all students in a class.
// If a student has no live CA/exam data for a subject but has imported data, the imported
// values are returned instead (marked with is_imported: true).
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
        `SELECT s.id, s.name, s.student_code, s.picture_url, s.gender, p.exam_body, p.name AS program_name
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

    // Get imported results for this year/semester for students in this class
    const studentIds = students.map(s => s.id);
    let importedRows = [];
    if (studentIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT student_id, subject, class_score, exam_score, total_score, grade, remarks
         FROM results_import
         WHERE school_id = $1
           AND academic_year_id = $2
           AND semester = $3
           AND student_id = ANY($4)`,
        [req.schoolId, academic_year_id, parseInt(semester), studentIds]
      );
      importedRows = rows;
    }

    // importedData[studentId][subject] = { class_score, exam_score, total_score, grade, remarks }
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

    // Group assessments by student → subject → mode → [scores]
    const caData = {};
    for (const a of assessments) {
      if (!caData[a.student_id]) caData[a.student_id] = {};
      if (!caData[a.student_id][a.subject]) caData[a.student_id][a.subject] = {};
      if (!caData[a.student_id][a.subject][a.mode_id]) caData[a.student_id][a.subject][a.mode_id] = [];
      caData[a.student_id][a.subject][a.mode_id].push({ score: parseFloat(a.score), max_score: parseFloat(a.max_score) });
    }

    // Group exam scores by student → subject
    const examData = {};
    for (const e of examScores) {
      if (!examData[e.student_id]) examData[e.student_id] = {};
      examData[e.student_id][e.subject] = { score: parseFloat(e.score), max_score: parseFloat(e.max_score) };
    }

    // Collect all subjects (live + imported)
    const allSubjects = new Set();
    for (const a of assessments) allSubjects.add(a.subject);
    for (const e of examScores) allSubjects.add(e.subject);
    for (const r of importedRows) allSubjects.add(r.subject);

    // Grade lookup — uses DB boundaries if configured, falls back to built-in defaults
    function getGrade(total, examBody) {
      const body = examBody || 'WAEC';
      const bodyBounds = boundaries
        .filter(b => b.exam_body === body)
        .sort((a, b) => parseFloat(b.min_pct) - parseFloat(a.min_pct));

      if (bodyBounds.length > 0) {
        for (const b of bodyBounds) {
          if (total >= parseFloat(b.min_pct)) {
            return { grade: b.grade, remark: b.remark };
          }
        }
        // Score is below the lowest configured boundary — fall through to defaults
      }

      // Built-in defaults when no boundaries have been configured
      if (body === 'CTVET') {
        const grade =
          total >= 75 ? 'A'  :
          total >= 70 ? 'B+' :
          total >= 65 ? 'B-' :
          total >= 55 ? 'C+' :
          total >= 50 ? 'C-' :
          total >= 45 ? 'D'  :
          total >= 40 ? 'E'  : 'F';
        const remark =
          total >= 75 ? 'DISTINCTION'  :
          total >= 65 ? 'UPPER CREDIT' :
          total >= 55 ? 'CREDIT'       :
          total >= 50 ? 'LOWER CREDIT' :
          total >= 40 ? 'PASS'         : 'FAIL';
        return { grade, remark };
      }

      // WAEC / WASSCE
      const grade =
        total >= 75 ? 'A1' :
        total >= 70 ? 'B2' :
        total >= 65 ? 'B3' :
        total >= 60 ? 'C4' :
        total >= 55 ? 'C5' :
        total >= 50 ? 'C6' :
        total >= 45 ? 'D7' :
        total >= 40 ? 'E8' : 'F9';
      const remark =
        total >= 75 ? 'EXCELLENT' :
        total >= 70 ? 'VERY GOOD' :
        total >= 65 ? 'GOOD'      :
        total >= 50 ? 'CREDIT'    :
        total >= 40 ? 'PASS'      : 'FAIL';
      return { grade, remark };
    }

    // Calculate per-student, per-subject results
    const subjectResults = {};
    for (const subject of allSubjects) {
      subjectResults[subject] = [];
      for (const st of students) {
        const hasLiveCA   = !!(caData[st.id]?.[subject]);
        const hasLiveExam = !!(examData[st.id]?.[subject]);
        const hasImport   = !!(importedData[st.id]?.[subject]);

        if (!hasLiveCA && !hasLiveExam && hasImport) {
          // Use imported data directly
          const imp = importedData[st.id][subject];
          subjectResults[subject].push({
            student_id:  st.id,
            ca_score:    imp.class_score,
            exam_score:  imp.exam_score,
            total:       imp.total_score,
            grade:       imp.grade,
            remark:      imp.remarks,
            is_imported: true,
          });
        } else {
          // Live calculation
          let caScore = 0;
          const studentSubjectModes = caData[st.id]?.[subject] || {};
          for (const mode of modes) {
            const modeScores = studentSubjectModes[mode.id] || [];
            if (modeScores.length === 0) continue;
            const avgPct = modeScores.reduce((sum, s) => sum + (s.score / s.max_score * 100), 0) / modeScores.length;
            caScore += (avgPct * parseFloat(mode.ca_contribution)) / 100;
          }
          const scaledCA = totalConfiguredCA > 0 ? (caScore / totalConfiguredCA) * caPercentage : caScore;

          const examEntry = examData[st.id]?.[subject];
          const examScore = examEntry ? (examEntry.score / examEntry.max_score) * examPercentage : null;
          const total = (examScore != null) ? Math.round(scaledCA + examScore) : null;

          subjectResults[subject].push({
            student_id:  st.id,
            ca_score:    Math.round(scaledCA * 10) / 10,
            exam_score:  examScore != null ? Math.round(examScore * 10) / 10 : null,
            total,
            is_imported: false,
          });
        }
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

        let gradeInfo;
        if (row.is_imported) {
          gradeInfo = { grade: row.grade, remark: row.remark };
        } else {
          gradeInfo = row.total != null ? getGrade(row.total, st.exam_body) : { grade: '-', remark: '-' };
        }

        subjectRows.push({
          subject,
          ca_score:         row.ca_score,
          exam_score:       row.exam_score,
          total:            row.total,
          grade:            gradeInfo.grade,
          remark:           gradeInfo.remark,
          subject_position: row.subject_position,
          class_size:       row.class_size,
          is_imported:      row.is_imported,
        });
        if (row.total != null) { totalSum += row.total; subjectCount++; }
      }

      const average = subjectCount > 0 ? Math.round((totalSum / subjectCount) * 10) / 10 : null;
      const overallGrade = average != null ? getGrade(average, st.exam_body) : { grade: '-', remark: '-' };

      return {
        student_id:      st.id,
        student_code:    st.student_code,
        name:            st.name,
        exam_body:       st.exam_body,
        program_name:    st.program_name ?? null,
        picture_url:     st.picture_url ?? null,
        gender:          st.gender ?? null,
        subjects:        subjectRows.sort((a, b) => a.subject.localeCompare(b.subject)),
        average,
        overall_grade:   overallGrade.grade,
        ca_percentage:   caPercentage,
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

    // Attendance per student for this class / year / semester
    const { rows: attRows } = await pool.query(
      `SELECT sar.student_id,
              COUNT(*)::int                                          AS total,
              COUNT(*) FILTER (WHERE sar.status = 'Present')::int   AS present,
              COUNT(*) FILTER (WHERE sar.status = 'Late')::int      AS late,
              COUNT(*) FILTER (WHERE sar.status = 'Absent')::int    AS absent
       FROM student_attendance_records sar
       JOIN student_attendance_sessions sas ON sas.id = sar.session_id
       WHERE sas.school_id = $1
         AND sas.academic_year_id = $2
         AND sas.semester = $3
         AND LOWER(sas.class_name) = LOWER($4)
       GROUP BY sar.student_id`,
      [req.schoolId, academic_year_id, parseInt(semester), class_name]
    );
    const attMap = {};
    for (const r of attRows) attMap[r.student_id] = { present: r.present, late: r.late, absent: r.absent, total: r.total };
    for (const r of results) r.attendance = attMap[r.student_id] ?? null;

    res.json(results);
  } catch (err) { next(err); }
});

// POST /api/results/import  (admin only)
// Body: { rows: [...] }  — called in chunks from the frontend; processes in bulk via unnest()
router.post('/import', adminOnly, async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required and must not be empty' });
    }

    // Load lookup tables once per request
    const [studentsRes, yearsRes] = await Promise.all([
      pool.query(`SELECT id, UPPER(student_code) AS student_code FROM students WHERE school_id = $1`, [req.schoolId]),
      pool.query(`SELECT id, name FROM academic_years WHERE school_id = $1`, [req.schoolId]),
    ]);

    const studentMap = {};
    for (const s of studentsRes.rows) studentMap[s.student_code] = s.id;

    function normalizeYear(name) {
      return String(name || '').replace(/\D/g, '');
    }
    const yearMap = {};
    for (const y of yearsRes.rows) yearMap[normalizeYear(y.name)] = y.id;

    // Validate all rows first — no DB queries here, just map lookups
    const validRows = [];
    const errors    = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i];
      const rowNum = i + 1;

      const studentId = studentMap[String(row.student_code || '').toUpperCase()];
      if (!studentId) {
        errors.push({ row: rowNum, student_code: row.student_code, error: 'Student not found' });
        skipped++; continue;
      }

      const yearId = yearMap[normalizeYear(row.academic_year_name)];
      if (!yearId) {
        errors.push({ row: rowNum, student_code: row.student_code, error: `Academic year not found: ${row.academic_year_name}` });
        skipped++; continue;
      }

      const semester = parseInt(row.semester);
      if (![1, 2].includes(semester)) {
        errors.push({ row: rowNum, student_code: row.student_code, error: `Invalid semester: ${row.semester}` });
        skipped++; continue;
      }

      const subject = String(row.subject || '').trim();
      if (!subject) {
        errors.push({ row: rowNum, student_code: row.student_code, error: 'Subject is missing' });
        skipped++; continue;
      }

      validRows.push({
        studentId, yearId, semester, subject,
        classScore: row.class_score != null && row.class_score !== '' ? parseFloat(row.class_score) : null,
        examScore:  row.exam_score  != null && row.exam_score  !== '' ? parseFloat(row.exam_score)  : null,
        totalScore: row.total_score != null && row.total_score !== '' ? parseFloat(row.total_score) : null,
        grade:      row.grade   ? String(row.grade).trim()   : null,
        remarks:    row.remarks ? String(row.remarks).trim() : null,
      });
    }

    // Bulk upsert in batches of 1 000 rows using unnest() — single query per batch
    const BATCH_SIZE = 1000;
    let inserted = 0, updated = 0;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      const { rows: result } = await pool.query(`
        WITH input AS (
          SELECT
            unnest($1::uuid[])    AS school_id,
            unnest($2::uuid[])    AS student_id,
            unnest($3::uuid[])    AS academic_year_id,
            unnest($4::int[])     AS semester,
            unnest($5::text[])    AS subject,
            unnest($6::numeric[]) AS class_score,
            unnest($7::numeric[]) AS exam_score,
            unnest($8::numeric[]) AS total_score,
            unnest($9::text[])    AS grade,
            unnest($10::text[])   AS remarks
        ),
        upserted AS (
          INSERT INTO results_import
            (school_id, student_id, academic_year_id, semester, subject,
             class_score, exam_score, total_score, grade, remarks)
          SELECT * FROM input
          ON CONFLICT (school_id, student_id, academic_year_id, semester, subject)
          DO UPDATE SET
            class_score = EXCLUDED.class_score,
            exam_score  = EXCLUDED.exam_score,
            total_score = EXCLUDED.total_score,
            grade       = EXCLUDED.grade,
            remarks     = EXCLUDED.remarks,
            imported_at = now()
          RETURNING (xmax = 0) AS was_inserted
        )
        SELECT
          COUNT(*) FILTER (WHERE was_inserted)     AS ins,
          COUNT(*) FILTER (WHERE NOT was_inserted) AS upd
        FROM upserted
      `, [
        batch.map(() => req.schoolId),
        batch.map(r => r.studentId),
        batch.map(r => r.yearId),
        batch.map(r => r.semester),
        batch.map(r => r.subject),
        batch.map(r => r.classScore),
        batch.map(r => r.examScore),
        batch.map(r => r.totalScore),
        batch.map(r => r.grade),
        batch.map(r => r.remarks),
      ]);

      inserted += parseInt(result[0].ins);
      updated  += parseInt(result[0].upd);
    }

    res.json({ total: rows.length, inserted, updated, skipped, errors: errors.slice(0, 100) });
  } catch (err) { next(err); }
});

// GET /api/results/remarks?academic_year_id=&semester=&class_name=
router.get('/remarks', async (req, res, next) => {
  try {
    const { academic_year_id, semester, class_name } = req.query;
    if (!academic_year_id || !semester || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, class_name are required' });
    }
    const { rows } = await pool.query(
      `SELECT rr.student_id, rr.attitude, rr.conduct, rr.general_remarks
       FROM report_remarks rr
       JOIN students s ON s.id = rr.student_id
       WHERE rr.school_id = $1
         AND rr.academic_year_id = $2
         AND rr.semester = $3
         AND LOWER(s.class_name) = LOWER($4)`,
      [req.schoolId, academic_year_id, parseInt(semester), class_name]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/results/remarks  (admin only) — bulk upsert
// Body: { academic_year_id, semester, remarks: [{ student_id, attitude, conduct, general_remarks }] }
router.post('/remarks', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id, semester, remarks } = req.body;
    if (!academic_year_id || !semester || !Array.isArray(remarks)) {
      return res.status(400).json({ error: 'academic_year_id, semester, remarks[] are required' });
    }
    for (const r of remarks) {
      await pool.query(
        `INSERT INTO report_remarks (school_id, student_id, academic_year_id, semester, attitude, conduct, general_remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (school_id, student_id, academic_year_id, semester)
         DO UPDATE SET attitude=$5, conduct=$6, general_remarks=$7, updated_at=now()`,
        [req.schoolId, r.student_id, academic_year_id, parseInt(semester),
         r.attitude || null, r.conduct || null, r.general_remarks || null]
      );
    }
    res.json({ saved: remarks.length });
  } catch (err) { next(err); }
});

// GET /api/results/transcript/:student_id
// Returns full academic history (all years + semesters) for a single student.
router.get('/transcript/:student_id', async (req, res, next) => {
  try {
    const { student_id } = req.params;

    const [studentRes, schoolRow, modesRow, boundariesRow] = await Promise.all([
      pool.query(
        `SELECT s.id, s.name, s.student_code, s.class_name, s.gender, s.picture_url,
                p.name AS program_name, p.exam_body
         FROM students s LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.id = $1 AND s.school_id = $2`,
        [student_id, req.schoolId]
      ),
      pool.query(`SELECT ca_percentage FROM schools WHERE id = $1`, [req.schoolId]),
      pool.query(`SELECT id, name, ca_contribution FROM assessment_modes WHERE school_id = $1`, [req.schoolId]),
      pool.query(
        `SELECT exam_body, grade, min_pct, max_pct, remark FROM grade_boundaries
         WHERE school_id = $1 ORDER BY exam_body, sort_order DESC`,
        [req.schoolId]
      ),
    ]);

    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const caPercentage      = parseFloat(schoolRow.rows[0]?.ca_percentage) || 30;
    const examPercentage    = 100 - caPercentage;
    const modes             = modesRow.rows;
    const boundaries        = boundariesRow.rows;
    const totalConfiguredCA = modes.reduce((s, m) => s + parseFloat(m.ca_contribution), 0) || caPercentage;

    function getGradeT(total, examBody) {
      const body = examBody || 'WAEC';
      const bodyBounds = boundaries
        .filter(b => b.exam_body === body)
        .sort((a, b) => parseFloat(b.min_pct) - parseFloat(a.min_pct));
      if (bodyBounds.length > 0) {
        for (const b of bodyBounds) {
          if (total >= parseFloat(b.min_pct))
            return { grade: b.grade, remark: b.remark };
        }
        // Score below lowest configured boundary — fall through to defaults
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

    // Fetch ALL raw data for this student across every year/semester at once
    const [caRes, examRes, importRes] = await Promise.all([
      pool.query(
        `SELECT a.academic_year_id, a.semester, a.subject, a.mode_id, a.max_score, a.class_name, sc.score
         FROM assessments a
         JOIN assessment_scores sc ON sc.assessment_id = a.id
         WHERE a.school_id = $1 AND sc.student_id = $2 AND sc.score IS NOT NULL AND sc.absent = false`,
        [req.schoolId, student_id]
      ),
      pool.query(
        `SELECT academic_year_id, semester, subject, score, max_score, class_name
         FROM exam_scores WHERE school_id = $1 AND student_id = $2 AND score IS NOT NULL`,
        [req.schoolId, student_id]
      ),
      pool.query(
        `SELECT academic_year_id, semester, subject, class_score, exam_score, total_score, grade, remarks
         FROM results_import WHERE school_id = $1 AND student_id = $2`,
        [req.schoolId, student_id]
      ),
    ]);

    // Determine unique periods (yearId:semester) and their class_name
    const periodMap = {};
    for (const r of caRes.rows) {
      const key = `${r.academic_year_id}:${r.semester}`;
      if (!periodMap[key]) periodMap[key] = { yearId: r.academic_year_id, semester: parseInt(r.semester), className: r.class_name };
      else if (!periodMap[key].className) periodMap[key].className = r.class_name;
    }
    for (const r of examRes.rows) {
      const key = `${r.academic_year_id}:${r.semester}`;
      if (!periodMap[key]) periodMap[key] = { yearId: r.academic_year_id, semester: parseInt(r.semester), className: r.class_name };
      else if (!periodMap[key].className) periodMap[key].className = r.class_name;
    }
    for (const r of importRes.rows) {
      const key = `${r.academic_year_id}:${r.semester}`;
      if (!periodMap[key]) periodMap[key] = { yearId: r.academic_year_id, semester: parseInt(r.semester), className: student.class_name };
    }

    if (Object.keys(periodMap).length === 0) {
      return res.json({
        student_id: student.id, student_code: student.student_code, name: student.name,
        gender: student.gender, picture_url: student.picture_url,
        program_name: student.program_name, exam_body: student.exam_body,
        class_name: student.class_name, semesters: [],
      });
    }

    const yearIds = [...new Set(Object.values(periodMap).map(p => p.yearId))];
    const { rows: yearRows } = await pool.query(
      `SELECT id, name FROM academic_years WHERE id = ANY($1::uuid[])`, [yearIds]
    );
    const yearNameMap = {};
    for (const y of yearRows) yearNameMap[y.id] = y.name;

    const semesters = await Promise.all(Object.values(periodMap).map(async ({ yearId, semester, className }) => {
      const ec = className || student.class_name;

      // Build per-subject maps for this student / period
      const myCA = {}, myExam = {}, myImported = {};
      for (const r of caRes.rows) {
        if (r.academic_year_id !== yearId || parseInt(r.semester) !== semester) continue;
        if (!myCA[r.subject]) myCA[r.subject] = {};
        if (!myCA[r.subject][r.mode_id]) myCA[r.subject][r.mode_id] = [];
        myCA[r.subject][r.mode_id].push({ score: parseFloat(r.score), max_score: parseFloat(r.max_score) });
      }
      for (const r of examRes.rows) {
        if (r.academic_year_id !== yearId || parseInt(r.semester) !== semester) continue;
        myExam[r.subject] = { score: parseFloat(r.score), max_score: parseFloat(r.max_score) };
      }
      for (const r of importRes.rows) {
        if (r.academic_year_id !== yearId || parseInt(r.semester) !== semester) continue;
        myImported[r.subject] = {
          class_score: r.class_score != null ? parseFloat(r.class_score) : null,
          exam_score:  r.exam_score  != null ? parseFloat(r.exam_score)  : null,
          total_score: r.total_score != null ? parseFloat(r.total_score) : null,
          grade: r.grade || '-', remarks: r.remarks || '-',
        };
      }

      const allSubjects = new Set([...Object.keys(myCA), ...Object.keys(myExam), ...Object.keys(myImported)]);
      const subjects = [];
      let totalSum = 0, subjectCount = 0;

      for (const subject of allSubjects) {
        let ca_score, exam_score, total, grade, remark;
        if (!myCA[subject] && !myExam[subject] && myImported[subject]) {
          const imp = myImported[subject];
          ca_score = imp.class_score; exam_score = imp.exam_score;
          total = imp.total_score; grade = imp.grade; remark = imp.remarks;
        } else {
          let caScore = 0;
          for (const mode of modes) {
            const ms = myCA[subject]?.[mode.id] || [];
            if (!ms.length) continue;
            const avgPct = ms.reduce((s, r) => s + (r.score / r.max_score * 100), 0) / ms.length;
            caScore += (avgPct * parseFloat(mode.ca_contribution)) / 100;
          }
          const scaledCA = totalConfiguredCA > 0 ? (caScore / totalConfiguredCA) * caPercentage : caScore;
          const ee = myExam[subject];
          const ev = ee ? (ee.score / ee.max_score) * examPercentage : null;
          total     = ev != null ? Math.round(scaledCA + ev) : null;
          ca_score  = Math.round(scaledCA * 10) / 10;
          exam_score = ev != null ? Math.round(ev * 10) / 10 : null;
          const g = total != null ? getGradeT(total, student.exam_body) : { grade: '-', remark: '-' };
          grade = g.grade; remark = g.remark;
        }
        subjects.push({ subject, ca_score, exam_score, total, grade, remark });
        if (total != null) { totalSum += total; subjectCount++; }
      }

      const average      = subjectCount > 0 ? Math.round((totalSum / subjectCount) * 10) / 10 : null;
      const overallGrade = average != null ? getGradeT(average, student.exam_body) : { grade: '-', remark: '-' };

      // Class position — compare against all classmates for this period
      let class_position = null, class_total = null;
      try {
        const { rows: classmates } = await pool.query(
          `SELECT id FROM students WHERE school_id = $1 AND LOWER(class_name) = LOWER($2) AND status = 'Active'`,
          [req.schoolId, ec]
        );
        if (classmates.length > 1 && average != null) {
          const ids = classmates.map(c => c.id);
          const [cmCA, cmExam, cmImp] = await Promise.all([
            pool.query(
              `SELECT sc.student_id, a.subject, a.mode_id, a.max_score, sc.score
               FROM assessments a JOIN assessment_scores sc ON sc.assessment_id = a.id
               WHERE a.school_id = $1 AND a.academic_year_id = $2 AND a.semester = $3
                 AND LOWER(a.class_name) = LOWER($4) AND sc.score IS NOT NULL AND sc.absent = false`,
              [req.schoolId, yearId, semester, ec]
            ),
            pool.query(
              `SELECT student_id, subject, score, max_score FROM exam_scores
               WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3
                 AND LOWER(class_name) = LOWER($4) AND score IS NOT NULL`,
              [req.schoolId, yearId, semester, ec]
            ),
            pool.query(
              `SELECT student_id, subject, total_score FROM results_import
               WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3 AND student_id = ANY($4::uuid[])`,
              [req.schoolId, yearId, semester, ids]
            ),
          ]);
          const averages = {};
          for (const cm of classmates) {
            const cCA = {}, cEx = {}, cIm = {};
            for (const r of cmCA.rows)  {
              if (r.student_id !== cm.id) continue;
              if (!cCA[r.subject]) cCA[r.subject] = {};
              if (!cCA[r.subject][r.mode_id]) cCA[r.subject][r.mode_id] = [];
              cCA[r.subject][r.mode_id].push({ score: parseFloat(r.score), max_score: parseFloat(r.max_score) });
            }
            for (const r of cmExam.rows) { if (r.student_id === cm.id) cEx[r.subject] = { score: parseFloat(r.score), max_score: parseFloat(r.max_score) }; }
            for (const r of cmImp.rows)  { if (r.student_id === cm.id && r.total_score != null) cIm[r.subject] = parseFloat(r.total_score); }
            const subs = new Set([...Object.keys(cCA), ...Object.keys(cEx), ...Object.keys(cIm)]);
            let sum = 0, cnt = 0;
            for (const subj of subs) {
              let t = null;
              if (!cCA[subj] && !cEx[subj] && cIm[subj] != null) {
                t = cIm[subj];
              } else {
                let cs = 0;
                for (const mode of modes) {
                  const ms = cCA[subj]?.[mode.id] || [];
                  if (!ms.length) continue;
                  const ap = ms.reduce((s, r) => s + (r.score / r.max_score * 100), 0) / ms.length;
                  cs += (ap * parseFloat(mode.ca_contribution)) / 100;
                }
                const sca = totalConfiguredCA > 0 ? (cs / totalConfiguredCA) * caPercentage : cs;
                const ee2 = cEx[subj];
                const ev2 = ee2 ? (ee2.score / ee2.max_score) * examPercentage : null;
                t = ev2 != null ? Math.round((sca + ev2) * 10) / 10 : null;
              }
              if (t != null) { sum += t; cnt++; }
            }
            if (cnt > 0) averages[cm.id] = sum / cnt;
          }
          const allAvgs = Object.values(averages);
          class_total    = allAvgs.length;
          class_position = allAvgs.filter(a => a > average).length + 1;
        }
      } catch (_) { /* position non-critical */ }

      return {
        year_id: yearId, academic_year: yearNameMap[yearId] || yearId,
        semester, class_name: ec,
        subjects: subjects.sort((a, b) => a.subject.localeCompare(b.subject)),
        average, overall_grade: overallGrade.grade, class_position, class_total,
      };
    }));

    semesters.sort((a, b) => {
      if (a.academic_year !== b.academic_year) return a.academic_year.localeCompare(b.academic_year);
      return a.semester - b.semester;
    });

    res.json({
      student_id:   student.id,   student_code: student.student_code,
      name:         student.name, gender:       student.gender,
      picture_url:  student.picture_url, program_name: student.program_name,
      exam_body:    student.exam_body,   class_name:   student.class_name,
      semesters,
    });
  } catch (err) { next(err); }
});

module.exports = router;
