const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

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
    res.status(201).json(rows[0]);
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
    res.json(rows[0]);
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

    if (!class_name) {
      const { rows: ct } = await pool.query(
        `SELECT ct.class_name FROM primary_class_teachers ct
         JOIN academic_years ay ON ay.id=ct.academic_year_id
         WHERE ct.school_id=$1 AND ct.teacher_id=$2 AND ay.is_current=true LIMIT 1`,
        [req.schoolId, req.user.id]
      );
      if (!ct.length) return res.status(403).json({ error: 'No class assigned' });
      class_name = ct[0].class_name;
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

    if (!class_name) {
      const { rows: ct } = await pool.query(
        `SELECT ct.class_name FROM primary_class_teachers ct
         JOIN academic_years ay ON ay.id=ct.academic_year_id
         WHERE ct.school_id=$1 AND ct.teacher_id=$2 AND ay.is_current=true LIMIT 1`,
        [req.schoolId, req.user.id]
      );
      class_name = ct[0]?.class_name ?? null;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of records) {
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

    res.json({ message: `Attendance saved for ${records.length} students` });
  } catch (err) { next(err); }
});

// ── SCORES ────────────────────────────────────────────────────────────────────

// GET /api/primary/scores?term_id= (class_name auto-detected from teacher or passed explicitly)
router.get('/scores', async (req, res, next) => {
  try {
    let { class_name, term_id } = req.query;
    if (!term_id) return res.status(400).json({ error: 'term_id is required' });

    // If class_name not given, derive from teacher's current assignment
    if (!class_name) {
      const { rows: ct } = await pool.query(
        `SELECT ct.class_name FROM primary_class_teachers ct
         JOIN primary_terms t ON t.id=$2
         WHERE ct.school_id=$1 AND ct.teacher_id=$3 AND ct.academic_year_id=t.academic_year_id LIMIT 1`,
        [req.schoolId, term_id, req.user.id]
      );
      if (!ct.length) return res.status(403).json({ error: 'No class assigned for this teacher' });
      class_name = ct[0].class_name;
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

    // Auto-detect academic_year_id from term
    const { rows: termRows } = await pool.query(
      `SELECT academic_year_id FROM primary_terms WHERE id=$1 AND school_id=$2`,
      [term_id, req.schoolId]
    );
    if (!termRows.length) return res.status(404).json({ error: 'Term not found' });
    const academic_year_id = termRows[0].academic_year_id;

    const scale = await getGradeScale(req.schoolId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const s of scores) {
        const { student_id, class_score, exam_score } = s;
        if (!student_id) continue;
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
          [req.schoolId, student_id, subject_id /* from outer scope */, term_id, academic_year_id, cs, es, total, grade, req.user.id]
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

// ── TEACHER ATTENDANCE ────────────────────────────────────────────────────────

// GET /api/primary/teacher-attendance?date=
router.get('/teacher-attendance', async (req, res, next) => {
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

    if (!academic_year_id) {
      const { rows } = await pool.query(
        `SELECT academic_year_id FROM primary_terms WHERE id=$1 AND school_id=$2`,
        [term_id, req.schoolId]
      );
      academic_year_id = rows[0]?.academic_year_id;
    }
    if (!academic_year_id) return res.status(400).json({ error: 'Could not determine academic year' });

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
    const { rows } = await pool.query(
      `UPDATE primary_report_remarks
       SET status='submitted', class_teacher_submitted_at=now(), updated_at=now()
       WHERE id=$1 AND school_id=$2 AND status IN ('draft','rejected') RETURNING *`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Remark not found or already submitted' });
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

module.exports = router;
