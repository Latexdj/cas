const router = require('express').Router();
const pool   = require('../config/db');
const multer = require('multer');
const XLSX   = require('xlsx');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { uploadFile } = require('../services/storage.service');

router.use(authenticate, requireActiveSubscription, adminOnly);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM school_admission_settings WHERE school_id = $1`, [req.schoolId]
    );
    res.json(rows[0] ?? { school_id: req.schoolId, is_portal_open: false, next_sequence: 1,
      admission_prefix: 'STU', admission_year: new Date().getFullYear() % 100,
      portal_primary_color: '#16A34A', portal_accent_color: '#15803D' });
  } catch (err) { next(err); }
});

router.patch('/settings', async (req, res, next) => {
  try {
    const {
      portal_slug, admission_prefix, admission_year, is_portal_open, application_deadline,
      website_title, website_tagline, welcome_text,
      banner_image_data, portal_logo_data,
      contact_email, contact_phone, contact_address,
      portal_primary_color, portal_accent_color,
    } = req.body;

    let banner_image_url = null;
    let portal_logo_url  = null;
    if (banner_image_data) banner_image_url = await uploadFile(banner_image_data, `admissions/${req.schoolId}/banner`, { upsert: true });
    if (portal_logo_data)  portal_logo_url  = await uploadFile(portal_logo_data,  `admissions/${req.schoolId}/logo`,   { upsert: true });

    const { rows } = await pool.query(
      `INSERT INTO school_admission_settings
         (school_id, portal_slug, admission_prefix, admission_year, is_portal_open,
          application_deadline, website_title, website_tagline, welcome_text,
          banner_image_url, portal_logo_url, contact_email, contact_phone, contact_address,
          portal_primary_color, portal_accent_color, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
       ON CONFLICT (school_id) DO UPDATE SET
         portal_slug          = COALESCE(EXCLUDED.portal_slug,          school_admission_settings.portal_slug),
         admission_prefix     = COALESCE(EXCLUDED.admission_prefix,     school_admission_settings.admission_prefix),
         admission_year       = COALESCE(EXCLUDED.admission_year,       school_admission_settings.admission_year),
         is_portal_open       = COALESCE(EXCLUDED.is_portal_open,       school_admission_settings.is_portal_open),
         application_deadline = COALESCE(EXCLUDED.application_deadline, school_admission_settings.application_deadline),
         website_title        = COALESCE(EXCLUDED.website_title,        school_admission_settings.website_title),
         website_tagline      = COALESCE(EXCLUDED.website_tagline,      school_admission_settings.website_tagline),
         welcome_text         = COALESCE(EXCLUDED.welcome_text,         school_admission_settings.welcome_text),
         banner_image_url     = COALESCE(EXCLUDED.banner_image_url,     school_admission_settings.banner_image_url),
         portal_logo_url      = COALESCE(EXCLUDED.portal_logo_url,      school_admission_settings.portal_logo_url),
         contact_email        = COALESCE(EXCLUDED.contact_email,        school_admission_settings.contact_email),
         contact_phone        = COALESCE(EXCLUDED.contact_phone,        school_admission_settings.contact_phone),
         contact_address      = COALESCE(EXCLUDED.contact_address,      school_admission_settings.contact_address),
         portal_primary_color = COALESCE(EXCLUDED.portal_primary_color, school_admission_settings.portal_primary_color),
         portal_accent_color  = COALESCE(EXCLUDED.portal_accent_color,  school_admission_settings.portal_accent_color),
         updated_at           = now()
       RETURNING *`,
      [req.schoolId, portal_slug||null, admission_prefix||null,
       admission_year ? parseInt(admission_year) : null,
       is_portal_open !== undefined ? Boolean(is_portal_open) : null,
       application_deadline||null, website_title||null, website_tagline||null, welcome_text||null,
       banner_image_url, portal_logo_url,
       contact_email||null, contact_phone||null, contact_address||null,
       portal_primary_color||null, portal_accent_color||null]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Portal slug already taken by another school.' });
    next(err);
  }
});

// ── Placement list ─────────────────────────────────────────────────────────────

router.get('/placement', async (req, res, next) => {
  try {
    const { search, page = 1 } = req.query;
    const limit = 50, offset = (parseInt(page) - 1) * limit;
    const params = [req.schoolId];
    let where = 'WHERE school_id = $1';
    if (search) { params.push(`%${search}%`); where += ` AND (index_number ILIKE $${params.length} OR full_name ILIKE $${params.length})`; }
    const { rows } = await pool.query(
      `SELECT *, COUNT(*) OVER()::int AS total_count FROM admission_placement ${where}
       ORDER BY is_registered, uploaded_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    res.json({ data: rows, total: rows[0]?.total_count ?? 0 });
  } catch (err) { next(err); }
});

