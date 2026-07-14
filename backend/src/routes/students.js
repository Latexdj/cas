const router = require('express').Router();
const multer = require('multer');
const XLSX   = require('xlsx');
const bcrypt = require('bcrypt');
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { uploadFile } = require('../services/storage.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PHONE_RE      = /^0\d{9}$/;
const GHANA_CARD_RE = /^GHA-\d{9}-\d$/;

function validateStudentFields(fields) {
  const errors = [];
  if (fields.mobile_number   && !PHONE_RE.test(fields.mobile_number))
    errors.push('Mobile number must be 10 digits starting with 0 (e.g. 0207440175)');
  if (fields.guardian_mobile && !PHONE_RE.test(fields.guardian_mobile))
    errors.push('Guardian mobile must be 10 digits starting with 0');
  if (fields.ghana_card_number && !GHANA_CARD_RE.test(fields.ghana_card_number))
    errors.push('Ghana Card must be in the format GHA-XXXXXXXXX-X (e.g. GHA-715422858-2)');
  return errors;
}

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

/** GET /api/students/upload/template — returns a styled XLSX workbook
 *  ?mode=empty|populated  &class=<class_name>  &status=Active|Inactive|Graduated|all
 */
router.get('/upload/template', adminOnly, async (req, res, next) => {
  try {
    const mode         = req.query.mode   || 'empty';
    const classFilter  = req.query.class  || '';
    const statusFilter = req.query.status || 'Active';

    const { rows: programs } = await pool.query(
      `SELECT name FROM programs WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Students ──
    const headers = [
      'Student ID', 'Name', 'Class', 'Program', 'Status',
      'JHS Index No.', 'Date of Birth (YYYY-MM-DD)', 'Gender (Male/Female)',
      'Hometown', 'Residential Address', 'Ghana Card No.', 'NHIA No.',
      'Mobile No.', 'Aggregate', 'House', 'Residential Status (Day/Boarding)',
      'Religion', 'Religious Denomination',
      'Guardian Name', 'Guardian Occupation', 'Guardian Mobile',
      'Notes',
    ];

    let dataRows;
    let dataStyle;

    if (mode === 'populated') {
      const qParams = [req.schoolId];
      const conds   = ['s.school_id = $1'];
      if (classFilter)            { qParams.push(classFilter);  conds.push(`s.class_name = $${qParams.length}`); }
      if (statusFilter !== 'all') { qParams.push(statusFilter); conds.push(`s.status = $${qParams.length}`); }
      const { rows: students } = await pool.query(`
        SELECT s.*, p.name AS program_name
        FROM students s
        LEFT JOIN programs p ON p.id = s.program_id
        WHERE ${conds.join(' AND ')}
        ORDER BY s.class_name, s.name
      `, qParams);

      dataRows = students.map(s => [
        s.student_code        ?? '',
        s.name                ?? '',
        s.class_name          ?? '',
        s.program_name        ?? '',
        s.status              ?? '',
        s.jhs_index_number    ?? '',
        s.date_of_birth ? String(s.date_of_birth).slice(0, 10) : '',
        s.gender              ?? '',
        s.hometown            ?? '',
        s.residential_address ?? '',
        s.ghana_card_number   ?? '',
        s.nhia_number         ?? '',
        s.mobile_number       ?? '',
        s.aggregate != null ? s.aggregate : '',
        s.house               ?? '',
        s.residential_status  ?? '',
        s.religion            ?? '',
        s.religious_denomination ?? '',
        s.guardian_name       ?? '',
        s.guardian_occupation ?? '',
        s.guardian_mobile     ?? '',
        s.notes               ?? '',
      ]);
      dataStyle = { fill: { patternType: 'solid', fgColor: { rgb: 'F0FDF4' } } };
    } else {
      const p0 = programs[0]?.name ?? '';
      const p1 = programs[1]?.name ?? p0;
      dataRows = [
        ['',     'Kwame Mensah', '1A', p0, 'Active', 'GHA-JHS-001', '2008-03-15', 'Male',   'Accra',    '12 Main St', 'GHA-001', 'NHIA-001', '024-000-0001', 8,  'Blue',  'Day',      'Christianity', 'Methodist', 'Kofi Mensah',  'Farmer',   '020-000-0001', ''],
        ['',     'Abena Osei',   '2B', p1, 'Active', 'GHA-JHS-002', '2007-07-20', 'Female', 'Kumasi',   '5 Ring Rd',  '',        '',          '',             12, 'Red',   'Boarding', 'Islam',        'Sunni',     'Ama Osei',     'Teacher',  '024-000-0002', 'Transferred in'],
        ['S003', 'Kofi Asante',  '3C', p0, 'Active', 'GHA-JHS-003', '2006-11-05', 'Male',   'Takoradi', '3 Beach Rd', 'GHA-003', 'NHIA-003', '027-000-0003', 10, 'Green', 'Day',      'Christianity', 'Catholic',  'Yaw Asante',   'Engineer', '027-000-0003', ''],
      ];
      dataStyle = { fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } } };
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

    ws['!cols'] = [
      { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 22 }, { wch: 12 },
      { wch: 18 }, { wch: 26 }, { wch: 22 }, { wch: 18 }, { wch: 30 },
      { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 14 },
      { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 26 }, { wch: 22 },
      { wch: 18 }, { wch: 28 },
    ];
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    const hStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    headers.forEach((_, c) => {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = hStyle;
    });
    dataRows.forEach((_, r) => {
      headers.forEach((__, c) => {
        const ref = XLSX.utils.encode_cell({ r: r + 1, c });
        if (ws[ref]) ws[ref].s = dataStyle;
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
    let filename = 'students_template.xlsx';
    if (mode === 'populated') {
      const parts = ['students', classFilter ? classFilter.replace(/[^a-z0-9]/gi, '_') : 'all_classes', statusFilter];
      filename = parts.join('_') + '.xlsx';
    }
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

// ── Import normalizers ────────────────────────────────────────────────────────
function normalizeGender(val) {
  if (!val) return null;
  const v = val.trim().toLowerCase();
  if (v === 'male')   return 'Male';
  if (v === 'female') return 'Female';
  return val.trim() || null;
}
function normalizeResidentialStatus(val) {
  if (!val) return null;
  const v = val.trim().toLowerCase();
  if (v === 'day')      return 'Day';
  if (v === 'boarding') return 'Boarding';
  return val.trim() || null;
}

/** POST /api/students/upload — bulk import */
router.post('/upload', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb   = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', cellDates: true });
    if (!rows.length) return res.status(400).json({ error: 'File is empty' });

    // Strip comment rows, then skip header row if detected
    let dataRows = rows.filter(row => !String(row[0] ?? '').trim().startsWith('#'));
    if (dataRows.length > 0) {
      const firstCell = String(dataRows[0][0] ?? '').trim().toLowerCase();
      if (['student', 'name', 'id'].some(k => firstCell.includes(k))) {
        dataRows = dataRows.slice(1);
      }
    }

    // Load programs + ALL existing student codes in two parallel queries
    const [{ rows: programRows }, { rows: allCodeRows }] = await Promise.all([
      pool.query(`SELECT id, LOWER(TRIM(name)) AS name_lower FROM programs WHERE school_id = $1`, [req.schoolId]),
      pool.query(`SELECT student_code FROM students WHERE school_id = $1`, [req.schoolId]),
    ]);
    const programByName    = new Map(programRows.map(p => [p.name_lower, p.id]));
    const existingCodesDB  = new Set(allCodeRows.map(r => r.student_code));
    let autoCodeCounter    = 0;
    for (const r of allCodeRows) {
      if (/^S\d+$/.test(r.student_code)) {
        const n = parseInt(r.student_code.slice(1));
        if (n > autoCodeCounter) autoCodeCounter = n;
      }
    }

    // Helper: normalise a date cell to ISO string or null
    function toISODate(val) {
      if (val == null || val === '') return null;
      if (val instanceof Date) return isNaN(val) ? null : val.toISOString().slice(0, 10);
      const s = String(val).trim();
      if (!s) return null;
      let d = new Date(s);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
      const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmy) {
        d = new Date(`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`);
        if (!isNaN(d)) return d.toISOString().slice(0, 10);
      }
      return null;
    }

    // Pass 1: validate every row in JS — zero DB calls
    const errors    = [];
    const validRows = [];
    const seenCodes = new Set();
    const validStatuses = ['Active', 'Graduated', 'Inactive'];

    for (let i = 0; i < dataRows.length; i++) {
      const row    = dataRows[i];
      const rowNum = i + 2;

      const studentCode            = String(row[0]  ?? '').trim() || null;
      const name                   = String(row[1]  ?? '').trim();
      const className              = String(row[2]  ?? '').trim();
      const programName            = String(row[3]  ?? '').trim();
      const statusRaw              = String(row[4]  ?? '').trim();
      const jhs_index_number       = String(row[5]  ?? '').trim() || null;
      const date_of_birth          = toISODate(row[6]);
      const gender                 = normalizeGender(String(row[7] ?? ''));
      const hometown               = String(row[8]  ?? '').trim() || null;
      const residential_address    = String(row[9]  ?? '').trim() || null;
      const ghana_card_number      = String(row[10] ?? '').trim() || null;
      const nhia_number            = String(row[11] ?? '').trim() || null;
      const mobile_number          = String(row[12] ?? '').trim() || null;
      const aggregateRaw           = String(row[13] ?? '').trim();
      const aggregate              = aggregateRaw ? (parseInt(aggregateRaw) || null) : null;
      const house                  = String(row[14] ?? '').trim() || null;
      const residential_status     = normalizeResidentialStatus(String(row[15] ?? ''));
      const religion               = String(row[16] ?? '').trim() || null;
      const religious_denomination = String(row[17] ?? '').trim() || null;
      const guardian_name          = String(row[18] ?? '').trim() || null;
      const guardian_occupation    = String(row[19] ?? '').trim() || null;
      const guardian_mobile        = String(row[20] ?? '').trim() || null;
      const notes                  = String(row[21] ?? '').trim() || null;

      if (!name && !studentCode) continue;
      if (!name)      { errors.push({ row: rowNum, message: 'Name is required' });  continue; }
      if (!className) { errors.push({ row: rowNum, message: 'Class is required' }); continue; }

      let programId = null;
      if (programName) {
        programId = programByName.get(programName.toLowerCase()) ?? null;
        if (!programId) {
          errors.push({ row: rowNum, message: `Program "${programName}" not found` });
          continue;
        }
      }

      const status = validStatuses.find(s => s.toLowerCase() === statusRaw.toLowerCase()) || 'Active';
      const code   = studentCode || ('S' + String(++autoCodeCounter).padStart(3, '0'));

      if (existingCodesDB.has(code)) {
        errors.push({ row: rowNum, message: `Student ID "${code}" already exists` });
        continue;
      }
      if (seenCodes.has(code)) {
        errors.push({ row: rowNum, message: `Duplicate Student ID "${code}" in file` });
        continue;
      }
      seenCodes.add(code);

      validRows.push({ rowNum, code, name, className, status, notes, programId,
        jhs_index_number, date_of_birth, gender, hometown, residential_address,
        ghana_card_number, nhia_number, mobile_number, aggregate, house,
        residential_status, religion, religious_denomination,
        guardian_name, guardian_occupation, guardian_mobile });
    }

    // Pass 2: one multi-value INSERT — each cell is its own parameter so nulls work naturally
    let inserted = 0;
    if (validRows.length > 0) {
      const params       = [];
      const placeholders = validRows.map(r => {
        const b = params.length;
        params.push(
          req.schoolId, r.code, r.name, r.className, r.status, r.notes, r.programId,
          r.jhs_index_number, r.date_of_birth || null, r.gender, r.hometown, r.residential_address,
          r.ghana_card_number, r.nhia_number, r.mobile_number, r.aggregate, r.house,
          r.residential_status, r.religion, r.religious_denomination,
          r.guardian_name, r.guardian_occupation, r.guardian_mobile
        );
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19},$${b+20},$${b+21},$${b+22},$${b+23})`;
      });
      await pool.query(
        `INSERT INTO students
           (school_id, student_code, name, class_name, status, notes, program_id,
            jhs_index_number, date_of_birth, gender, hometown, residential_address,
            ghana_card_number, nhia_number, mobile_number, aggregate, house,
            residential_status, religion, religious_denomination,
            guardian_name, guardian_occupation, guardian_mobile)
         VALUES ${placeholders.join(',')}`,
        params
      );
      inserted = validRows.length;
    }

    res.json({ inserted, errors });
  } catch (err) { next(err); }
});

