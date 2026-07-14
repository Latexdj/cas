const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// ── GET /api/departments ─────────────────────────────────────────────────────
router.get('/', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        d.id, d.name, d.clearance_enabled, d.created_at,
        d.head_teacher_id,
        t.name  AS head_name,
        t.teacher_code AS head_code,
        t.photo_url AS head_photo,
        COUNT(DISTINCT dt.teacher_id)::int AS staff_count,
        (SELECT COUNT(*)::int FROM department_subjects ds WHERE ds.department_id = d.id AND ds.school_id = d.school_id) AS subject_count
      FROM departments d
      LEFT JOIN teachers t  ON t.id = d.head_teacher_id
      LEFT JOIN department_teachers dt ON dt.department_id = d.id
      WHERE d.school_id = $1
      GROUP BY d.id, t.name, t.teacher_code, t.photo_url
      ORDER BY d.name
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/departments ────────────────────────────────────────────────────
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Department name is required' });
    const { rows } = await pool.query(
      `INSERT INTO departments (school_id, name)
       VALUES ($1, $2)
       RETURNING id, name, clearance_enabled, head_teacher_id, created_at`,
      [req.schoolId, name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A department with that name already exists' });
    next(err);
  }
});

// ── GET /api/departments/subjects ────────────────────────────────────────────
router.get('/subjects', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT ds.id, ds.subject, ds.department_id, d.name AS department_name
      FROM department_subjects ds
      JOIN departments d ON d.id = ds.department_id
      WHERE ds.school_id = $1
      ORDER BY ds.subject
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/departments/subjects/timetable ───────────────────────────────────
// All distinct timetable subjects with their current department assignment
router.get('/subjects/timetable', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        tt.subject,
        ds.department_id,
        d.name AS department_name
      FROM (
        SELECT DISTINCT LOWER(subject) AS subject_key, MIN(subject) AS subject
        FROM timetable WHERE school_id = $1
        GROUP BY LOWER(subject)
      ) tt
      LEFT JOIN department_subjects ds
        ON ds.school_id = $1 AND LOWER(ds.subject) = tt.subject_key
      LEFT JOIN departments d ON d.id = ds.department_id
      ORDER BY tt.subject
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/departments/subjects/seed ──────────────────────────────────────
// Auto-assign each timetable subject to the department its most common teacher belongs to
router.post('/subjects/seed', adminOnly, async (req, res, next) => {
  try {
    const { rows: suggestions } = await pool.query(`
      SELECT
        MIN(tt.subject) AS subject,
        MODE() WITHIN GROUP (ORDER BY te.department) AS dept_name
      FROM (
        SELECT DISTINCT LOWER(subject) AS subject_key, subject, teacher_id
        FROM timetable WHERE school_id = $1
      ) tt
      JOIN teachers te ON te.id = tt.teacher_id AND te.school_id = $1
      WHERE te.department IS NOT NULL
      GROUP BY tt.subject_key
    `, [req.schoolId]);

    let seeded = 0;
    for (const row of suggestions) {
      const { rows: dRows } = await pool.query(
        `SELECT id FROM departments WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [req.schoolId, row.dept_name]
      );
      if (!dRows.length) continue;
      await pool.query(
        `INSERT INTO department_subjects (school_id, department_id, subject)
         VALUES ($1, $2, $3)
         ON CONFLICT (school_id, subject) DO NOTHING`,
        [req.schoolId, dRows[0].id, row.subject]
      );
      seeded++;
    }
    res.json({ message: `Seeded ${seeded} subject(s).`, seeded });
  } catch (err) { next(err); }
});

// ── PUT /api/departments/:id ─────────────────────────────────────────────────
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Department name is required' });

    const { rows } = await pool.query(
      `UPDATE departments SET name = $1, updated_at = now()
       WHERE id = $2 AND school_id = $3
       RETURNING id, name, clearance_enabled, head_teacher_id`,
      [name.trim(), req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Department not found' });

    // Sync teachers' department text field
    await pool.query(
      `UPDATE teachers SET department = $1
       WHERE school_id = $2 AND id IN (
         SELECT teacher_id FROM department_teachers WHERE department_id = $3
       )`,
      [name.trim(), req.schoolId, req.params.id]
    );
    // Also sync the HOD if set
    if (rows[0].head_teacher_id) {
      await pool.query(
        `UPDATE teachers SET department = $1 WHERE id = $2 AND school_id = $3`,
        [name.trim(), rows[0].head_teacher_id, req.schoolId]
      );
    }

    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A department with that name already exists' });
    next(err);
  }
});

// ── DELETE /api/departments/:id ──────────────────────────────────────────────
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    // Remove clearance office that was auto-created for this department (if any)
    await pool.query(
      `DELETE FROM clearance_offices
       WHERE school_id = $1 AND office_type = 'hod'
         AND name = (SELECT name FROM departments WHERE id = $2 AND school_id = $1)`,
      [req.schoolId, req.params.id]
    );
    const { rowCount } = await pool.query(
      `DELETE FROM departments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Department not found' });
    res.json({ message: 'Department deleted' });
  } catch (err) { next(err); }
});

// ── GET /api/departments/:id/teachers ────────────────────────────────────────
router.get('/:id/teachers', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.id, t.teacher_code, t.name, t.email, t.department, t.status, t.photo_url,
             (d.head_teacher_id = t.id) AS is_head
      FROM department_teachers dt
      JOIN teachers t ON t.id = dt.teacher_id
      JOIN departments d ON d.id = dt.department_id
      WHERE dt.department_id = $1 AND dt.school_id = $2
      ORDER BY t.name
    `, [req.params.id, req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/departments/:id/teachers ───────────────────────────────────────
router.post('/:id/teachers', adminOnly, async (req, res, next) => {
  try {
    const { teacher_id } = req.body;
    if (!teacher_id) return res.status(400).json({ error: 'teacher_id is required' });

    // Get department name to sync teacher.department
    const { rows: dRows } = await pool.query(
      `SELECT name FROM departments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!dRows.length) return res.status(404).json({ error: 'Department not found' });

    await pool.query(
      `INSERT INTO department_teachers (department_id, teacher_id, school_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [req.params.id, teacher_id, req.schoolId]
    );
    // Sync teacher's department text field
    await pool.query(
      `UPDATE teachers SET department = $1 WHERE id = $2 AND school_id = $3`,
      [dRows[0].name, teacher_id, req.schoolId]
    );
    res.status(201).json({ message: 'Teacher added to department' });
  } catch (err) { next(err); }
});

// ── DELETE /api/departments/:id/teachers/:teacherId ──────────────────────────
router.delete('/:id/teachers/:teacherId', adminOnly, async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM department_teachers
       WHERE department_id = $1 AND teacher_id = $2 AND school_id = $3`,
      [req.params.id, req.params.teacherId, req.schoolId]
    );
    res.json({ message: 'Teacher removed from department' });
  } catch (err) { next(err); }
});

// ── PUT /api/departments/:id/head ────────────────────────────────────────────
// Assign (or replace) the HOD for a department.
// Body: { teacher_id, clearance_enabled }
router.put('/:id/head', adminOnly, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { teacher_id, clearance_enabled = false } = req.body;
    if (!teacher_id) return res.status(400).json({ error: 'teacher_id is required' });

    await client.query('BEGIN');

    // Get current department state
    const { rows: dRows } = await client.query(
      `SELECT id, name, head_teacher_id, clearance_enabled FROM departments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!dRows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Department not found' }); }
    const dept = dRows[0];

    // Verify teacher belongs to this school
    const { rows: tRows } = await client.query(
      `SELECT id, name FROM teachers WHERE id = $1 AND school_id = $2`,
      [teacher_id, req.schoolId]
    );
    if (!tRows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Teacher not found' }); }

    // Update head on departments table
    await client.query(
      `UPDATE departments SET head_teacher_id = $1, clearance_enabled = $2, updated_at = now()
       WHERE id = $3 AND school_id = $4`,
      [teacher_id, clearance_enabled, req.params.id, req.schoolId]
    );

    // Also ensure the new HOD is in department_teachers
    await client.query(
      `INSERT INTO department_teachers (department_id, teacher_id, school_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [req.params.id, teacher_id, req.schoolId]
    );

    // Sync teacher.department text field for new HOD
    await client.query(
      `UPDATE teachers SET department = $1 WHERE id = $2 AND school_id = $3`,
      [dept.name, teacher_id, req.schoolId]
    );

    // ── Clearance office sync ─────────────────────────────────────────────────
    // We manage ONE clearance office per department (name matches department name)
    if (clearance_enabled) {
      // Upsert the clearance office for this department
      const { rows: offRows } = await client.query(
        `INSERT INTO clearance_offices (school_id, name, office_type, sort_order)
         VALUES ($1, $2, 'hod', 99)
         ON CONFLICT (school_id, name) DO UPDATE SET office_type = 'hod', is_active = true
         RETURNING id`,
        [req.schoolId, dept.name]
      );
      const officeId = offRows[0].id;

      // Remove old HOD from this office (if different)
      if (dept.head_teacher_id && dept.head_teacher_id !== teacher_id) {
        await client.query(
          `DELETE FROM clearance_office_staff WHERE office_id = $1 AND teacher_id = $2`,
          [officeId, dept.head_teacher_id]
        );
      }
      // Add new HOD to the office
      await client.query(
        `INSERT INTO clearance_office_staff (school_id, office_id, teacher_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [req.schoolId, officeId, teacher_id]
      );
    } else {
      // clearance disabled — remove teacher from any HOD clearance office for this dept
      await client.query(
        `DELETE FROM clearance_office_staff cos
         USING clearance_offices co
         WHERE co.id = cos.office_id
           AND co.school_id = $1
           AND co.name = $2
           AND co.office_type = 'hod'
           AND cos.teacher_id = $3`,
        [req.schoolId, dept.name, teacher_id]
      );
      // Also deactivate the clearance office if no other staff remain
      await client.query(
        `UPDATE clearance_offices SET is_active = false
         WHERE school_id = $1 AND name = $2 AND office_type = 'hod'
           AND NOT EXISTS (
             SELECT 1 FROM clearance_office_staff cos2
             WHERE cos2.office_id = clearance_offices.id
           )`,
        [req.schoolId, dept.name]
      );
    }

    await client.query('COMMIT');

    const { rows: result } = await pool.query(
      `SELECT d.id, d.name, d.clearance_enabled, d.head_teacher_id,
              t.name AS head_name, t.teacher_code AS head_code
       FROM departments d LEFT JOIN teachers t ON t.id = d.head_teacher_id
       WHERE d.id = $1`,
      [req.params.id]
    );
    res.json(result[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// ── POST /api/departments/:id/subjects ───────────────────────────────────────
// Assign (or reassign) a subject to this department. UPSERT: moves subject if in another dept.
router.post('/:id/subjects', adminOnly, async (req, res, next) => {
  try {
    const { subject } = req.body;
    if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });

    const { rows: dRows } = await pool.query(
      `SELECT id FROM departments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!dRows.length) return res.status(404).json({ error: 'Department not found' });

    await pool.query(
      `INSERT INTO department_subjects (school_id, department_id, subject)
       VALUES ($1, $2, $3)
       ON CONFLICT (school_id, subject) DO UPDATE SET department_id = EXCLUDED.department_id`,
      [req.schoolId, req.params.id, subject.trim()]
    );
    res.status(201).json({ message: 'Subject assigned to department.' });
  } catch (err) { next(err); }
});

// ── DELETE /api/departments/:id/subjects/:subject ────────────────────────────
router.delete('/:id/subjects/:subject', adminOnly, async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM department_subjects
       WHERE school_id = $1 AND department_id = $2 AND LOWER(subject) = LOWER($3)`,
      [req.schoolId, req.params.id, decodeURIComponent(req.params.subject)]
    );
    res.json({ message: 'Subject removed.' });
  } catch (err) { next(err); }
});

// ── DELETE /api/departments/:id/head ─────────────────────────────────────────
router.delete('/:id/head', adminOnly, async (req, res, next) => {
  try {
    const { rows: dRows } = await pool.query(
      `SELECT name, head_teacher_id FROM departments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!dRows.length) return res.status(404).json({ error: 'Department not found' });
    const { name, head_teacher_id } = dRows[0];

    if (head_teacher_id) {
      // Remove from clearance office
      await pool.query(
        `DELETE FROM clearance_office_staff cos
         USING clearance_offices co
         WHERE co.id = cos.office_id
           AND co.school_id = $1 AND co.name = $2 AND co.office_type = 'hod'
           AND cos.teacher_id = $3`,
        [req.schoolId, name, head_teacher_id]
      );
    }

    await pool.query(
      `UPDATE departments SET head_teacher_id = NULL, clearance_enabled = false, updated_at = now()
       WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    res.json({ message: 'HOD removed' });
  } catch (err) { next(err); }
});

module.exports = router;
