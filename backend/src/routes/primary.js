const router  = require('express').Router();
const pool    = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const multer  = require('multer');
const XLSX    = require('xlsx');
const ExcelJS = require('exceljs');
const { uploadFile } = require('../services/storage.service');
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireActiveSubscription);

// ── Grade scale helper ────────────────────────────────────────────────────────

async function getGradeScale(schoolId) {
  const { rows } = await pool.query(
    `SELECT grade, min_score, max_score FROM primary_grade_scale
     WHERE school_id = $1 ORDER BY sort_order`,
    [schoolId]
  );
  return rows;
}

function assignGrade(total, scale) {
  for (const row of scale) {
    if (total >= parseFloat(row.min_score) && total <= parseFloat(row.max_score)) {
      return row.grade;
    }
  }
  return 'F9';
}

// ── TERMS ─────────────────────────────────────────────────────────────────────

// GET /api/primary/terms?academic_year_id=
router.get('/terms', async (req, res, next) => {
  try {
    const { academic_year_id } = req.query;
    const params = [req.schoolId];
    let filter = '';
    if (academic_year_id) { params.push(academic_year_id); filter = `AND t.academic_year_id = $${params.length}`; }
    const { rows } = await pool.query(
      `SELECT t.*, ay.name AS academic_year_name
       FROM primary_terms t
       JOIN academic_years ay ON ay.id = t.academic_year_id
       WHERE t.school_id = $1 ${filter}
       ORDER BY ay.name DESC, t.term_number`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/terms
router.post('/terms', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id, term_number, name, start_date, end_date } = req.body;
    if (!academic_year_id || !term_number || !name)
      return res.status(400).json({ error: 'academic_year_id, term_number, name are required' });
    const { rows } = await pool.query(
      `INSERT INTO primary_terms (school_id, academic_year_id, term_number, name, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [req.schoolId, academic_year_id, term_number, name, start_date || null, end_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/primary/terms/:id
router.put('/terms/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, start_date, end_date } = req.body;
    const { rows } = await pool.query(
      `UPDATE primary_terms SET name=$1, start_date=$2, end_date=$3
       WHERE id=$4 AND school_id=$5 RETURNING *`,
      [name, start_date || null, end_date || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Term not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/primary/terms/:id/set-current
router.put('/terms/:id/set-current', adminOnly, async (req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE primary_terms SET is_current = false WHERE school_id = $1`, [req.schoolId]
      );
      const { rows } = await client.query(
        `UPDATE primary_terms SET is_current = true WHERE id = $1 AND school_id = $2 RETURNING *`,
        [req.params.id, req.schoolId]
      );
      if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Term not found' }); }
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

// DELETE /api/primary/terms/:id
router.delete('/terms/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM primary_terms WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Term not found' });
    res.json({ message: 'Term deleted' });
  } catch (err) { next(err); }
});

// ── STUDENTS ──────────────────────────────────────────────────────────────────

