const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const multer = require('multer');
const ExcelJS = require('exceljs');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireActiveSubscription);

// ── Submission lock helpers ────────────────────────────────────────────────────

async function getSubmissionStatus(schoolId, yearId, semester, subject, className) {
  if (!yearId) return 'draft';
  const { rows } = await pool.query(
    `SELECT status FROM result_submissions
     WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND subject=$4 AND class_name=$5`,
    [schoolId, yearId, parseInt(semester), subject, className]
  );
  return rows[0]?.status ?? 'draft';
}

const LOCKED_STATUSES = ['submitted','hod_approved','final_approved','published'];

// GET /api/assessments/my-subjects?academic_year_id=&semester=
// Returns subjects + classes the requesting teacher is assigned to in the timetable
router.get('/my-subjects', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'academic_year_id and semester are required' });
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT subject, class_names
       FROM timetable
       WHERE school_id = $1 AND teacher_id = $2
         AND academic_year_id = $3 AND semester = $4
       ORDER BY subject, class_names`,
      [req.schoolId, req.user.id, academic_year_id, parseInt(semester)]
    );
    // Expand class_names (comma-separated) into individual rows
    const subjects = [];
    for (const r of rows) {
      const classes = r.class_names.split(',').map(c => c.trim()).filter(Boolean);
      for (const cls of classes) {
        subjects.push({ subject: r.subject, class_name: cls });
      }
    }
    // Deduplicate
    const seen = new Set();
    const unique = subjects.filter(s => {
      const key = `${s.subject}|${s.class_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json(unique);
  } catch (err) { next(err); }
});

// GET /api/assessments?academic_year_id=&semester=&subject=&class_name=
router.get('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name } = req.query;
    if (!academic_year_id || !semester || !subject || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name are required' });
    }
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const params = [req.schoolId, academic_year_id, parseInt(semester), subject, class_name];
    let teacherFilter = '';
    if (!isAdmin) { params.push(req.user.id); teacherFilter = `AND a.teacher_id = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT a.id, a.mode_id, m.name AS mode_name, m.ca_contribution,
              a.title, a.date, a.max_score,
              a.subject, a.class_name,
              a.academic_year_id, a.semester, a.created_at,
              t.name AS teacher_name,
              COUNT(sc.id)::int AS score_count
       FROM assessments a
       JOIN assessment_modes m ON m.id = a.mode_id
       LEFT JOIN teachers t ON t.id = a.teacher_id
       LEFT JOIN assessment_scores sc ON sc.assessment_id = a.id
       WHERE a.school_id = $1
         AND a.academic_year_id = $2
         AND a.semester = $3
         AND LOWER(a.subject) = LOWER($4)
         AND LOWER(a.class_name) = LOWER($5)
         ${teacherFilter}
       GROUP BY a.id, m.name, m.ca_contribution, t.name
       ORDER BY a.date NULLS LAST, m.name, a.title`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/assessments
router.post('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name, mode_id, title, date, max_score } = req.body;
    if (!academic_year_id || !semester || !subject || !class_name || !mode_id) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name, mode_id are required' });
    }
    // Verify mode belongs to school
    const modeCheck = await pool.query(
      `SELECT id, name, max_instances FROM assessment_modes WHERE id = $1 AND school_id = $2`,
      [mode_id, req.schoolId]
    );
    if (!modeCheck.rows.length) return res.status(400).json({ error: 'Invalid assessment mode' });

    // Enforce max_instances per subject/class/semester
    const mode = modeCheck.rows[0];
    const client = await pool.connect();
    let newAssessment;
    try {
      await client.query('BEGIN');
      if (mode.max_instances != null) {
        const { rows: existing } = await client.query(
          `SELECT COUNT(*) FROM assessments
           WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3
             AND subject=$4 AND class_name=$5 AND mode_id=$6
           FOR UPDATE`,
          [req.schoolId, academic_year_id, parseInt(semester), subject, class_name, mode_id]
        );
        if (parseInt(existing[0].count) >= mode.max_instances) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(409).json({
            error: `Maximum ${mode.max_instances} "${mode.name}" assessment(s) allowed per subject per semester`,
          });
        }
      }
      const { rows } = await client.query(
        `INSERT INTO assessments
           (school_id, academic_year_id, semester, subject, class_name, teacher_id, mode_id, title, date, max_score)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, mode_id, title, date, max_score, subject, class_name`,
        [req.schoolId, academic_year_id, parseInt(semester), subject, class_name,
         req.user.id, mode_id, title||null, date||null, parseFloat(max_score)||100]
      );
      await client.query('COMMIT');
      newAssessment = rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.status(201).json(newAssessment);
  } catch (err) { next(err); }
});

