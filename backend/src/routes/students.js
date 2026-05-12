const router = require('express').Router();
const multer = require('multer');
const XLSX   = require('xlsx');
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireActiveSubscription);

async function nextStudentCode(schoolId) {
  const { rows } = await pool.query(
    `SELECT student_code FROM students WHERE school_id = $1 AND student_code ~ '^S[0-9]+$'`,
    [schoolId]
  );
  const max = rows.reduce((m, r) => {
    const n = parseInt(r.student_code.slice(1));
    return n > m ? n : m;
  }, 0);
  return 'S' + String(max + 1).padStart(3, '0');
}

/** GET /api/students/upload/template */
router.get('/upload/template', adminOnly, async (req, res, next) => {
  try {
    const note    = '# Leave "Student ID" blank to auto-generate.';
    const header  = 'Student ID,Name,Class,Status (Active/Graduated/Inactive),Notes';
    const example = ',John Doe,Form 1A,Active,';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students_template.csv"');
    res.send([note, header, example].join('\n'));
  } catch (err) { next(err); }
});

/** POST /api/students/upload — bulk import */
router.post('/upload', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'File is empty' });

    const firstCell = String(rows[0][0] ?? '').trim();
    const hasHeader = firstCell.startsWith('#') ||
      ['student','name','id'].some(k => firstCell.toLowerCase().includes(k));
    const dataRows = hasHeader ? rows.slice(1) : rows;

    let inserted = 0;
    const errors = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row    = dataRows[i];
      const rowNum = i + (hasHeader ? 2 : 1);

      const studentCode = String(row[0] ?? '').trim() || null;
      const name        = String(row[1] ?? '').trim();
      const className   = String(row[2] ?? '').trim();
      const statusRaw   = String(row[3] ?? '').trim();
      const notes       = String(row[4] ?? '').trim() || null;

      if (!name && !studentCode) continue;
      if (!name)      { errors.push({ row: rowNum, message: 'Name is required' });  continue; }
      if (!className) { errors.push({ row: rowNum, message: 'Class is required' }); continue; }

      const validStatuses = ['Active', 'Graduated', 'Inactive'];
      const status = validStatuses.find(s => s.toLowerCase() === statusRaw.toLowerCase()) || 'Active';
      const code   = studentCode || await nextStudentCode(req.schoolId);

      try {
        await pool.query(
          `INSERT INTO students (school_id, student_code, name, class_name, status, notes)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.schoolId, code, name, className, status, notes]
        );
        inserted++;
      } catch (err) {
        if (err.code === '23505') {
          errors.push({ row: rowNum, message: `Student ID "${code}" already exists` });
        } else {
          errors.push({ row: rowNum, message: err.message });
        }
      }
    }
    res.json({ inserted, errors });
  } catch (err) { next(err); }
});

/** POST /api/students/promote — bulk promote a class */
router.post('/promote', adminOnly, async (req, res, next) => {
  try {
    const { from_class, to_class } = req.body;
    if (!from_class || !to_class)
      return res.status(400).json({ error: 'from_class and to_class are required' });

    const { rowCount } = await pool.query(
      `UPDATE students SET class_name = $1, updated_at = now()
       WHERE school_id = $2 AND class_name = $3 AND status = 'Active'`,
      [to_class, req.schoolId, from_class]
    );
    res.json({ promoted: rowCount, from_class, to_class });
  } catch (err) { next(err); }
});

/** POST /api/students/graduate — mark an entire class as graduated */
router.post('/graduate', adminOnly, async (req, res, next) => {
  try {
    const { class_name } = req.body;
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });

    const { rowCount } = await pool.query(
      `UPDATE students SET status = 'Graduated', updated_at = now()
       WHERE school_id = $1 AND class_name = $2 AND status = 'Active'`,
      [req.schoolId, class_name]
    );
    res.json({ graduated: rowCount, class_name });
  } catch (err) { next(err); }
});

/** GET /api/students/classes — distinct active class names */
router.get('/classes', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT class_name FROM students
       WHERE school_id = $1 AND status = 'Active'
       ORDER BY class_name`,
      [req.schoolId]
    );
    res.json(rows.map(r => r.class_name));
  } catch (err) { next(err); }
});

/** GET /api/students */
router.get('/', async (req, res, next) => {
  try {
    const { class_name, status } = req.query;
    const conds  = ['school_id = $1'];
    const params = [req.schoolId];

    if (class_name) { params.push(class_name); conds.push(`class_name = $${params.length}`); }

    // Default to Active only; pass status=all to get everything
    const effectiveStatus = status || 'Active';
    if (effectiveStatus !== 'all') {
      params.push(effectiveStatus);
      conds.push(`status = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT id, student_code, name, class_name, status, notes
       FROM students WHERE ${conds.join(' AND ')}
       ORDER BY class_name, name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/** GET /api/students/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, student_code, name, class_name, status, notes
       FROM students WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/** POST /api/students */
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, class_name, student_code, status = 'Active', notes } = req.body;
    if (!name)       return res.status(400).json({ error: 'name is required' });
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });

    const code = student_code?.trim() || await nextStudentCode(req.schoolId);
    const { rows } = await pool.query(
      `INSERT INTO students (school_id, student_code, name, class_name, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, student_code, name, class_name, status, notes`,
      [req.schoolId, code, name.trim(), class_name.trim(), status, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That Student ID is already in use' });
    next(err);
  }
});

/** PUT /api/students/:id */
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, class_name, student_code, status, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE students SET
         student_code = COALESCE($1, student_code),
         name         = COALESCE($2, name),
         class_name   = COALESCE($3, class_name),
         status       = COALESCE($4, status),
         notes        = COALESCE($5, notes),
         updated_at   = now()
       WHERE id = $6 AND school_id = $7
       RETURNING id, student_code, name, class_name, status, notes`,
      [student_code?.trim() || null, name || null, class_name?.trim() || null,
       status || null, notes !== undefined ? (notes || null) : undefined,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That Student ID is already in use' });
    next(err);
  }
});

/** DELETE /api/students/:id */
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM students WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
