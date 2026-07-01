const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
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

// GET /api/exam-scores/template — download pre-filled exam score template
// IMPORTANT: declared before / to avoid Express conflicts
router.get('/template', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name } = req.query;
    if (!academic_year_id || !semester || !subject || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name are required' });
    }
    const isAdmin = req.user.role === 'admin';
    const params  = [req.schoolId, academic_year_id, parseInt(semester), subject, class_name];
    let teacherFilter = '';
    if (!isAdmin) { params.push(req.user.id); teacherFilter = `AND e.teacher_id = $${params.length}`; }

    const { rows: students } = await pool.query(
      `SELECT s.id AS student_id, s.name, e.score, e.max_score
       FROM students s
       LEFT JOIN exam_scores e
         ON e.student_id = s.id AND e.school_id = $1
         AND e.academic_year_id = $2 AND e.semester = $3
         AND LOWER(e.subject) = LOWER($4) AND LOWER(e.class_name) = LOWER($5)
         ${teacherFilter}
       WHERE s.school_id = $1 AND s.status = 'Active' AND LOWER(s.class_name) = LOWER($5)
       ORDER BY s.name`,
      params
    );

    const existingMax = students.find(s => s.max_score != null)?.max_score ?? 100;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Exam Scores');

    ws.columns = [
      { key: 'student_id', width: 38 },
      { key: 'name',       width: 28 },
      { key: 'score',      width: 14 },
      { key: '_max',       width: 8  },
    ];

    // Row 1: Note (merged A-C); D1 = max_score for machine reading
    const noteRow = ws.addRow([
      `Exam Scores — ${subject} | Class: ${class_name} | Semester: ${semester} | Max: ${existingMax}`,
      '', '', existingMax,
    ]);
    ws.mergeCells(1, 1, 1, 3);
    noteRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    noteRow.getCell(1).font      = { italic: true, color: { argb: 'FF856404' } };
    noteRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    noteRow.getCell(4).font = { size: 7, color: { argb: 'FFCCCCCC' } };
    ws.getRow(1).height = 20;

    // Row 2: Headers
    const hdrRow = ws.addRow(['Student ID (do not edit)', 'Name', `Score (0–${existingMax})`, '']);
    ['Student ID (do not edit)', 'Name', `Score (0–${existingMax})`].forEach((_, i) => {
      const cell = hdrRow.getCell(i + 1);
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C2218' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.getRow(2).height = 20;

    const greyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E2DA' } };
    for (let i = 0; i < students.length; i++) {
      const s      = students[i];
      const rowNum = i + 3;
      const row    = ws.addRow([s.student_id, s.name, s.score != null ? s.score : '', '']);
      row.getCell(1).fill = greyFill;
      row.getCell(1).font = { color: { argb: 'FF8C7E6E' }, size: 9 };
      row.getCell(2).fill = greyFill;
      row.getCell(2).font = { color: { argb: 'FF2C2218' } };
      ws.getCell(rowNum, 3).dataValidation = {
        type: 'decimal', operator: 'between',
        formulae: [0, parseFloat(existingMax)],
        showErrorMessage: true, errorTitle: 'Invalid Score',
        error: `Must be 0–${existingMax}`,
      };
    }

    const label = `${subject}_${class_name}_sem${semester}`.replace(/[^a-z0-9_]/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${label}_exam.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// POST /api/exam-scores/upload-scores — upload exam scores from Excel
router.post('/upload-scores', upload.single('file'), async (req, res, next) => {
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

    // Read max_score from D1
    const maxScore = parseFloat(ws.getCell(1, 4).value) || 100;

    const results  = { saved: 0, skipped: 0, errors: [] };
    const toUpsert = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum <= 2) return; // skip note + header

      const studentId = (row.getCell(1).text ?? '').trim();
      const scoreRaw  = row.getCell(3).value;

      if (!studentId) { results.skipped++; return; }
      if (!validIds.has(studentId)) {
        results.errors.push({ row: rowNum, message: `Student ID not found in class ${class_name}` });
        return;
      }
      if (scoreRaw === null || scoreRaw === undefined || scoreRaw === '') {
        results.skipped++;
        return;
      }
      const num = parseFloat(scoreRaw);
      if (isNaN(num)) {
        results.errors.push({ row: rowNum, message: `Invalid score "${scoreRaw}" — must be a number` });
        return;
      }
      if (num < 0 || num > maxScore) {
        results.errors.push({ row: rowNum, message: `Score ${num} out of range (0–${maxScore})` });
        return;
      }
      toUpsert.push({ student_id: studentId, score: num });
    });

    if (toUpsert.length === 0 && results.errors.length > 0) {
      return res.status(422).json({ ...results, error: `All rows had errors — check errors below` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { student_id, score } of toUpsert) {
        await client.query(
          `INSERT INTO exam_scores
             (school_id, academic_year_id, semester, subject, class_name, student_id, teacher_id, score, max_score)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (academic_year_id, semester, subject, class_name, student_id)
           DO UPDATE SET score = EXCLUDED.score, max_score = EXCLUDED.max_score, teacher_id = EXCLUDED.teacher_id`,
          [req.schoolId, academic_year_id, parseInt(semester), subject, class_name,
           student_id, req.user.id, score, maxScore]
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

// GET /api/exam-scores?academic_year_id=&semester=&subject=&class_name=
router.get('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name } = req.query;
    if (!academic_year_id || !semester || !subject || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name are required' });
    }
    const isAdmin = req.user.role === 'admin';
    const params = [req.schoolId, academic_year_id, parseInt(semester), subject, class_name];
    let teacherFilter = '';
    if (!isAdmin) { params.push(req.user.id); teacherFilter = `AND e.teacher_id = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.student_code, s.name,
              e.id AS exam_id, e.score, e.max_score
       FROM students s
       LEFT JOIN exam_scores e
         ON  e.student_id      = s.id
         AND e.school_id       = $1
         AND e.academic_year_id = $2
         AND e.semester        = $3
         AND LOWER(e.subject)  = LOWER($4)
         AND LOWER(e.class_name) = LOWER($5)
         ${teacherFilter}
       WHERE s.school_id = $1 AND s.status = 'Active'
         AND LOWER(s.class_name) = LOWER($5)
       ORDER BY s.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/exam-scores — bulk upsert exam scores
router.post('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name, max_score, scores } = req.body;
    if (!academic_year_id || !semester || !subject || !class_name || !Array.isArray(scores)) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name, scores[] required' });
    }

    // Check if results are locked
    const subStatus = await getSubmissionStatus(req.schoolId, academic_year_id, semester, subject, class_name);
    if (LOCKED_STATUSES.includes(subStatus)) {
      return res.status(409).json({ error: `Scores are locked — submission status is “${subStatus}”. Contact your HOD or admin to unlock.` });
    }

    const examMax = parseFloat(max_score) || 100;

    // Validate scores against max_score
    for (const s of scores) {
      if (s.score != null) {
        const numScore = parseFloat(s.score);
        if (isNaN(numScore) || numScore < 0 || numScore > parseFloat(max_score || 100)) {
          return res.status(400).json({ error: `Score ${s.score} exceeds max score of ${max_score || 100}` });
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { student_id, score } of scores) {
        await client.query(
          `INSERT INTO exam_scores
             (school_id, academic_year_id, semester, subject, class_name, student_id, teacher_id, score, max_score)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (academic_year_id, semester, subject, class_name, student_id)
           DO UPDATE SET score = EXCLUDED.score, max_score = EXCLUDED.max_score, teacher_id = EXCLUDED.teacher_id`,
          [req.schoolId, academic_year_id, parseInt(semester), subject, class_name,
           student_id, req.user.id, score != null ? parseFloat(score) : null, examMax]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ message: 'Exam scores saved' });
  } catch (err) { next(err); }
});

module.exports = router;