router.post('/placement/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const wb   = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

    let inserted = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row    = data[i];
      const idx    = String(row['IndexNo'] ?? row['Index No'] ?? row['indexno'] ?? '').trim().toUpperCase();
      const name   = String(row['FullName'] ?? row['Full Name'] ?? row['fullname'] ?? '').trim();
      const dobRaw = row['DOB'];
      const dob    = dobRaw ? (dobRaw instanceof Date ? dobRaw : new Date(dobRaw)) : null;
      const gender = String(row['Gender'] ?? '').trim();
      const agg    = row['Aggregate'] ? parseInt(row['Aggregate']) : null;
      const prog   = String(row['Programme'] ?? row['Program'] ?? '').trim();
      const res    = String(row['ResidentialStatus'] ?? row['Residential Status'] ?? '').trim();

      if (!idx || idx.length !== 12) {
        errors.push({ row: i + 2, message: `Invalid index number "${idx}" — must be 12 characters` });
        skipped++; continue;
      }
      try {
        await pool.query(
          `INSERT INTO admission_placement (school_id,index_number,full_name,date_of_birth,gender,aggregate,programme,residential_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (school_id,index_number) DO UPDATE SET
             full_name=EXCLUDED.full_name, date_of_birth=EXCLUDED.date_of_birth,
             gender=EXCLUDED.gender, aggregate=EXCLUDED.aggregate,
             programme=EXCLUDED.programme, residential_status=EXCLUDED.residential_status`,
          [req.schoolId, idx, name, dob && !isNaN(dob) ? dob : null, gender, agg, prog, res]
        );
        inserted++;
      } catch (e) { errors.push({ row: i + 2, message: e.message }); skipped++; }
    }
    res.json({ inserted, skipped, errors });
  } catch (err) { next(err); }
});

