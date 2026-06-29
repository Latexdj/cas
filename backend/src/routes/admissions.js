const router = require('express').Router();
const pool   = require('../config/db');
const { uploadFile } = require('../services/storage.service');

async function getSchoolBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT s.id AS school_id, s.name AS school_name, s.logo_url, s.primary_color, s.accent_color,
            a.portal_slug, a.is_portal_open, a.application_deadline,
            a.website_title, a.website_tagline, a.welcome_text,
            a.banner_image_url, a.portal_logo_url,
            a.contact_email, a.contact_phone, a.contact_address,
            a.portal_primary_color, a.portal_accent_color,
            a.admission_prefix, a.admission_year
     FROM school_admission_settings a
     JOIN schools s ON s.id = a.school_id
     WHERE a.portal_slug = $1`,
    [slug]
  );
  return rows[0] || null;
}

async function generateAdmissionNumber(schoolId, client) {
  const { rows } = await client.query(
    `UPDATE school_admission_settings
     SET next_sequence = next_sequence + 1, updated_at = now()
     WHERE school_id = $1
     RETURNING next_sequence - 1 AS seq, admission_prefix, admission_year`,
    [schoolId]
  );
  if (!rows.length) throw new Error('Admission settings not found');
  const { seq, admission_prefix, admission_year } = rows[0];
  return `${admission_prefix}${String(seq).padStart(4,'0')}${String(admission_year).padStart(2,'0')}`;
}

async function assignHouse(schoolId, gender, residentialStatus, programId) {
  const { rows: houses } = await pool.query(
    `SELECT name FROM houses WHERE school_id = $1 ORDER BY name`,
    [schoolId]
  );
  if (!houses.length) return null;

  const { rows: counts } = await pool.query(
    `SELECT house,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE program_id = $4)::int AS prog_count
     FROM admission_applications
     WHERE school_id = $1
       AND LOWER(gender) = LOWER($2)
       AND LOWER(residential_status) = LOWER($3)
       AND status != 'pending'
       AND house IS NOT NULL
     GROUP BY house`,
    [schoolId, gender, residentialStatus, programId]
  );

  const total = {}, prog = {};
  for (const r of counts) { total[r.house] = r.total; prog[r.house] = r.prog_count; }

  let best = null, bestScore = Infinity;
  for (const h of houses) {
    const score = (total[h.name] ?? 0) + 0.3 * (prog[h.name] ?? 0);
    if (score < bestScore) { bestScore = score; best = h.name; }
  }
  return best;
}

// GET /api/admissions/:slug
router.get('/:slug', async (req, res, next) => {
  try {
    const school = await getSchoolBySlug(req.params.slug);
    if (!school) return res.status(404).json({ error: 'Portal not found' });
    const { rows: programs } = await pool.query(
      `SELECT id, name FROM programs WHERE school_id = $1 ORDER BY name`,
      [school.school_id]
    );
    res.json({ ...school, programs });
  } catch (err) { next(err); }
});

// POST /api/admissions/:slug/check  { index_number }
router.post('/:slug/check', async (req, res, next) => {
  try {
    const school = await getSchoolBySlug(req.params.slug);
    if (!school) return res.status(404).json({ error: 'Portal not found' });
    if (!school.is_portal_open) return res.status(403).json({ error: 'Admission portal is currently closed.' });

    const idx = String(req.body.index_number ?? '').trim().toUpperCase();
    if (idx.length !== 12) return res.status(400).json({ error: 'Index number must be exactly 12 characters.' });

    const { rows: placed } = await pool.query(
      `SELECT * FROM admission_placement WHERE school_id = $1 AND index_number = $2`,
      [school.school_id, idx]
    );
    if (!placed.length) {
      return res.status(404).json({ error: 'Your index number was not found on the placement list. Please contact the school admissions office.' });
    }

    const { rows: existing } = await pool.query(
      `SELECT form_token, status, form_step FROM admission_applications WHERE school_id = $1 AND index_number = $2`,
      [school.school_id, idx]
    );
    if (existing.length) {
      const app = existing[0];
      if (['completed','reported','migrated'].includes(app.status)) {
        return res.json({ already_submitted: true, token: app.form_token, status: app.status });
      }
      return res.json({ resume: true, token: app.form_token, form_step: app.form_step });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const admissionNumber = await generateAdmissionNumber(school.school_id, client);
      const placement = placed[0];
      const { rows } = await client.query(
        `INSERT INTO admission_applications
           (school_id, index_number, admission_number, full_name, date_of_birth, gender, aggregate, residential_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING form_token, form_step`,
        [school.school_id, idx, admissionNumber,
         placement.full_name, placement.date_of_birth,
         placement.gender, placement.aggregate, placement.residential_status]
      );
      await client.query(
        `UPDATE admission_placement SET is_registered = true WHERE school_id = $1 AND index_number = $2`,
        [school.school_id, idx]
      );
      await client.query('COMMIT');
      res.json({ token: rows[0].form_token, form_step: rows[0].form_step, placement });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

// GET /api/admissions/:slug/apply/:token
router.get('/:slug/apply/:token', async (req, res, next) => {
  try {
    const school = await getSchoolBySlug(req.params.slug);
    if (!school) return res.status(404).json({ error: 'Portal not found' });
    const { rows } = await pool.query(
      `SELECT a.*, p.name AS program_name
       FROM admission_applications a LEFT JOIN programs p ON p.id = a.program_id
       WHERE a.form_token = $1 AND a.school_id = $2`,
      [req.params.token, school.school_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Application not found' });
    res.json({ ...rows[0], school });
  } catch (err) { next(err); }
});

// PATCH /api/admissions/:slug/apply/:token
router.patch('/:slug/apply/:token', async (req, res, next) => {
  try {
    const school = await getSchoolBySlug(req.params.slug);
    if (!school) return res.status(404).json({ error: 'Portal not found' });
    const { rows: chk } = await pool.query(
      `SELECT id, status FROM admission_applications WHERE form_token = $1 AND school_id = $2`,
      [req.params.token, school.school_id]
    );
    if (!chk.length) return res.status(404).json({ error: 'Application not found' });
    if (['completed','reported','migrated'].includes(chk[0].status)) {
      return res.status(400).json({ error: 'Application already submitted.' });
    }

    const f = req.body;
    await pool.query(
      `UPDATE admission_applications SET
        full_name              = COALESCE($1,  full_name),
        date_of_birth          = COALESCE($2,  date_of_birth),
        gender                 = COALESCE($3,  gender),
        hometown               = COALESCE($4,  hometown),
        residential_address    = COALESCE($5,  residential_address),
        mobile_number          = COALESCE($6,  mobile_number),
        ghana_card_number      = COALESCE($7,  ghana_card_number),
        nhia_number            = COALESCE($8,  nhia_number),
        aggregate              = COALESCE($9::int,  aggregate),
        residential_status     = COALESCE($10, residential_status),
        religion               = COALESCE($11, religion),
        religious_denomination = COALESCE($12, religious_denomination),
        guardian_name          = COALESCE($13, guardian_name),
        guardian_relationship  = COALESCE($14, guardian_relationship),
        guardian_occupation    = COALESCE($15, guardian_occupation),
        guardian_mobile        = COALESCE($16, guardian_mobile),
        program_id             = COALESCE($17::uuid, program_id),
        form_step              = GREATEST(form_step, COALESCE($18::int, form_step)),
        updated_at             = now()
       WHERE form_token = $19 AND school_id = $20`,
      [f.full_name||null, f.date_of_birth||null, f.gender||null,
       f.hometown||null, f.residential_address||null, f.mobile_number||null,
       f.ghana_card_number||null, f.nhia_number||null,
       f.aggregate!=null ? String(f.aggregate) : null,
       f.residential_status||null, f.religion||null, f.religious_denomination||null,
       f.guardian_name||null, f.guardian_relationship||null,
       f.guardian_occupation||null, f.guardian_mobile||null,
       f.program_id||null, f.form_step!=null ? String(f.form_step) : null,
       req.params.token, school.school_id]
    );
    const { rows } = await pool.query(
      `SELECT a.*, p.name AS program_name FROM admission_applications a
       LEFT JOIN programs p ON p.id = a.program_id WHERE a.form_token = $1`,
      [req.params.token]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/admissions/:slug/apply/:token/submit
router.post('/:slug/apply/:token/submit', async (req, res, next) => {
  try {
    const school = await getSchoolBySlug(req.params.slug);
    if (!school) return res.status(404).json({ error: 'Portal not found' });
    const { rows } = await pool.query(
      `SELECT * FROM admission_applications WHERE form_token = $1 AND school_id = $2`,
      [req.params.token, school.school_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Application not found' });
    const app = rows[0];
    if (app.status !== 'pending') return res.status(400).json({ error: 'Already submitted.' });
    if (!app.full_name || !app.gender || !app.residential_status || !app.program_id) {
      return res.status(400).json({ error: 'Please complete all required fields before submitting.' });
    }

    const house = await assignHouse(school.school_id, app.gender, app.residential_status, app.program_id);
    await pool.query(
      `UPDATE admission_applications
       SET status='completed', house=$1, form_step=5, form_completed_at=now(), updated_at=now()
       WHERE form_token=$2`,
      [house, req.params.token]
    );
    const { rows: updated } = await pool.query(
      `SELECT a.*, p.name AS program_name FROM admission_applications a
       LEFT JOIN programs p ON p.id = a.program_id WHERE a.form_token = $1`,
      [req.params.token]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

// POST /api/admissions/:slug/apply/:token/upload
router.post('/:slug/apply/:token/upload', async (req, res, next) => {
  try {
    const school = await getSchoolBySlug(req.params.slug);
    if (!school) return res.status(404).json({ error: 'Portal not found' });
    const { rows } = await pool.query(
      `SELECT id FROM admission_applications WHERE form_token=$1 AND school_id=$2`,
      [req.params.token, school.school_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Application not found' });
    const id = rows[0].id;

    const { picture_data, bece_data } = req.body;
    const sets = {}, vals = [];

    if (picture_data) {
      vals.push(await uploadFile(picture_data, `admissions/${id}/picture`, { upsert: true }));
      sets.picture_url = `$${vals.length}`;
    }
    if (bece_data) {
      vals.push(await uploadFile(bece_data, `admissions/${id}/bece`, { upsert: true }));
      sets.bece_results_url = `$${vals.length}`;
    }
    if (Object.keys(sets).length) {
      const setClauses = Object.entries(sets).map(([k,v]) => `${k} = ${v}`).join(', ');
      vals.push(req.params.token);
      await pool.query(`UPDATE admission_applications SET ${setClauses}, updated_at=now() WHERE form_token=$${vals.length}`, vals);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/admissions/:slug/apply/:token/prospectus
router.get('/:slug/apply/:token/prospectus', async (req, res, next) => {
  try {
    const school = await getSchoolBySlug(req.params.slug);
    if (!school) return res.status(404).json({ error: 'Portal not found' });
    const { rows } = await pool.query(
      `SELECT program_id, gender, residential_status FROM admission_applications WHERE form_token=$1 AND school_id=$2`,
      [req.params.token, school.school_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Application not found' });
    const { program_id, gender, residential_status } = rows[0];

    const { rows: p } = await pool.query(
      `SELECT file_url, file_name FROM admission_prospectus
       WHERE school_id = $1
         AND (program_id = $2 OR program_id IS NULL)
         AND (gender = $3 OR gender = 'All')
         AND (residential_status = $4 OR residential_status = 'All')
       ORDER BY (program_id = $2)::int DESC, (gender = $3)::int DESC, (residential_status = $4)::int DESC
       LIMIT 1`,
      [school.school_id, program_id, gender, residential_status]
    );
    if (!p.length) return res.status(404).json({ error: 'No prospectus available for your program. Please collect from the school.' });
    res.json(p[0]);
  } catch (err) { next(err); }
});

module.exports = router;
