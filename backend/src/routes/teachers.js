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
    // Fetch school name for the header
    const { rows: schoolRows } = await pool.query(
      `SELECT name FROM schools WHERE id = $1`, [req.schoolId]
    );
    const schoolName = schoolRows[0]?.name ?? 'School';

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'CAS – Classroom Attendance System';
    wb.created  = new Date();

    // ── Colours & fonts ──────────────────────────────────────────
    const GREEN_DARK  = '0F4C35';  // header bg
    const GREEN_MID   = '1A7A50';  // sub-header bg
    const GREEN_LIGHT = 'E8F5EE';  // example row bg
    const AMBER       = 'FFFBEB';  // notes bg
    const AMBER_BORDER= 'FCD34D';
    const GREY_HEADER = 'F8FAFC';
    const WHITE       = 'FFFFFF';
    const TEXT_DARK   = '0F172A';
    const TEXT_MUTED  = '64748B';
    const RED_LIGHT   = 'FEF2F2';
    const RED_TEXT    = 'DC2626';

    const boldWhite  = { bold: true, color: { argb: WHITE },    size: 11, name: 'Calibri' };
    const boldDark   = { bold: true, color: { argb: TEXT_DARK }, size: 11, name: 'Calibri' };
    const normalDark = {             color: { argb: TEXT_DARK }, size: 10, name: 'Calibri' };
    const mutedSmall = {             color: { argb: TEXT_MUTED }, size: 9, name: 'Calibri', italic: true };

    // ── Sheet: Teachers ──────────────────────────────────────────
    const ws = wb.addWorksheet('Teachers', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ state: 'frozen', ySplit: 6 }],
    });

    // Column definitions
    const cols = [
      { key: 'teacher_code', header: 'Teacher ID',        width: 16 },
      { key: 'name',         header: 'Full Name',         width: 28 },
      { key: 'email',        header: 'Email Address',     width: 32 },
      { key: 'phone',        header: 'Phone Number',      width: 18 },
      { key: 'department',   header: 'Department / Subject', width: 26 },
      { key: 'is_admin',     header: 'Is Admin? (Yes/No)', width: 20 },
      { key: 'notes',        header: 'Notes',             width: 30 },
    ];
    ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

    // ── Row 1: Title banner ──────────────────────────────────────
    const titleRow = ws.getRow(1);
    titleRow.height = 36;
    titleRow.getCell(1).value    = 'CAS — Teacher Bulk Upload Template';
    titleRow.getCell(1).font     = { bold: true, color: { argb: WHITE }, size: 16, name: 'Calibri' };
    titleRow.getCell(1).fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
    titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.mergeCells('A1:G1');
    for (let c = 2; c <= 7; c++) {
      titleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
    }

    // ── Row 2: School name subtitle ───────────────────────────────
    const subRow = ws.getRow(2);
    subRow.height = 20;
    subRow.getCell(1).value     = schoolName;
    subRow.getCell(1).font      = { color: { argb: WHITE }, size: 10, name: 'Calibri', italic: true };
    subRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_MID } };
    subRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.mergeCells('A2:G2');
    for (let c = 2; c <= 7; c++) {
      subRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_MID } };
    }

    // ── Row 3: Instructions block ─────────────────────────────────
    const notes = [
      '• Leave "Teacher ID" blank — the system will auto-generate it (e.g. T001, T002).',
      '• "Full Name" and "Email Address" are required. All other columns are optional.',
      '• "Is Admin?" accepts only: Yes or No  (default: No).  Admins can log into this portal.',
    ];
    notes.forEach((note, i) => {
      const r = ws.getRow(3 + i);
      r.height = 18;
      r.getCell(1).value     = note;
      r.getCell(1).font      = { color: { argb: TEXT_MUTED }, size: 9, name: 'Calibri' };
      r.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };
      r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: false };
      ws.mergeCells(`A${3 + i}:G${3 + i}`);
      for (let c = 2; c <= 7; c++) {
        r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };
      }
      // Amber left border on first note row only
      if (i === 0) {
        r.getCell(1).border = { left: { style: 'medium', color: { argb: AMBER_BORDER } } };
      }
    });

    // ── Row 6: Column headers ─────────────────────────────────────
    const hdrRow = ws.getRow(6);
    hdrRow.height = 24;
    cols.forEach((col, idx) => {
      const cell = hdrRow.getCell(idx + 1);
      cell.value     = col.header;
      cell.font      = { bold: true, color: { argb: WHITE }, size: 10, name: 'Calibri' };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      cell.border    = { bottom: { style: 'thin', color: { argb: GREEN_MID } } };
    });

    // ── Rows 7–9: Example rows ────────────────────────────────────
    const examples = [
      { teacher_code: '', name: 'Jane Doe',   email: 'jane.doe@school.edu',   phone: '024-000-0001', department: 'Mathematics', is_admin: 'No',  notes: 'Head of department' },
      { teacher_code: '', name: 'Kwame Asante', email: 'kwame.a@school.edu', phone: '024-000-0002', department: 'English',     is_admin: 'No',  notes: '' },
      { teacher_code: '', name: 'Ama Boateng', email: 'ama.b@school.edu',    phone: '024-000-0003', department: 'Science',     is_admin: 'Yes', notes: 'Vice principal' },
    ];

    examples.forEach((ex, i) => {
      const r = ws.getRow(7 + i);
      r.height = 20;
      cols.forEach((col, idx) => {
        const cell = r.getCell(idx + 1);
        cell.value     = ex[col.key] ?? '';
        cell.font      = { color: { argb: '3D7A55' }, size: 10, name: 'Calibri', italic: true };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_LIGHT } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        cell.border    = { bottom: { style: 'hair', color: { argb: 'C8E6D4' } } };
      });
    });

    // ── Row 10: "← Example rows" label ───────────────────────────
    const labelRow = ws.getRow(10);
    labelRow.height = 14;
    labelRow.getCell(1).value     = '↑ Example rows — delete these before uploading, or leave them; the system will skip duplicates.';
    labelRow.getCell(1).font      = mutedSmall;
    labelRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_HEADER } };
    labelRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.mergeCells('A10:G10');
    for (let c = 2; c <= 7; c++) {
      labelRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_HEADER } };
    }

    // ── Rows 11–60: Empty data rows (alternating) ─────────────────
    for (let row = 11; row <= 60; row++) {
      const r = ws.getRow(row);
      r.height = 18;
      const bg = row % 2 === 0 ? GREY_HEADER : WHITE;
      cols.forEach((_, idx) => {
        const cell = r.getCell(idx + 1);
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font      = normalDark;
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        cell.border    = { bottom: { style: 'hair', color: { argb: 'E2E8F0' } } };
      });
      // Data validation: Is Admin column (col F = index 6)
      ws.getCell(`F${row}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"Yes,No"'],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Invalid value',
        error: 'Please enter Yes or No',
      };
    }

    // ── Instructions sheet ────────────────────────────────────────
    const ws2 = wb.addWorksheet('Instructions');
    ws2.columns = [{ width: 80 }];

    const instructions = [
      { text: 'HOW TO USE THIS TEMPLATE', bold: true, size: 14, bg: GREEN_DARK, color: WHITE, height: 30 },
      { text: '', bg: WHITE, height: 8 },
      { text: 'STEP 1 — Fill in the "Teachers" sheet', bold: true, size: 11, bg: GREEN_LIGHT, color: GREEN_DARK, height: 22 },
      { text: '  • Delete the three example rows (rows 7–9) or leave them — duplicates are skipped automatically.', height: 18 },
      { text: '  • Each row = one teacher. Required: Full Name + Email Address.', height: 18 },
      { text: '  • Teacher ID: leave blank to auto-generate (T001, T002, …).', height: 18 },
      { text: '  • Is Admin?: enter Yes (can log into admin portal) or No (teacher-only access).', height: 18 },
      { text: '', height: 8 },
      { text: 'STEP 2 — Save the file', bold: true, size: 11, bg: GREEN_LIGHT, color: GREEN_DARK, height: 22 },
      { text: '  • Save as .xlsx or .csv before uploading.', height: 18 },
      { text: '  • Do not rename the "Teachers" sheet or add extra sheets.', height: 18 },
      { text: '', height: 8 },
      { text: 'STEP 3 — Upload', bold: true, size: 11, bg: GREEN_LIGHT, color: GREEN_DARK, height: 22 },
      { text: '  • In the admin portal go to Teachers → Bulk Upload.', height: 18 },
      { text: '  • Select your saved file and click Upload.', height: 18 },
      { text: '  • A summary will show how many were added and any rows that were skipped.', height: 18 },
      { text: '', height: 8 },
      { text: 'COLUMN REFERENCE', bold: true, size: 11, bg: GREEN_LIGHT, color: GREEN_DARK, height: 22 },
      { text: '  Teacher ID     — Optional. Leave blank for auto-assignment.', height: 18 },
      { text: '  Full Name      — Required.', height: 18 },
      { text: '  Email Address  — Required. Must be unique across all teachers.', height: 18 },
      { text: '  Phone Number   — Optional.', height: 18 },
      { text: '  Department     — Optional. e.g. Mathematics, Science, English.', height: 18 },
      { text: '  Is Admin?      — Optional. Yes or No (default: No).', height: 18 },
      { text: '  Notes          — Optional. Internal notes about the teacher.', height: 18 },
    ];

    instructions.forEach(({ text, bold, size, bg, color, height }) => {
      const r = ws2.addRow([text]);
      r.height = height ?? 18;
      const cell = r.getCell(1);
      cell.font      = { bold: !!bold, size: size ?? 10, name: 'Calibri', color: { argb: color ?? TEXT_DARK } };
      cell.alignment = { vertical: 'middle', wrapText: false };
      if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    });

    // ── Send as buffer (streaming directly to res causes corrupt files) ──
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