router.delete('/placement/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM admission_placement WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// ── Applications ──────────────────────────────────────────────────────────────

router.get('/applications', async (req, res, next) => {
  try {
    const { status, gender, program_id, house, residential_status, search, page = 1 } = req.query;
    const limit = 50, offset = (parseInt(page) - 1) * limit;
    const params = [req.schoolId];
    const conds  = ['a.school_id = $1'];

    if (status)             { params.push(status);             conds.push(`a.status = $${params.length}`); }
    if (gender)             { params.push(gender);             conds.push(`a.gender = $${params.length}`); }
    if (program_id)         { params.push(program_id);         conds.push(`a.program_id = $${params.length}::uuid`); }
    if (house)              { params.push(house);              conds.push(`a.house = $${params.length}`); }
    if (residential_status) { params.push(residential_status); conds.push(`a.residential_status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conds.push(`(a.full_name ILIKE $${params.length} OR a.index_number ILIKE $${params.length} OR a.admission_number ILIKE $${params.length})`);
    }

    const { rows } = await pool.query(
      `SELECT a.*, p.name AS program_name, COUNT(*) OVER()::int AS total_count
       FROM admission_applications a LEFT JOIN programs p ON p.id = a.program_id
       WHERE ${conds.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    res.json({ data: rows, total: rows[0]?.total_count ?? 0 });
  } catch (err) { next(err); }
});

router.get('/applications/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, p.name AS program_name FROM admission_applications a
       LEFT JOIN programs p ON p.id = a.program_id WHERE a.id=$1 AND a.school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/applications/:id', async (req, res, next) => {
  try {
    const allowed = ['status','house','program_id','full_name','residential_status','gender','mobile_number'];
    const sets = [], params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(key === 'program_id' ? (req.body[key] || null) : req.body[key]);
        sets.push(`${key} = $${params.length}${key === 'program_id' ? '::uuid' : ''}`);
        if (key === 'status' && req.body[key] === 'reported') sets.push('reported_at = now()');
      }
    }
    sets.push('updated_at = now()');
    if (params.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    const { rows } = await pool.query(
      `UPDATE admission_applications SET ${sets.join(',')} WHERE id=$${params.length+1} AND school_id=$${params.length+2} RETURNING *`,
      [...params, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/applications/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM admission_applications WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// ── Migration ─────────────────────────────────────────────────────────────────

async function migrateOne(client, app, defaultClass, schoolId) {
  const { rows: codeRows } = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(student_code FROM 2) AS INTEGER)), 0) + 1 AS next_num
     FROM students WHERE school_id = $1 AND student_code ~ '^S[0-9]+$'`,
    [schoolId]
  );
  const studentCode = `S${String(codeRows[0].next_num).padStart(3,'0')}`;
  const { rows } = await client.query(
    `INSERT INTO students (
       school_id, student_code, name, class_name, status, program_id,
       jhs_index_number, date_of_birth, gender, hometown, residential_address,
       ghana_card_number, nhia_number, mobile_number, aggregate,
       house, residential_status, religion, religious_denomination,
       guardian_name, guardian_occupation, guardian_mobile, picture_url
     ) VALUES ($1,$2,$3,$4,'Active',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     RETURNING id`,
    [schoolId, studentCode, app.full_name, defaultClass, app.program_id,
     app.index_number, app.date_of_birth, app.gender, app.hometown, app.residential_address,
     app.ghana_card_number, app.nhia_number, app.mobile_number, app.aggregate,
     app.house, app.residential_status, app.religion, app.religious_denomination,
     app.guardian_name, app.guardian_occupation, app.guardian_mobile, app.picture_url]
  );
  const studentId = rows[0].id;
  await client.query(
    `UPDATE admission_applications SET status='migrated', student_id=$1, migrated_at=now(), updated_at=now() WHERE id=$2`,
    [studentId, app.id]
  );
  return studentId;
}

router.post('/applications/migrate-bulk', async (req, res, next) => {
  try {
    const { default_class = '1' } = req.body;
    const { rows } = await pool.query(
      `SELECT * FROM admission_applications WHERE school_id=$1 AND status='reported' ORDER BY created_at`,
      [req.schoolId]
    );
    if (!rows.length) return res.json({ migrated: 0, skipped: 0, errors: [] });
    const client = await pool.connect();
    let migrated = 0, skipped = 0; const errors = [];
    try {
      await client.query('BEGIN');
      for (const app of rows) {
        try { await migrateOne(client, app, default_class, req.schoolId); migrated++; }
        catch (e) { errors.push({ id: app.id, name: app.full_name, error: e.message }); skipped++; }
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
    res.json({ migrated, skipped, errors });
  } catch (err) { next(err); }
});

router.post('/applications/:id/migrate', async (req, res, next) => {
  try {
    const { default_class = '1' } = req.body;
    const { rows } = await pool.query(
      `SELECT * FROM admission_applications WHERE id=$1 AND school_id=$2 AND status='reported'`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Application not found or not in reported status.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const studentId = await migrateOne(client, rows[0], default_class, req.schoolId);
      await client.query('COMMIT');
      res.json({ migrated: 1, student_id: studentId });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

// ── Stats & Reports ───────────────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const [apps, place] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status='pending')::int   AS pending,
                COUNT(*) FILTER (WHERE status='completed')::int AS completed,
                COUNT(*) FILTER (WHERE status='reported')::int  AS reported,
                COUNT(*) FILTER (WHERE status='migrated')::int  AS migrated
         FROM admission_applications WHERE school_id=$1`, [req.schoolId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total_placed,
                COUNT(*) FILTER (WHERE is_registered)::int AS total_registered
         FROM admission_placement WHERE school_id=$1`, [req.schoolId]
      ),
    ]);
    res.json({ ...apps.rows[0], ...place.rows[0] });
  } catch (err) { next(err); }
});

router.get('/reports', async (req, res, next) => {
  try {
    const [programs, genders, houses, residentials] = await Promise.all([
      pool.query(
        `SELECT p.name AS label, COUNT(a.id)::int AS count
         FROM programs p LEFT JOIN admission_applications a ON a.program_id=p.id AND a.school_id=$1 AND a.status!='pending'
         WHERE p.school_id=$1 GROUP BY p.name ORDER BY count DESC`, [req.schoolId]
      ),
      pool.query(
        `SELECT COALESCE(gender,'Unknown') AS label, COUNT(*)::int AS count
         FROM admission_applications WHERE school_id=$1 AND status!='pending' GROUP BY gender`, [req.schoolId]
      ),
      pool.query(
        `SELECT COALESCE(house,'Unassigned') AS label, COUNT(*)::int AS count
         FROM admission_applications WHERE school_id=$1 AND status!='pending' GROUP BY house ORDER BY count DESC`, [req.schoolId]
      ),
      pool.query(
        `SELECT COALESCE(residential_status,'Unknown') AS label, COUNT(*)::int AS count
         FROM admission_applications WHERE school_id=$1 AND status!='pending' GROUP BY residential_status`, [req.schoolId]
      ),
    ]);
    res.json({ programs: programs.rows, genders: genders.rows, houses: houses.rows, residentials: residentials.rows });
  } catch (err) { next(err); }
});

// ── Prospectus ────────────────────────────────────────────────────────────────

router.get('/prospectus', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ap.*, p.name AS program_name FROM admission_prospectus ap
       LEFT JOIN programs p ON p.id = ap.program_id
       WHERE ap.school_id=$1 ORDER BY p.name NULLS LAST, ap.gender, ap.residential_status`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/prospectus', async (req, res, next) => {
  try {
    const { program_id, gender = 'All', residential_status = 'All', file_data, file_name } = req.body;
    if (!file_data || !file_name) return res.status(400).json({ error: 'file_data and file_name are required' });
    const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const file_url = await uploadFile(file_data, `admissions/${req.schoolId}/prospectus/${Date.now()}_${safeName}`, { upsert: false });
    const { rows } = await pool.query(
      `INSERT INTO admission_prospectus (school_id, program_id, gender, residential_status, file_url, file_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.schoolId, program_id||null, gender, residential_status, file_url, file_name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A prospectus already exists for this combination. Delete the existing one first.' });
    next(err);
  }
});

router.delete('/prospectus/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM admission_prospectus WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
