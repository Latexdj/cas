const router = require('express').Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const XLSX   = require('xlsx');
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireActiveSubscription);

/** Generate the next available teacher code for a school (T001, T002, …) */
async function nextTeacherCode(schoolId) {
  const { rows } = await pool.query(
    `SELECT teacher_code FROM teachers WHERE school_id = $1 AND teacher_code ~ '^T[0-9]+$'`,
    [schoolId]
  );
  const max = rows.reduce((m, r) => {
    const n = parseInt(r.teacher_code.slice(1));
    return n > m ? n : m;
  }, 0);
  return 'T' + String(max + 1).padStart(3, '0');
}

/** GET /api/teachers/upload/template — CSV pre-filled with column headers + example row */
router.get('/upload/template', adminOnly, async (req, res, next) => {
  try {
    const note   = '# Leave "Teacher ID" blank to auto-generate. Default PIN is assigned to all new teachers.';
    const header = 'Teacher ID,Name,Email,Phone,Department,Is Admin (Yes/No),Notes';
    const example = ',Jane Doe,jane@school.com,555-1234,Mathematics,No,';
    const csv = [note, header, example].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="teachers_template.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

/** POST /api/teachers/upload — bulk-import teachers from Excel/CSV */
router.post('/upload', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (!rows.length) return res.status(400).json({ error: 'File is empty' });

    // Skip header / comment rows
    const firstCell = String(rows[0][0] ?? '').trim();
    const hasHeader = firstCell.startsWith('#') ||
      firstCell.toLowerCase().includes('teacher') ||
      firstCell.toLowerCase().includes('name') ||
      firstCell.toLowerCase().includes('id');
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const defaultPin = process.env.DEFAULT_TEACHER_PIN || '1234';
    const pinHash    = await bcrypt.hash(defaultPin, 12);

    // Get teacher limit for this school
    const { rows: subRows } = await pool.query(
      `SELECT teacher_limit FROM subscriptions
       WHERE school_id = $1 AND status IN ('trial', 'active')
       ORDER BY created_at DESC LIMIT 1`,
      [req.schoolId]
    );
    let teacherLimit = null;
    let activeCount  = 0;
    if (subRows.length) {
      teacherLimit = subRows[0].teacher_limit;
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM teachers WHERE school_id = $1 AND status = 'Active'`,
        [req.schoolId]
      );
      activeCount = countRows[0].cnt;
    }

    let inserted = 0;
    const errors = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row    = dataRows[i];
      const rowNum = i + (hasHeader ? 2 : 1);

      const teacherCode = String(row[0] ?? '').trim().toUpperCase() || null;
      const name        = String(row[1] ?? '').trim();
      const email       = String(row[2] ?? '').trim() || null;
      const phone       = String(row[3] ?? '').trim() || null;
      const department  = String(row[4] ?? '').trim() || null;
      const isAdminRaw  = String(row[5] ?? '').trim().toLowerCase();
      const notes       = String(row[6] ?? '').trim() || null;

      // Skip entirely blank rows
      if (!name && !teacherCode) continue;
      if (!name) { errors.push({ row: rowNum, message: 'Name is required' }); continue; }

      // Hard stop at teacher limit
      if (teacherLimit !== null && activeCount + inserted >= teacherLimit) {
        errors.push({ row: rowNum, message: `Teacher limit reached (${teacherLimit}). Row skipped.` });
        continue;
      }

      const isAdmin = ['yes', 'true', '1', 'y'].includes(isAdminRaw);

      // Use provided code or auto-generate
      const code = teacherCode || await nextTeacherCode(req.schoolId);

      try {
        await pool.query(
          `INSERT INTO teachers
             (school_id, teacher_code, name, email, phone, department, status, is_admin, notes, pin_hash)
           VALUES ($1,$2,$3,$4,$5,$6,'Active',$7,$8,$9)`,
          [req.schoolId, code, name, email, phone, department, isAdmin, notes, pinHash]
        );
        inserted++;
      } catch (err) {
        if (err.code === '23505') {
          const detail = err.constraint?.includes('code')
            ? `Teacher ID "${code}" already exists`
            : `A teacher named "${name}" already exists`;
          errors.push({ row: rowNum, message: detail });
        } else {
          errors.push({ row: rowNum, message: err.message });
        }
      }
    }

    res.json({ inserted, errors });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id, t.teacher_code, t.name, t.email, t.phone, t.department,
        t.status, t.is_admin, t.notes,
        COUNT(tt.id)::int AS total_periods
      FROM teachers t
      LEFT JOIN timetable tt ON tt.teacher_id = t.id
      WHERE t.school_id = $1
      GROUP BY t.id
      ORDER BY t.teacher_code
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, teacher_code, name, email, phone, department, status, is_admin, notes
       FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });

    const teacher = rows[0];
    const { rows: schedule } = await pool.query(
      `SELECT id, day_of_week, start_time, end_time, subject, class_names
       FROM timetable WHERE teacher_id = $1 AND school_id = $2
       ORDER BY day_of_week, start_time`,
      [teacher.id, req.schoolId]
    );
    teacher.schedule = schedule;
    res.json(teacher);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, email, phone, department, status = 'Active', is_admin = false, notes, teacher_code } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    // Enforce teacher limit
    const { rows: subRows } = await pool.query(
      `SELECT teacher_limit FROM subscriptions
       WHERE school_id = $1 AND status IN ('trial', 'active')
       ORDER BY created_at DESC LIMIT 1`,
      [req.schoolId]
    );
    if (subRows.length) {
      const limit = subRows[0].teacher_limit;
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM teachers WHERE school_id = $1 AND status = 'Active'`,
        [req.schoolId]
      );
      if (countRows[0].cnt >= limit) {
        return res.status(403).json({
          error: `Teacher limit reached (${countRows[0].cnt}/${limit}). Contact your administrator to upgrade your subscription.`,
        });
      }
    }

    const code    = teacher_code?.trim().toUpperCase() || await nextTeacherCode(req.schoolId);
    const pinHash = await bcrypt.hash(process.env.DEFAULT_TEACHER_PIN || '1234', 12);

    const { rows } = await pool.query(
      `INSERT INTO teachers (school_id, teacher_code, name, email, phone, department, status, is_admin, notes, pin_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, teacher_code, name, email, phone, department, status, is_admin, notes`,
      [req.schoolId, code, name.trim(), email || null, phone || null,
       department || null, status, is_admin, notes || null, pinHash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const detail = err.constraint?.includes('code')
        ? 'That Teacher ID is already in use'
        : 'A teacher with that name already exists';
      return res.status(409).json({ error: detail });
    }
    next(err);
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, email, phone, department, status, is_admin, notes, teacher_code } = req.body;
    const { rows } = await pool.query(
      `UPDATE teachers
       SET teacher_code = COALESCE($1, teacher_code),
           name        = COALESCE($2, name),
           email       = COALESCE($3, email),
           phone       = COALESCE($4, phone),
           department  = COALESCE($5, department),
           status      = COALESCE($6, status),
           is_admin    = COALESCE($7, is_admin),
           notes       = COALESCE($8, notes),
           updated_at  = now()
       WHERE id = $9 AND school_id = $10
       RETURNING id, teacher_code, name, email, phone, department, status, is_admin, notes`,
      [teacher_code?.trim().toUpperCase() || null, name||null, email||null, phone||null,
       department||null, status||null, is_admin??null, notes||null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That Teacher ID is already in use' });
    next(err);
  }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ message: 'Teacher deleted' });
  } catch (err) { next(err); }
});

router.post('/:id/reset-pin', adminOnly, async (req, res, next) => {
  try {
    const defaultPin = process.env.DEFAULT_TEACHER_PIN || '1234';
    const pinHash    = await bcrypt.hash(defaultPin, 12);
    const { rowCount } = await pool.query(
      `UPDATE teachers SET pin_hash = $1 WHERE id = $2 AND school_id = $3`,
      [pinHash, req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ message: `PIN reset to default (${defaultPin})` });
  } catch (err) { next(err); }
});

module.exports = router;