/** POST /api/students/bulk-update — update existing students by student_code */
router.post('/bulk-update', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb   = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', cellDates: true });
    if (!rows.length) return res.status(400).json({ error: 'File is empty' });

    let dataRows = rows.filter(row => !String(row[0] ?? '').trim().startsWith('#'));
    if (dataRows.length > 0) {
      const firstCell = String(dataRows[0][0] ?? '').trim().toLowerCase();
      if (['student', 'name', 'id'].some(k => firstCell.includes(k))) {
        dataRows = dataRows.slice(1);
      }
    }

    function toISODate(val) {
      if (val == null || val === '') return undefined;
      if (val instanceof Date) return isNaN(val) ? undefined : val.toISOString().slice(0, 10);
      const s = String(val).trim();
      if (!s) return undefined;
      let d = new Date(s);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
      const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmy) {
        d = new Date(`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`);
        if (!isNaN(d)) return d.toISOString().slice(0, 10);
      }
      return undefined;
    }

    const [{ rows: programRows }, { rows: studentRows }] = await Promise.all([
      pool.query(`SELECT id, LOWER(TRIM(name)) AS name_lower FROM programs WHERE school_id = $1`, [req.schoolId]),
      pool.query(`SELECT id, student_code FROM students WHERE school_id = $1`, [req.schoolId]),
    ]);
    const programByName = new Map(programRows.map(p => [p.name_lower, p.id]));
    const studentById   = new Map(studentRows.map(s => [s.student_code, s.id]));
    const validStatuses = ['Active', 'Graduated', 'Inactive'];

    const errors   = [];
    const notFound = [];
    let updated    = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row    = dataRows[i];
      const rowNum = i + 2;

      const studentCode = String(row[0] ?? '').trim();
      if (!studentCode) { errors.push({ row: rowNum, message: 'Student ID is required for updates' }); continue; }

      const studentId = studentById.get(studentCode);
      if (!studentId) { notFound.push({ row: rowNum, code: studentCode }); continue; }

      // Collect only fields that are non-empty — blank = skip (don't overwrite)
      const sets = [];
      const params = [];

      function add(col, val) {
        if (val === undefined || val === null || val === '') return;
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      }

      const name      = String(row[1] ?? '').trim();
      const className = String(row[2] ?? '').trim();
      const programName = String(row[3] ?? '').trim();
      const statusRaw = String(row[4] ?? '').trim();

      add('name',                  name || undefined);
      add('class_name',            className || undefined);
      add('jhs_index_number',      String(row[5] ?? '').trim() || undefined);
      add('date_of_birth',         toISODate(row[6]));
      add('gender',                normalizeGender(String(row[7] ?? '')) || undefined);
      add('hometown',              String(row[8] ?? '').trim() || undefined);
      add('residential_address',   String(row[9] ?? '').trim() || undefined);
      add('ghana_card_number',     String(row[10] ?? '').trim() || undefined);
      add('nhia_number',           String(row[11] ?? '').trim() || undefined);
      add('mobile_number',         String(row[12] ?? '').trim() || undefined);
      const aggRaw = String(row[13] ?? '').trim();
      if (aggRaw) add('aggregate', parseInt(aggRaw) || undefined);
      add('house',                 String(row[14] ?? '').trim() || undefined);
      add('residential_status',    normalizeResidentialStatus(String(row[15] ?? '')) || undefined);
      add('religion',              String(row[16] ?? '').trim() || undefined);
      add('religious_denomination',String(row[17] ?? '').trim() || undefined);
      add('guardian_name',         String(row[18] ?? '').trim() || undefined);
      add('guardian_occupation',   String(row[19] ?? '').trim() || undefined);
      add('guardian_mobile',       String(row[20] ?? '').trim() || undefined);
      add('notes',                 String(row[21] ?? '').trim() || undefined);

      if (statusRaw) {
        const status = validStatuses.find(s => s.toLowerCase() === statusRaw.toLowerCase());
        if (status) add('status', status);
      }
      if (programName) {
        const progId = programByName.get(programName.toLowerCase());
        if (!progId) { errors.push({ row: rowNum, message: `Program "${programName}" not found` }); continue; }
        add('program_id', progId);
      }

      const fieldErrors = validateStudentFields({
        mobile_number:    sets.some(s => s.startsWith('mobile_number')) ? params[sets.findIndex(s => s.startsWith('mobile_number'))] : null,
        guardian_mobile:  sets.some(s => s.startsWith('guardian_mobile')) ? params[sets.findIndex(s => s.startsWith('guardian_mobile'))] : null,
        ghana_card_number: sets.some(s => s.startsWith('ghana_card_number')) ? params[sets.findIndex(s => s.startsWith('ghana_card_number'))] : null,
      });
      if (fieldErrors.length) { errors.push({ row: rowNum, message: fieldErrors.join('; ') }); continue; }

      if (!sets.length) continue; // nothing to update on this row

      params.push(req.schoolId, studentId);
      await pool.query(
        `UPDATE students SET ${sets.join(', ')}, updated_at = now()
         WHERE school_id = $${params.length - 1} AND id = $${params.length}`,
        params
      );
      updated++;
    }

    res.json({ updated, notFound, errors });
  } catch (err) { next(err); }
});

