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

/** GET /api/students/upload/template — returns a styled XLSX workbook */
router.get('/upload/template', adminOnly, async (req, res, next) => {
  try {
    const { rows: programs } = await pool.query(
      `SELECT name FROM programs WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Students ──
    const headers = ['Student ID', 'Name', 'Class', 'Program', 'Status', 'Notes'];
    const p0 = programs[0]?.name ?? '';
    const p1 = programs[1]?.name ?? p0;
    const examples = [
      ['',     'Kwame Mensah',  '1A', p0, 'Active', ''],
      ['',     'Abena Osei',    '2B', p1, 'Active', 'Transferred in'],
      ['S003', 'Kofi Asante',   '3C', p0, 'Active', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);

    ws['!cols'] = [
      { wch: 14 },
      { wch: 28 },
      { wch: 10 },
      { wch: 22 },
      { wch: 12 },
      { wch: 32 },
    ];

    // Freeze the header row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    // Bold + dark background on header row
    const hStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    headers.forEach((_, c) => {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = hStyle;
    });

    // Light blue tint on example rows
    const exStyle = { fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } } };
    examples.forEach((_, r) => {
      headers.forEach((__, c) => {
        const ref = XLSX.utils.encode_cell({ r: r + 1, c });
        if (ws[ref]) ws[ref].s = exStyle;
      });
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Students');

    // ── Sheet 2: Reference ──
    const statuses = ['Active', 'Graduated', 'Inactive'];
    const maxRows  = Math.max(statuses.length, programs.length, 1);
    const refData  = [
      ['VALID STATUSES', '', 'PROGRAMS FOR THIS SCHOOL', '', 'NOTES'],
      ...Array.from({ length: maxRows }, (_, i) => [
        statuses[i] ?? '',
        '',
        programs[i]?.name ?? '',
        '',
        i === 0 ? 'Leave Student ID blank to auto-generate (e.g. S001)' :
        i === 1 ? 'Program column is optional — leave blank if not applicable' :
        i === 2 ? 'Status defaults to Active if left blank' : '',
      ]),
    ];

    const wsRef = XLSX.utils.aoa_to_sheet(refData);
    wsRef['!cols'] = [{ wch: 18 }, { wch: 3 }, { wch: 30 }, { wch: 3 }, { wch: 50 }];

    const refHStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '15803D' } } };
    ['A1', 'C1', 'E1'].forEach(ref => { if (wsRef[ref]) wsRef[ref].s = refHStyle; });

    XLSX.utils.book_append_sheet(wb, wsRef, 'Reference');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="students_template.xlsx"');
    res.send(buf);
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

    // Strip comment rows, then skip header row if detected
    let dataRows = rows.filter(row => !String(row[0] ?? '').trim().startsWith('#'));
    if (dataRows.length > 0) {
      const firstCell = String(dataRows[0][0] ?? '').trim().toLowerCase();
      if (['student', 'name', 'id'].some(k => firstCell.includes(k))) {
        dataRows = dataRows.slice(1);
      }
    }

    // Load programs for name → id resolution
    const { rows: programRows } = await pool.query(
      `SELECT id, LOWER(TRIM(name)) AS name_lower FROM programs WHERE school_id = $1`,
      [req.schoolId]
    );
    const programByName = new Map(programRows.map(p => [p.name_lower, p.id]));

    let inserted = 0;
    const errors = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row    = dataRows[i];
      const rowNum = i + 2;

      const studentCode = String(row[0] ?? '').trim() || null;
      const name        = String(row[1] ?? '').trim();
      const className   = String(row[2] ?? '').trim();
      const programName = String(row[3] ?? '').trim();
      const statusRaw   = String(row[4] ?? '').trim();
      const notes       = String(row[5] ?? '').trim() || null;

      if (!name && !studentCode) continue;
      if (!name)      { errors.push({ row: rowNum, message: 'Name is required' });  continue; }
      if (!className) { errors.push({ row: rowNum, message: 'Class is required' }); continue; }

      // Resolve program (blank is fine; unknown name is an error)
      let programId = null;
      if (programName) {
        programId = programByName.get(programName.toLowerCase()) ?? null;
        if (!programId) {
          errors.push({ row: rowNum, message: `Program "${programName}" not found. Check the Reference sheet for valid program names.` });
          continue;
        }
      }

      const validStatuses = ['Active', 'Graduated', 'Inactive'];
      const status = validStatuses.find(s => s.toLowerCase() === statusRaw.toLowerCase()) || 'Active';
      const code   = studentCode || await nextStudentCode(req.schoolId);

      try {
        await pool.query(
          `INSERT INTO students (school_id, student_code, name, class_name, status, notes, program_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [req.schoolId, code, name, className, status, notes, programId]
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
    const { class_name, status, program_id } = req.query;
    const conds  = ['s.school_id = $1'];
    const params = [req.schoolId];

    if (class_name)  { params.push(class_name);  conds.push(`s.class_name = $${params.length}`); }
    if (program_id)  { params.push(program_id);  conds.push(`s.program_id = $${params.length}`); }

    // Default to Active only; pass status=all to get everything
    const effectiveStatus = status || 'Active';
    if (effectiveStatus !== 'all') {
      params.push(effectiveStatus);
      conds.push(`s.status = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT s.id, s.student_code, s.name, s.class_name, s.status, s.notes,
              s.program_id, p.name AS program_name
       FROM students s
       LEFT JOIN programs p ON p.id = s.program_id
       WHERE ${conds.join(' AND ')}
       ORDER BY s.class_name, s.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/** GET /api/students/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.student_code, s.name, s.class_name, s.status, s.notes,
              s.program_id, p.name AS program_name
       FROM students s
       LEFT JOIN programs p ON p.id = s.program_id
       WHERE s.id = $1 AND s.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/** POST /api/students */
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, class_name, student_code, status = 'Active', notes, program_id } = req.body;
    if (!name)       return res.status(400).json({ error: 'name is required' });
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });

    const code = student_code?.trim() || await nextStudentCode(req.schoolId);
    const { rows } = await pool.query(
      `INSERT INTO students (school_id, student_code, name, class_name, status, notes, program_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, student_code, name, class_name, status, notes, program_id`,
      [req.schoolId, code, name.trim(), class_name.trim(), status, notes || null, program_id || null]
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
    const { name, class_name, student_code, status, notes, program_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE students SET
         student_code = COALESCE($1, student_code),
         name         = COALESCE($2, name),
         class_name   = COALESCE($3, class_name),
         status       = COALESCE($4, status),
         notes        = COALESCE($5, notes),
         program_id   = $6,
         updated_at   = now()
       WHERE id = $7 AND school_id = $8
       RETURNING id, student_code, name, class_name, status, notes, program_id`,
      [student_code?.trim() || null, name || null, class_name?.trim() || null,
       status || null, notes !== undefined ? (notes || null) : undefined,
       program_id || null, req.params.id, req.schoolId]
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