// GET /api/primary/students?class_name=&status=&search=
// For non-admin teachers: auto-filter to their assigned class unless class_name provided explicitly
router.get('/students', async (req, res, next) => {
  try {
    let { class_name, status, search } = req.query;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

    if (!class_name && !isAdmin) {
      const { rows: ct } = await pool.query(
        `SELECT ct.class_name FROM primary_class_teachers ct
         JOIN academic_years ay ON ay.id=ct.academic_year_id
         WHERE ct.school_id=$1 AND ct.teacher_id=$2 AND ay.is_current=true LIMIT 1`,
        [req.schoolId, req.user.id]
      );
      if (ct.length) class_name = ct[0].class_name;
    }

    const params = [req.schoolId];
    const clauses = [];
    if (class_name) { params.push(class_name); clauses.push(`LOWER(s.class_name) = LOWER($${params.length})`); }
    if (status)     { params.push(status);     clauses.push(`s.status = $${params.length}`); }
    if (search)     {
      params.push(`%${search}%`);
      const p = params.length;
      clauses.push(`(s.surname ILIKE $${p} OR s.other_names ILIKE $${p} OR s.admission_number ILIKE $${p})`);
    }
    const where = clauses.length ? `AND ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT s.*, (s.surname || ' ' || COALESCE(s.other_names,'')) AS full_name
       FROM primary_students s
       WHERE s.school_id = $1 ${where}
       ORDER BY s.class_name, s.surname, s.other_names`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/primary/students/classes — ordered classes with active student counts
router.get('/students/classes', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT pc.class_name, pc.sort_order,
              COUNT(s.id)::int AS student_count
       FROM primary_classes pc
       LEFT JOIN primary_students s
         ON LOWER(s.class_name) = LOWER(pc.class_name)
            AND s.school_id = pc.school_id
            AND s.status = 'Active'
       WHERE pc.school_id = $1
       GROUP BY pc.class_name, pc.sort_order
       ORDER BY pc.sort_order, pc.class_name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/students/promote — bulk or selective class promotion
router.post('/students/promote', adminOnly, async (req, res, next) => {
  try {
    const { from_class, to_class, student_ids } = req.body;
    if (!from_class || !to_class)
      return res.status(400).json({ error: 'from_class and to_class are required' });
    if (from_class === to_class)
      return res.status(400).json({ error: 'from_class and to_class must differ' });

    let rowCount;
    if (Array.isArray(student_ids) && student_ids.length > 0) {
      const { rowCount: rc } = await pool.query(
        `UPDATE primary_students SET class_name=$1, updated_at=now()
         WHERE id=ANY($2::uuid[]) AND school_id=$3 AND status='Active'`,
        [to_class, student_ids, req.schoolId]
      );
      rowCount = rc;
    } else {
      const { rowCount: rc } = await pool.query(
        `UPDATE primary_students SET class_name=$1, updated_at=now()
         WHERE school_id=$2 AND class_name=$3 AND status='Active'`,
        [to_class, req.schoolId, from_class]
      );
      rowCount = rc;
    }
    res.json({ promoted: rowCount, from_class, to_class });
  } catch (err) { next(err); }
});

// POST /api/primary/students/graduate — bulk or selective graduation
router.post('/students/graduate', adminOnly, async (req, res, next) => {
  try {
    const { class_name, student_ids } = req.body;
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });

    let rowCount;
    if (Array.isArray(student_ids) && student_ids.length > 0) {
      const { rowCount: rc } = await pool.query(
        `UPDATE primary_students SET status='Graduated', updated_at=now()
         WHERE id=ANY($2::uuid[]) AND school_id=$1 AND status='Active'`,
        [req.schoolId, student_ids]
      );
      rowCount = rc;
    } else {
      const { rowCount: rc } = await pool.query(
        `UPDATE primary_students SET status='Graduated', updated_at=now()
         WHERE school_id=$1 AND class_name=$2 AND status='Active'`,
        [req.schoolId, class_name]
      );
      rowCount = rc;
    }
    res.json({ graduated: rowCount, class_name });
  } catch (err) { next(err); }
});

// GET /api/primary/students/:id
router.get('/students/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM primary_students WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/primary/students
router.post('/students', adminOnly, async (req, res, next) => {
  try {
    const {
      admission_number, surname, other_names, preferred_name, date_of_birth, sex,
      nationality, religion, hometown, district_of_origin, region_of_origin, residential_address,
      birth_certificate_no, ghana_card_no, nhis_number,
      blood_group, genotype, known_conditions,
      immunization_bcg, immunization_dpt, immunization_polio, immunization_measles,
      class_name, date_of_admission, previous_school, previous_class,
      father_name, father_occupation, father_education, father_phone, father_alive,
      mother_name, mother_occupation, mother_education, mother_phone, mother_alive,
      guardian_name, guardian_relationship, guardian_occupation, guardian_phone, guardian_address,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      picture_data,
    } = req.body;

    if (!admission_number || !surname || !class_name)
      return res.status(400).json({ error: 'admission_number, surname, class_name are required' });

    const { rows } = await pool.query(
      `INSERT INTO primary_students (
        school_id, admission_number, surname, other_names, preferred_name,
        date_of_birth, sex, nationality, religion, hometown, district_of_origin,
        region_of_origin, residential_address, birth_certificate_no, ghana_card_no,
        nhis_number, blood_group, genotype, known_conditions,
        immunization_bcg, immunization_dpt, immunization_polio, immunization_measles,
        class_name, date_of_admission, previous_school, previous_class,
        father_name, father_occupation, father_education, father_phone, father_alive,
        mother_name, mother_occupation, mother_education, mother_phone, mother_alive,
        guardian_name, guardian_relationship, guardian_occupation, guardian_phone, guardian_address,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,
        $37,$38,$39,$40,$41,$42,$43,$44,$45
      ) RETURNING *`,
      [
        req.schoolId, admission_number, surname, other_names || null, preferred_name || null,
        date_of_birth || null, sex || null, nationality || 'Ghanaian', religion || null,
        hometown || null, district_of_origin || null, region_of_origin || null,
        residential_address || null, birth_certificate_no || null, ghana_card_no || null,
        nhis_number || null, blood_group || null, genotype || null, known_conditions || null,
        !!immunization_bcg, !!immunization_dpt, !!immunization_polio, !!immunization_measles,
        class_name, date_of_admission || null, previous_school || null, previous_class || null,
        father_name || null, father_occupation || null, father_education || null,
        father_phone || null, father_alive !== false,
        mother_name || null, mother_occupation || null, mother_education || null,
        mother_phone || null, mother_alive !== false,
        guardian_name || null, guardian_relationship || null, guardian_occupation || null,
        guardian_phone || null, guardian_address || null,
        emergency_contact_name || null, emergency_contact_phone || null,
        emergency_contact_relationship || null,
      ]
    );
    let studentRow = rows[0];
    if (picture_data) {
      try {
        const photoUrl = await uploadFile(picture_data, `primary-student-photos/${req.schoolId}/${studentRow.id}`, { upsert: true });
        const { rows: updated } = await pool.query(
          `UPDATE primary_students SET picture_url=$1 WHERE id=$2 RETURNING *`,
          [photoUrl, studentRow.id]
        );
        studentRow = updated[0];
      } catch (photoErr) { console.error('Photo upload failed:', photoErr.message); }
    }
    res.status(201).json(studentRow);
  } catch (err) { next(err); }
});

// PUT /api/primary/students/:id
router.put('/students/:id', adminOnly, async (req, res, next) => {
  try {
    const {
      admission_number, surname, other_names, preferred_name, date_of_birth, sex,
      nationality, religion, hometown, district_of_origin, region_of_origin, residential_address,
      birth_certificate_no, ghana_card_no, nhis_number,
      blood_group, genotype, known_conditions,
      immunization_bcg, immunization_dpt, immunization_polio, immunization_measles,
      class_name, date_of_admission, previous_school, previous_class, status,
      father_name, father_occupation, father_education, father_phone, father_alive,
      mother_name, mother_occupation, mother_education, mother_phone, mother_alive,
      guardian_name, guardian_relationship, guardian_occupation, guardian_phone, guardian_address,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      picture_data,
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE primary_students SET
        admission_number=$1, surname=$2, other_names=$3, preferred_name=$4,
        date_of_birth=$5, sex=$6, nationality=$7, religion=$8, hometown=$9,
        district_of_origin=$10, region_of_origin=$11, residential_address=$12,
        birth_certificate_no=$13, ghana_card_no=$14, nhis_number=$15,
        blood_group=$16, genotype=$17, known_conditions=$18,
        immunization_bcg=$19, immunization_dpt=$20, immunization_polio=$21, immunization_measles=$22,
        class_name=$23, date_of_admission=$24, previous_school=$25, previous_class=$26,
        status=$27,
        father_name=$28, father_occupation=$29, father_education=$30, father_phone=$31, father_alive=$32,
        mother_name=$33, mother_occupation=$34, mother_education=$35, mother_phone=$36, mother_alive=$37,
        guardian_name=$38, guardian_relationship=$39, guardian_occupation=$40, guardian_phone=$41, guardian_address=$42,
        emergency_contact_name=$43, emergency_contact_phone=$44, emergency_contact_relationship=$45,
        updated_at=now()
       WHERE id=$46 AND school_id=$47 RETURNING *`,
      [
        admission_number, surname, other_names || null, preferred_name || null,
        date_of_birth || null, sex || null, nationality || 'Ghanaian', religion || null,
        hometown || null, district_of_origin || null, region_of_origin || null,
        residential_address || null, birth_certificate_no || null, ghana_card_no || null,
        nhis_number || null, blood_group || null, genotype || null, known_conditions || null,
        !!immunization_bcg, !!immunization_dpt, !!immunization_polio, !!immunization_measles,
        class_name, date_of_admission || null, previous_school || null, previous_class || null,
        status || 'Active',
        father_name || null, father_occupation || null, father_education || null,
        father_phone || null, father_alive !== false,
        mother_name || null, mother_occupation || null, mother_education || null,
        mother_phone || null, mother_alive !== false,
        guardian_name || null, guardian_relationship || null, guardian_occupation || null,
        guardian_phone || null, guardian_address || null,
        emergency_contact_name || null, emergency_contact_phone || null,
        emergency_contact_relationship || null,
        req.params.id, req.schoolId,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    let studentRow = rows[0];
    if (picture_data) {
      try {
        const photoUrl = await uploadFile(picture_data, `primary-student-photos/${req.schoolId}/${req.params.id}`, { upsert: true });
        const { rows: updated } = await pool.query(
          `UPDATE primary_students SET picture_url=$1 WHERE id=$2 RETURNING *`,
          [photoUrl, req.params.id]
        );
        studentRow = updated[0];
      } catch (photoErr) { console.error('Photo upload failed:', photoErr.message); }
    }
    res.json(studentRow);
  } catch (err) { next(err); }
});

// DELETE /api/primary/students/:id
router.delete('/students/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM primary_students WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student deleted' });
  } catch (err) { next(err); }
});

// GET /api/primary/students-template?mode=empty|populated
router.get('/students-template', adminOnly, async (req, res, next) => {
  try {
    const mode = req.query.mode === 'populated' ? 'populated' : 'empty';
    const { rows: classRows } = await pool.query(
      `SELECT class_name FROM primary_classes WHERE school_id=$1 ORDER BY sort_order, class_name`,
      [req.schoolId]
    );
    const classNames   = classRows.map(c => c.class_name);
    const classDropdown = classNames.length ? `"${classNames.join(',')}"` : '"Basic 1,Basic 2,Basic 3"';

    const wb         = new ExcelJS.Workbook();
    wb.creator       = 'CAS – Classroom Attendance System';
    wb.created       = new Date();
    const GREEN_DARK = '166534';
    const WHITE      = 'FFFFFF';
    const TEXT_DARK  = '0F172A';

    const cols = [
      { key: 'admission_number', header: 'Admission No. (leave blank to auto-generate)', width: 36 },
      { key: 'surname',          header: 'Surname *',                                    width: 20 },
      { key: 'other_names',      header: 'Other Names',                                  width: 22 },
      { key: 'sex',              header: 'Sex (Male/Female) *',                          width: 20 },
      { key: 'date_of_birth',    header: 'Date of Birth (YYYY-MM-DD)',                  width: 24 },
      { key: 'class_name',       header: 'Class *',                                      width: 18 },
      { key: 'status',           header: 'Status (Active/Withdrawn)',                    width: 22 },
      { key: 'father_name',      header: "Father's Name",                               width: 22 },
      { key: 'father_phone',     header: "Father's Phone",                               width: 18 },
      { key: 'mother_name',      header: "Mother's Name",                               width: 22 },
      { key: 'mother_phone',     header: "Mother's Phone",                               width: 18 },
      { key: 'guardian_name',    header: "Guardian's Name",                             width: 22 },
      { key: 'guardian_phone',   header: "Guardian's Phone",                             width: 18 },
    ];

    const ws = wb.addWorksheet('Students', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

    const hdrRow = ws.getRow(1);
    hdrRow.height = 26;
    cols.forEach((col, idx) => {
      const cell = hdrRow.getCell(idx + 1);
      cell.value     = col.header;
      cell.font      = { bold: true, color: { argb: WHITE }, size: 11, name: 'Calibri' };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      cell.border    = { right: { style: 'thin', color: { argb: '1A7A50' } } };
    });

    const applyRowDropdowns = (rowNum) => {
      ws.getCell(`D${rowNum}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"Male,Female"'],
        showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Invalid', error: 'Please enter Male or Female',
      };
      ws.getCell(`F${rowNum}`).dataValidation = {
        type: 'list', allowBlank: false, formulae: [classDropdown], showErrorMessage: false,
      };
      ws.getCell(`G${rowNum}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"Active,Withdrawn,Graduated"'],
        showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Invalid', error: 'Please enter Active, Withdrawn, or Graduated',
      };
    };

    if (mode === 'populated') {
      const { rows: students } = await pool.query(
        `SELECT * FROM primary_students WHERE school_id=$1 ORDER BY class_name, surname`,
        [req.schoolId]
      );
      students.forEach(s => {
        const r = ws.addRow({
          admission_number: s.admission_number ?? '',
          surname:          s.surname          ?? '',
          other_names:      s.other_names      ?? '',
          sex:              s.sex              ?? '',
          date_of_birth:    s.date_of_birth ? String(s.date_of_birth).slice(0, 10) : '',
          class_name:       s.class_name       ?? '',
          status:           s.status           ?? 'Active',
          father_name:      s.father_name      ?? '',
          father_phone:     s.father_phone     ?? '',
          mother_name:      s.mother_name      ?? '',
          mother_phone:     s.mother_phone     ?? '',
          guardian_name:    s.guardian_name    ?? '',
          guardian_phone:   s.guardian_phone   ?? '',
        });
        r.height = 18;
        const rowNum = r.number;
        cols.forEach((_, idx) => {
          const cell = r.getCell(idx + 1);
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };
          cell.font      = { color: { argb: TEXT_DARK }, size: 10, name: 'Calibri' };
          cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
          cell.border    = { bottom: { style: 'hair', color: { argb: 'E2E8F0' } } };
        });
        applyRowDropdowns(rowNum);
      });
    } else {
      for (let row = 2; row <= 200; row++) {
        const r  = ws.getRow(row);
        r.height = 18;
        const bg = row % 2 === 0 ? 'F8FAFC' : WHITE;
        cols.forEach((_, idx) => {
          const cell = r.getCell(idx + 1);
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.font      = { color: { argb: TEXT_DARK }, size: 10, name: 'Calibri' };
          cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
          cell.border    = { bottom: { style: 'hair', color: { argb: 'E2E8F0' } } };
        });
        applyRowDropdowns(row);
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="primary_students_${mode}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// POST /api/primary/students/upload — bulk-insert students from Excel
router.post('/students/upload', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Read admission prefix/year from school settings
    const { rows: [school] } = await pool.query(
      `SELECT admission_prefix, admission_year FROM schools WHERE id=$1`, [req.schoolId]
    );
    const prefix = String(school?.admission_prefix ?? '').trim();
    const year   = String(school?.admission_year   ?? '').trim();

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const dataRows = rows.slice(1).filter(r => r.some(v => v !== ''));

    let nextSerial = 1;
    if (prefix && year) {
      const pattern = `^${prefix}[0-9]+${year}$`;
      const { rows: existing } = await pool.query(
        `SELECT admission_number FROM primary_students WHERE school_id=$1 AND admission_number ~ $2`,
        [req.schoolId, pattern]
      );
      if (existing.length) {
        const serials = existing.map(r => {
          const stripped = r.admission_number.slice(prefix.length, r.admission_number.length - year.length);
          return parseInt(stripped, 10) || 0;
        });
        nextSerial = Math.max(...serials) + 1;
      }
    }

    const inserted = [];
    const errors   = [];
    const client   = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        let [adm, surname, other_names, sex, dob, class_name, status,
             father_name, father_phone, mother_name, mother_phone, guardian_name, guardian_phone] = row;
        adm     = String(adm     ?? '').trim();
        surname = String(surname ?? '').trim();
        class_name = String(class_name ?? '').trim();
        if (!surname)    { errors.push(`Row ${i + 2}: Surname is required`);          continue; }
        if (!class_name) { errors.push(`Row ${i + 2}: Class is required`);            continue; }

        if (!adm) {
          if (!prefix || !year) { errors.push(`Row ${i + 2}: Admission No. blank — set Admission Prefix and Year in School Settings first`); continue; }
          adm = `${prefix}${String(nextSerial).padStart(3, '0')}${year}`;
          nextSerial++;
        }

        let dobStr = null;
        if (dob instanceof Date) dobStr = dob.toISOString().slice(0, 10);
        else if (dob && String(dob).trim()) dobStr = String(dob).trim().slice(0, 10);

        const { rows: r } = await client.query(
          `INSERT INTO primary_students
             (school_id, admission_number, surname, other_names, sex, date_of_birth, class_name, status,
              father_name, father_phone, mother_name, mother_phone, guardian_name, guardian_phone)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (school_id, admission_number) DO NOTHING
           RETURNING id`,
          [req.schoolId, adm, surname, other_names || null, sex || null, dobStr,
           class_name, status || 'Active', father_name || null, father_phone || null,
           mother_name || null, mother_phone || null, guardian_name || null, guardian_phone || null]
        );
        if (r.length) inserted.push(adm);
        else errors.push(`Row ${i + 2}: Admission No. ${adm} already exists — skipped`);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.json({ message: `Inserted ${inserted.length} student(s)`, inserted: inserted.length, errors });
  } catch (err) { next(err); }
});

// POST /api/primary/students/bulk-update — update students matched by admission_number
router.post('/students/bulk-update', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const dataRows = rows.slice(1).filter(r => r.some(v => v !== ''));

    let updated = 0;
    const errors = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        let [adm, surname, other_names, sex, dob, class_name, status,
             father_name, father_phone, mother_name, mother_phone, guardian_name, guardian_phone] = row;
        adm = String(adm ?? '').trim();
        if (!adm) { errors.push(`Row ${i + 2}: Admission No. required for update`); continue; }

        const fields = [];
        const vals   = [req.schoolId, adm];
        const addF   = (col, val) => {
          const v = String(val ?? '').trim();
          if (v) { fields.push(`${col}=$${vals.length + 1}`); vals.push(v); }
        };
        addF('surname',       surname);
        addF('other_names',   other_names);
        addF('sex',           sex);
        addF('class_name',    class_name);
        addF('status',        status);
        addF('father_name',   father_name);
        addF('father_phone',  father_phone);
        addF('mother_name',   mother_name);
        addF('mother_phone',  mother_phone);
        addF('guardian_name', guardian_name);
        addF('guardian_phone',guardian_phone);
        if (dob) {
          let dobStr = null;
          if (dob instanceof Date) dobStr = dob.toISOString().slice(0, 10);
          else if (String(dob).trim()) dobStr = String(dob).trim().slice(0, 10);
          if (dobStr) { fields.push(`date_of_birth=$${vals.length + 1}`); vals.push(dobStr); }
        }
        if (!fields.length) continue;
        fields.push('updated_at=now()');

        const { rowCount } = await client.query(
          `UPDATE primary_students SET ${fields.join(',')} WHERE school_id=$1 AND admission_number=$2`,
          vals
        );
        if (rowCount) updated++;
        else errors.push(`Row ${i + 2}: No student found with Adm. No. ${adm}`);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.json({ message: `Updated ${updated} student(s)`, updated, errors });
  } catch (err) { next(err); }
});

// ── CLASS TEACHERS ────────────────────────────────────────────────────────────

// GET /api/primary/my-class — teacher: get own class assignment for current year
router.get('/my-class', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ct.*, ay.name AS academic_year_name,
              (SELECT COUNT(*) FROM primary_students s
               WHERE s.school_id = $1 AND LOWER(s.class_name) = LOWER(ct.class_name) AND s.status = 'Active')::int AS student_count
       FROM primary_class_teachers ct
       JOIN academic_years ay ON ay.id = ct.academic_year_id
       WHERE ct.school_id = $1 AND ct.teacher_id = $2 AND ay.is_current = true
       LIMIT 1`,
      [req.schoolId, req.user.id]
    );
    if (!rows.length) return res.json(null);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/primary/class-teachers?academic_year_id=
router.get('/class-teachers', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id } = req.query;
    const params = [req.schoolId];
    let filter = '';
    if (academic_year_id) { params.push(academic_year_id); filter = `AND ct.academic_year_id = $${params.length}`; }
    const { rows } = await pool.query(
      `SELECT ct.*, t.name AS teacher_name, ay.name AS academic_year_name,
              (SELECT COUNT(*) FROM primary_students s
               WHERE s.school_id = ct.school_id AND LOWER(s.class_name) = LOWER(ct.class_name)
                 AND s.status = 'Active')::int AS student_count
       FROM primary_class_teachers ct
       JOIN teachers t ON t.id = ct.teacher_id
       JOIN academic_years ay ON ay.id = ct.academic_year_id
       WHERE ct.school_id = $1 ${filter}
       ORDER BY ct.class_name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/class-teachers
router.post('/class-teachers', adminOnly, async (req, res, next) => {
  try {
    const { teacher_id, class_name, academic_year_id } = req.body;
    if (!teacher_id || !class_name || !academic_year_id)
      return res.status(400).json({ error: 'teacher_id, class_name, academic_year_id are required' });
    const { rows } = await pool.query(
      `INSERT INTO primary_class_teachers (school_id, teacher_id, class_name, academic_year_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (school_id, class_name, academic_year_id) DO UPDATE SET teacher_id=EXCLUDED.teacher_id
       RETURNING *`,
      [req.schoolId, teacher_id, class_name, academic_year_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/primary/class-teachers/:id
router.delete('/class-teachers/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM primary_class_teachers WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ message: 'Assignment removed' });
  } catch (err) { next(err); }
});

// ── CLASSES (school-defined class list) ──────────────────────────────────────

// GET /api/primary/classes?academic_year_id=
router.get('/classes', adminOnly, async (req, res, next) => {
  try {
    let { academic_year_id } = req.query;
    if (!academic_year_id) {
      const { rows: ay } = await pool.query(
        `SELECT id FROM academic_years WHERE school_id=$1 AND is_current=true LIMIT 1`, [req.schoolId]
      );
      academic_year_id = ay[0]?.id ?? null;
    }
    const { rows } = await pool.query(
      `SELECT
         c.id, c.class_name, c.sort_order,
         ct.id          AS assignment_id,
         t.id           AS teacher_id,
         t.name         AS teacher_name,
         (SELECT COUNT(*) FROM primary_students s
          WHERE s.school_id=c.school_id AND LOWER(s.class_name)=LOWER(c.class_name) AND s.status='Active')::int AS student_count
       FROM primary_classes c
       LEFT JOIN primary_class_teachers ct
         ON ct.school_id=c.school_id AND LOWER(ct.class_name)=LOWER(c.class_name)
            AND ct.academic_year_id=$2
       LEFT JOIN teachers t ON t.id=ct.teacher_id
       WHERE c.school_id=$1
       ORDER BY c.sort_order, c.class_name`,
      [req.schoolId, academic_year_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/classes
router.post('/classes', adminOnly, async (req, res, next) => {
  try {
    const { class_name, sort_order } = req.body;
    if (!class_name?.trim()) return res.status(400).json({ error: 'class_name is required' });
    const { rows } = await pool.query(
      `INSERT INTO primary_classes (school_id, class_name, sort_order)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.schoolId, class_name.trim(), sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A class with this name already exists' });
    next(err);
  }
});

// PUT /api/primary/classes/:id
router.put('/classes/:id', adminOnly, async (req, res, next) => {
  try {
    const { class_name, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE primary_classes SET class_name=COALESCE($1,class_name), sort_order=COALESCE($2,sort_order)
       WHERE id=$3 AND school_id=$4 RETURNING *`,
      [class_name?.trim() ?? null, sort_order ?? null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Class not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A class with this name already exists' });
    next(err);
  }
});

// DELETE /api/primary/classes/:id
router.delete('/classes/:id', adminOnly, async (req, res, next) => {
  try {
    const { rows: cls } = await pool.query(
      `SELECT class_name FROM primary_classes WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]
    );
    if (!cls.length) return res.status(404).json({ error: 'Class not found' });
    const { rows: studs } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM primary_students
       WHERE school_id=$1 AND LOWER(class_name)=LOWER($2) AND status='Active'`,
      [req.schoolId, cls[0].class_name]
    );
    if (parseInt(studs[0].cnt) > 0)
      return res.status(400).json({ error: `Cannot delete: ${studs[0].cnt} active student(s) are in this class. Move them first.` });
    await pool.query(`DELETE FROM primary_classes WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Class deleted' });
  } catch (err) { next(err); }
});

// POST /api/primary/assign-students — bulk-assign students to a class
router.post('/assign-students', adminOnly, async (req, res, next) => {
  try {
    const { student_ids, class_name } = req.body;
    if (!class_name || !Array.isArray(student_ids) || !student_ids.length)
      return res.status(400).json({ error: 'class_name and student_ids[] are required' });
    const { rowCount } = await pool.query(
      `UPDATE primary_students SET class_name=$1, updated_at=now()
       WHERE id=ANY($2::uuid[]) AND school_id=$3`,
      [class_name, student_ids, req.schoolId]
    );
    res.json({ message: `${rowCount} student(s) assigned to ${class_name}` });
  } catch (err) { next(err); }
});

// PUT /api/primary/students/:id/move-class — move a single student to a different class
router.put('/students/:id/move-class', adminOnly, async (req, res, next) => {
  try {
    const { class_name } = req.body;
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });
    const { rows } = await pool.query(
      `UPDATE primary_students SET class_name=$1, updated_at=now()
       WHERE id=$2 AND school_id=$3 RETURNING id, surname, other_names, class_name`,
      [class_name, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── SUBJECT CATALOG ───────────────────────────────────────────────────────────

// GET /api/primary/subject-catalog
router.get('/subject-catalog', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT sc.*,
         (SELECT COUNT(*) FROM primary_subjects ps
          WHERE ps.catalog_id = sc.id)::int AS class_count
       FROM primary_subject_catalog sc
       WHERE sc.school_id = $1
       ORDER BY sc.sort_order, sc.subject_name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/subject-catalog
router.post('/subject-catalog', adminOnly, async (req, res, next) => {
  try {
    const { subject_name, description, sort_order } = req.body;
    if (!subject_name?.trim()) return res.status(400).json({ error: 'subject_name is required' });
    const { rows } = await pool.query(
      `INSERT INTO primary_subject_catalog (school_id, subject_name, description, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.schoolId, subject_name.trim(), description || null, sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A subject with this name already exists' });
    next(err);
  }
});

// PUT /api/primary/subject-catalog/:id
router.put('/subject-catalog/:id', adminOnly, async (req, res, next) => {
  try {
    const { subject_name, description, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE primary_subject_catalog
       SET subject_name = COALESCE($1, subject_name),
           description  = COALESCE($2, description),
           sort_order   = COALESCE($3, sort_order)
       WHERE id = $4 AND school_id = $5 RETURNING *`,
      [subject_name?.trim() || null, description ?? null, sort_order ?? null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Subject not found in catalog' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A subject with this name already exists' });
    next(err);
  }
});

// DELETE /api/primary/subject-catalog/:id
router.delete('/subject-catalog/:id', adminOnly, async (req, res, next) => {
  try {
    // Remove all class assignments first, then delete catalog entry
    await pool.query(
      `DELETE FROM primary_subjects WHERE catalog_id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    const { rowCount } = await pool.query(
      `DELETE FROM primary_subject_catalog WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Subject not found in catalog' });
    res.json({ message: 'Subject deleted from catalog and all class assignments removed' });
  } catch (err) { next(err); }
});

// GET /api/primary/class-subjects?class_name= — subjects assigned to a class with catalog info
router.get('/class-subjects', adminOnly, async (req, res, next) => {
  try {
    const { class_name } = req.query;
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });
    // Return all catalog subjects with assigned=true/false for this class
    const { rows } = await pool.query(
      `SELECT
         sc.id         AS catalog_id,
         sc.subject_name,
         sc.sort_order AS catalog_sort,
         ps.id         AS subject_id,
         ps.max_class_score,
         ps.max_exam_score,
         ps.sort_order,
         (ps.id IS NOT NULL) AS assigned
       FROM primary_subject_catalog sc
       LEFT JOIN primary_subjects ps
         ON ps.catalog_id = sc.id AND ps.school_id = sc.school_id
            AND LOWER(ps.class_name) = LOWER($2)
       WHERE sc.school_id = $1
       ORDER BY sc.sort_order, sc.subject_name`,
      [req.schoolId, class_name]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /api/primary/class-subjects — save all subject assignments for a class
// Body: { class_name, assignments: [{ catalog_id, assigned, max_class_score, max_exam_score, sort_order }] }
router.put('/class-subjects', adminOnly, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { class_name, assignments } = req.body;
    if (!class_name || !Array.isArray(assignments))
      return res.status(400).json({ error: 'class_name and assignments[] are required' });

    await client.query('BEGIN');

    for (const a of assignments) {
      if (a.assigned) {
        // Get subject name from catalog
        const { rows: cat } = await client.query(
          `SELECT subject_name FROM primary_subject_catalog WHERE id=$1 AND school_id=$2`,
          [a.catalog_id, req.schoolId]
        );
        if (!cat.length) continue;
        await client.query(
          `INSERT INTO primary_subjects (school_id, class_name, subject_name, catalog_id, max_class_score, max_exam_score, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (school_id, class_name, subject_name)
           DO UPDATE SET max_class_score=$5, max_exam_score=$6, sort_order=$7, catalog_id=$4`,
          [req.schoolId, class_name, cat[0].subject_name, a.catalog_id,
           parseFloat(a.max_class_score) || 30, parseFloat(a.max_exam_score) || 70, a.sort_order ?? 0]
        );
      } else {
        // Remove assignment
        await client.query(
          `DELETE FROM primary_subjects WHERE catalog_id=$1 AND school_id=$2 AND LOWER(class_name)=LOWER($3)`,
          [a.catalog_id, req.schoolId, class_name]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Class subjects updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// ── SUBJECTS ──────────────────────────────────────────────────────────────────

// GET /api/primary/subjects?class_name=
router.get('/subjects', async (req, res, next) => {
  try {
    const { class_name } = req.query;
    const params = [req.schoolId];
    let filter = '';
    if (class_name) { params.push(class_name); filter = `AND LOWER(class_name) = LOWER($${params.length})`; }
    const { rows } = await pool.query(
      `SELECT * FROM primary_subjects WHERE school_id = $1 ${filter} ORDER BY class_name, sort_order, subject_name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/subjects
router.post('/subjects', adminOnly, async (req, res, next) => {
  try {
    const { class_name, subject_name, max_class_score, max_exam_score, sort_order } = req.body;
    if (!class_name || !subject_name)
      return res.status(400).json({ error: 'class_name and subject_name are required' });
    const { rows } = await pool.query(
      `INSERT INTO primary_subjects (school_id, class_name, subject_name, max_class_score, max_exam_score, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.schoolId, class_name, subject_name,
       parseFloat(max_class_score) || 30, parseFloat(max_exam_score) || 70, sort_order || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/primary/subjects/:id
router.put('/subjects/:id', adminOnly, async (req, res, next) => {
  try {
    const { subject_name, max_class_score, max_exam_score, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE primary_subjects SET subject_name=$1, max_class_score=$2, max_exam_score=$3, sort_order=$4
       WHERE id=$5 AND school_id=$6 RETURNING *`,
      [subject_name, parseFloat(max_class_score) || 30, parseFloat(max_exam_score) || 70,
       sort_order || 0, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Subject not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/primary/subjects/:id
router.delete('/subjects/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM primary_subjects WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Subject not found' });
    res.json({ message: 'Subject deleted' });
  } catch (err) { next(err); }
});

// ── ATTENDANCE ────────────────────────────────────────────────────────────────

// GET /api/primary/attendance?date= (class_name auto-detected from teacher or passed explicitly)
router.get('/attendance', async (req, res, next) => {
  try {
    let { class_name, date } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

    if (!isAdmin) {
      // Always resolve teacher's assigned class; ignore any supplied class_name to prevent IDOR
      const { rows: ct } = await pool.query(
        `SELECT ct.class_name FROM primary_class_teachers ct
         JOIN academic_years ay ON ay.id=ct.academic_year_id
         WHERE ct.school_id=$1 AND ct.teacher_id=$2 AND ay.is_current=true LIMIT 1`,
        [req.schoolId, req.user.id]
      );
      if (!ct.length) return res.status(403).json({ error: 'No class assigned' });
      class_name = ct[0].class_name;
    } else if (!class_name) {
      return res.status(400).json({ error: 'class_name is required' });
    }

    // Return all active students with their attendance status for the given date
    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.admission_number, s.surname, s.other_names, s.preferred_name,
              COALESCE(a.status, 'present') AS status, a.notes, a.id AS attendance_id
       FROM primary_students s
       LEFT JOIN primary_daily_attendance a
         ON a.student_id = s.id AND a.school_id = $1 AND a.date = $3
       WHERE s.school_id = $1 AND LOWER(s.class_name) = LOWER($2) AND s.status = 'Active'
       ORDER BY s.surname, s.other_names`,
      [req.schoolId, class_name, date]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/primary/attendance/summary?class_name=&term_id=
router.get('/attendance/summary', async (req, res, next) => {
  try {
    const { class_name, term_id } = req.query;
    if (!class_name || !term_id)
      return res.status(400).json({ error: 'class_name and term_id are required' });

    const { rows: term } = await pool.query(
      `SELECT start_date, end_date FROM primary_terms WHERE id=$1 AND school_id=$2`,
      [term_id, req.schoolId]
    );
    const startDate = term[0]?.start_date;
    const endDate   = term[0]?.end_date;

    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.surname, s.other_names,
              COUNT(CASE WHEN a.status = 'present' THEN 1 END)::int AS present_days,
              COUNT(CASE WHEN a.status = 'absent'  THEN 1 END)::int AS absent_days,
              COUNT(CASE WHEN a.status = 'late'    THEN 1 END)::int AS late_days,
              COUNT(CASE WHEN a.status = 'excused' THEN 1 END)::int AS excused_days,
              COUNT(a.id)::int AS total_marked
       FROM primary_students s
       LEFT JOIN primary_daily_attendance a
         ON a.student_id = s.id AND a.school_id = $1
         AND ($3::date IS NULL OR a.date >= $3::date)
         AND ($4::date IS NULL OR a.date <= $4::date)
       WHERE s.school_id = $1 AND LOWER(s.class_name) = LOWER($2) AND s.status = 'Active'
       GROUP BY s.id, s.surname, s.other_names
       ORDER BY s.surname, s.other_names`,
      [req.schoolId, class_name, startDate || null, endDate || null]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/attendance — bulk mark for a date
// class_name auto-detected from teacher assignment if not provided
router.post('/attendance', async (req, res, next) => {
  try {
    let { class_name, date, records } = req.body;
    if (!date || !Array.isArray(records))
      return res.status(400).json({ error: 'date and records[] are required' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

    if (!isAdmin) {
      // Always resolve teacher's assigned class; ignore any supplied class_name to prevent IDOR
      const { rows: ct } = await pool.query(
        `SELECT ct.class_name FROM primary_class_teachers ct
         JOIN academic_years ay ON ay.id=ct.academic_year_id
         WHERE ct.school_id=$1 AND ct.teacher_id=$2 AND ay.is_current=true LIMIT 1`,
        [req.schoolId, req.user.id]
      );
      if (!ct.length) return res.status(403).json({ error: 'No class assigned' });
      class_name = ct[0].class_name;
    } else if (!class_name) {
      return res.status(400).json({ error: 'class_name is required' });
    }

    // Validate: only allow student IDs that actually belong to this class at this school
    const { rows: validStudents } = await pool.query(
      `SELECT id FROM primary_students
       WHERE school_id=$1 AND LOWER(class_name)=LOWER($2) AND status='Active'`,
      [req.schoolId, class_name]
    );
    const validIds = new Set(validStudents.map(s => s.id));
    const safeRecords = records.filter(r => validIds.has(r.student_id));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of safeRecords) {
        await client.query(
          `INSERT INTO primary_daily_attendance (school_id, student_id, class_name, date, status, notes, marked_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (school_id, student_id, date)
           DO UPDATE SET status=$5, notes=$6, marked_by=$7`,
          [req.schoolId, r.student_id, class_name, date,
           r.status || 'present', r.notes || null, req.user.id]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.json({ message: `Attendance saved for ${safeRecords.length} students` });
  } catch (err) { next(err); }
});

// ── SCORES ────────────────────────────────────────────────────────────────────

// GET /api/primary/scores?term_id= (class_name auto-detected from teacher or passed explicitly)
router.get('/scores', async (req, res, next) => {
  try {
    let { class_name, term_id } = req.query;
    if (!term_id) return res.status(400).json({ error: 'term_id is required' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

    if (!isAdmin) {
      // Always derive class from teacher's assignment — ignore any supplied class_name to prevent IDOR
      const { rows: ct } = await pool.query(
        `SELECT ct.class_name FROM primary_class_teachers ct
         JOIN primary_terms t ON t.id=$2
         WHERE ct.school_id=$1 AND ct.teacher_id=$3 AND ct.academic_year_id=t.academic_year_id LIMIT 1`,
        [req.schoolId, term_id, req.user.id]
      );
      if (!ct.length) return res.status(403).json({ error: 'No class assigned for this teacher' });
      class_name = ct[0].class_name;
    } else if (!class_name) {
      return res.status(400).json({ error: 'class_name is required' });
    }

    const { rows: subjects } = await pool.query(
      `SELECT * FROM primary_subjects WHERE school_id=$1 AND LOWER(class_name)=LOWER($2) ORDER BY sort_order, subject_name`,
      [req.schoolId, class_name]
    );

    const { rows: students } = await pool.query(
      `SELECT s.id, s.surname, s.other_names, s.admission_number
       FROM primary_students s
       WHERE s.school_id=$1 AND LOWER(s.class_name)=LOWER($2) AND s.status='Active'
       ORDER BY s.surname, s.other_names`,
      [req.schoolId, class_name]
    );

    const { rows: scores } = await pool.query(
      `SELECT sc.* FROM primary_scores sc
       JOIN primary_subjects sub ON sub.id = sc.subject_id
       WHERE sc.school_id=$1 AND LOWER(sub.class_name)=LOWER($2) AND sc.term_id=$3`,
      [req.schoolId, class_name, term_id]
    );

    // Nested scoreMap: { [subjectId]: { [studentId]: score } }
    const scoreMap = {};
    for (const sc of scores) {
      if (!scoreMap[sc.subject_id]) scoreMap[sc.subject_id] = {};
      scoreMap[sc.subject_id][sc.student_id] = sc;
    }

    res.json({ subjects, students, scoreMap });
  } catch (err) { next(err); }
});

// POST /api/primary/scores — bulk upsert scores for a class/term/subject
// Accepts: { term_id, subject_id, scores: [{student_id, class_score, exam_score}] }
// academic_year_id is auto-detected from term
router.post('/scores', async (req, res, next) => {
  try {
    const { term_id, subject_id, scores } = req.body;
    if (!term_id || !subject_id || !Array.isArray(scores))
      return res.status(400).json({ error: 'term_id, subject_id, scores[] are required' });

    // Auto-detect academic_year_id from term (also validates term belongs to school)
    const { rows: termRows } = await pool.query(
      `SELECT academic_year_id FROM primary_terms WHERE id=$1 AND school_id=$2`,
      [term_id, req.schoolId]
    );
    if (!termRows.length) return res.status(404).json({ error: 'Term not found' });
    const academic_year_id = termRows[0].academic_year_id;

    // Validate subject belongs to this school and get its class_name
    const { rows: [subjectRow] } = await pool.query(
      `SELECT class_name FROM primary_subjects WHERE id=$1 AND school_id=$2`,
      [subject_id, req.schoolId]
    );
    if (!subjectRow) return res.status(404).json({ error: 'Subject not found' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin) {
      // Verify teacher is assigned to the subject's class for this term's academic year
      const { rows: ct } = await pool.query(
        `SELECT 1 FROM primary_class_teachers
         WHERE school_id=$1 AND teacher_id=$2 AND academic_year_id=$3
           AND LOWER(class_name)=LOWER($4)`,
        [req.schoolId, req.user.id, academic_year_id, subjectRow.class_name]
      );
      if (!ct.length) return res.status(403).json({ error: 'You are not assigned to this class' });
    }

    // Only allow student IDs that actually belong to this class at this school
    const { rows: validStudents } = await pool.query(
      `SELECT id FROM primary_students
       WHERE school_id=$1 AND LOWER(class_name)=LOWER($2) AND status='Active'`,
      [req.schoolId, subjectRow.class_name]
    );
    const validIds = new Set(validStudents.map(s => s.id));

    const scale = await getGradeScale(req.schoolId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const s of scores) {
        const { student_id, class_score, exam_score } = s;
        if (!student_id || !validIds.has(student_id)) continue;
        const cs    = class_score != null ? parseFloat(class_score) : null;
        const es    = exam_score  != null ? parseFloat(exam_score)  : null;
        const total = cs != null && es != null ? cs + es : (cs ?? es);
        const grade = total != null ? assignGrade(total, scale) : null;
        await client.query(
          `INSERT INTO primary_scores
             (school_id, student_id, subject_id, term_id, academic_year_id, class_score, exam_score, total, grade, teacher_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
           ON CONFLICT (school_id, student_id, subject_id, term_id)
           DO UPDATE SET class_score=$6, exam_score=$7, total=$8, grade=$9, teacher_id=$10, updated_at=now()`,
          [req.schoolId, student_id, subject_id, term_id, academic_year_id, cs, es, total, grade, req.user.id]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    // Recalculate class positions per subject
    await recalcPositions(req.schoolId, term_id);

    res.json({ message: 'Scores saved', count: scores.length });
  } catch (err) { next(err); }
});

async function recalcPositions(schoolId, termId) {
  // Get distinct subjects in this term
  const { rows: subs } = await pool.query(
    `SELECT DISTINCT subject_id FROM primary_scores WHERE school_id=$1 AND term_id=$2`,
    [schoolId, termId]
  );
  for (const { subject_id } of subs) {
    await pool.query(
      `UPDATE primary_scores sc SET position = ranked.pos
       FROM (
         SELECT id, RANK() OVER (ORDER BY total DESC NULLS LAST) AS pos
         FROM primary_scores WHERE school_id=$1 AND term_id=$2 AND subject_id=$3
       ) ranked
       WHERE sc.id = ranked.id`,
      [schoolId, termId, subject_id]
    );
  }
}

// ── SCORE EXCEL TEMPLATES & UPLOADS ──────────────────────────────────────────

function numToCol(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// GET /api/primary/scores/template?term_id=&class_name=&subject_id=
// Downloads a per-subject score entry template pre-filled with students
router.get('/scores/template', adminOnly, async (req, res, next) => {
  try {
    const { term_id, class_name, subject_id } = req.query;
    if (!term_id || !class_name || !subject_id)
      return res.status(400).json({ error: 'term_id, class_name, and subject_id are required' });

    const [{ rows: [term] }, { rows: [subject] }, { rows: students }] = await Promise.all([
      pool.query(`SELECT name FROM primary_terms WHERE id=$1 AND school_id=$2`, [term_id, req.schoolId]),
      pool.query(`SELECT subject_name, max_class_score, max_exam_score FROM primary_subjects WHERE id=$1 AND school_id=$2`, [subject_id, req.schoolId]),
      pool.query(
        `SELECT id, admission_number, surname, other_names
         FROM primary_students WHERE school_id=$1 AND LOWER(class_name)=LOWER($2) AND status='Active'
         ORDER BY surname, other_names`,
        [req.schoolId, class_name]
      ),
    ]);
    if (!term)    return res.status(404).json({ error: 'Term not found' });
    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    const { rows: existing } = await pool.query(
      `SELECT student_id, class_score, exam_score FROM primary_scores
       WHERE school_id=$1 AND term_id=$2 AND subject_id=$3`,
      [req.schoolId, term_id, subject_id]
    );
    const scoreMap = {};
    existing.forEach(s => { scoreMap[s.student_id] = s; });

    const wb         = new ExcelJS.Workbook();
    wb.creator       = 'CAS – Classroom Attendance System';
    const GREEN_DARK = '166534';
    const WHITE      = 'FFFFFF';

    const ws = wb.addWorksheet('Scores');
    ws.columns = [
      { key: 'student_id',  width: 36 },
      { key: 'adm_no',      width: 18 },
      { key: 'name',        width: 28 },
      { key: 'class_score', width: 18 },
      { key: 'exam_score',  width: 18 },
    ];

    // Row 1: Banner
    const b1 = ws.getRow(1);
    b1.height = 28;
    b1.getCell(1).value = `Primary Scores — ${subject.subject_name} | ${term.name} | ${class_name}`;
    b1.getCell(1).font  = { bold: true, size: 12, name: 'Calibri', color: { argb: WHITE } };
    for (let ci = 1; ci <= 5; ci++) b1.getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
    b1.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    ws.mergeCells('A1:E1');

    // Row 2: Hidden metadata (term_id, subject_id)
    const meta = ws.getRow(2);
    meta.getCell(1).value = 'META';
    meta.getCell(2).value = term_id;
    meta.getCell(3).value = subject_id;
    meta.height = 6;
    meta.hidden = true;

    // Row 3: Column headers
    const hdr = ws.getRow(3);
    hdr.height = 22;
    ['Student ID (do not edit)', 'Adm. No.', 'Student Name',
     `Class Score /${subject.max_class_score}`, `Exam Score /${subject.max_exam_score}`].forEach((h, i) => {
      const cell = hdr.getCell(i + 1);
      cell.value     = h;
      cell.font      = { bold: true, size: 10, name: 'Calibri', color: { argb: WHITE } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1A7A50' } };
      cell.alignment = { vertical: 'middle', indent: 1 };
    });

    // Data rows (from row 4)
    students.forEach((s, i) => {
      const sc  = scoreMap[s.id];
      const r   = ws.addRow({
        student_id:  s.id,
        adm_no:      s.admission_number,
        name:        `${s.surname}${s.other_names ? ' ' + s.other_names : ''}`,
        class_score: sc?.class_score ?? '',
        exam_score:  sc?.exam_score  ?? '',
      });
      r.height = 18;
      const rowNum = r.number;
      const bg = i % 2 === 0 ? 'F0FDF4' : WHITE;
      for (let ci = 1; ci <= 5; ci++) {
        const cell = r.getCell(ci);
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font      = { size: 10, name: 'Calibri', color: { argb: '0F172A' } };
        cell.alignment = { vertical: 'middle', indent: 1 };
        cell.border    = { bottom: { style: 'hair', color: { argb: 'E2E8F0' } } };
      }
      ws.getCell(`D${rowNum}`).dataValidation = {
        type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, subject.max_class_score],
      };
      ws.getCell(`E${rowNum}`).dataValidation = {
        type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, subject.max_exam_score],
      };
    });

    const safe = (s) => s.replace(/[^A-Za-z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="scores_${safe(class_name)}_${safe(subject.subject_name)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// POST /api/primary/scores/upload — per-subject score upload
router.post('/scores/upload', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { term_id, subject_id } = req.body;
    if (!term_id || !subject_id) return res.status(400).json({ error: 'term_id and subject_id are required' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    // Data starts at row 4 (index 3): banner(0), meta(1), header(2)
    const dataRows = rows.slice(3).filter(r => String(r[0] ?? '').trim());

    const [{ rows: [termRow] }, { rows: [subject] }] = await Promise.all([
      pool.query(`SELECT academic_year_id FROM primary_terms WHERE id=$1 AND school_id=$2`, [term_id, req.schoolId]),
      pool.query(`SELECT max_class_score, max_exam_score FROM primary_subjects WHERE id=$1 AND school_id=$2`, [subject_id, req.schoolId]),
    ]);
    if (!termRow) return res.status(404).json({ error: 'Term not found' });
    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    const academic_year_id = termRow.academic_year_id;

    const scale  = await getGradeScale(req.schoolId);
    const errors = [];
    let count    = 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < dataRows.length; i++) {
        const row        = dataRows[i];
        const student_id = String(row[0] ?? '').trim();
        if (!student_id) continue;
        const cs  = row[3] !== '' && row[3] != null ? parseFloat(row[3]) : null;
        const es  = row[4] !== '' && row[4] != null ? parseFloat(row[4]) : null;
        if (cs != null && cs > subject.max_class_score) { errors.push(`Row ${i + 4}: Class score ${cs} exceeds max ${subject.max_class_score}`); continue; }
        if (es != null && es > subject.max_exam_score)  { errors.push(`Row ${i + 4}: Exam score ${es} exceeds max ${subject.max_exam_score}`); continue; }
        const total = cs != null && es != null ? cs + es : (cs ?? es);
        const grade = total != null ? assignGrade(total, scale) : null;
        await client.query(
          `INSERT INTO primary_scores
             (school_id, student_id, subject_id, term_id, academic_year_id, class_score, exam_score, total, grade, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
           ON CONFLICT (school_id, student_id, subject_id, term_id)
           DO UPDATE SET class_score=$6, exam_score=$7, total=$8, grade=$9, updated_at=now()`,
          [req.schoolId, student_id, subject_id, term_id, academic_year_id, cs, es, total, grade]
        );
        count++;
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    await recalcPositions(req.schoolId, term_id);
    res.json({ message: `Uploaded ${count} score(s)`, count, errors });
  } catch (err) { next(err); }
});

// GET /api/primary/scores/class-template?term_id=&class_name=
// Downloads a multi-subject template with all subjects as paired columns
router.get('/scores/class-template', adminOnly, async (req, res, next) => {
  try {
    const { term_id, class_name } = req.query;
    if (!term_id || !class_name) return res.status(400).json({ error: 'term_id and class_name are required' });

    const [{ rows: [term] }, { rows: subjects }, { rows: students }] = await Promise.all([
      pool.query(`SELECT name FROM primary_terms WHERE id=$1 AND school_id=$2`, [term_id, req.schoolId]),
      pool.query(
        `SELECT id, subject_name, max_class_score, max_exam_score
         FROM primary_subjects WHERE school_id=$1 AND LOWER(class_name)=LOWER($2)
         ORDER BY sort_order, subject_name`,
        [req.schoolId, class_name]
      ),
      pool.query(
        `SELECT id, admission_number, surname, other_names
         FROM primary_students WHERE school_id=$1 AND LOWER(class_name)=LOWER($2) AND status='Active'
         ORDER BY surname, other_names`,
        [req.schoolId, class_name]
      ),
    ]);
    if (!term) return res.status(404).json({ error: 'Term not found' });
    if (!subjects.length) return res.status(400).json({ error: 'No subjects configured for this class' });

    const { rows: allScores } = await pool.query(
      `SELECT sc.student_id, sc.subject_id, sc.class_score, sc.exam_score
       FROM primary_scores sc
       JOIN primary_subjects sub ON sub.id=sc.subject_id
       WHERE sc.school_id=$1 AND sc.term_id=$2 AND LOWER(sub.class_name)=LOWER($3)`,
      [req.schoolId, term_id, class_name]
    );
    const scoreMap = {};
    allScores.forEach(s => {
      if (!scoreMap[s.student_id]) scoreMap[s.student_id] = {};
      scoreMap[s.student_id][s.subject_id] = s;
    });

    const wb         = new ExcelJS.Workbook();
    wb.creator       = 'CAS – Classroom Attendance System';
    const GREEN_DARK = '166534';
    const WHITE      = 'FFFFFF';
    const totalCols  = 3 + subjects.length * 2;

    const ws = wb.addWorksheet('Scores');
    const colDefs = [{ width: 36 }, { width: 18 }, { width: 28 }];
    subjects.forEach(() => { colDefs.push({ width: 18 }); colDefs.push({ width: 16 }); });
    ws.columns = colDefs;

    // Row 1: Banner
    const b1 = ws.getRow(1);
    b1.height = 28;
    for (let ci = 1; ci <= totalCols; ci++)
      b1.getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
    b1.getCell(1).value     = `Primary Scores — All Subjects | ${term.name} | ${class_name}`;
    b1.getCell(1).font      = { bold: true, size: 12, name: 'Calibri', color: { argb: WHITE } };
    b1.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    ws.mergeCells(`A1:${numToCol(totalCols)}1`);

    // Row 2: Hidden metadata — subject IDs at paired column positions
    const meta = ws.getRow(2);
    meta.height = 6;
    meta.hidden = true;
    meta.getCell(1).value = 'SUBJECT_IDS';
    subjects.forEach((sub, i) => {
      meta.getCell(4 + i * 2).value = sub.id;
      meta.getCell(5 + i * 2).value = sub.id;
    });

    // Row 3: Column headers
    const hdr = ws.getRow(3);
    hdr.height = 30;
    ['Student ID (do not edit)', 'Adm. No.', 'Student Name'].forEach((h, i) => {
      const cell = hdr.getCell(i + 1);
      cell.value     = h;
      cell.font      = { bold: true, size: 10, name: 'Calibri', color: { argb: WHITE } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1A7A50' } };
      cell.alignment = { vertical: 'middle', indent: 1 };
    });
    subjects.forEach((sub, i) => {
      [
        { col: 4 + i * 2, label: `${sub.subject_name}\nClass /${sub.max_class_score}` },
        { col: 5 + i * 2, label: `${sub.subject_name}\nExam /${sub.max_exam_score}` },
      ].forEach(({ col, label }) => {
        const cell = hdr.getCell(col);
        cell.value     = label;
        cell.font      = { bold: true, size: 9, name: 'Calibri', color: { argb: WHITE } };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1A7A50' } };
        cell.alignment = { vertical: 'middle', indent: 1, wrapText: true };
      });
    });

    // Data rows (row 4+)
    students.forEach((s, i) => {
      const r = ws.addRow([]);
      r.getCell(1).value = s.id;
      r.getCell(2).value = s.admission_number;
      r.getCell(3).value = `${s.surname}${s.other_names ? ' ' + s.other_names : ''}`;
      subjects.forEach((sub, j) => {
        const sc = (scoreMap[s.id] ?? {})[sub.id];
        r.getCell(4 + j * 2).value = sc?.class_score ?? '';
        r.getCell(5 + j * 2).value = sc?.exam_score  ?? '';
      });
      r.height = 18;
      const bg = i % 2 === 0 ? 'F0FDF4' : WHITE;
      for (let ci = 1; ci <= totalCols; ci++) {
        const cell = r.getCell(ci);
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font      = { size: 10, name: 'Calibri', color: { argb: '0F172A' } };
        cell.alignment = { vertical: 'middle', indent: 1 };
        cell.border    = { bottom: { style: 'hair', color: { argb: 'E2E8F0' } } };
      }
    });

    const safe = (s) => s.replace(/[^A-Za-z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="scores_class_${safe(class_name)}_all.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// POST /api/primary/scores/class-upload — multi-subject score upload
router.post('/scores/class-upload', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { term_id } = req.body;
    if (!term_id) return res.status(400).json({ error: 'term_id is required' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Row 2 (index 1): subject IDs at cols 4,5 / 6,7 / 8,9 … (1-indexed → array index 3,4/5,6/…)
    const metaRow = rows[1] ?? [];
    const subjectCols = [];
    for (let ci = 3; ci < metaRow.length; ci += 2) {
      const sid = String(metaRow[ci] ?? '').trim();
      if (sid && sid !== 'SUBJECT_IDS') subjectCols.push({ subjectId: sid, classIdx: ci, examIdx: ci + 1 });
    }
    if (!subjectCols.length)
      return res.status(400).json({ error: 'No subject columns found. Use the downloaded class template.' });

    const { rows: [termRow] } = await pool.query(
      `SELECT academic_year_id FROM primary_terms WHERE id=$1 AND school_id=$2`,
      [term_id, req.schoolId]
    );
    if (!termRow) return res.status(404).json({ error: 'Term not found' });
    const academic_year_id = termRow.academic_year_id;

    const subjectIds = subjectCols.map(s => s.subjectId);
    const { rows: validSubs } = await pool.query(
      `SELECT id, max_class_score, max_exam_score FROM primary_subjects WHERE school_id=$1 AND id = ANY($2::uuid[])`,
      [req.schoolId, subjectIds]
    );
    const subMeta = {};
    validSubs.forEach(s => { subMeta[s.id] = s; });

    const scale  = await getGradeScale(req.schoolId);
    const errors = [];
    let count    = 0;

    const dataRows = rows.slice(3).filter(r => String(r[0] ?? '').trim());
    const client   = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < dataRows.length; i++) {
        const row        = dataRows[i];
        const student_id = String(row[0] ?? '').trim();
        if (!student_id) continue;
        for (const { subjectId, classIdx, examIdx } of subjectCols) {
          const sub    = subMeta[subjectId];
          if (!sub) continue;
          const csRaw = row[classIdx];
          const esRaw = row[examIdx];
          if ((csRaw === '' || csRaw == null) && (esRaw === '' || esRaw == null)) continue;
          const cs    = csRaw !== '' && csRaw != null ? parseFloat(csRaw) : null;
          const es    = esRaw !== '' && esRaw != null ? parseFloat(esRaw) : null;
          const total = cs != null && es != null ? cs + es : (cs ?? es);
          const grade = total != null ? assignGrade(total, scale) : null;
          await client.query(
            `INSERT INTO primary_scores
               (school_id, student_id, subject_id, term_id, academic_year_id, class_score, exam_score, total, grade, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
             ON CONFLICT (school_id, student_id, subject_id, term_id)
             DO UPDATE SET class_score=$6, exam_score=$7, total=$8, grade=$9, updated_at=now()`,
            [req.schoolId, student_id, subjectId, term_id, academic_year_id, cs, es, total, grade]
          );
          count++;
        }
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    await recalcPositions(req.schoolId, term_id);
    res.json({ message: `Uploaded ${count} score entries`, count, errors });
  } catch (err) { next(err); }
});

// ── TEACHER ATTENDANCE ────────────────────────────────────────────────────────

// GET /api/primary/teacher-attendance?date=
router.get('/teacher-attendance', adminOnly, async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required' });
    const { rows } = await pool.query(
      `SELECT t.id AS teacher_id, t.name AS teacher_name, t.teacher_code,
              COALESCE(a.status, 'present') AS status, a.notes, a.id AS attendance_id
       FROM teachers t
       LEFT JOIN primary_teacher_attendance a ON a.teacher_id=t.id AND a.school_id=$1 AND a.date=$2
       WHERE t.school_id=$1 AND t.status='Active'
       ORDER BY t.name`,
      [req.schoolId, date]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/primary/teacher-attendance/summary?month=YYYY-MM
router.get('/teacher-attendance/summary', adminOnly, async (req, res, next) => {
  try {
    const { month } = req.query; // e.g. '2025-01'
    if (!month) return res.status(400).json({ error: 'month is required (YYYY-MM)' });
    const start = `${month}-01`;
    const end   = `${month}-31`;
    const { rows } = await pool.query(
      `SELECT t.id AS teacher_id, t.name AS teacher_name, t.teacher_code,
              COUNT(CASE WHEN a.status='present' THEN 1 END)::int AS present_days,
              COUNT(CASE WHEN a.status='absent'  THEN 1 END)::int AS absent_days,
              COUNT(CASE WHEN a.status='late'    THEN 1 END)::int AS late_days,
              COUNT(CASE WHEN a.status='excused' THEN 1 END)::int AS excused_days,
              COUNT(a.id)::int AS total_marked
       FROM teachers t
       LEFT JOIN primary_teacher_attendance a
         ON a.teacher_id=t.id AND a.school_id=$1 AND a.date BETWEEN $2::date AND $3::date
       WHERE t.school_id=$1 AND t.status='Active'
       GROUP BY t.id, t.name, t.teacher_code
       ORDER BY t.name`,
      [req.schoolId, start, end]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/teacher-attendance — bulk mark teacher attendance for a date
router.post('/teacher-attendance', adminOnly, async (req, res, next) => {
  try {
    const { date, records } = req.body;
    if (!date || !Array.isArray(records))
      return res.status(400).json({ error: 'date and records[] are required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of records) {
        await client.query(
          `INSERT INTO primary_teacher_attendance (school_id, teacher_id, date, status, notes, marked_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (school_id, teacher_id, date)
           DO UPDATE SET status=$4, notes=$5, marked_by=$6`,
          [req.schoolId, r.teacher_id, date, r.status || 'present', r.notes || null, req.user.id]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
    res.json({ message: `Saved for ${records.length} teachers` });
  } catch (err) { next(err); }
});

// ── GRADE SCALE ───────────────────────────────────────────────────────────────

// GET /api/primary/grade-scale
router.get('/grade-scale', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM primary_grade_scale WHERE school_id=$1 ORDER BY sort_order`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /api/primary/grade-scale — full replace
router.put('/grade-scale', adminOnly, async (req, res, next) => {
  try {
    const scale = req.body.scale ?? req.body.rows; // accept both keys
    if (!Array.isArray(scale) || !scale.length)
      return res.status(400).json({ error: 'scale[] or rows[] is required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM primary_grade_scale WHERE school_id=$1`, [req.schoolId]);
      for (let i = 0; i < scale.length; i++) {
        const { grade, min_score, max_score, description } = scale[i];
        await client.query(
          `INSERT INTO primary_grade_scale (school_id, grade, min_score, max_score, description, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.schoolId, grade, parseFloat(min_score), parseFloat(max_score), description || null, i]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    const { rows } = await pool.query(
      `SELECT * FROM primary_grade_scale WHERE school_id=$1 ORDER BY sort_order`, [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── REPORTS / REMARKS ─────────────────────────────────────────────────────────

// GET /api/primary/reports/overview?term_id=[&class_name=]
// Without class_name: returns class-level summary counts (for admin)
// With class_name: returns student-level status list
router.get('/reports/overview', async (req, res, next) => {
  try {
    const { term_id, class_name } = req.query;
    if (!term_id) return res.status(400).json({ error: 'term_id is required' });

    if (class_name) {
      // Student list mode
      const { rows } = await pool.query(
        `SELECT s.id AS student_id,
                (s.surname || COALESCE(' ' || s.other_names, '')) AS student_name,
                s.admission_number,
                COALESCE(r.status,'draft') AS status,
                r.id AS report_id
         FROM primary_students s
         LEFT JOIN primary_report_remarks r ON r.student_id=s.id AND r.term_id=$2 AND r.school_id=$1
         WHERE s.school_id=$1 AND LOWER(s.class_name)=LOWER($3) AND s.status='Active'
         ORDER BY s.surname, s.other_names`,
        [req.schoolId, term_id, class_name]
      );
      return res.json(rows);
    }

    // Class summary mode (admin) or student list mode (teacher auto-detect)
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

    if (!isAdmin) {
      // Teacher: return student-level statuses for their assigned class
      const { rows: ct } = await pool.query(
        `SELECT ct.class_name FROM primary_class_teachers ct
         JOIN primary_terms t ON t.id=$2
         WHERE ct.school_id=$1 AND ct.teacher_id=$3 AND ct.academic_year_id=t.academic_year_id LIMIT 1`,
        [req.schoolId, term_id, req.user.id]
      );
      if (!ct.length) return res.json([]);
      const teacherClass = ct[0].class_name;
      const { rows } = await pool.query(
        `SELECT s.id AS student_id,
                (s.surname || COALESCE(' ' || s.other_names, '')) AS student_name,
                s.admission_number,
                COALESCE(r.status,'draft') AS status,
                r.id AS report_id
         FROM primary_students s
         LEFT JOIN primary_report_remarks r ON r.student_id=s.id AND r.term_id=$2 AND r.school_id=$1
         WHERE s.school_id=$1 AND LOWER(s.class_name)=LOWER($3) AND s.status='Active'
         ORDER BY s.surname, s.other_names`,
        [req.schoolId, term_id, teacherClass]
      );
      return res.json(rows);
    }

    // Admin: class-level summary across all classes
    const { rows } = await pool.query(
      `SELECT s.class_name,
              COUNT(s.id)::int AS total_students,
              COUNT(CASE WHEN COALESCE(r.status,'draft')='draft'     THEN 1 END)::int AS draft_count,
              COUNT(CASE WHEN r.status='submitted'                   THEN 1 END)::int AS submitted_count,
              COUNT(CASE WHEN r.status='approved'                    THEN 1 END)::int AS approved_count,
              COUNT(CASE WHEN r.status='rejected'                    THEN 1 END)::int AS rejected_count
       FROM primary_students s
       LEFT JOIN primary_report_remarks r ON r.student_id=s.id AND r.term_id=$2 AND r.school_id=$1
       WHERE s.school_id=$1 AND s.status='Active'
       GROUP BY s.class_name
       ORDER BY s.class_name`,
      [req.schoolId, term_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/primary/reports/student?term_id=&student_id= — full report for review / PDF
router.get('/reports/student', async (req, res, next) => {
  try {
    const { term_id, student_id } = req.query;
    if (!term_id || !student_id) return res.status(400).json({ error: 'term_id and student_id are required' });
    req.params = { student_id };
    req.query  = { term_id };
    // Delegate to the path-param handler below by calling the same logic inline
    const { rows: [student] } = await pool.query(
      `SELECT * FROM primary_students WHERE id=$1 AND school_id=$2`, [student_id, req.schoolId]
    );
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { rows: [term] } = await pool.query(
      `SELECT t.*, ay.name AS academic_year_name FROM primary_terms t
       JOIN academic_years ay ON ay.id=t.academic_year_id
       WHERE t.id=$1 AND t.school_id=$2`, [term_id, req.schoolId]
    );

    const { rows: scores } = await pool.query(
      `SELECT sc.*, sub.subject_name, sub.max_class_score, sub.max_exam_score, sub.sort_order
       FROM primary_scores sc
       JOIN primary_subjects sub ON sub.id=sc.subject_id
       WHERE sc.student_id=$1 AND sc.term_id=$2 AND sc.school_id=$3
       ORDER BY sub.sort_order, sub.subject_name`,
      [student_id, term_id, req.schoolId]
    );

    const { rows: [remarks] } = await pool.query(
      `SELECT r.*, t.name AS class_teacher_name, h.name AS headmaster_name
       FROM primary_report_remarks r
       LEFT JOIN teachers t ON t.id=r.class_teacher_id
       LEFT JOIN teachers h ON h.id=r.headmaster_id
       WHERE r.student_id=$1 AND r.term_id=$2 AND r.school_id=$3`,
      [student_id, term_id, req.schoolId]
    );

    const { rows: [attendance] } = await pool.query(
      `SELECT
         COUNT(CASE WHEN status='present' THEN 1 END)::int AS present,
         COUNT(CASE WHEN status='absent'  THEN 1 END)::int AS absent,
         COUNT(CASE WHEN status='late'    THEN 1 END)::int AS late,
         COUNT(CASE WHEN status='excused' THEN 1 END)::int AS excused,
         COUNT(*)::int AS total_days
       FROM primary_daily_attendance
       WHERE student_id=$1 AND school_id=$2
         AND ($3::date IS NULL OR date >= $3::date)
         AND ($4::date IS NULL OR date <= $4::date)`,
      [student_id, req.schoolId, term?.start_date || null, term?.end_date || null]
    );

    res.json({
      student,
      term,
      scores,
      remarks: remarks ? {
        id: remarks.id,
        affective_ratings: remarks.affective_ratings,
        class_teacher_remarks: remarks.class_teacher_remarks,
        headmaster_remarks: remarks.headmaster_remarks,
        status: remarks.status,
      } : { id: null, affective_ratings: null, class_teacher_remarks: null, headmaster_remarks: null, status: 'draft' },
      attendance: attendance || { present: 0, absent: 0, late: 0, excused: 0, total_days: 0 },
    });
  } catch (err) { next(err); }
});

// GET /api/primary/reports?term_id=&class_name= — legacy alias kept for backwards compat
router.get('/reports', async (req, res, next) => {
  try {
    const { term_id, class_name } = req.query;
    if (!term_id || !class_name)
      return res.status(400).json({ error: 'term_id and class_name are required' });

    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.surname, s.other_names, s.admission_number,
              COALESCE(r.status,'draft') AS status,
              r.id AS remark_id,
              r.class_teacher_submitted_at,
              r.headmaster_approved_at,
              (SELECT COUNT(*) FROM primary_scores sc WHERE sc.student_id=s.id AND sc.term_id=$2)::int AS score_count
       FROM primary_students s
       LEFT JOIN primary_report_remarks r ON r.student_id=s.id AND r.term_id=$2 AND r.school_id=$1
       WHERE s.school_id=$1 AND LOWER(s.class_name)=LOWER($3) AND s.status='Active'
       ORDER BY s.surname, s.other_names`,
      [req.schoolId, term_id, class_name]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/primary/reports/student/:student_id?term_id= — full report for PDF / review
router.get('/reports/student/:student_id', async (req, res, next) => {
  try {
    const { term_id } = req.query;
    if (!term_id) return res.status(400).json({ error: 'term_id is required' });

    const { rows: [student] } = await pool.query(
      `SELECT * FROM primary_students WHERE id=$1 AND school_id=$2`, [req.params.student_id, req.schoolId]
    );
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { rows: [term] } = await pool.query(
      `SELECT t.*, ay.name AS academic_year_name FROM primary_terms t
       JOIN academic_years ay ON ay.id=t.academic_year_id
       WHERE t.id=$1 AND t.school_id=$2`, [term_id, req.schoolId]
    );

    const { rows: scores } = await pool.query(
      `SELECT sc.*, sub.subject_name, sub.max_class_score, sub.max_exam_score, sub.sort_order
       FROM primary_scores sc
       JOIN primary_subjects sub ON sub.id=sc.subject_id
       WHERE sc.student_id=$1 AND sc.term_id=$2 AND sc.school_id=$3
       ORDER BY sub.sort_order, sub.subject_name`,
      [req.params.student_id, term_id, req.schoolId]
    );

    const { rows: [remarks] } = await pool.query(
      `SELECT r.*, t.name AS class_teacher_name, h.name AS headmaster_name
       FROM primary_report_remarks r
       LEFT JOIN teachers t ON t.id=r.class_teacher_id
       LEFT JOIN teachers h ON h.id=r.headmaster_id
       WHERE r.student_id=$1 AND r.term_id=$2 AND r.school_id=$3`,
      [req.params.student_id, term_id, req.schoolId]
    );

    // Attendance totals for the term
    const { rows: [attendance] } = await pool.query(
      `SELECT
         COUNT(CASE WHEN status='present' THEN 1 END)::int AS present_days,
         COUNT(CASE WHEN status='absent'  THEN 1 END)::int AS absent_days,
         COUNT(CASE WHEN status='late'    THEN 1 END)::int AS late_days,
         COUNT(*)::int AS total_marked
       FROM primary_daily_attendance
       WHERE student_id=$1 AND school_id=$2
         AND ($3::date IS NULL OR date >= $3::date)
         AND ($4::date IS NULL OR date <= $4::date)`,
      [req.params.student_id, req.schoolId, term?.start_date || null, term?.end_date || null]
    );

    // Overall position in class
    const { rows: classScores } = await pool.query(
      `SELECT student_id, SUM(total) AS grand_total
       FROM primary_scores sc
       JOIN primary_students s ON s.id=sc.student_id
       WHERE sc.school_id=$1 AND sc.term_id=$2 AND LOWER(s.class_name)=LOWER($3)
       GROUP BY student_id ORDER BY grand_total DESC NULLS LAST`,
      [req.schoolId, term_id, student.class_name]
    );
    const overallPosition = classScores.findIndex(r => r.student_id === req.params.student_id) + 1;
    const classSize       = classScores.length;
    const grandTotal      = scores.reduce((sum, s) => sum + parseFloat(s.total || 0), 0);

    res.json({ student, term, scores, remarks: remarks || null, attendance, overallPosition, classSize, grandTotal });
  } catch (err) { next(err); }
});

// POST /api/primary/reports/remarks — save remarks + affective ratings
router.post('/reports/remarks', async (req, res, next) => {
  try {
    const { student_id, term_id, affective_ratings, class_teacher_remarks } = req.body;
    let { academic_year_id } = req.body;
    if (!student_id || !term_id)
      return res.status(400).json({ error: 'student_id and term_id are required' });

    // Validate student belongs to this school
    const { rows: [studentRow] } = await pool.query(
      `SELECT class_name FROM primary_students WHERE id=$1 AND school_id=$2`,
      [student_id, req.schoolId]
    );
    if (!studentRow) return res.status(404).json({ error: 'Student not found' });

    const termRes = await pool.query(
      `SELECT academic_year_id FROM primary_terms WHERE id=$1 AND school_id=$2`,
      [term_id, req.schoolId]
    );
    if (!termRes.rows.length) return res.status(404).json({ error: 'Term not found' });
    academic_year_id = academic_year_id || termRes.rows[0].academic_year_id;
    if (!academic_year_id) return res.status(400).json({ error: 'Could not determine academic year' });

    // Non-admins must be the class teacher for this student's class in this term's academic year
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin) {
      const { rows: ct } = await pool.query(
        `SELECT 1 FROM primary_class_teachers
         WHERE school_id=$1 AND teacher_id=$2 AND academic_year_id=$3
           AND LOWER(class_name)=LOWER($4)`,
        [req.schoolId, req.user.id, academic_year_id, studentRow.class_name]
      );
      if (!ct.length) return res.status(403).json({ error: 'You are not the class teacher for this student' });
    }

    const { rows } = await pool.query(
      `INSERT INTO primary_report_remarks
         (school_id, student_id, term_id, academic_year_id, affective_ratings, class_teacher_remarks, class_teacher_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (school_id, student_id, term_id)
       DO UPDATE SET affective_ratings=$5, class_teacher_remarks=$6, class_teacher_id=$7, updated_at=now()
       RETURNING *`,
      [req.schoolId, student_id, term_id, academic_year_id,
       affective_ratings ? JSON.stringify(affective_ratings) : null,
       class_teacher_remarks || null, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/primary/reports/:id/submit — teacher submits for headmaster review
router.put('/reports/:id/submit', async (req, res, next) => {
  try {
    // Verify the remark belongs to this school and teacher owns it (admin can bypass)
    const { rows: [remark] } = await pool.query(
      `SELECT class_teacher_id FROM primary_report_remarks WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!remark) return res.status(404).json({ error: 'Remark not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && remark.class_teacher_id !== req.user.id)
      return res.status(403).json({ error: 'You did not create this remark' });

    const { rows } = await pool.query(
      `UPDATE primary_report_remarks
       SET status='submitted', class_teacher_submitted_at=now(), updated_at=now()
       WHERE id=$1 AND school_id=$2 AND status IN ('draft','rejected') RETURNING *`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(409).json({ error: 'Remark is already submitted or approved' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/primary/reports/:id/approve — headmaster approves
router.put('/reports/:id/approve', adminOnly, async (req, res, next) => {
  try {
    const { headmaster_remarks } = req.body;
    const { rows } = await pool.query(
      `UPDATE primary_report_remarks
       SET status='approved', headmaster_remarks=$1, headmaster_id=$2, headmaster_approved_at=now(), updated_at=now()
       WHERE id=$3 AND school_id=$4 AND status='submitted' RETURNING *`,
      [headmaster_remarks || null, req.user.id, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Remark not found or not in submitted state' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/primary/reports/:id/reject — headmaster rejects
router.put('/reports/:id/reject', adminOnly, async (req, res, next) => {
  try {
    const { rejection_reason, headmaster_remarks } = req.body;
    const reason = rejection_reason || headmaster_remarks || null;
    const { rows } = await pool.query(
      `UPDATE primary_report_remarks
       SET status='rejected', rejection_reason=$1, headmaster_remarks=$1, headmaster_id=$2, updated_at=now()
       WHERE id=$3 AND school_id=$4 AND status='submitted' RETURNING *`,
      [reason, req.user.id, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Remark not found or not in submitted state' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── ADMIN DASHBOARD STATS ─────────────────────────────────────────────────────

// GET /api/primary/dashboard-stats
router.get('/dashboard-stats', adminOnly, async (req, res, next) => {
  try {
    const { rows: [counts] } = await pool.query(
      `SELECT
         COUNT(*)::int                                                         AS total_students,
         COUNT(*) FILTER (WHERE status='Active')::int                         AS active_students,
         COUNT(DISTINCT class_name)::int                                       AS total_classes
       FROM primary_students WHERE school_id=$1`,
      [req.schoolId]
    );

    const { rows: [termRow] } = await pool.query(
      `SELECT t.id, t.name FROM primary_terms t
       JOIN academic_years ay ON ay.id=t.academic_year_id
       WHERE t.school_id=$1 AND t.is_current=true AND ay.is_current=true
       LIMIT 1`,
      [req.schoolId]
    );

    const today = new Date().toISOString().slice(0, 10);
    const { rows: [attToday] } = await pool.query(
      `SELECT COUNT(*)::int AS marked FROM primary_daily_attendance WHERE school_id=$1 AND date=$2`,
      [req.schoolId, today]
    );

    const { rows: classCounts } = await pool.query(
      `SELECT class_name, COUNT(*)::int AS student_count
       FROM primary_students WHERE school_id=$1 AND status='Active'
       GROUP BY class_name ORDER BY class_name`,
      [req.schoolId]
    );

    res.json({ ...counts, current_term: termRow || null, attendance_today: attToday.marked, classes: classCounts });
  } catch (err) { next(err); }
});

// ── TEACHER SELF-ATTENDANCE (GPS + Photo clock-in/out) ───────────────────────

const { calculateDistance } = require('../services/geo.service');

function verifySchoolGps(school, userLat, userLng) {
  if (!school.school_latitude || !school.school_longitude)
    return { valid: false, verified: false, distance: 0, message: 'School GPS not configured. Contact your administrator.' };
  const dist = Math.round(calculateDistance(userLat, userLng, parseFloat(school.school_latitude), parseFloat(school.school_longitude)));
  const radius = school.school_gps_radius ?? 100;
  return dist <= radius
    ? { valid: true, verified: true, distance: dist, message: `Within school grounds (${dist}m from centre)` }
    : { valid: false, verified: true, distance: dist, message: `You are ${dist}m from the school (max ${radius}m allowed)` };
}

// GET /api/primary/me/attendance/today
router.get('/me/attendance/today', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `SELECT * FROM primary_teacher_self_attendance WHERE school_id=$1 AND teacher_id=$2 AND date=$3`,
      [req.schoolId, req.user.id, today]
    );
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

// GET /api/primary/me/attendance?term_id=
router.get('/me/attendance', async (req, res, next) => {
  try {
    const { term_id } = req.query;
    let filter = ''; const params = [req.schoolId, req.user.id];
    if (term_id) {
      const { rows: tr } = await pool.query(
        `SELECT start_date, end_date FROM primary_terms WHERE id=$1 AND school_id=$2`, [term_id, req.schoolId]
      );
      if (tr[0]?.start_date) { params.push(tr[0].start_date); filter += ` AND date >= $${params.length}`; }
      if (tr[0]?.end_date)   { params.push(tr[0].end_date);   filter += ` AND date <= $${params.length}`; }
    }
    const { rows } = await pool.query(
      `SELECT id, date, status, is_auto_generated, clock_in_time, clock_in_location_verified,
              clock_out_time, clock_out_location_verified, manual_entry_by, manual_entry_note
       FROM primary_teacher_self_attendance WHERE school_id=$1 AND teacher_id=$2 ${filter}
       ORDER BY date DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/me/attendance/clock-in
router.post('/me/attendance/clock-in', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { photo, gps } = req.body;
    if (!photo || !gps) return res.status(400).json({ error: 'photo and gps are required' });

    const [lat, lng] = gps.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Invalid GPS format (lat,lng)' });

    const { rows: [school] } = await pool.query(
      `SELECT school_latitude, school_longitude, school_gps_radius FROM schools WHERE id=$1`, [req.schoolId]
    );
    const geo = verifySchoolGps(school, lat, lng);
    if (!geo.valid) return res.status(400).json({ error: geo.message });

    const photoSizeKb = parseFloat((Buffer.byteLength(photo, 'utf8') * 0.75 / 1024).toFixed(2));
    if (photoSizeKb > 25) return res.status(400).json({ error: `Photo too large (${photoSizeKb.toFixed(1)}KB). Must be under 25KB.` });

    const { rows } = await pool.query(
      `INSERT INTO primary_teacher_self_attendance
         (school_id, teacher_id, date, status, clock_in_time, clock_in_photo, clock_in_gps, clock_in_location_verified, photo_size_kb_in)
       VALUES ($1,$2,$3,'present',NOW(),$4,$5,$6,$7)
       ON CONFLICT (school_id, teacher_id, date) DO NOTHING
       RETURNING *`,
      [req.schoolId, req.user.id, today, photo, gps, geo.verified, photoSizeKb]
    );
    if (!rows.length) return res.status(409).json({ error: 'Already clocked in today' });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/primary/me/attendance/clock-out
router.post('/me/attendance/clock-out', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { photo, gps } = req.body;
    if (!photo || !gps) return res.status(400).json({ error: 'photo and gps are required' });

    const [lat, lng] = gps.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Invalid GPS format (lat,lng)' });

    const { rows: [school] } = await pool.query(
      `SELECT school_latitude, school_longitude, school_gps_radius FROM schools WHERE id=$1`, [req.schoolId]
    );
    const geo = verifySchoolGps(school, lat, lng);
    if (!geo.valid) return res.status(400).json({ error: geo.message });

    const photoSizeKb = parseFloat((Buffer.byteLength(photo, 'utf8') * 0.75 / 1024).toFixed(2));
    if (photoSizeKb > 25) return res.status(400).json({ error: `Photo too large (${photoSizeKb.toFixed(1)}KB). Must be under 25KB.` });

    const { rows: [existing] } = await pool.query(
      `SELECT id, clock_in_time FROM primary_teacher_self_attendance
       WHERE school_id=$1 AND teacher_id=$2 AND date=$3`,
      [req.schoolId, req.user.id, today]
    );
    if (!existing) return res.status(400).json({ error: 'You have not clocked in today' });
    if (!existing.clock_in_time) return res.status(400).json({ error: 'Clock-in not completed' });

    const { rows } = await pool.query(
      `UPDATE primary_teacher_self_attendance
       SET clock_out_time=NOW(), clock_out_photo=$4, clock_out_gps=$5,
           clock_out_location_verified=$6, photo_size_kb_out=$7
       WHERE id=$1 AND school_id=$2 AND teacher_id=$3
       RETURNING *`,
      [existing.id, req.schoolId, req.user.id, photo, gps, geo.verified, photoSizeKb]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── ADMIN: teacher self-attendance management ──────────────────────────────────

// GET /api/primary/admin/self-attendance?date=&teacher_id=&from=&to=
router.get('/admin/self-attendance', adminOnly, async (req, res, next) => {
  try {
    const { date, teacher_id, from, to } = req.query;
    const params = [req.schoolId]; const filters = [];
    if (date)       { params.push(date);       filters.push(`a.date=$${params.length}`); }
    if (teacher_id) { params.push(teacher_id); filters.push(`a.teacher_id=$${params.length}`); }
    if (from)       { params.push(from);       filters.push(`a.date>=$${params.length}`); }
    if (to)         { params.push(to);         filters.push(`a.date<=$${params.length}`); }
    const where = filters.length ? 'AND ' + filters.join(' AND ') : '';
    const { rows } = await pool.query(
      `SELECT a.*, t.name AS teacher_name, t.teacher_code,
              mb.name AS manual_entry_by_name
       FROM primary_teacher_self_attendance a
       JOIN teachers t ON t.id=a.teacher_id
       LEFT JOIN teachers mb ON mb.id=a.manual_entry_by
       WHERE a.school_id=$1 ${where}
       ORDER BY a.date DESC, t.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/primary/admin/self-attendance/report?term_id=
router.get('/admin/self-attendance/report', adminOnly, async (req, res, next) => {
  try {
    const { term_id } = req.query;
    let dateFilter = ''; const params = [req.schoolId];
    if (term_id) {
      const { rows: tr } = await pool.query(
        `SELECT start_date, end_date FROM primary_terms WHERE id=$1 AND school_id=$2`, [term_id, req.schoolId]
      );
      if (tr[0]?.start_date) { params.push(tr[0].start_date); dateFilter += ` AND a.date>=$${params.length}`; }
      if (tr[0]?.end_date)   { params.push(tr[0].end_date);   dateFilter += ` AND a.date<=$${params.length}`; }
    }
    const { rows } = await pool.query(
      `SELECT t.id AS teacher_id, t.name AS teacher_name, t.teacher_code,
              COUNT(CASE WHEN a.status='present' AND NOT a.is_auto_generated THEN 1 END)::int AS days_present,
              COUNT(CASE WHEN a.status='absent'  AND a.is_auto_generated THEN 1 END)::int     AS days_absent,
              COUNT(CASE WHEN a.status='excused' THEN 1 END)::int                             AS days_excused,
              COUNT(CASE WHEN a.clock_in_time IS NOT NULL AND a.clock_out_time IS NULL AND NOT a.is_auto_generated THEN 1 END)::int AS days_incomplete,
              COUNT(a.id)::int                                                                 AS total_marked,
              CASE WHEN COUNT(a.id)=0 THEN NULL
                   ELSE ROUND(100.0 * COUNT(CASE WHEN a.status='present' AND NOT a.is_auto_generated THEN 1 END) / COUNT(a.id), 1)
              END AS attendance_pct
       FROM teachers t
       LEFT JOIN primary_teacher_self_attendance a ON a.teacher_id=t.id AND a.school_id=$1 ${dateFilter}
       WHERE t.school_id=$1 AND t.status='Active'
       GROUP BY t.id, t.name, t.teacher_code
       ORDER BY attendance_pct ASC NULLS LAST, t.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/admin/self-attendance/manual — manual clock-in by admin
router.post('/admin/self-attendance/manual', adminOnly, async (req, res, next) => {
  try {
    const { teacher_id, date, note } = req.body;
    if (!teacher_id || !date) return res.status(400).json({ error: 'teacher_id and date are required' });
    const { rows } = await pool.query(
      `INSERT INTO primary_teacher_self_attendance
         (school_id, teacher_id, date, status, manual_entry_by, manual_entry_note,
          clock_in_time, clock_in_location_verified)
       VALUES ($1,$2,$3,'present',$4,$5,NOW(),false)
       ON CONFLICT (school_id, teacher_id, date)
       DO UPDATE SET status='present', manual_entry_by=$4, manual_entry_note=$5,
                     is_auto_generated=false
       RETURNING *`,
      [req.schoolId, teacher_id, date, req.user.id, note || null]
    );
    // Remove auto-generated absence if it existed
    await pool.query(
      `DELETE FROM primary_teacher_self_attendance
       WHERE school_id=$1 AND teacher_id=$2 AND date=$3 AND is_auto_generated=true AND id<>$4`,
      [req.schoolId, teacher_id, date, rows[0].id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/primary/admin/self-attendance/:id
router.delete('/admin/self-attendance/:id', adminOnly, async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM primary_teacher_self_attendance WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// POST /api/primary/admin/run-absence-check
router.post('/admin/run-absence-check', adminOnly, async (req, res, next) => {
  try {
    const { runPrimaryAbsenceCheck } = require('../jobs/absenceCheck');
    const result = await runPrimaryAbsenceCheck(req.schoolId);
    res.json(result);
  } catch (err) { next(err); }
});

// ── TEACHER EXCUSES ───────────────────────────────────────────────────────────

// GET /api/primary/excuses — teacher sees own; admin sees all
router.get('/excuses', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const params = [req.schoolId];
    let filter = '';
    if (!isAdmin) { params.push(req.user.id); filter = `AND e.teacher_id=$${params.length}`; }
    const { rows } = await pool.query(
      `SELECT e.*, t.name AS teacher_name, r.name AS reviewed_by_name
       FROM primary_teacher_excuses e
       JOIN teachers t ON t.id=e.teacher_id
       LEFT JOIN teachers r ON r.id=e.reviewed_by
       WHERE e.school_id=$1 ${filter}
       ORDER BY e.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/excuses — teacher submits leave request
router.post('/excuses', async (req, res, next) => {
  try {
    const { date_from, date_to, excuse_type, reason } = req.body;
    if (!date_from || !date_to || !excuse_type)
      return res.status(400).json({ error: 'date_from, date_to, excuse_type are required' });
    const { rows } = await pool.query(
      `INSERT INTO primary_teacher_excuses (school_id, teacher_id, date_from, date_to, excuse_type, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,'Pending') RETURNING *`,
      [req.schoolId, req.user.id, date_from, date_to, excuse_type, reason || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/primary/excuses/:id/approve — admin approves
router.patch('/excuses/:id/approve', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE primary_teacher_excuses SET status='Approved', reviewed_by=$1, reviewed_at=NOW()
       WHERE id=$2 AND school_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    // Retroactively update any auto-generated absences in this date range
    await pool.query(
      `UPDATE primary_teacher_self_attendance SET status='excused'
       WHERE school_id=$1 AND teacher_id=$2 AND date BETWEEN $3 AND $4 AND is_auto_generated=true`,
      [req.schoolId, rows[0].teacher_id, rows[0].date_from, rows[0].date_to]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/primary/excuses/:id/reject — admin rejects
router.patch('/excuses/:id/reject', adminOnly, async (req, res, next) => {
  try {
    const { rejection_reason } = req.body;
    if (!rejection_reason) return res.status(400).json({ error: 'rejection_reason is required' });
    const { rows } = await pool.query(
      `UPDATE primary_teacher_excuses SET status='Rejected', reviewed_by=$1, reviewed_at=NOW(), rejection_reason=$2
       WHERE id=$3 AND school_id=$4 RETURNING *`,
      [req.user.id, rejection_reason, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/primary/excuses/:id
router.delete('/excuses/:id', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const filter = isAdmin ? 'AND school_id=$2' : `AND teacher_id=$2 AND status='Pending'`;
    const val    = isAdmin ? req.schoolId : req.user.id;
    const { rowCount } = await pool.query(
      `DELETE FROM primary_teacher_excuses WHERE id=$1 ${filter}`,
      [req.params.id, val]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found or cannot be deleted' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// ── ASSESSMENT MODES ──────────────────────────────────────────────────────────

// GET /api/primary/assessment-modes
router.get('/assessment-modes', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM primary_assessment_modes WHERE school_id=$1 ORDER BY sort_order, name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/assessment-modes
router.post('/assessment-modes', adminOnly, async (req, res, next) => {
  try {
    const { name, ca_weight, is_terminal_exam, max_instances, sort_order } = req.body;
    if (!name || ca_weight == null)
      return res.status(400).json({ error: 'name and ca_weight are required' });
    const limit = (max_instances != null && max_instances !== '') ? parseInt(max_instances) : null;
    if (limit != null && (isNaN(limit) || limit < 1))
      return res.status(400).json({ error: 'max_instances must be a positive integer' });
    const { rows } = await pool.query(
      `INSERT INTO primary_assessment_modes (school_id, name, ca_weight, is_terminal_exam, max_instances, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.schoolId, name.trim(), parseFloat(ca_weight), !!is_terminal_exam, limit, sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A mode with that name already exists' });
    next(err);
  }
});

// PUT /api/primary/assessment-modes/:id
router.put('/assessment-modes/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, ca_weight, is_terminal_exam, max_instances, sort_order } = req.body;
    const limit = (max_instances != null && max_instances !== '') ? parseInt(max_instances) : null;
    if (limit != null && (isNaN(limit) || limit < 1))
      return res.status(400).json({ error: 'max_instances must be a positive integer' });
    const { rows } = await pool.query(
      `UPDATE primary_assessment_modes
       SET name=$1, ca_weight=$2, is_terminal_exam=$3, max_instances=$4, sort_order=$5
       WHERE id=$6 AND school_id=$7 RETURNING *`,
      [name.trim(), parseFloat(ca_weight), !!is_terminal_exam, limit,
       sort_order ?? 0, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Mode not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A mode with that name already exists' });
    next(err);
  }
});

// DELETE /api/primary/assessment-modes/:id
router.delete('/assessment-modes/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM primary_assessment_modes WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Mode not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// ── PRIMARY ASSESSMENTS ───────────────────────────────────────────────────────

// Recalculate class_score + exam_score for every active student in the class,
// using mode-averaged percentage × ca_weight, then scaled to max_class/exam_score.
async function recalcFromAssessments(schoolId, termId, subjectId, teacherId) {
  const { rows: [subject] } = await pool.query(
    `SELECT max_class_score, max_exam_score FROM primary_subjects WHERE id=$1 AND school_id=$2`,
    [subjectId, schoolId]
  );
  if (!subject) return;

  const { rows: [term] } = await pool.query(
    `SELECT academic_year_id FROM primary_terms WHERE id=$1`, [termId]
  );
  if (!term) return;

  // Only consider modes that have at least one assessment for this subject/term
  const { rows: modes } = await pool.query(
    `SELECT DISTINCT am.id, am.ca_weight, am.is_terminal_exam
     FROM primary_assessment_modes am
     JOIN primary_assessments a ON a.mode_id = am.id
     WHERE a.school_id=$1 AND a.term_id=$2 AND a.subject_id=$3`,
    [schoolId, termId, subjectId]
  );
  if (!modes.length) return;

  const { rows: assessments } = await pool.query(
    `SELECT id, mode_id, max_score, class_name FROM primary_assessments
     WHERE school_id=$1 AND term_id=$2 AND subject_id=$3 AND mode_id IS NOT NULL`,
    [schoolId, termId, subjectId]
  );
  const className = assessments[0]?.class_name;
  if (!className) return;

  // Group assessments by mode_id
  const byMode = {};
  for (const a of assessments) { (byMode[a.mode_id] ??= []).push(a); }

  const { rows: students } = await pool.query(
    `SELECT id FROM primary_students WHERE school_id=$1 AND LOWER(class_name)=LOWER($2) AND status='Active'`,
    [schoolId, className]
  );

  const { rows: allScores } = await pool.query(
    `SELECT sc.student_id, sc.assessment_id, sc.score, sc.absent
     FROM primary_assessment_scores sc
     JOIN primary_assessments a ON a.id = sc.assessment_id
     WHERE a.school_id=$1 AND a.term_id=$2 AND a.subject_id=$3 AND a.mode_id IS NOT NULL`,
    [schoolId, termId, subjectId]
  );
  const idx = {};
  for (const s of allScores) { (idx[s.student_id] ??= {})[s.assessment_id] = s; }

  const classModes = modes.filter(m => !m.is_terminal_exam);
  const examModes  = modes.filter(m =>  m.is_terminal_exam);
  const classTotalWeight = classModes.reduce((s, m) => s + parseFloat(m.ca_weight), 0);
  const examTotalWeight  = examModes.reduce((s, m)  => s + parseFloat(m.ca_weight), 0);
  const scale = await getGradeScale(schoolId);
  const maxCs = parseFloat(subject.max_class_score);
  const maxEs = parseFloat(subject.max_exam_score);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const student of students) {
      const sIdx = idx[student.id] ?? {};
      let classRaw = 0, examRaw = 0;

      for (const mode of classModes) {
        const pcts = [];
        for (const a of (byMode[mode.id] ?? [])) {
          const sc = sIdx[a.id];
          if (sc?.absent)                              pcts.push(0);
          else if (sc && sc.score !== null)            pcts.push(parseFloat(sc.score) / parseFloat(a.max_score) * 100);
          // no entry yet → skip (don't penalise un-entered scores)
        }
        if (pcts.length) classRaw += (pcts.reduce((a, b) => a + b, 0) / pcts.length) * parseFloat(mode.ca_weight);
      }

      for (const mode of examModes) {
        const pcts = [];
        for (const a of (byMode[mode.id] ?? [])) {
          const sc = sIdx[a.id];
          if (sc?.absent)                              pcts.push(0);
          else if (sc && sc.score !== null)            pcts.push(parseFloat(sc.score) / parseFloat(a.max_score) * 100);
        }
        if (pcts.length) examRaw += (pcts.reduce((a, b) => a + b, 0) / pcts.length) * parseFloat(mode.ca_weight);
      }

      // Rescale: raw ÷ totalWeight ÷ 100 × subjectMax
      const classScore = classTotalWeight > 0 ? parseFloat((classRaw / classTotalWeight / 100 * maxCs).toFixed(2)) : null;
      const examScore  = examTotalWeight  > 0 ? parseFloat((examRaw  / examTotalWeight  / 100 * maxEs).toFixed(2)) : null;
      const total      = (classScore !== null || examScore !== null)
        ? parseFloat(((classScore ?? 0) + (examScore ?? 0)).toFixed(2)) : null;
      const grade = total !== null ? assignGrade(total, scale) : null;

      await client.query(
        `INSERT INTO primary_scores
           (school_id, student_id, subject_id, term_id, academic_year_id, class_score, exam_score, total, grade, teacher_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (school_id, student_id, subject_id, term_id)
         DO UPDATE SET class_score=$6, exam_score=$7, total=$8, grade=$9, teacher_id=$10, updated_at=NOW()`,
        [schoolId, student.id, subjectId, termId, term.academic_year_id,
         classScore, examScore, total, grade, teacherId ?? null]
      );
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }

  await recalcPositions(schoolId, termId).catch(() => {});
}

// GET /api/primary/assessments?term_id=&class_name=&subject_id=
router.get('/assessments', async (req, res, next) => {
  try {
    const { term_id, class_name, subject_id } = req.query;
    const params = [req.schoolId]; const filters = [];
    if (term_id)    { params.push(term_id);    filters.push(`a.term_id=$${params.length}`); }
    if (class_name) { params.push(class_name); filters.push(`LOWER(a.class_name)=LOWER($${params.length})`); }
    if (subject_id) { params.push(subject_id); filters.push(`a.subject_id=$${params.length}`); }
    const where = filters.length ? 'AND ' + filters.join(' AND ') : '';
    const { rows } = await pool.query(
      `SELECT a.*, ps.subject_name,
              am.name AS mode_name, am.ca_weight, am.is_terminal_exam, am.max_instances,
              (SELECT COUNT(*) FROM primary_assessment_scores s WHERE s.assessment_id=a.id)::int AS score_count
       FROM primary_assessments a
       JOIN primary_subjects ps ON ps.id=a.subject_id
       LEFT JOIN primary_assessment_modes am ON am.id=a.mode_id
       WHERE a.school_id=$1 ${where}
       ORDER BY am.sort_order NULLS LAST, a.created_at`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/primary/assessments
router.post('/assessments', async (req, res, next) => {
  try {
    const { term_id, subject_id, title, mode_id, max_score } = req.body;
    if (!term_id || !subject_id || !title || !mode_id || !max_score)
      return res.status(400).json({ error: 'term_id, subject_id, title, mode_id, max_score are required' });

    // Validate mode belongs to this school
    const { rows: [mode] } = await pool.query(
      `SELECT * FROM primary_assessment_modes WHERE id=$1 AND school_id=$2`,
      [mode_id, req.schoolId]
    );
    if (!mode) return res.status(404).json({ error: 'Assessment mode not found' });

    // Derive class_name from the subject
    const { rows: [sub] } = await pool.query(
      `SELECT class_name FROM primary_subjects WHERE id=$1 AND school_id=$2`,
      [subject_id, req.schoolId]
    );
    if (!sub) return res.status(404).json({ error: 'Subject not found' });

    // Enforce max_instances atomically inside a transaction to prevent race conditions
    const client = await pool.connect();
    let newAssessment;
    try {
      await client.query('BEGIN');
      if (mode.max_instances != null) {
        const { rows: existing } = await client.query(
          `SELECT COUNT(*) FROM primary_assessments
           WHERE school_id=$1 AND term_id=$2 AND subject_id=$3 AND mode_id=$4
           FOR UPDATE`,
          [req.schoolId, term_id, subject_id, mode_id]
        );
        if (parseInt(existing[0].count) >= mode.max_instances) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(409).json({
            error: `Maximum ${mode.max_instances} "${mode.name}" assessment(s) allowed per subject per term`,
          });
        }
      }
      const { rows } = await client.query(
        `INSERT INTO primary_assessments (school_id, teacher_id, term_id, subject_id, class_name, title, mode_id, max_score)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.schoolId, req.user.id, term_id, subject_id, sub.class_name, title, mode_id, parseFloat(max_score)]
      );
      await client.query('COMMIT');
      newAssessment = rows[0];
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.status(201).json({ ...newAssessment, mode_name: mode.name, is_terminal_exam: mode.is_terminal_exam, ca_weight: mode.ca_weight, score_count: 0 });
  } catch (err) { next(err); }
});

// PUT /api/primary/assessments/:id
router.put('/assessments/:id', async (req, res, next) => {
  try {
    const { rows: [existing] } = await pool.query(
      `SELECT teacher_id FROM primary_assessments WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && existing.teacher_id !== req.user.id)
      return res.status(403).json({ error: 'You did not create this assessment' });

    const { title, max_score } = req.body;
    const { rows } = await pool.query(
      `UPDATE primary_assessments SET title=COALESCE($1,title), max_score=COALESCE($2,max_score)
       WHERE id=$3 AND school_id=$4 RETURNING *`,
      [title || null, max_score ? parseFloat(max_score) : null, req.params.id, req.schoolId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/primary/assessments/:id
router.delete('/assessments/:id', async (req, res, next) => {
  try {
    const { rows: [existing] } = await pool.query(
      `SELECT teacher_id FROM primary_assessments WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && existing.teacher_id !== req.user.id)
      return res.status(403).json({ error: 'You did not create this assessment' });

    await pool.query(`DELETE FROM primary_assessments WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// GET /api/primary/assessments/:id/scores
router.get('/assessments/:id/scores', async (req, res, next) => {
  try {
    const { rows: [assessment] } = await pool.query(
      `SELECT a.*, ps.subject_name, ps.max_class_score, ps.max_exam_score,
              am.name AS mode_name, am.ca_weight, am.is_terminal_exam
       FROM primary_assessments a
       JOIN primary_subjects ps ON ps.id=a.subject_id
       LEFT JOIN primary_assessment_modes am ON am.id=a.mode_id
       WHERE a.id=$1 AND a.school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    const { rows: students } = await pool.query(
      `SELECT s.id AS student_id, (s.surname||COALESCE(' '||s.other_names,'')) AS name,
              s.admission_number, sc.score, sc.absent
       FROM primary_students s
       LEFT JOIN primary_assessment_scores sc ON sc.student_id=s.id AND sc.assessment_id=$1
       WHERE s.school_id=$2 AND LOWER(s.class_name)=LOWER($3) AND s.status='Active'
       ORDER BY s.surname, s.other_names`,
      [req.params.id, req.schoolId, assessment.class_name]
    );
    res.json({ assessment, students });
  } catch (err) { next(err); }
});

// POST /api/primary/assessments/:id/scores
// Validates bounds, upserts scores, then recalculates primary_scores via mode weights.
router.post('/assessments/:id/scores', async (req, res, next) => {
  try {
    const { scores } = req.body;
    if (!Array.isArray(scores)) return res.status(400).json({ error: 'scores[] required' });

    const { rows: [assessment] } = await pool.query(
      `SELECT a.* FROM primary_assessments a WHERE a.id=$1 AND a.school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && assessment.teacher_id !== req.user.id)
      return res.status(403).json({ error: 'You did not create this assessment' });

    // Validate every score entry
    const maxScore = parseFloat(assessment.max_score);
    for (const s of scores) {
      if (s.absent) continue;
      if (s.score == null || s.score === '') continue;
      const v = parseFloat(s.score);
      if (isNaN(v))      return res.status(400).json({ error: `Invalid score value: ${s.score}` });
      if (v < 0)         return res.status(400).json({ error: `Score cannot be negative (got ${v})` });
      if (v > maxScore)  return res.status(400).json({ error: `Score ${v} exceeds max score of ${maxScore}` });
    }

    // Upsert scores
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const s of scores) {
        await client.query(
          `INSERT INTO primary_assessment_scores (assessment_id, student_id, score, absent)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (assessment_id, student_id) DO UPDATE SET score=$3, absent=$4`,
          [req.params.id, s.student_id, s.absent ? 0 : (s.score ?? null), !!s.absent]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    // Recalculate primary_scores using the mode-weighted average approach
    if (assessment.mode_id) {
      await recalcFromAssessments(req.schoolId, assessment.term_id, assessment.subject_id, req.user.id);
    }

    res.json({ message: `Saved ${scores.length} scores` });
  } catch (err) { next(err); }
});

// ── Cash Book ──────────────────────────────────────────────────────────────

// GET /cashbook — list cashbooks for this school
router.get('/cashbook', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT cb.*, ay.name AS academic_year_name
       FROM primary_cashbooks cb
       LEFT JOIN academic_years ay ON ay.id = cb.academic_year_id
       WHERE cb.school_id = $1
       ORDER BY ay.name DESC NULLS LAST, cb.fund_source`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /cashbook — create cashbook
router.post('/cashbook', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id, fund_source, opening_balance, notes } = req.body;
    if (!fund_source) return res.status(400).json({ error: 'fund_source is required' });
    const { rows } = await pool.query(
      `INSERT INTO primary_cashbooks (school_id, academic_year_id, fund_source, opening_balance, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.schoolId, academic_year_id || null, fund_source, parseFloat(opening_balance) || 0, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A cashbook for this year and fund source already exists' });
    next(err);
  }
});

// GET /cashbook/:id/entries — list entries with optional ?month=YYYY-MM filter
router.get('/cashbook/:id/entries', adminOnly, async (req, res, next) => {
  try {
    const { month } = req.query;
    const params = [req.params.id, req.schoolId];
    let filter = '';
    if (month) {
      params.push(month);
      filter = `AND TO_CHAR(e.entry_date, 'YYYY-MM') = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT * FROM primary_cashbook_entries e
       WHERE e.cashbook_id = $1 AND e.school_id = $2 ${filter}
       ORDER BY e.entry_date, e.created_at`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /cashbook/:id/entries — add entry
router.post('/cashbook/:id/entries', adminOnly, async (req, res, next) => {
  try {
    const { rows: cb } = await pool.query(
      `SELECT id FROM primary_cashbooks WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!cb.length) return res.status(404).json({ error: 'Cashbook not found' });

    const { entry_date, entry_type, particulars, expenditure_head, voucher_ref, amount, receipt_data } = req.body;
    if (!entry_date || !entry_type || !particulars || !amount)
      return res.status(400).json({ error: 'entry_date, entry_type, particulars and amount are required' });
    if (!['receipt', 'payment'].includes(entry_type))
      return res.status(400).json({ error: 'entry_type must be receipt or payment' });

    const { rows } = await pool.query(
      `INSERT INTO primary_cashbook_entries
         (cashbook_id, school_id, entry_date, entry_type, particulars, expenditure_head, voucher_ref, amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, req.schoolId, entry_date, entry_type, particulars,
       expenditure_head || null, voucher_ref || null, parseFloat(amount)]
    );
    let entry = rows[0];

    if (receipt_data) {
      try {
        const receiptUrl = await uploadFile(receipt_data, `primary-cashbook-receipts/${req.schoolId}/${entry.id}`, { upsert: true });
        const { rows: updated } = await pool.query(
          `UPDATE primary_cashbook_entries SET receipt_url=$1 WHERE id=$2 RETURNING *`,
          [receiptUrl, entry.id]
        );
        entry = updated[0];
      } catch (e) { console.error('Receipt upload failed:', e.message); }
    }

    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// PUT /cashbook/:id/entries/:entryId — edit entry
router.put('/cashbook/:id/entries/:entryId', adminOnly, async (req, res, next) => {
  try {
    const { entry_date, entry_type, particulars, expenditure_head, voucher_ref, amount, receipt_data } = req.body;
    const { rows } = await pool.query(
      `UPDATE primary_cashbook_entries
         SET entry_date=$1, entry_type=$2, particulars=$3, expenditure_head=$4,
             voucher_ref=$5, amount=$6, updated_at=now()
       WHERE id=$7 AND cashbook_id=$8 AND school_id=$9 RETURNING *`,
      [entry_date, entry_type, particulars, expenditure_head || null,
       voucher_ref || null, parseFloat(amount),
       req.params.entryId, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    let entry = rows[0];

    if (receipt_data) {
      try {
        const receiptUrl = await uploadFile(receipt_data, `primary-cashbook-receipts/${req.schoolId}/${entry.id}`, { upsert: true });
        const { rows: updated } = await pool.query(
          `UPDATE primary_cashbook_entries SET receipt_url=$1 WHERE id=$2 RETURNING *`,
          [receiptUrl, entry.id]
        );
        entry = updated[0];
      } catch (e) { console.error('Receipt upload failed:', e.message); }
    }

    res.json(entry);
  } catch (err) { next(err); }
});

// DELETE /cashbook/:id/entries/:entryId — remove entry
router.delete('/cashbook/:id/entries/:entryId', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM primary_cashbook_entries WHERE id=$1 AND cashbook_id=$2 AND school_id=$3`,
      [req.params.entryId, req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Entry not found' });
    res.json({ message: 'Entry deleted' });
  } catch (err) { next(err); }
});

// GET /cashbook/:id/summary — totals by expenditure head (for accountability return)
router.get('/cashbook/:id/summary', adminOnly, async (req, res, next) => {
  try {
    const { rows: cb } = await pool.query(
      `SELECT cb.*, ay.name AS academic_year_name
       FROM primary_cashbooks cb
       LEFT JOIN academic_years ay ON ay.id = cb.academic_year_id
       WHERE cb.id=$1 AND cb.school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!cb.length) return res.status(404).json({ error: 'Cashbook not found' });

    const { rows: breakdown } = await pool.query(
      `SELECT entry_type, expenditure_head,
              SUM(amount)::NUMERIC(12,2) AS total, COUNT(*)::int AS count
       FROM primary_cashbook_entries
       WHERE cashbook_id=$1 AND school_id=$2
       GROUP BY entry_type, expenditure_head
       ORDER BY entry_type, expenditure_head`,
      [req.params.id, req.schoolId]
    );

    res.json({ cashbook: cb[0], breakdown });
  } catch (err) { next(err); }
});

module.exports = router;