/** POST /api/students/promote — bulk or selective class promotion */
router.post('/promote', adminOnly, async (req, res, next) => {
  try {
    const { from_class, to_class, student_ids } = req.body;
    if (!from_class || !to_class)
      return res.status(400).json({ error: 'from_class and to_class are required' });

    let rowCount;
    if (Array.isArray(student_ids) && student_ids.length > 0) {
      const { rowCount: rc } = await pool.query(
        `UPDATE students SET class_name=$1, updated_at=now()
         WHERE id=ANY($2::uuid[]) AND school_id=$3 AND status='Active'`,
        [to_class, student_ids, req.schoolId]
      );
      rowCount = rc;
    } else {
      const { rowCount: rc } = await pool.query(
        `UPDATE students SET class_name=$1, updated_at=now()
         WHERE school_id=$2 AND class_name=$3 AND status='Active'`,
        [to_class, req.schoolId, from_class]
      );
      rowCount = rc;
    }
    res.json({ promoted: rowCount, from_class, to_class });
  } catch (err) { next(err); }
});

/** POST /api/students/graduate — bulk or selective graduation */
router.post('/graduate', adminOnly, async (req, res, next) => {
  try {
    const { class_name, student_ids } = req.body;
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });

    let rowCount;
    if (Array.isArray(student_ids) && student_ids.length > 0) {
      const { rowCount: rc } = await pool.query(
        `UPDATE students SET status='Graduated', updated_at=now()
         WHERE id=ANY($2::uuid[]) AND school_id=$1 AND status='Active'`,
        [req.schoolId, student_ids]
      );
      rowCount = rc;
    } else {
      const { rowCount: rc } = await pool.query(
        `UPDATE students SET status='Graduated', updated_at=now()
         WHERE school_id=$1 AND class_name=$2 AND status='Active'`,
        [req.schoolId, class_name]
      );
      rowCount = rc;
    }
    res.json({ graduated: rowCount, class_name });
  } catch (err) { next(err); }
});