// GET /api/assessments/subject-remarks — get remarks for a subject/class/semester
// IMPORTANT: must be declared before /:id routes to avoid Express treating 'subject-remarks' as :id
router.get('/subject-remarks', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name } = req.query;
    if (!academic_year_id || !semester || !subject || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name are required' });
    }
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin) {
      const { rows: assigned } = await pool.query(
        `SELECT 1 FROM timetable
         WHERE school_id=$1 AND teacher_id=$2 AND academic_year_id=$3 AND semester=$4
           AND LOWER(subject)=LOWER($5)
           AND LOWER($6) = ANY(SELECT LOWER(TRIM(cls)) FROM unnest(string_to_array(class_names, ',')) AS cls)
         LIMIT 1`,
        [req.schoolId, req.user.id, academic_year_id, parseInt(semester), subject, class_name]
      );
      if (!assigned.length) return res.status(403).json({ error: 'You are not assigned to teach this subject to this class' });
    }
    // Get all active students in class with their remarks (NULL if none yet)
    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.student_code, s.name,
              sr.remarks, sr.updated_at
       FROM students s
       LEFT JOIN subject_remarks sr ON sr.student_id = s.id
         AND sr.academic_year_id = $2 AND sr.semester = $3
         AND sr.subject = $4 AND sr.class_name = $5 AND sr.school_id = $1
       WHERE s.school_id = $1 AND s.class_name = $5 AND s.status = 'Active'
       ORDER BY s.name`,
      [req.schoolId, academic_year_id, parseInt(semester), subject, class_name]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/assessments/subject-remarks — bulk upsert subject remarks
// IMPORTANT: must be declared before /:id routes to avoid Express treating 'subject-remarks' as :id
router.post('/subject-remarks', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name, remarks } = req.body;
    if (!academic_year_id || !semester || !subject || !class_name || !Array.isArray(remarks)) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name, remarks[] are required' });
    }
    if (!remarks.length) return res.json({ message: 'No remarks to save.' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin) {
      const { rows: assigned } = await pool.query(
        `SELECT 1 FROM timetable
         WHERE school_id=$1 AND teacher_id=$2 AND academic_year_id=$3 AND semester=$4
           AND LOWER(subject)=LOWER($5)
           AND LOWER($6) = ANY(SELECT LOWER(TRIM(cls)) FROM unnest(string_to_array(class_names, ',')) AS cls)
         LIMIT 1`,
        [req.schoolId, req.user.id, academic_year_id, parseInt(semester), subject, class_name]
      );
      if (!assigned.length) return res.status(403).json({ error: 'You are not assigned to teach this subject to this class' });
    }

    const { rows: classStudents } = await pool.query(
      `SELECT id FROM students WHERE school_id=$1 AND LOWER(class_name)=LOWER($2) AND status='Active'`,
      [req.schoolId, class_name]
    );
    const validStudentIds = new Set(classStudents.map(s => s.id));
    const safeRemarks = remarks.filter(r => r.student_id && validStudentIds.has(r.student_id));
    if (!safeRemarks.length) return res.json({ message: 'No remarks to save.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of safeRemarks) {
        await client.query(
          `INSERT INTO subject_remarks (school_id, academic_year_id, semester, subject, class_name, student_id, teacher_id, remarks, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
           ON CONFLICT (school_id, academic_year_id, semester, subject, class_name, student_id)
           DO UPDATE SET remarks=$8, teacher_id=$7, updated_at=now()`,
          [req.schoolId, academic_year_id, parseInt(semester), subject, class_name, r.student_id, req.user.id, r.remarks ?? null]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.json({ message: 'Remarks saved.' });
  } catch (err) { next(err); }
});

// GET /api/assessments/class-template — bulk CA template (all assessments for a subject/class)
// IMPORTANT: must be declared before /:id routes
router.get('/class-template', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name } = req.query;
    if (!academic_year_id || !semester || !subject || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name are required' });
    }
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const asmtParams = [req.schoolId, academic_year_id, parseInt(semester), subject, class_name];
    let teacherFilter = '';
    if (!isAdmin) { asmtParams.push(req.user.id); teacherFilter = `AND a.teacher_id = $${asmtParams.length}`; }

    const { rows: assessments } = await pool.query(
      `SELECT a.id, a.max_score, m.name AS mode_name, a.title, a.date
       FROM assessments a
       JOIN assessment_modes m ON m.id = a.mode_id
       WHERE a.school_id = $1 AND a.academic_year_id = $2 AND a.semester = $3
         AND LOWER(a.subject) = LOWER($4) AND LOWER(a.class_name) = LOWER($5)
         ${teacherFilter}
       ORDER BY a.date NULLS LAST, m.name, a.title`,
      asmtParams
    );
    if (!assessments.length) {
      return res.status(404).json({ error: 'No assessments found for this subject/class/semester' });
    }

    const { rows: students } = await pool.query(
      `SELECT s.id AS student_id, s.student_code, s.name FROM students s
       WHERE s.school_id = $1 AND s.status = 'Active' AND LOWER(s.class_name) = LOWER($2)
       ORDER BY s.name`,
      [req.schoolId, class_name]
    );

    const asmtIds = assessments.map(a => a.id);
    const { rows: allScores } = await pool.query(
      `SELECT assessment_id, student_id, score, absent
       FROM assessment_scores WHERE assessment_id = ANY($1::uuid[])`,
      [asmtIds]
    );
    const scoreMap = {};
    for (const sc of allScores) scoreMap[`${sc.assessment_id}|${sc.student_id}`] = sc;

    // Fetch year name for label
    const { rows: [yearRow] } = await pool.query(
      `SELECT name FROM academic_years WHERE id = $1 AND school_id = $2`,
      [academic_year_id, req.schoolId]
    );

    const wb  = new ExcelJS.Workbook();
    const ws  = wb.addWorksheet('CA Scores');
    const totalCols = 3 + assessments.length;

    ws.columns = [
      { key: 'student_id',   width: 38 },
      { key: 'student_code', width: 14 },
      { key: 'name',         width: 28 },
      ...assessments.map((_, i) => ({ key: `a${i}`, width: 16 })),
    ];

    // Row 1: Note
    const noteRow = ws.addRow([
      `CAs — ${subject} | Class: ${class_name} | ${yearRow?.name ?? ''} | Semester ${semester}`,
      ...Array(totalCols - 1).fill(''),
    ]);
    ws.mergeCells(1, 1, 1, totalCols);
    noteRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    noteRow.getCell(1).font      = { italic: true, color: { argb: 'FF856404' } };
    noteRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 20;

    // Row 2: Assessment IDs (machine-readable, tiny grey text)
    const idRow = ws.addRow(['ASSESSMENT_IDS', '', '', ...assessments.map(a => a.id)]);
    idRow.eachCell(cell => { cell.font = { size: 7, color: { argb: 'FFCCCCCC' } }; });
    ws.getRow(2).height = 11;

    // Row 3: Headers
    const hdrRow = ws.addRow([
      'Student ID (do not edit)', 'Student No.', 'Name',
      ...assessments.map(a => {
        const lbl = [a.mode_name, a.title].filter(Boolean).join(' – ');
        const d   = a.date ? new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
        return `${lbl}${d ? ` (${d})` : ''}\nMax: ${a.max_score}`;
      }),
    ]);
    hdrRow.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C2218' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    ws.getRow(3).height = 36;

    const greyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E2DA' } };

    for (let i = 0; i < students.length; i++) {
      const s      = students[i];
      const rowNum = i + 4;
      const scoreVals = assessments.map(a => {
        const sc = scoreMap[`${a.id}|${s.student_id}`];
        if (!sc)            return '';
        if (sc.absent)      return 'Absent';
        return sc.score != null ? sc.score : '';
      });
      const row = ws.addRow([s.student_id, s.student_code, s.name, ...scoreVals]);
      row.getCell(1).fill = greyFill;
      row.getCell(1).font = { color: { argb: 'FF8C7E6E' }, size: 9 };
      row.getCell(2).fill = greyFill;
      row.getCell(2).font = { bold: true, color: { argb: 'FF2C2218' } };
      row.getCell(3).fill = greyFill;
      row.getCell(3).font = { color: { argb: 'FF2C2218' } };

      for (let j = 0; j < assessments.length; j++) {
        ws.getCell(rowNum, j + 4).dataValidation = {
          type: 'decimal', operator: 'between',
          formulae: [0, parseFloat(assessments[j].max_score)],
          showErrorMessage: true, errorTitle: 'Invalid Score',
          error: `Must be 0–${assessments[j].max_score} (or Absent)`,
        };
      }
    }

    const label = `${subject}_${class_name}_sem${semester}`.replace(/[^a-z0-9_]/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${label}_CAs.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// POST /api/assessments/class-upload-scores — upload bulk CA Excel
// IMPORTANT: must be declared before /:id routes
router.post('/class-upload-scores', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { academic_year_id, semester, subject, class_name } = req.body;
    if (!academic_year_id || !semester || !subject || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name are required' });
    }

    const subStatus = await getSubmissionStatus(req.schoolId, academic_year_id, semester, subject, class_name);
    if (LOCKED_STATUSES.includes(subStatus)) {
      return res.status(409).json({ error: `Scores are locked — submission status is "${subStatus}".` });
    }

    const { rows: students } = await pool.query(
      `SELECT id FROM students WHERE school_id = $1 AND status = 'Active' AND LOWER(class_name) = LOWER($2)`,
      [req.schoolId, class_name]
    );
    const validIds = new Set(students.map(s => s.id));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'No worksheet found in the uploaded file' });

    // Read assessment IDs from row 2 (col C = index 3, onwards)
    const idRow  = ws.getRow(2);
    const asmtIds = [];
    let colIdx = 4;
    while (true) {
      const val = (idRow.getCell(colIdx).text ?? '').trim();
      if (!val || val.length < 30) break; // UUIDs are 36 chars
      asmtIds.push(val);
      colIdx++;
    }
    if (!asmtIds.length) {
      return res.status(400).json({ error: 'Could not read assessment IDs from the template. Please use the downloaded template file.' });
    }

    // Validate assessment IDs
    const { rows: validAsmts } = await pool.query(
      `SELECT id, max_score, teacher_id FROM assessments WHERE id = ANY($1::uuid[]) AND school_id = $2`,
      [asmtIds, req.schoolId]
    );
    const asmtMap = Object.fromEntries(validAsmts.map(a => [a.id, a]));
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    for (const id of asmtIds) {
      if (!asmtMap[id]) {
        return res.status(400).json({ error: `Assessment not found. Please use the downloaded template file.` });
      }
      if (!isAdmin && asmtMap[id].teacher_id !== req.user.id) {
        return res.status(403).json({ error: 'You are not the owner of one or more assessments in this template.' });
      }
    }

    function colLabel(n) {
      let r = '';
      while (n > 0) { n--; r = String.fromCharCode(65 + (n % 26)) + r; n = Math.floor(n / 26); }
      return r;
    }

    const results  = { saved: 0, skipped: 0, errors: [] };
    const toUpsert = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum <= 3) return; // skip note + id + header rows

      const studentId = (row.getCell(1).text ?? '').trim();
      if (!studentId) { results.skipped++; return; }
      if (!validIds.has(studentId)) {
        results.errors.push({ row: rowNum, message: `Student ID not found in class ${class_name}` });
        return;
      }

      for (let j = 0; j < asmtIds.length; j++) {
        const raw     = row.getCell(j + 4).value;
        const rawText = (row.getCell(j + 4).text ?? '').trim().toLowerCase();
        if (raw === null || raw === undefined || raw === '') continue; // blank = skip this cell

        const absent = rawText === 'absent' || rawText === 'yes' || rawText === 'true';
        let score = null;

        if (!absent) {
          const num = parseFloat(raw);
          if (isNaN(num)) {
            results.errors.push({ row: rowNum, message: `Col ${colLabel(j + 4)}: invalid score "${raw}"` });
            continue;
          }
          const maxScore = parseFloat(asmtMap[asmtIds[j]].max_score);
          if (num < 0 || num > maxScore) {
            results.errors.push({ row: rowNum, message: `Col ${colLabel(j + 4)}: score ${num} out of range (0–${maxScore})` });
            continue;
          }
          score = num;
        }

        toUpsert.push({ assessment_id: asmtIds[j], student_id: studentId, score, absent });
      }
    });

    if (toUpsert.length === 0 && results.errors.length > 0) {
      return res.status(422).json({ ...results, error: `All rows had errors — check errors below` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { assessment_id, student_id, score, absent } of toUpsert) {
        await client.query(
          `INSERT INTO assessment_scores (assessment_id, student_id, score, absent)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (assessment_id, student_id)
           DO UPDATE SET score = EXCLUDED.score, absent = EXCLUDED.absent`,
          [assessment_id, student_id, score, absent]
        );
        results.saved++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }

    res.json(results);
  } catch (err) { next(err); }
});

// GET /api/assessments/admin-list — admin: list all assessments with flexible filters
// IMPORTANT: must be declared before /:id routes
router.get('/admin-list', adminOnly, async (req, res, next) => {
  try {
    const { teacher_id, academic_year_id, semester, subject, class_name, search } = req.query;
    const params = [req.schoolId];
    const clauses = [];

    if (teacher_id)       { params.push(teacher_id);              clauses.push(`a.teacher_id = $${params.length}`); }
    if (academic_year_id) { params.push(academic_year_id);        clauses.push(`a.academic_year_id = $${params.length}`); }
    if (semester)         { params.push(parseInt(semester));       clauses.push(`a.semester = $${params.length}`); }
    if (subject)          { params.push(subject);                  clauses.push(`LOWER(a.subject) = LOWER($${params.length})`); }
    if (class_name)       { params.push(class_name);               clauses.push(`LOWER(a.class_name) = LOWER($${params.length})`); }
    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      clauses.push(`(a.title ILIKE $${p} OR a.subject ILIKE $${p} OR t.name ILIKE $${p} OR a.class_name ILIKE $${p})`);
    }

    const where = clauses.length ? `AND ${clauses.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT a.id, a.mode_id, m.name AS mode_name,
              a.title, a.date, a.max_score,
              a.subject, a.class_name,
              a.academic_year_id, ay.name AS academic_year_name,
              a.semester, a.created_at,
              a.teacher_id, t.name AS teacher_name,
              COUNT(sc.id)::int AS score_count
       FROM assessments a
       JOIN assessment_modes m ON m.id = a.mode_id
       LEFT JOIN teachers t ON t.id = a.teacher_id
       LEFT JOIN academic_years ay ON ay.id = a.academic_year_id
       LEFT JOIN assessment_scores sc ON sc.assessment_id = a.id
       WHERE a.school_id = $1 ${where}
       GROUP BY a.id, m.name, t.name, ay.name
       ORDER BY a.created_at DESC
       LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /api/assessments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { title, date, max_score, mode_id, semester, academic_year_id } = req.body;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

    // Check if results are locked before applying any other guards
    const { rows: asmtRows } = await pool.query(
      'SELECT * FROM assessments WHERE id=$1 AND school_id=$2',
      [req.params.id, req.schoolId]
    );
    if (!asmtRows.length) return res.status(404).json({ error: 'Assessment not found' });
    const asmt = asmtRows[0];
    const subStatus = await getSubmissionStatus(req.schoolId, asmt.academic_year_id, asmt.semester, asmt.subject, asmt.class_name);
    if (LOCKED_STATUSES.includes(subStatus) && !isAdmin) {
      return res.status(409).json({ error: `Assessment is locked — submission status is "${subStatus}".` });
    }

    // Fetch the assessment with score count to apply guards
    const fetchParams = [req.params.id, req.schoolId];
    let ownerClause = '';
    if (!isAdmin) { fetchParams.push(req.user.id); ownerClause = `AND a.teacher_id = $${fetchParams.length}`; }

    const { rows: [assessment] } = await pool.query(
      `SELECT a.*, COUNT(sc.id)::int AS score_count
       FROM assessments a
       LEFT JOIN assessment_scores sc ON sc.assessment_id = a.id
       WHERE a.id = $1 AND a.school_id = $2 ${ownerClause}
       GROUP BY a.id`,
      fetchParams
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    // Determine if semester or academic_year is being changed
    const newSem  = semester          !== undefined ? parseInt(semester) : null;
    const newYear = academic_year_id  !== undefined ? academic_year_id  : null;
    const changingSemester = newSem  !== null && newSem  !== assessment.semester;
    const changingYear     = newYear !== null && newYear !== assessment.academic_year_id;

    if ((changingSemester || changingYear) && !isAdmin) {
      if (assessment.score_count > 0) {
        return res.status(409).json({
          error: 'Semester and academic year cannot be changed after scores have been entered.',
        });
      }
      const ageHours = (Date.now() - new Date(assessment.created_at).getTime()) / 3_600_000;
      if (ageHours > 48) {
        return res.status(403).json({
          error: 'Semester and academic year can only be changed within 48 hours of creating the assessment. Contact your administrator.',
        });
      }
    }

    // Validate new academic year belongs to this school
    if (changingYear) {
      const { rows: yr } = await pool.query(
        'SELECT id FROM academic_years WHERE id = $1 AND school_id = $2',
        [academic_year_id, req.schoolId]
      );
      if (!yr.length) return res.status(400).json({ error: 'Invalid academic year.' });
    }

    const finalSemester = changingSemester ? newSem          : assessment.semester;
    const finalYearId   = changingYear     ? academic_year_id : assessment.academic_year_id;
    const finalModeId   = mode_id          || assessment.mode_id;
    const finalTitle    = title     !== undefined ? (title?.trim()       || null) : assessment.title;
    const finalDate     = date      !== undefined ? (date                || null) : assessment.date;
    const finalMaxScore = max_score !== undefined ? (parseFloat(max_score) || 100) : assessment.max_score;

    const { rows } = await pool.query(
      `UPDATE assessments
       SET title = $1, date = $2, max_score = $3, mode_id = $4,
           semester = $5, academic_year_id = $6
       WHERE id = $7 AND school_id = $8
       RETURNING id, mode_id, title, date, max_score, semester, academic_year_id, created_at`,
      [finalTitle, finalDate, finalMaxScore, finalModeId, finalSemester, finalYearId, req.params.id, req.schoolId]
    );

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/assessments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

    // Check if results are locked
    const { rows: asmtRows } = await pool.query(
      'SELECT * FROM assessments WHERE id=$1 AND school_id=$2',
      [req.params.id, req.schoolId]
    );
    if (!asmtRows.length) return res.status(404).json({ error: 'Assessment not found' });
    const asmt = asmtRows[0];
    const subStatus = await getSubmissionStatus(req.schoolId, asmt.academic_year_id, asmt.semester, asmt.subject, asmt.class_name);
    if (LOCKED_STATUSES.includes(subStatus) && !isAdmin) {
      return res.status(409).json({ error: `Assessment is locked — submission status is "${subStatus}".` });
    }

    const params = [req.params.id, req.schoolId];
    let ownerFilter = '';
    if (!isAdmin) { params.push(req.user.id); ownerFilter = `AND teacher_id = $${params.length}`; }

    const { rowCount } = await pool.query(
      `DELETE FROM assessments WHERE id = $1 AND school_id = $2 ${ownerFilter}`,
      params
    );
    if (!rowCount) return res.status(404).json({ error: 'Assessment not found' });
    res.json({ message: 'Assessment deleted' });
  } catch (err) { next(err); }
});

