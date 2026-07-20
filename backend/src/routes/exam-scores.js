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
      `SELECT s.id AS student_id, s.student_code, s.name, e.score, e.max_score
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

    const existingMax = students.find(s => s.max_score != null)?.max_score ?? null;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Exam Scores');

    ws.columns = [
      { key: 'student_id',   width: 38 },
      { key: 'student_code', width: 14 },
      { key: 'name',         width: 28 },
      { key: 'score',        width: 14 },
      { key: '_max',         width: 8  },
    ];

    // Row 1: Note (merged A-D); E1 = max_score for machine reading (blank if not yet set)
    const maxLabel = existingMax != null ? `Max: ${existingMax}` : 'Max: (enter in column E row 1 before uploading)';
    const noteRow = ws.addRow([
      `Exam Scores — ${subject} | Class: ${class_name} | Semester: ${semester} | ${maxLabel}`,
      '', '', '', existingMax,
    ]);
    ws.mergeCells(1, 1, 1, 4);
    noteRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    noteRow.getCell(1).font      = { italic: true, color: { argb: 'FF856404' } };
    noteRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    noteRow.getCell(5).font = { size: 7, color: { argb: 'FFCCCCCC' } };
    ws.getRow(1).height = 20;

    // Row 2: Headers
    const hdrRow = ws.addRow(['Student ID (do not edit)', 'Student No.', 'Name', `Score (0–${existingMax})`, '']);
    ['Student ID (do not edit)', 'Student No.', 'Name', `Score (0–${existingMax})`].forEach((_, i) => {
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
      const row    = ws.addRow([s.student_id, s.student_code, s.name, s.score != null ? s.score : '', '']);
      row.getCell(1).fill = greyFill;
      row.getCell(1).font = { color: { argb: 'FF8C7E6E' }, size: 9 };
      row.getCell(2).fill = greyFill;
      row.getCell(2).font = { bold: true, color: { argb: 'FF2C2218' } };
      row.getCell(3).fill = greyFill;
      row.getCell(3).font = { color: { argb: 'FF2C2218' } };
      ws.getCell(rowNum, 4).dataValidation = {
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

    // Read max_score from E1 — required
    const maxScore = parseFloat(ws.getCell(1, 5).value);
    if (!maxScore || maxScore <= 0) {
      return res.status(400).json({ error: 'Max score (cell E1) is missing or invalid. Re-download the template and enter the correct max score in cell E1 before uploading.' });
    }

    const results  = { saved: 0, skipped: 0, errors: [] };
    const toUpsert = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum <= 2) return; // skip note + header

      const studentId = (row.getCell(1).text ?? '').trim();
      const scoreRaw  = row.getCell(4).value;

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
             (school_id, academic_year_id, semester, subject, class_name, student_id, teacher_id, score, max_score, submitted_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
           ON CONFLICT (academic_year_id, semester, subject, class_name, student_id)
           DO UPDATE SET score = EXCLUDED.score, max_score = EXCLUDED.max_score,
                         teacher_id = EXCLUDED.teacher_id, submitted_at = now()`,
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
    if (!max_score || parseFloat(max_score) <= 0) {
      return res.status(400).json({ error: 'max_score is required and must be greater than 0' });
    }

    // Check if results are locked
    const subStatus = await getSubmissionStatus(req.schoolId, academic_year_id, semester, subject, class_name);
    if (LOCKED_STATUSES.includes(subStatus)) {
      return res.status(409).json({ error: `Scores are locked — submission status is “${subStatus}”. Contact your HOD or admin to unlock.` });
    }

    const examMax = parseFloat(max_score);

    // Validate scores against max_score
    for (const s of scores) {
      if (s.score != null) {
        const numScore = parseFloat(s.score);
        if (isNaN(numScore) || numScore < 0 || numScore > examMax) {
          return res.status(400).json({ error: `Score ${s.score} exceeds max score of ${examMax}` });
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { student_id, score } of scores) {
        await client.query(
          `INSERT INTO exam_scores
             (school_id, academic_year_id, semester, subject, class_name, student_id, teacher_id, score, max_score, submitted_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
           ON CONFLICT (academic_year_id, semester, subject, class_name, student_id)
           DO UPDATE SET score = EXCLUDED.score, max_score = EXCLUDED.max_score,
                         teacher_id = EXCLUDED.teacher_id, submitted_at = now()`,
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

// ── GET /api/exam-scores/admin-list ─────────────────────────────────────────
// Admin view: one row per (teacher, subject, class, year, semester) batch.
router.get('/admin-list', adminOnly, async (req, res, next) => {
  try {
    const { teacher_id, academic_year_id, semester, subject, class_name } = req.query;
    const params = [req.schoolId];
    const filters = [];
    if (teacher_id)       { params.push(teacher_id);              filters.push(`e.teacher_id = $${params.length}`); }
    if (academic_year_id) { params.push(academic_year_id);        filters.push(`e.academic_year_id = $${params.length}`); }
    if (semester)         { params.push(parseInt(semester));      filters.push(`e.semester = $${params.length}`); }
    if (subject)          { params.push(subject);                 filters.push(`LOWER(e.subject) LIKE LOWER($${params.length})`); }
    if (class_name)       { params.push(class_name);              filters.push(`LOWER(e.class_name) LIKE LOWER($${params.length})`); }
    const where = filters.length ? ' AND ' + filters.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT
         e.teacher_id,
         t.name                          AS teacher_name,
         e.subject,
         e.class_name,
         e.academic_year_id,
         ay.name                         AS academic_year_name,
         e.semester,
         MAX(e.max_score)                AS max_score,
         COUNT(e.score)::int             AS score_count,
         COUNT(*)::int                   AS row_count,
         MAX(e.submitted_at)             AS submitted_at,
         (SELECT COUNT(*)::int FROM students s
          WHERE s.school_id = $1 AND LOWER(s.class_name) = LOWER(e.class_name)
            AND s.status = 'Active')     AS class_size
       FROM exam_scores e
       JOIN academic_years ay ON ay.id = e.academic_year_id AND ay.school_id = $1
       LEFT JOIN teachers t  ON t.id  = e.teacher_id AND t.school_id = $1
       WHERE e.school_id = $1 ${where}
       GROUP BY e.teacher_id, t.name, e.subject, e.class_name,
                e.academic_year_id, ay.name, e.semester
       ORDER BY MAX(e.submitted_at) DESC NULLS LAST, e.class_name, e.subject`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── PATCH /api/exam-scores/admin-edit ────────────────────────────────────────
// Bulk-update all scores in a batch. Body: { current: {...}, update: {...} }
router.patch('/admin-edit', adminOnly, async (req, res, next) => {
  try {
    const { current, update } = req.body;
    if (!current?.academic_year_id || !current?.semester || !current?.subject ||
        !current?.class_name || !current?.teacher_id) {
      return res.status(400).json({ error: 'current filter (academic_year_id, semester, subject, class_name, teacher_id) is required' });
    }
    if (!update || !Object.keys(update).length) {
      return res.status(400).json({ error: 'update fields required' });
    }

    const keyFields = ['academic_year_id', 'semester', 'subject', 'class_name'];
    const changingKey = keyFields.some(f => update[f] !== undefined && update[f] !== current[f]);

    // Check UNIQUE constraint before updating key fields
    if (changingKey) {
      const newYear  = update.academic_year_id ?? current.academic_year_id;
      const newSem   = update.semester         ?? current.semester;
      const newSubj  = update.subject          ?? current.subject;
      const newClass = update.class_name       ?? current.class_name;
      const { rows: conflict } = await pool.query(
        `SELECT 1 FROM exam_scores
         WHERE school_id = $1
           AND academic_year_id = $2 AND semester = $3
           AND LOWER(subject) = LOWER($4) AND LOWER(class_name) = LOWER($5)
           AND student_id IN (
             SELECT student_id FROM exam_scores
             WHERE school_id = $1 AND academic_year_id = $6 AND semester = $7
               AND LOWER(subject) = LOWER($8) AND LOWER(class_name) = LOWER($9)
               AND teacher_id = $10
           )
         LIMIT 1`,
        [req.schoolId, newYear, parseInt(newSem), newSubj, newClass,
         current.academic_year_id, parseInt(current.semester), current.subject,
         current.class_name, current.teacher_id]
      );
      if (conflict.length) {
        return res.status(409).json({ error: 'Scores already exist at the destination period/subject/class. Delete them first or choose a different target.' });
      }
    }

    // Build SET clause
    const setClauses = [];
    const vals       = [req.schoolId, current.academic_year_id, parseInt(current.semester),
                        current.subject, current.class_name, current.teacher_id];
    const addSet = (col, val) => {
      vals.push(val);
      setClauses.push(`${col} = $${vals.length}`);
    };
    if (update.academic_year_id !== undefined) addSet('academic_year_id', update.academic_year_id);
    if (update.semester         !== undefined) addSet('semester',         parseInt(update.semester));
    if (update.subject          !== undefined) addSet('subject',          update.subject);
    if (update.class_name       !== undefined) addSet('class_name',       update.class_name);
    if (update.teacher_id       !== undefined) addSet('teacher_id',       update.teacher_id);
    if (update.max_score        !== undefined) addSet('max_score',        parseFloat(update.max_score));

    const { rowCount } = await pool.query(
      `UPDATE exam_scores SET ${setClauses.join(', ')}
       WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3
         AND LOWER(subject) = LOWER($4) AND LOWER(class_name) = LOWER($5)
         AND teacher_id = $6`,
      vals
    );

    // Audit log
    const adminName = req.user.name ?? req.user.email ?? req.user.id;
    await pool.query(
      `INSERT INTO school_audit_logs (school_id, action, actor_id, actor_name, target_type, details)
       VALUES ($1, 'exam_scores_edited', $2, $3, 'exam_scores', $4)`,
      [req.schoolId, req.user.id, adminName,
       JSON.stringify({ current, update, rows_affected: rowCount })]
    );

    res.json({ rows_affected: rowCount });
  } catch (err) { next(err); }
});

// ── DELETE /api/exam-scores/admin-delete ─────────────────────────────────────
// Delete an entire batch with reason. Notifies the teacher and writes audit log.
router.delete('/admin-delete', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name, teacher_id, reason } = req.body;
    if (!academic_year_id || !semester || !subject || !class_name || !teacher_id) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name, teacher_id are required' });
    }
    if (!reason?.trim()) {
      return res.status(400).json({ error: 'A reason for deletion is required' });
    }

    // Fetch rows before deletion for audit trail
    const { rows: toDelete } = await pool.query(
      `SELECT e.id, e.student_id, e.score, t.name AS teacher_name, t.email AS teacher_email
       FROM exam_scores e
       LEFT JOIN teachers t ON t.id = e.teacher_id AND t.school_id = $1
       WHERE e.school_id = $1 AND e.academic_year_id = $2 AND e.semester = $3
         AND LOWER(e.subject) = LOWER($4) AND LOWER(e.class_name) = LOWER($5)
         AND e.teacher_id = $6`,
      [req.schoolId, academic_year_id, parseInt(semester), subject, class_name, teacher_id]
    );
    if (!toDelete.length) return res.status(404).json({ error: 'No scores found for the given filter' });

    const adminName    = req.user.name ?? req.user.email ?? req.user.id;
    const teacherName  = toDelete[0].teacher_name ?? 'Unknown';
    const teacherEmail = toDelete[0].teacher_email;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete scores
      await client.query(
        `DELETE FROM exam_scores
         WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3
           AND LOWER(subject) = LOWER($4) AND LOWER(class_name) = LOWER($5)
           AND teacher_id = $6`,
        [req.schoolId, academic_year_id, parseInt(semester), subject, class_name, teacher_id]
      );

      // Per-score audit entries
      for (const row of toDelete) {
        await client.query(
          `INSERT INTO score_audit_log
             (school_id, score_type, score_id, student_id, old_score, changed_by_id, changed_by_name, reason)
           VALUES ($1, 'exam', $2, $3, $4, $5, $6, $7)`,
          [req.schoolId, row.id, row.student_id, row.score, req.user.id, adminName,
           `DELETED — ${reason.trim()}`]
        );
      }

      // Batch audit entry
      await client.query(
        `INSERT INTO school_audit_logs (school_id, action, actor_id, actor_name, target_type, details)
         VALUES ($1, 'exam_scores_deleted', $2, $3, 'exam_scores', $4)`,
        [req.schoolId, req.user.id, adminName,
         JSON.stringify({ academic_year_id, semester, subject, class_name, teacher_id,
                          teacher_name: teacherName, rows_deleted: toDelete.length, reason: reason.trim() })]
      );

      // Notify the teacher
      await client.query(
        `INSERT INTO teacher_notifications (school_id, teacher_id, title, message)
         VALUES ($1, $2, $3, $4)`,
        [req.schoolId, teacher_id,
         `Exam scores deleted — ${subject} (${class_name}, Sem ${semester})`,
         `Your exam scores for ${subject} / ${class_name} (Semester ${semester}) have been deleted by the admin.\n\nReason: ${reason.trim()}\n\nPlease re-enter the scores or contact the admin if this was a mistake.`]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }

    res.json({ rows_deleted: toDelete.length });
  } catch (err) { next(err); }
});

module.exports = router;
