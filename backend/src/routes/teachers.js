const router   = require('express').Router();
const bcrypt   = require('bcrypt');
const multer   = require('multer');
const XLSX     = require('xlsx');
const ExcelJS  = require('exceljs');
const pool     = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { uploadFile, uploadDocument } = require('../services/storage.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PHONE_RE      = /^0\d{9}$/;
const GHANA_CARD_RE = /^GHA-\d{9}-\d$/;
const NTC_RE        = /^PT\/\d{6}\/\d{4}$/;
const SSF_RE        = /^[A-Za-z]{2}\d{11}$/;

function validateTeacherFields(fields) {
  const errors = [];
  if (fields.phone              && !PHONE_RE.test(fields.phone))
    errors.push('Phone must be 10 digits starting with 0 (e.g. 0207440175)');
  if (fields.emergency_contact_phone && !PHONE_RE.test(fields.emergency_contact_phone))
    errors.push('Emergency contact phone must be 10 digits starting with 0');
  if (fields.ghana_card_number  && !GHANA_CARD_RE.test(fields.ghana_card_number))
    errors.push('Ghana Card must be in the format GHA-XXXXXXXXX-X (e.g. GHA-715422858-2)');
  if (fields.ntc_number         && !NTC_RE.test(fields.ntc_number))
    errors.push('NTC Number must be in the format PT/XXXXXX/XXXX (e.g. PT/010060/2009)');
  if (fields.ssf_number         && !SSF_RE.test(fields.ssf_number))
    errors.push('SSF Number must be 2 letters followed by 11 digits (e.g. KO18602160034)');
  return errors;
}

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

/** GET /api/teachers/upload/template — styled XLSX template
 *  ?mode=empty|populated  &status=Active|Inactive|all
 */
router.get('/upload/template', adminOnly, async (req, res, next) => {
  try {
    const mode         = req.query.mode   || 'empty';
    const statusFilter = req.query.status || 'Active';

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
      { key: 'teacher_code',              header: 'Teacher ID',                    width: 16 },
      { key: 'name',                      header: 'Full Name',                     width: 28 },
      { key: 'email',                     header: 'Email Address',                 width: 32 },
      { key: 'phone',                     header: 'Phone Number',                  width: 18 },
      { key: 'department',                header: 'Department / Subject',          width: 26 },
      { key: 'rank',                      header: 'GES Rank',                      width: 28 },
      { key: 'gov_staff_id',              header: 'Gov Staff ID',                  width: 18 },
      { key: 'gender',                    header: 'Gender (Male/Female)',          width: 20 },
      { key: 'date_of_birth',             header: 'Date of Birth (YYYY-MM-DD)',    width: 24 },
      { key: 'registered_number',         header: 'Registered Number',             width: 20 },
      { key: 'ntc_number',                header: 'NTC Number',                    width: 18 },
      { key: 'ssf_number',                header: 'SSF Number',                    width: 18 },
      { key: 'academic_qualification',    header: 'Academic Qualification',        width: 26 },
      { key: 'professional_qualification',header: 'Professional Qualification',    width: 28 },
      { key: 'additional_responsibility', header: 'Additional Responsibility',     width: 28 },
      { key: 'bank',                      header: 'Bank',                          width: 22 },
      { key: 'bank_branch',               header: 'Bank Branch',                   width: 22 },
      { key: 'account_number',            header: 'Account Number',                width: 20 },
      { key: 'religion',                  header: 'Religion',                      width: 18 },
      { key: 'religious_denomination',    header: 'Religious Denomination',        width: 24 },
      { key: 'hometown',                  header: 'Hometown',                      width: 22 },
      { key: 'residential_address',       header: 'Residential Address',           width: 32 },
      { key: 'association',               header: 'Association (GNAT/NAGRAT/etc)', width: 26 },
      { key: 'ghana_card_number',         header: 'Ghana Card Number',             width: 22 },
      { key: 'emergency_contact_name',    header: 'Emergency Contact Name',        width: 26 },
      { key: 'emergency_contact_phone',   header: 'Emergency Contact Phone',       width: 24 },
      { key: 'is_admin',                  header: 'Is Admin? (Yes/No)',            width: 20 },
      { key: 'notes',                     header: 'Notes',                         width: 30 },
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

    // Data rows — populated or empty
    let dataRowCount = 0;
    if (mode === 'populated') {
      const qParams = [req.schoolId];
      const conds   = ['school_id = $1'];
      if (statusFilter !== 'all') { qParams.push(statusFilter); conds.push(`status = $${qParams.length}`); }
      const { rows: teachers } = await pool.query(
        `SELECT * FROM teachers WHERE ${conds.join(' AND ')} ORDER BY name`,
        qParams
      );
      dataRowCount = teachers.length;

      teachers.forEach((t, i) => {
        const r  = ws.addRow({
          teacher_code:               t.teacher_code              ?? '',
          name:                       t.name                      ?? '',
          email:                      t.email                     ?? '',
          phone:                      t.phone                     ?? '',
          department:                 t.department                ?? '',
          rank:                       t.rank                      ?? '',
          gov_staff_id:               t.gov_staff_id              ?? '',
          gender:                     t.gender                    ?? '',
          date_of_birth:              t.date_of_birth ? String(t.date_of_birth).slice(0, 10) : '',
          registered_number:          t.registered_number         ?? '',
          ntc_number:                 t.ntc_number                ?? '',
          ssf_number:                 t.ssf_number                ?? '',
          academic_qualification:     t.academic_qualification    ?? '',
          professional_qualification: t.professional_qualification ?? '',
          additional_responsibility:  t.additional_responsibility ?? '',
          bank:                       t.bank                      ?? '',
          bank_branch:                t.bank_branch               ?? '',
          account_number:             t.account_number            ?? '',
          religion:                   t.religion                  ?? '',
          religious_denomination:     t.religious_denomination    ?? '',
          hometown:                   t.hometown                  ?? '',
          residential_address:        t.residential_address       ?? '',
          association:                t.association               ?? '',
          ghana_card_number:          t.ghana_card_number         ?? '',
          emergency_contact_name:     t.emergency_contact_name    ?? '',
          emergency_contact_phone:    t.emergency_contact_phone   ?? '',
          is_admin:                   t.is_admin ? 'Yes' : 'No',
          notes:                      t.notes                     ?? '',
        });
        r.height = 18;
        const rowNum = r.number;
        cols.forEach((_, idx) => {
          const cell     = r.getCell(idx + 1);
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };
          cell.font      = { color: { argb: TEXT_DARK }, size: 10, name: 'Calibri' };
          cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
          cell.border    = { bottom: { style: 'hair', color: { argb: 'E2E8F0' } } };
        });
        ws.getCell(`H${rowNum}`).dataValidation = {
          type: 'list', allowBlank: true, formulae: ['"Male,Female"'],
          showErrorMessage: true, errorStyle: 'stop',
          errorTitle: 'Invalid value', error: 'Please enter Male or Female',
        };
        ws.getCell(`F${rowNum}`).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: ['"Pupil Teacher,Teacher II,Teacher I,Senior Teacher II,Senior Teacher I,Assistant Superintendent II,Assistant Superintendent I,Superintendent,Senior Superintendent,Principal Superintendent,Assistant Director II,Assistant Director I,Deputy Director,Director"'],
          showErrorMessage: true, errorStyle: 'stop',
          errorTitle: 'Invalid value', error: 'Select a rank from the list',
        };
        ws.getCell(`AB${rowNum}`).dataValidation = {
          type: 'list', allowBlank: true, formulae: ['"Yes,No"'],
          showErrorMessage: true, errorStyle: 'stop',
          errorTitle: 'Invalid value', error: 'Please enter Yes or No',
        };
      });
    } else {
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
        ws.getCell(`H${row}`).dataValidation = {
          type: 'list', allowBlank: true, formulae: ['"Male,Female"'],
          showErrorMessage: true, errorStyle: 'stop',
          errorTitle: 'Invalid value', error: 'Please enter Male or Female',
        };
        ws.getCell(`F${row}`).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: ['"Pupil Teacher,Teacher II,Teacher I,Senior Teacher II,Senior Teacher I,Assistant Superintendent II,Assistant Superintendent I,Superintendent,Senior Superintendent,Principal Superintendent,Assistant Director II,Assistant Director I,Deputy Director,Director"'],
          showErrorMessage: true, errorStyle: 'stop',
          errorTitle: 'Invalid value', error: 'Select a rank from the list',
        };
        ws.getCell(`AB${row}`).dataValidation = {
          type: 'list', allowBlank: true, formulae: ['"Yes,No"'],
          showErrorMessage: true, errorStyle: 'stop',
          errorTitle: 'Invalid value', error: 'Please enter Yes or No',
        };
      }
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
      ['Teacher ID',                    'Optional',  'Leave blank — the system will auto-assign (e.g. T001, T002).'],
      ['Full Name',                     'Required',  'Teacher\'s full name as it should appear in reports.'],
      ['Email Address',                 'Optional',  'Must be unique if provided. Used for login.'],
      ['Phone Number',                  'Optional',  'Contact number. Any format accepted.'],
      ['Department / Subject',          'Optional',  'e.g. Mathematics, English Language, Science.'],
      ['GES Rank',                      'Optional',  'Select from dropdown: Pupil Teacher → Director.'],
      ['Gov Staff ID',                  'Optional',  'Government-issued staff identification number.'],
      ['Gender',                        'Optional',  'Male or Female (use dropdown).'],
      ['Date of Birth',                 'Optional',  'Format: YYYY-MM-DD (e.g. 1990-05-23).'],
      ['Registered Number',             'Optional',  'GES registered number.'],
      ['NTC Number',                    'Optional',  'National Teaching Council registration number.'],
      ['SSF Number',                    'Optional',  'Social Security and National Insurance Trust number.'],
      ['Academic Qualification',        'Optional',  'Highest academic qualification e.g. BA, BSc, MA, PhD.'],
      ['Professional Qualification',    'Optional',  'e.g. B.Ed, PGDE, Cert A.'],
      ['Additional Responsibility',     'Optional',  'e.g. Form Master, HOD, House Master, Vice Principal.'],
      ['Bank',                          'Optional',  'Name of bank e.g. GCB, Absa, Ecobank.'],
      ['Bank Branch',                   'Optional',  'Branch name or code.'],
      ['Account Number',                'Optional',  'Bank account number.'],
      ['Religion',                      'Optional',  'e.g. Christianity, Islam, Traditional.'],
      ['Religious Denomination',        'Optional',  'e.g. Catholic, Methodist, Presbyterian, Sunni.'],
      ['Hometown',                      'Optional',  'Town or city of origin.'],
      ['Residential Address',           'Optional',  'Current home address.'],
      ['Association',                   'Optional',  'e.g. GNAT, NAGRAT, CCT, TEWU, Non-member.'],
      ['Ghana Card Number',             'Optional',  'National ID card number.'],
      ['Emergency Contact Name',        'Optional',  'Name of person to contact in an emergency.'],
      ['Emergency Contact Phone',       'Optional',  'Phone number of emergency contact person.'],
      ['Is Admin? (Yes/No)',            'Optional',  'Yes = can log into admin portal. Default: No.'],
      ['Notes',                         'Optional',  'Internal notes — not visible to the teacher.'],
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
    ws2.columns = cols.map(c => ({ width: c.width }));

    const examples = [
      ['', 'Jane Doe',     'jane.doe@school.edu',  '024-000-0001', 'Mathematics', 'Senior Teacher I',       'GHA-0001', 'Female', '1985-03-12', 'REG001', 'NTC001', 'SSF001', 'BA',    'B.Ed', 'HOD',         'GCB Bank',  'Accra Central', '1234567890', 'Christianity', 'Methodist',  'Accra',  '12 Main St', 'GNAT',    'GHA-001234', 'Kofi Doe',  '024-111-0001', 'No',  'Head of dept'],
      ['', 'Kwame Asante', 'kwame.a@school.edu',   '024-000-0002', 'English',     'Teacher I',              'GHA-0002', 'Male',   '1990-07-20', '',       '',       '',       'BSc',   'PGDE', '',            'Absa',      'Kumasi',        '0987654321', 'Islam',        'Sunni',      'Kumasi', '5 Ring Rd',  'NAGRAT',  '',            'Ama Asante','024-222-0002', 'No',  ''],
      ['T050', 'Ama Boateng', 'ama.b@school.edu', '024-000-0003', 'Science',     'Assistant Superintendent I','GHA-0003','Female','1978-11-05','REG003', 'NTC003', 'SSF003', 'MA',    'B.Ed', 'Vice Principal','Ecobank',   'Takoradi',      '1122334455', 'Christianity', 'Catholic',   'Takoradi','3 Beach Rd', 'CCT',     'GHA-003456', 'Kojo Boateng','024-333-0003','Yes','Vice principal'],
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
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    let filename = 'teachers_template.xlsx';
    if (mode === 'populated') filename = `teachers_${statusFilter}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
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

      const teacherCode              = String(row[0]  ?? '').trim().toUpperCase() || null;
      const name                     = String(row[1]  ?? '').trim();
      const email                    = String(row[2]  ?? '').trim() || null;
      const phone                    = String(row[3]  ?? '').trim() || null;
      const department               = String(row[4]  ?? '').trim() || null;
      const rank                     = String(row[5]  ?? '').trim() || null;
      const gov_staff_id             = String(row[6]  ?? '').trim() || null;
      const gender                   = String(row[7]  ?? '').trim() || null;
      const date_of_birth            = String(row[8]  ?? '').trim() || null;
      const registered_number        = String(row[9]  ?? '').trim() || null;
      const ntc_number               = String(row[10] ?? '').trim() || null;
      const ssf_number               = String(row[11] ?? '').trim() || null;
      const academic_qualification   = String(row[12] ?? '').trim() || null;
      const professional_qualification = String(row[13] ?? '').trim() || null;
      const additional_responsibility = String(row[14] ?? '').trim() || null;
      const bank                     = String(row[15] ?? '').trim() || null;
      const bank_branch              = String(row[16] ?? '').trim() || null;
      const account_number           = String(row[17] ?? '').trim() || null;
      const religion                 = String(row[18] ?? '').trim() || null;
      const religious_denomination   = String(row[19] ?? '').trim() || null;
      const hometown                 = String(row[20] ?? '').trim() || null;
      const residential_address      = String(row[21] ?? '').trim() || null;
      const association              = String(row[22] ?? '').trim() || null;
      const ghana_card_number        = String(row[23] ?? '').trim() || null;
      const emergency_contact_name   = String(row[24] ?? '').trim() || null;
      const emergency_contact_phone  = String(row[25] ?? '').trim() || null;
      const isAdminRaw               = String(row[26] ?? '').trim().toLowerCase();
      const notes                    = String(row[27] ?? '').trim() || null;

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
             (school_id, teacher_code, name, email, phone, department, status, is_admin, notes, pin_hash,
              rank, gov_staff_id, gender, date_of_birth, registered_number, ntc_number, ssf_number,
              academic_qualification, professional_qualification, additional_responsibility,
              bank, bank_branch, account_number, religion, religious_denomination,
              hometown, residential_address, association, ghana_card_number,
              emergency_contact_name, emergency_contact_phone)
           VALUES ($1,$2,$3,$4,$5,$6,'Active',$7,$8,$9,
                   $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
          [req.schoolId, code, name, email, phone, department, isAdmin, notes, pinHash,
           rank, gov_staff_id, gender, date_of_birth || null, registered_number, ntc_number, ssf_number,
           academic_qualification, professional_qualification, additional_responsibility,
           bank, bank_branch, account_number, religion, religious_denomination,
           hometown, residential_address, association, ghana_card_number,
           emergency_contact_name, emergency_contact_phone]
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
        t.status, t.is_admin, t.notes, t.rank, t.photo_url,
        ROUND(COALESCE(SUM(
          GREATEST(0,
            EXTRACT(EPOCH FROM (tt.end_time - tt.start_time))
            - COALESCE((
                SELECT SUM(GREATEST(0, EXTRACT(EPOCH FROM (
                  LEAST(tt.end_time, sb.end_time)
                  - GREATEST(tt.start_time, sb.start_time)
                ))))
                FROM school_breaks sb
                WHERE sb.school_id = $1
                  AND (sb.day_of_week IS NULL OR sb.day_of_week = tt.day_of_week)
            ), 0)
          ) / (s.period_duration_minutes * 60.0)
        ), 0)::numeric)::integer AS total_periods
      FROM teachers t
      JOIN schools s ON s.id = $1
      LEFT JOIN timetable tt ON tt.teacher_id = t.id AND tt.school_id = $1
      WHERE t.school_id = $1
      GROUP BY t.id, s.period_duration_minutes
      ORDER BY t.teacher_code
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/teachers/me — own full profile (must be before /:id to avoid being matched as id='me')
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, teacher_code, name, email, phone, department, status, is_admin, notes,
              rank, gov_staff_id, gender, date_of_birth, registered_number, ntc_number, ssf_number,
              academic_qualification, professional_qualification, additional_responsibility,
              bank, bank_branch, account_number, religion, religious_denomination,
              hometown, residential_address, association, ghana_card_number, photo_url,
              certificate_url, certificate_filename, emergency_contact_name, emergency_contact_phone
       FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.user.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });
    const teacher = rows[0];
    const { rows: responsibilities } = await pool.query(
      `SELECT tr.id, tr.name, tr.module_key
       FROM teacher_responsibility_assignments tra
       JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
       WHERE tra.teacher_id = $1 AND tr.school_id = $2
       ORDER BY tr.sort_order, tr.name`,
      [teacher.id, req.schoolId]
    );
    teacher.responsibilities = responsibilities;
    res.json(teacher);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, teacher_code, name, email, phone, department, status, is_admin, notes,
              rank, gov_staff_id, gender, date_of_birth, registered_number, ntc_number, ssf_number,
              academic_qualification, professional_qualification, additional_responsibility,
              bank, bank_branch, account_number, religion, religious_denomination,
              hometown, residential_address, association, ghana_card_number, photo_url,
              certificate_url, certificate_filename, emergency_contact_name, emergency_contact_phone
       FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });

    const teacher = rows[0];
    const [{ rows: schedule }, { rows: responsibilities }] = await Promise.all([
      pool.query(
        `SELECT id, day_of_week, start_time, end_time, subject, class_names
         FROM timetable WHERE teacher_id = $1 AND school_id = $2
         ORDER BY day_of_week, start_time`,
        [teacher.id, req.schoolId]
      ),
      pool.query(
        `SELECT tr.id, tr.name, tr.module_key
         FROM teacher_responsibility_assignments tra
         JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
         WHERE tra.teacher_id = $1 AND tr.school_id = $2
         ORDER BY tr.sort_order, tr.name`,
        [teacher.id, req.schoolId]
      ),
    ]);
    teacher.schedule = schedule;
    teacher.responsibilities = responsibilities;
    res.json(teacher);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, email, phone, department, status = 'Active', is_admin = false, notes, teacher_code } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const valErrors = validateTeacherFields(req.body);
    if (valErrors.length) return res.status(400).json({ error: valErrors.join('; ') });

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
    const {
      name, email, phone, department, status, is_admin, notes, teacher_code,
      rank, gov_staff_id, gender, date_of_birth, registered_number, ntc_number, ssf_number,
      academic_qualification, professional_qualification, additional_responsibility,
      bank, bank_branch, account_number, religion, religious_denomination,
      hometown, residential_address, association, ghana_card_number,
      emergency_contact_name, emergency_contact_phone,
      responsibility_ids,
    } = req.body;
    const valErrors = validateTeacherFields(req.body);
    if (valErrors.length) return res.status(400).json({ error: valErrors.join('; ') });
    const { rows } = await pool.query(
      `UPDATE teachers SET
         teacher_code             = COALESCE($1,  teacher_code),
         name                     = COALESCE($2,  name),
         email                    = COALESCE($3,  email),
         phone                    = COALESCE($4,  phone),
         department               = COALESCE($5,  department),
         status                   = COALESCE($6,  status),
         is_admin                 = COALESCE($7,  is_admin),
         notes                    = COALESCE($8,  notes),
         rank                     = COALESCE($9,  rank),
         gov_staff_id             = COALESCE($10, gov_staff_id),
         gender                   = COALESCE($11, gender),
         date_of_birth            = COALESCE($12, date_of_birth),
         registered_number        = COALESCE($13, registered_number),
         ntc_number               = COALESCE($14, ntc_number),
         ssf_number               = COALESCE($15, ssf_number),
         academic_qualification   = COALESCE($16, academic_qualification),
         professional_qualification = COALESCE($17, professional_qualification),
         additional_responsibility = COALESCE($18, additional_responsibility),
         bank                     = COALESCE($19, bank),
         bank_branch              = COALESCE($20, bank_branch),
         account_number           = COALESCE($21, account_number),
         religion                 = COALESCE($22, religion),
         religious_denomination   = COALESCE($23, religious_denomination),
         hometown                 = COALESCE($24, hometown),
         residential_address      = COALESCE($25, residential_address),
         association              = COALESCE($26, association),
         ghana_card_number        = COALESCE($27, ghana_card_number),
         emergency_contact_name   = COALESCE($28, emergency_contact_name),
         emergency_contact_phone  = COALESCE($29, emergency_contact_phone),
         updated_at               = now()
       WHERE id = $30 AND school_id = $31
       RETURNING id, teacher_code, name, email, phone, department, status, is_admin, notes,
                 rank, gov_staff_id, gender, date_of_birth, registered_number, ntc_number, ssf_number,
                 academic_qualification, professional_qualification, additional_responsibility,
                 bank, bank_branch, account_number, religion, religious_denomination,
                 hometown, residential_address, association, ghana_card_number,
                 emergency_contact_name, emergency_contact_phone, photo_url`,
      [teacher_code?.trim().toUpperCase() || null,
       name||null, email||null, phone||null, department||null, status||null, is_admin??null, notes||null,
       rank||null, gov_staff_id||null, gender||null, date_of_birth||null,
       registered_number||null, ntc_number||null, ssf_number||null,
       academic_qualification||null, professional_qualification||null, additional_responsibility||null,
       bank||null, bank_branch||null, account_number||null,
       religion||null, religious_denomination||null, hometown||null, residential_address||null,
       association||null, ghana_card_number||null,
       emergency_contact_name||null, emergency_contact_phone||null,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });

    // Sync responsibility assignments if provided
    if (Array.isArray(responsibility_ids)) {
      await pool.query(
        `DELETE FROM teacher_responsibility_assignments WHERE teacher_id = $1`,
        [req.params.id]
      );
      if (responsibility_ids.length > 0) {
        const params = [], placeholders = [];
        for (const rid of responsibility_ids) {
          const b = params.length;
          params.push(req.params.id, rid, req.schoolId);
          placeholders.push(`($${b+1},$${b+2},$${b+3})`);
        }
        await pool.query(
          `INSERT INTO teacher_responsibility_assignments (teacher_id, responsibility_id, school_id)
           VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING`,
          params
        );
      }
    }

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

// PATCH /api/teachers/me/profile — teacher self-updates own editable fields
router.patch('/me/profile', async (req, res, next) => {
  try {
    const {
      phone, gender, date_of_birth, religion, religious_denomination,
      hometown, residential_address, emergency_contact_name, emergency_contact_phone,
    } = req.body;
    const valErrors = validateTeacherFields(req.body);
    if (valErrors.length) return res.status(400).json({ error: valErrors.join('; ') });
    const { rows } = await pool.query(
      `UPDATE teachers SET
         phone                   = COALESCE($1,  phone),
         gender                  = COALESCE($2,  gender),
         date_of_birth           = COALESCE($3,  date_of_birth),
         religion                = COALESCE($4,  religion),
         religious_denomination  = COALESCE($5,  religious_denomination),
         hometown                = COALESCE($6,  hometown),
         residential_address     = COALESCE($7,  residential_address),
         emergency_contact_name  = COALESCE($8,  emergency_contact_name),
         emergency_contact_phone = COALESCE($9,  emergency_contact_phone),
         updated_at              = now()
       WHERE id = $10 AND school_id = $11
       RETURNING id, teacher_code, name, email, phone, gender, date_of_birth, religion,
                 religious_denomination, hometown, residential_address,
                 emergency_contact_name, emergency_contact_phone, photo_url`,
      [phone||null, gender||null, date_of_birth||null,
       religion||null, religious_denomination||null,
       hometown||null, residential_address||null,
       emergency_contact_name||null, emergency_contact_phone||null,
       req.user.id, req.schoolId]
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

// PATCH /api/teachers/me/certificate — teacher uploads own academic certificate
router.patch('/me/certificate', async (req, res, next) => {
  try {
    const { documentBase64, documentFilename } = req.body;
    if (!documentBase64 || !documentFilename) {
      return res.status(400).json({ error: 'documentBase64 and documentFilename are required' });
    }
    const { url, filename } = await uploadDocument(documentBase64, documentFilename, `teacher-certificates/${req.schoolId}`);
    await pool.query(
      `UPDATE teachers SET certificate_url = $1, certificate_filename = $2, updated_at = now()
       WHERE id = $3 AND school_id = $4`,
      [url, filename, req.user.id, req.schoolId]
    );
    res.json({ certificate_url: url, certificate_filename: filename });
  } catch (err) { next(err); }
});

// POST /api/teachers/:id/photo — admin uploads photo for a teacher
router.post('/:id/photo', adminOnly, async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
    const filePath = `profile-photos/${req.params.id}`;
    const photoUrl = await uploadFile(imageBase64, filePath, { upsert: true });
    const { rowCount } = await pool.query(
      `UPDATE teachers SET photo_url = $1, updated_at = now() WHERE id = $2 AND school_id = $3`,
      [photoUrl, req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ photo_url: photoUrl });
  } catch (err) { next(err); }
});

// POST /api/teachers/:id/certificate — admin uploads certificate for a teacher
router.post('/:id/certificate', adminOnly, async (req, res, next) => {
  try {
    const { documentBase64, documentFilename } = req.body;
    if (!documentBase64 || !documentFilename) {
      return res.status(400).json({ error: 'documentBase64 and documentFilename are required' });
    }
    const { url, filename } = await uploadDocument(documentBase64, documentFilename, `teacher-certificates/${req.schoolId}`);
    const { rowCount } = await pool.query(
      `UPDATE teachers SET certificate_url = $1, certificate_filename = $2, updated_at = now()
       WHERE id = $3 AND school_id = $4`,
      [url, filename, req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ certificate_url: url, certificate_filename: filename });
  } catch (err) { next(err); }
});

module.exports = router;