/** GET /api/students/classes — distinct active class names (teachers see only their timetable classes) */
router.get('/classes', async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === 'teacher') {
      ({ rows } = await pool.query(
        `SELECT DISTINCT TRIM(cls) AS class_name
         FROM timetable,
              LATERAL unnest(string_to_array(class_names, ',')) AS cls
         WHERE school_id = $1 AND teacher_id = $2
         ORDER BY class_name`,
        [req.schoolId, req.user.id]
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT DISTINCT class_name FROM students
         WHERE school_id = $1 AND status = 'Active'
         ORDER BY class_name`,
        [req.schoolId]
      ));
    }
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
              s.program_id, p.name AS program_name, s.picture_url, s.house, s.residential_status
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
              s.program_id, p.name AS program_name,
              s.jhs_index_number, s.date_of_birth, s.gender, s.hometown, s.residential_address,
              s.ghana_card_number, s.nhia_number, s.mobile_number, s.aggregate, s.house,
              s.residential_status, s.religion, s.religious_denomination,
              s.guardian_name, s.guardian_occupation, s.guardian_mobile, s.picture_url,
              DATE_PART('year', AGE(s.date_of_birth))::integer AS age,
              (s.pin_hash IS NOT NULL) AS has_pin
       FROM students s
       LEFT JOIN programs p ON p.id = s.program_id
       WHERE s.id = $1 AND s.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

const DEFAULT_STUDENT_PIN = 'Student123';

/** POST /api/students/:id/set-pin — admin sets or resets a student's portal PIN */
router.post('/:id/set-pin', adminOnly, async (req, res, next) => {
  try {
    // Empty pin resets to the school-wide default
    const pin = req.body.pin ? String(req.body.pin) : DEFAULT_STUDENT_PIN;
    if (pin.length < 4) return res.status(400).json({ error: 'PIN must be at least 4 characters' });
    const { rows } = await pool.query(`SELECT id FROM students WHERE id = $1 AND school_id = $2`, [req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    const hash = await bcrypt.hash(pin, 12);
    await pool.query(`UPDATE students SET pin_hash = $1, updated_at = now() WHERE id = $2`, [hash, req.params.id]);
    res.json({ message: pin === DEFAULT_STUDENT_PIN ? 'PIN reset to default (Student123)' : 'PIN set successfully' });
  } catch (err) { next(err); }
});

/** POST /api/students */
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, class_name, student_code, status = 'Active', notes, program_id } = req.body;
    if (!name)       return res.status(400).json({ error: 'name is required' });
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });
    const valErrors = validateStudentFields(req.body);
    if (valErrors.length) return res.status(400).json({ error: valErrors.join('; ') });

    const code = student_code?.trim() || await nextStudentCode(req.schoolId);
    const defaultHash = await bcrypt.hash(DEFAULT_STUDENT_PIN, 12);
    const { rows } = await pool.query(
      `INSERT INTO students (school_id, student_code, name, class_name, status, notes, program_id, pin_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, student_code, name, class_name, status, notes, program_id`,
      [req.schoolId, code, name.trim(), class_name.trim(), status, notes || null, program_id || null, defaultHash]
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
    const {
      name, class_name, student_code, status, notes, program_id,
      jhs_index_number, date_of_birth, gender, hometown, residential_address,
      ghana_card_number, nhia_number, mobile_number, aggregate, house,
      residential_status, religion, religious_denomination,
      guardian_name, guardian_occupation, guardian_mobile,
    } = req.body;
    const valErrors = validateStudentFields(req.body);
    if (valErrors.length) return res.status(400).json({ error: valErrors.join('; ') });
    const { rows } = await pool.query(
      `UPDATE students SET
         student_code           = COALESCE($1,  student_code),
         name                   = COALESCE($2,  name),
         class_name             = COALESCE($3,  class_name),
         status                 = COALESCE($4,  status),
         notes                  = COALESCE($5,  notes),
         program_id             = COALESCE($6,  program_id),
         jhs_index_number       = COALESCE($7,  jhs_index_number),
         date_of_birth          = COALESCE($8,  date_of_birth),
         gender                 = COALESCE($9,  gender),
         hometown               = COALESCE($10, hometown),
         residential_address    = COALESCE($11, residential_address),
         ghana_card_number      = COALESCE($12, ghana_card_number),
         nhia_number            = COALESCE($13, nhia_number),
         mobile_number          = COALESCE($14, mobile_number),
         aggregate              = COALESCE($15, aggregate),
         house                  = COALESCE($16, house),
         residential_status     = COALESCE($17, residential_status),
         religion               = COALESCE($18, religion),
         religious_denomination = COALESCE($19, religious_denomination),
         guardian_name          = COALESCE($20, guardian_name),
         guardian_occupation    = COALESCE($21, guardian_occupation),
         guardian_mobile        = COALESCE($22, guardian_mobile),
         updated_at             = now()
       WHERE id = $23 AND school_id = $24
       RETURNING id, student_code, name, class_name, status, notes, program_id,
                 jhs_index_number, date_of_birth, gender, hometown, residential_address,
                 ghana_card_number, nhia_number, mobile_number, aggregate, house,
                 residential_status, religion, religious_denomination,
                 guardian_name, guardian_occupation, guardian_mobile, picture_url`,
      [student_code?.trim() || null, name || null, class_name?.trim() || null,
       status || null, notes !== undefined ? (notes || null) : undefined,
       program_id || null,
       jhs_index_number||null, date_of_birth||null, gender||null, hometown||null, residential_address||null,
       ghana_card_number||null, nhia_number||null, mobile_number||null,
       aggregate !== undefined ? (aggregate || null) : undefined,
       house||null, residential_status||null, religion||null, religious_denomination||null,
       guardian_name||null, guardian_occupation||null, guardian_mobile||null,
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

/** POST /api/students/:id/picture — upload student profile photo */
router.post('/:id/picture', adminOnly, async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
    const filePath = `student-photos/${req.params.id}`;
    const pictureUrl = await uploadFile(imageBase64, filePath, { upsert: true });
    const { rowCount } = await pool.query(
      `UPDATE students SET picture_url = $1, updated_at = now() WHERE id = $2 AND school_id = $3`,
      [pictureUrl, req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Student not found' });
    res.json({ picture_url: pictureUrl });
  } catch (err) { next(err); }
});

module.exports = router;
