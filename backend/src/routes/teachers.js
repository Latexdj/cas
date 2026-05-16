const router   = require('express').Router();
const bcrypt   = require('bcrypt');
const multer   = require('multer');
const XLSX     = require('xlsx');
const ExcelJS  = require('exceljs');
const pool     = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { uploadFile } = require('../services/storage.service');

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

/** GET /api/teachers/upload/template — styled XLSX template */
router.get('/upload/template', adminOnly, async (req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CAS – Classroom Attendance System';
    wb.created = new Date();

    const GREEN_DARK  = '0F4C35';
    const GREEN_LIGHT = 'E8F5EE';
    const GREY_ALT    = 'F8FAFC';
    const WHITE       = 'FFFFFF';
    const TEXT_DARK   = '0F172A';
    const TEXT_MUTED  = '64748B';

    const cols = [
      { key: 'teacher_code', header: 'Teacher ID',             width: 16 },
      { key: 'name',         header: 'Full Name',              width: 28 },
      { key: 'email',        header: 'Email Address',          width: 32 },
      { key: 'phone',        header: 'Phone Number',           width: 18 },
      { key: 'department',   header: 'Department / Subject',   width: 26 },
      { key: 'is_admin',     header: 'Is Admin? (Yes/No)',     width: 20 },
      { key: 'notes',        header: 'Notes',                  width: 30 },
    ];

    // ── Sheet 1: Teachers ─────────────────────────────────────────
    const ws = wb.addWorksheet('Teachers', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

    // Row 1 — column headers
    const hdrRow = ws.getRow(1);
    hdrRow.height = 26;
    cols.forEach((col, idx) => {
      const cell      = hdrRow.getCell(idx + 1);
      cell.value      = col.header;
      cell.font       = { bold: true, color: { argb: WHITE }, size: 11, name: 'Calibri' };
      cell.fill       = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
      cell.alignment  = { vertical: 'middle', horizontal: 'left', indent: 1 };
      cell.border     = { right: { style: 'thin', color: { argb: '1A7A50' } } };
    });

    // Rows 2–200 — empty data rows with alternating background + dropdown
    for (let row = 2; row <= 200; row++) {
      const r  = ws.getRow(row);
      r.height = 18;
      const bg = row % 2 === 0 ? GREY_ALT : WHITE;
      cols.forEach((_, idx) => {
        const cell     = r.getCell(idx + 1);
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font      = { color: { argb: TEXT_DARK }, size: 10, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        cell.border    = { bottom: { style: 'hair', color: { argb: 'E2E8F0' } } };
      });
      // Yes/No dropdown for Is Admin (column F)
      ws.getCell(`F${row}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"Yes,No"'],
        showErrorMessage: true, errorStyle: 'stop',
        errorTitle: 'Invalid value', error: 'Please enter Yes or No',
      };
    }

    // ── Sheet 2: Instructions ─────────────────────────────────────
    const ws2 = wb.addWorksheet('Instructions');
    ws2.columns = [{ width: 14 }, { width: 66 }];

    const section = (label) => {
      const r    = ws2.addRow(['', label]);
      r.height   = 24;
      const cell = r.getCell(2);
      cell.font  = { bold: true, size: 11, name: 'Calibri', color: { argb: WHITE } };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
      cell.alignment = { vertical: 'middle', indent: 1 };
      ws2.mergeCells(`A${r.number}:B${r.number}`);
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
    };

    const line = (text, opts = {}) => {
      const r    = ws2.addRow(['', text]);
      r.height   = opts.height ?? 18;
      const cell = r.getCell(2);
      cell.font  = { size: 10, name: 'Calibri', color: { argb: opts.color ?? TEXT_DARK },
                     italic: !!opts.italic, bold: !!opts.bold };
      cell.alignment = { vertical: 'middle', indent: opts.indent ?? 1, wrapText: true };
      if (opts.bg) {
        cell.fill        = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
        ws2.mergeCells(`A${r.number}:B${r.number}`);
      }
    };

    const gap = () => { const r = ws2.addRow(['']); r.height = 8; };

    // Title
    const titleRow  = ws2.addRow(['', 'CAS — Teacher Bulk Upload: Instructions']);
    titleRow.height = 36;
    const titleCell = titleRow.getCell(2);
    titleCell.value = 'CAS — Teacher Bulk Upload: Instructions';
    titleCell.font  = { bold: true, size: 16, name: 'Calibri', color: { argb: WHITE } };
    titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
    titleCell.alignment = { vertical: 'middle', indent: 1 };
    ws2.mergeCells('A1:B1');
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };

    gap();

    // Overview
    section('OVERVIEW');
    line('Open the "Teachers" sheet, fill in one teacher per row starting from row 2, then upload the file via Teachers → Bulk Upload in the admin portal.', { indent: 2 });
    gap();

    // Column reference
    section('COLUMN REFERENCE');
    const colRef = [
      ['Teacher ID',           'Optional',  'Leave blank — the system will auto-assign (e.g. T001, T002). You may enter an existing ID to skip that row.'],
      ['Full Name',            'Required',  'Teacher\'s full name as it should appear in reports.'],
      ['Email Address',        'Required',  'Must be unique. Used for login and email notifications.'],
      ['Phone Number',         'Optional',  'Contact number. Any format accepted.'],
      ['Department / Subject', 'Optional',  'e.g. Mathematics, English Language, Science.'],
      ['Is Admin? (Yes/No)',   'Optional',  'Yes = can log into this admin portal. No = teacher access only. Default: No. Use the dropdown in column F.'],
      ['Notes',                'Optional',  'Internal notes — not visible to the teacher.'],
    ];
    colRef.forEach(([col, req, desc]) => {
      const r      = ws2.addRow([col, `[${req}]  ${desc}`]);
      r.height     = 20;
      const colCell = r.getCell(1);
      colCell.font      = { bold: true, size: 10, name: 'Calibri', color: { argb: GREEN_DARK } };
      colCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_LIGHT } };
      colCell.alignment = { vertical: 'middle', indent: 1 };
      const descCell = r.getCell(2);
      descCell.font      = { size: 10, name: 'Calibri', color: { argb: TEXT_DARK } };
      descCell.alignment = { vertical: 'middle', indent: 1, wrapText: true };
      descCell.border    = { bottom: { style: 'hair', color: { argb: 'E2E8F0' } } };
    });
    gap();

    // Example data
    section('EXAMPLE DATA');
    line('The rows below show correctly formatted entries. Your actual data goes in the "Teachers" sheet.', { color: TEXT_MUTED, italic: true });
    gap();

    // Example header
    const exHdrRow = ws2.addRow(cols.map(c => c.header));
    exHdrRow.height = 22;
    cols.forEach((_, i) => {
      const cell = exHdrRow.getCell(i + 1);
      cell.font       = { bold: true, size: 10, name: 'Calibri', color: { argb: WHITE } };
      cell.fill       = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1A7A50' } };
      cell.alignment  = { vertical: 'middle', indent: 1 };
    });
    // Adjust columns for example table
    ws2.columns = [
      { width: 14 }, { width: 24 }, { width: 28 }, { width: 16 },
      { width: 22 }, { width: 18 }, { width: 22 },
    ];

    const examples = [
      ['',     'Jane Doe',     'jane.doe@school.edu',  '024-000-0001', 'Mathematics', 'No',  'Head of department'],
      ['',     'Kwame Asante', 'kwame.a@school.edu',   '024-000-0002', 'English',     'No',  ''],
      ['T050', 'Ama Boateng',  'ama.b@school.edu',     '024-000-0003', 'Science',     'Yes', 'Vice principal'],
    ];
    examples.forEach((ex, i) => {
      const r  = ws2.addRow(ex);
      r.height = 18;
      const bg = i % 2 === 0 ? WHITE : GREEN_LIGHT;
      ex.forEach((_, idx) => {
        const cell     = r.getCell(idx + 1);
        cell.font      = { size: 10, name: 'Calibri', color: { argb: '2D6A4F' }, italic: true };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { vertical: 'middle', indent: 1 };
        cell.border    = { bottom: { style: 'hair', color: { argb: 'C8E6D4' } } };
      });
    });
    gap();

    // Rules
    section('IMPORTANT RULES');
    [
      'Do not rename or delete the "Teachers" sheet.',
      'Do not change the column order or header names in the Teachers sheet.',
      'One row = one teacher. Do not merge cells in the Teachers sheet.',
      'Rows with a missing Full Name or Email Address will be skipped with an error.',
      'Rows whose Email already exists in the system will be skipped.',
      'It is safe to upload the same file twice — duplicates are detected and skipped.',
    ].forEach((rule, i) => line(`${i + 1}.  ${rule}`, { indent: 2 }));

    // ── Send buffer ───────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="teachers_template.xlsx"');
    res.setHeader('Content-Length',      buffer.length);
    res.end(buffer);
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

    // Remove comment rows (lines whose first cell starts with #)
    let dataRows = rows.filter(row => !String(row[0] ?? '').trim().startsWith('#'));
    // Skip header row if the first remaining row looks like column labels
    if (dataRows.length > 0) {
      const firstCell = String(dataRows[0][0] ?? '').trim().toLowerCase();
      if (['teacher', 'name', 'id', 'email'].some(k => firstCell.includes(k))) {
        dataRows = dataRows.slice(1);
      }
    }

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
      const rowNum = i + 2;

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
        ROUND(COALESCE(SUM(
          EXTRACT(EPOCH FROM (tt.end_time - tt.start_time)) / 3600
        ), 0)::numeric, 1)::float AS total_periods
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

// GET /api/teachers/me — own profile
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, teacher_code, is_admin, photo_url FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.user.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/teachers/me/photo — upload / replace own profile photo
router.patch('/me/photo', async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
    const filePath = `profile-photos/${req.user.id}`;
    const photoUrl = await uploadFile(imageBase64, filePath, { upsert: true });
    await pool.query(
      `UPDATE teachers SET photo_url = $1, updated_at = now() WHERE id = $2 AND school_id = $3`,
      [photoUrl, req.user.id, req.schoolId]
    );
    res.json({ photo_url: photoUrl });
  } catch (err) { next(err); }
});

module.exports = router;