// GET /api/assessments/:id/scores — all student scores for an assessment
router.get('/:id/scores', async (req, res, next) => {
  try {
    const { rows: [assessment] } = await pool.query(
      `SELECT * FROM assessments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && assessment.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not the owner of this assessment' });
    }

    // Get all active students in this class
    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.student_code, s.name,
              sc.id AS score_id, sc.score, sc.absent
       FROM students s
       LEFT JOIN assessment_scores sc ON sc.assessment_id = $1 AND sc.student_id = s.id
       WHERE s.school_id = $2 AND s.status = 'Active'
         AND LOWER(s.class_name) = LOWER($3)
       ORDER BY s.name`,
      [req.params.id, req.schoolId, assessment.class_name]
    );
    res.json({ assessment, scores: rows });
  } catch (err) { next(err); }
});

// POST /api/assessments/:id/scores — bulk upsert scores
router.post('/:id/scores', async (req, res, next) => {
  try {
    const { scores } = req.body; // [{ student_id, score, absent }]
    if (!Array.isArray(scores)) return res.status(400).json({ error: 'scores must be an array' });

    const { rows: [assessment] } = await pool.query(
      `SELECT * FROM assessments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    // Check if results are locked
    const subStatus = await getSubmissionStatus(req.schoolId, assessment.academic_year_id, assessment.semester, assessment.subject, assessment.class_name);
    if (LOCKED_STATUSES.includes(subStatus)) {
      return res.status(409).json({ error: `Scores are locked — submission status is "${subStatus}". Contact your HOD or admin to unlock.` });
    }

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && assessment.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not the owner of this assessment' });
    }

    // Validate scores against max_score
    for (const s of scores) {
      if (s.score != null && !s.absent) {
        const numScore = parseFloat(s.score);
        if (isNaN(numScore) || numScore < 0 || numScore > parseFloat(assessment.max_score)) {
          return res.status(400).json({ error: `Score ${s.score} exceeds max score of ${assessment.max_score}` });
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { student_id, score, absent } of scores) {
        await client.query(
          `INSERT INTO assessment_scores (assessment_id, student_id, score, absent)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (assessment_id, student_id)
           DO UPDATE SET score = EXCLUDED.score, absent = EXCLUDED.absent`,
          [req.params.id, student_id, score != null ? parseFloat(score) : null, absent || false]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ message: 'Scores saved' });
  } catch (err) { next(err); }
});

// GET /api/assessments/:id/score-template — download pre-filled Excel template
router.get('/:id/score-template', async (req, res, next) => {
  try {
    const { rows: [assessment] } = await pool.query(
      `SELECT a.*, am.name AS mode_name
       FROM assessments a
       LEFT JOIN assessment_modes am ON am.id = a.mode_id
       WHERE a.id = $1 AND a.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && assessment.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not the owner of this assessment' });
    }

    const { rows: students } = await pool.query(
      `SELECT s.id AS student_id, s.student_code, s.name,
              sc.score, sc.absent
       FROM students s
       LEFT JOIN assessment_scores sc ON sc.assessment_id = $1 AND sc.student_id = s.id
       WHERE s.school_id = $2 AND s.status = 'Active'
         AND LOWER(s.class_name) = LOWER($3)
       ORDER BY s.name`,
      [req.params.id, req.schoolId, assessment.class_name]
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Scores');

    ws.columns = [
      { key: 'student_id',   width: 38 },
      { key: 'student_code', width: 14 },
      { key: 'name',         width: 28 },
      { key: 'score',        width: 14 },
      { key: 'absent',       width: 14 },
    ];

    // Note row
    const note = ws.addRow([
      `Assessment: ${[assessment.mode_name, assessment.title].filter(Boolean).join(' – ')} | Class: ${assessment.class_name} | Max: ${assessment.max_score}`,
      '', '', '', '',
    ]);
    ws.mergeCells(1, 1, 1, 5);
    note.getCell(1).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    note.getCell(1).font  = { italic: true, color: { argb: 'FF856404' } };
    note.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 20;

    // Header row
    const hdr = ws.addRow(['Student ID (do not edit)', 'Student No.', 'Name', `Score (0–${assessment.max_score})`, 'Absent (Yes/No)']);
    hdr.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C2218' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.getRow(2).height = 20;

    const greyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E2DA' } };
    for (let i = 0; i < students.length; i++) {
      const s   = students[i];
      const row = ws.addRow([
        s.student_id,
        s.student_code,
        s.name,
        s.score != null ? s.score : '',
        s.absent ? 'Yes' : '',
      ]);
      const rowNum = i + 3;
      row.getCell(1).fill = greyFill;
      row.getCell(1).font = { color: { argb: 'FF8C7E6E' }, size: 9 };
      row.getCell(2).fill = greyFill;
      row.getCell(2).font = { bold: true, color: { argb: 'FF2C2218' } };
      row.getCell(3).fill = greyFill;
      row.getCell(3).font = { color: { argb: 'FF2C2218' } };

      // Score validation
      ws.getCell(rowNum, 4).dataValidation = {
        type: 'decimal', operator: 'between',
        formulae: [0, parseFloat(assessment.max_score)],
        showErrorMessage: true,
        errorTitle: 'Invalid Score',
        error: `Must be 0 – ${assessment.max_score}`,
      };
      // Absent dropdown
      ws.getCell(rowNum, 5).dataValidation = {
        type: 'list', formulae: ['"Yes,No"'],
        showErrorMessage: true, errorTitle: 'Invalid', error: 'Enter Yes or No',
      };
    }

    const label = [assessment.mode_name, assessment.title, assessment.class_name]
      .filter(Boolean).join('_').replace(/[^a-z0-9_]/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${label}_scores.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// POST /api/assessments/:id/upload-scores — upload Excel with filled scores
router.post('/:id/upload-scores', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { rows: [assessment] } = await pool.query(
      `SELECT * FROM assessments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && assessment.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not the owner of this assessment' });
    }

    const subStatus = await getSubmissionStatus(req.schoolId, assessment.academic_year_id, assessment.semester, assessment.subject, assessment.class_name);
    if (LOCKED_STATUSES.includes(subStatus)) {
      return res.status(409).json({ error: `Scores are locked — submission status is "${subStatus}".` });
    }

    // Valid student IDs for this class
    const { rows: students } = await pool.query(
      `SELECT id FROM students WHERE school_id = $1 AND status = 'Active' AND LOWER(class_name) = LOWER($2)`,
      [req.schoolId, assessment.class_name]
    );
    const validIds = new Set(students.map(s => s.id));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'No worksheet found in the uploaded file' });

    const results = { saved: 0, skipped: 0, errors: [] };
    const toUpsert = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum <= 2) return; // skip note + header rows

      const studentId = (row.getCell(1).text ?? '').trim();
      const scoreRaw  = row.getCell(4).value;
      const absentRaw = (row.getCell(5).text ?? '').trim().toLowerCase();

      if (!studentId) { results.skipped++; return; }
      if (!validIds.has(studentId)) {
        results.errors.push({ row: rowNum, message: `Student ID not found in class ${assessment.class_name}` });
        return;
      }

      const absent = absentRaw === 'yes' || absentRaw === 'true';
      let score = null;

      if (!absent) {
        if (scoreRaw === null || scoreRaw === undefined || scoreRaw === '') {
          results.skipped++;
          return;
        }
        const num = parseFloat(scoreRaw);
        if (isNaN(num)) {
          results.errors.push({ row: rowNum, message: `Invalid score "${scoreRaw}" — must be a number` });
          return;
        }
        if (num < 0 || num > parseFloat(assessment.max_score)) {
          results.errors.push({ row: rowNum, message: `Score ${num} out of range (0–${assessment.max_score})` });
          return;
        }
        score = num;
      }

      toUpsert.push({ student_id: studentId, score, absent });
    });

    if (toUpsert.length === 0 && results.errors.length > 0) {
      return res.status(422).json({ ...results, error: `All ${results.errors.length} row(s) had errors — check errors below` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { student_id, score, absent } of toUpsert) {
        await client.query(
          `INSERT INTO assessment_scores (assessment_id, student_id, score, absent)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (assessment_id, student_id)
           DO UPDATE SET score = EXCLUDED.score, absent = EXCLUDED.absent`,
          [req.params.id, student_id, score, absent]
        );
        results.saved++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }

    res.json(results);
  } catch (err) { next(err); }
});

module.exports = router;
