const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const pool    = require('../config/db');
const { authenticate, requireActiveSubscription, adminOnly } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription, adminOnly);

// ── Clearance Offices ─────────────────────────────────────────────────────────

// GET /api/clearance-admin/offices
router.get('/offices', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT co.id, co.name, co.office_type, co.linked_programme_id,
              p.name AS linked_programme_name,
              co.linked_house, co.sort_order, co.is_active,
              COUNT(cos.id)::int AS staff_count
       FROM clearance_offices co
       LEFT JOIN programs p ON p.id = co.linked_programme_id
       LEFT JOIN clearance_office_staff cos ON cos.office_id = co.id
       WHERE co.school_id = $1
       GROUP BY co.id, p.name
       ORDER BY co.sort_order, co.name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/clearance-admin/offices
router.post('/offices', async (req, res, next) => {
  try {
    const { name, office_type = 'general', linked_programme_id, linked_house, sort_order = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO clearance_offices (school_id, name, office_type, linked_programme_id, linked_house, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.schoolId, name.trim(), office_type, linked_programme_id || null, linked_house || null, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An office with this name already exists' });
    next(err);
  }
});

// PUT /api/clearance-admin/offices/:id
router.put('/offices/:id', async (req, res, next) => {
  try {
    const { name, office_type, linked_programme_id, linked_house, sort_order, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE clearance_offices
       SET name                = COALESCE($1, name),
           office_type         = COALESCE($2, office_type),
           linked_programme_id = $3,
           linked_house        = $4,
           sort_order          = COALESCE($5, sort_order),
           is_active           = COALESCE($6, is_active)
       WHERE id = $7 AND school_id = $8
       RETURNING *`,
      [name?.trim() || null, office_type || null,
       linked_programme_id || null, linked_house || null,
       sort_order ?? null, is_active ?? null,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Office not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An office with this name already exists' });
    next(err);
  }
});

// DELETE /api/clearance-admin/offices/:id
router.delete('/offices/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM clearance_offices WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Office not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Office Staff Assignments ──────────────────────────────────────────────────

// GET /api/clearance-admin/offices/:id/staff
router.get('/offices/:id/staff', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT cos.id, cos.teacher_id, cos.school_staff_id,
              t.name AS teacher_name, t.teacher_code,
              ss.name AS school_staff_name, ss.email AS school_staff_email
       FROM clearance_office_staff cos
       LEFT JOIN teachers t ON t.id = cos.teacher_id
       LEFT JOIN school_staff ss ON ss.id = cos.school_staff_id
       WHERE cos.office_id = $1 AND cos.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/clearance-admin/offices/:id/staff
router.post('/offices/:id/staff', async (req, res, next) => {
  try {
    const { teacher_id, school_staff_id } = req.body;
    if (!teacher_id && !school_staff_id) {
      return res.status(400).json({ error: 'teacher_id or school_staff_id required' });
    }
    const { rows: officeRows } = await pool.query(
      `SELECT id FROM clearance_offices WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!officeRows.length) return res.status(404).json({ error: 'Office not found' });

    const { rows } = await pool.query(
      `INSERT INTO clearance_office_staff (school_id, office_id, teacher_id, school_staff_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.schoolId, req.params.id, teacher_id || null, school_staff_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This staff member is already assigned to this office' });
    next(err);
  }
});

// DELETE /api/clearance-admin/offices/:officeId/staff/:assignmentId
router.delete('/offices/:officeId/staff/:assignmentId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM clearance_office_staff
       WHERE id = $1 AND office_id = $2 AND school_id = $3 RETURNING id`,
      [req.params.assignmentId, req.params.officeId, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Non-Teaching Clearance Staff Accounts (now backed by school_staff) ────────

// GET /api/clearance-admin/staff
router.get('/staff', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ss.id, ss.name, ss.email, ss.is_active, ss.created_at,
              ARRAY_AGG(co.name ORDER BY co.name) FILTER (WHERE co.id IS NOT NULL) AS offices
       FROM school_staff ss
       JOIN school_staff_roles ssr ON ssr.staff_id = ss.id AND ssr.role = 'clearance'
       LEFT JOIN clearance_office_staff cos ON cos.school_staff_id = ss.id
       LEFT JOIN clearance_offices co ON co.id = cos.office_id
       WHERE ss.school_id = $1
       GROUP BY ss.id
       ORDER BY ss.name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/clearance-admin/staff
router.post('/staff', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'name, email and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = await bcrypt.hash(String(password), 12);
    const { rows } = await pool.query(
      `INSERT INTO school_staff (school_id, name, email, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, is_active, created_at`,
      [req.schoolId, name.trim(), email.trim().toLowerCase(), hash]
    );
    await pool.query(
      `INSERT INTO school_staff_roles (staff_id, school_id, role) VALUES ($1, $2, 'clearance') ON CONFLICT DO NOTHING`,
      [rows[0].id, req.schoolId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A staff account with this email already exists' });
    next(err);
  }
});

// PUT /api/clearance-admin/staff/:id
router.put('/staff/:id', async (req, res, next) => {
  try {
    const { name, email, password, is_active } = req.body;
    let hash;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      hash = await bcrypt.hash(String(password), 12);
    }
    const { rows } = await pool.query(
      `UPDATE school_staff
       SET name          = COALESCE($1, name),
           email         = COALESCE($2, email),
           password_hash = COALESCE($3, password_hash),
           is_active     = COALESCE($4, is_active)
       WHERE id = $5 AND school_id = $6
       RETURNING id, name, email, is_active, created_at`,
      [name?.trim() || null, email?.trim().toLowerCase() || null,
       hash || null, is_active ?? null,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Staff not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    next(err);
  }
});

// DELETE /api/clearance-admin/staff/:id
router.delete('/staff/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM school_staff WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Staff not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Batch Clearance Initiation ────────────────────────────────────────────────

// GET /api/clearance-admin/classes  — distinct class names of active students
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

// POST /api/clearance-admin/initiate  — start clearance for a batch (class names)
// body: { class_names: string[] }
router.post('/initiate', async (req, res, next) => {
  try {
    const { class_names } = req.body;
    if (!Array.isArray(class_names) || class_names.length === 0) {
      return res.status(400).json({ error: 'class_names array is required' });
    }

    // Two parallel queries — no per-student DB calls
    const [{ rows: offices }, { rows: students }] = await Promise.all([
      pool.query(
        `SELECT id, office_type, linked_programme_id, linked_house
         FROM clearance_offices WHERE school_id = $1 AND is_active = true`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT id, program_id, house FROM students
         WHERE school_id = $1 AND status = 'Active' AND class_name = ANY($2)`,
        [req.schoolId, class_names]
      ),
    ]);

    if (offices.length === 0)
      return res.status(400).json({ error: 'No active clearance offices configured' });
    if (students.length === 0)
      return res.status(400).json({ error: 'No active students found in the selected classes' });

    // Compute applicable offices per student in JS — zero DB calls
    const studentOfficeMap = new Map(); // studentId → officeId[]
    for (const student of students) {
      const applicable = offices.filter(o => {
        if (o.office_type === 'hod')
          return !o.linked_programme_id || o.linked_programme_id === student.program_id;
        if (o.office_type === 'housemaster')
          return !o.linked_house || o.linked_house.toLowerCase() === (student.house ?? '').toLowerCase();
        return true;
      });
      if (applicable.length > 0) studentOfficeMap.set(student.id, applicable.map(o => o.id));
    }

    const eligibleIds = [...studentOfficeMap.keys()];
    const skippedNoOffice = students.length - eligibleIds.length;
    if (eligibleIds.length === 0)
      return res.json({ initiated: 0, skipped: skippedNoOffice, total: students.length });

    // Find which already have clearance records
    const idList  = eligibleIds.map((_, i) => `$${i + 2}`).join(',');
    const { rows: existing } = await pool.query(
      `SELECT id, student_id FROM student_clearances WHERE school_id = $1 AND student_id IN (${idList})`,
      [req.schoolId, ...eligibleIds]
    );
    const clearanceByStudent = new Map(existing.map(r => [r.student_id, r.id]));

    // Bulk INSERT new clearances (students without an existing record)
    const newStudentIds = eligibleIds.filter(id => !clearanceByStudent.has(id));
    let initiated = 0;
    if (newStudentIds.length > 0) {
      const params = [], placeholders = [];
      for (const sid of newStudentIds) {
        const b = params.length;
        params.push(req.schoolId, sid, req.user.id);
        placeholders.push(`($${b+1},$${b+2},$${b+3})`);
      }
      const { rows: newClr } = await pool.query(
        `INSERT INTO student_clearances (school_id, student_id, initiated_by)
         VALUES ${placeholders.join(',')} RETURNING id, student_id`,
        params
      );
      initiated = newClr.length;
      for (const r of newClr) clearanceByStudent.set(r.student_id, r.id);
    }

    // Bulk INSERT clearance items for all student-office pairs
    const itemParams = [], itemPlaceholders = [];
    for (const [studentId, officeIds] of studentOfficeMap) {
      const clearanceId = clearanceByStudent.get(studentId);
      if (!clearanceId) continue;
      for (const officeId of officeIds) {
        const b = itemParams.length;
        itemParams.push(req.schoolId, clearanceId, officeId);
        itemPlaceholders.push(`($${b+1},$${b+2},$${b+3})`);
      }
    }
    if (itemPlaceholders.length > 0) {
      await pool.query(
        `INSERT INTO student_clearance_items (school_id, clearance_id, office_id)
         VALUES ${itemPlaceholders.join(',')}
         ON CONFLICT (clearance_id, office_id) DO NOTHING`,
        itemParams
      );
    }

    res.json({ initiated, skipped: skippedNoOffice + existing.length, total: students.length });
  } catch (err) { next(err); }
});

// ── Student Clearance Overview ────────────────────────────────────────────────

// GET /api/clearance-admin/students?search=&class_name=&status=
router.get('/students', async (req, res, next) => {
  try {
    const { search, class_name, status } = req.query;
    const conditions = [`s.school_id = $1`];
    const params = [req.schoolId];
    let p = 2;

    if (search) { conditions.push(`(LOWER(s.name) LIKE $${p} OR LOWER(s.student_code) LIKE $${p})`); params.push(`%${search.toLowerCase()}%`); p++; }
    if (class_name) { conditions.push(`s.class_name = $${p}`); params.push(class_name); p++; }

    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.student_code, s.class_name,
              sc.id AS clearance_id, sc.is_fully_cleared, sc.initiated_at, sc.fully_cleared_at,
              COUNT(sci.id)::int AS total_offices,
              COUNT(sci.id) FILTER (WHERE sci.status = 'cleared')::int AS cleared_count,
              COUNT(sci.id) FILTER (WHERE sci.status = 'not_cleared')::int AS not_cleared_count
       FROM students s
       LEFT JOIN student_clearances sc ON sc.student_id = s.id AND sc.school_id = s.school_id
       LEFT JOIN student_clearance_items sci ON sci.clearance_id = sc.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY s.id, sc.id
       ORDER BY s.class_name, s.name
       LIMIT 200`,
      params
    );

    // Filter by status if requested
    const filtered = status
      ? rows.filter(r => {
          if (status === 'not_initiated') return !r.clearance_id;
          if (status === 'fully_cleared') return r.is_fully_cleared;
          if (status === 'in_progress')   return r.clearance_id && !r.is_fully_cleared;
          return true;
        })
      : rows;

    res.json(filtered);
  } catch (err) { next(err); }
});

// GET /api/clearance-admin/students/:studentId
router.get('/students/:studentId', async (req, res, next) => {
  try {
    const { rows: sRows } = await pool.query(
      `SELECT id, name, student_code, class_name, picture_url FROM students
       WHERE id = $1 AND school_id = $2`,
      [req.params.studentId, req.schoolId]
    );
    if (!sRows.length) return res.status(404).json({ error: 'Student not found' });
    const student = sRows[0];

    const { rows: clRows } = await pool.query(
      `SELECT sc.id, sc.is_fully_cleared, sc.initiated_at, sc.fully_cleared_at,
              sci.id AS item_id, sci.office_id, sci.status, sci.notes, sci.actioned_at,
              co.name AS office_name, co.office_type, co.sort_order,
              t.name AS actioned_by_teacher, ss2.name AS actioned_by_staff
       FROM student_clearances sc
       JOIN student_clearance_items sci ON sci.clearance_id = sc.id
       JOIN clearance_offices co ON co.id = sci.office_id
       LEFT JOIN teachers t    ON t.id   = sci.actioned_by_teacher_id
       LEFT JOIN school_staff ss2 ON ss2.id = sci.actioned_by_school_staff_id
       WHERE sc.student_id = $1 AND sc.school_id = $2
       ORDER BY co.sort_order, co.name`,
      [req.params.studentId, req.schoolId]
    );

    res.json({ student, clearance: clRows });
  } catch (err) { next(err); }
});

// POST /api/clearance-admin/students/:studentId/override
// Admin can force a specific item to any status, or reset it to pending
router.post('/students/:studentId/override', async (req, res, next) => {
  try {
    const { item_id, status, notes } = req.body;
    if (!item_id || !status) return res.status(400).json({ error: 'item_id and status required' });
    if (!['pending', 'cleared', 'not_cleared'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending, cleared or not_cleared' });
    }
    if (status === 'not_cleared' && !notes?.trim()) {
      return res.status(400).json({ error: 'A reason is required when marking as not cleared' });
    }

    // Verify item belongs to this school and student
    const { rows: itemRows } = await pool.query(
      `SELECT sci.id, sci.clearance_id FROM student_clearance_items sci
       JOIN student_clearances sc ON sc.id = sci.clearance_id
       WHERE sci.id = $1 AND sc.student_id = $2 AND sc.school_id = $3`,
      [item_id, req.params.studentId, req.schoolId]
    );
    if (!itemRows.length) return res.status(404).json({ error: 'Item not found' });
    const clearanceId = itemRows[0].clearance_id;

    await pool.query(
      `UPDATE student_clearance_items
       SET status = $1, notes = $2,
           actioned_by_teacher_id      = $3,
           actioned_by_school_staff_id = NULL,
           actioned_at = $4
       WHERE id = $5`,
      [status, notes?.trim() || null, status !== 'pending' ? req.user.id : null,
       status !== 'pending' ? new Date() : null, item_id]
    );

    // Recalculate fully_cleared
    await recalcFullyCleared(clearanceId, req.schoolId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Shared helper ─────────────────────────────────────────────────────────────
async function recalcFullyCleared(clearanceId, schoolId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status != 'cleared')::int AS pending_count
     FROM student_clearance_items WHERE clearance_id = $1`,
    [clearanceId]
  );
  const fullyCleared = rows[0].pending_count === 0;
  await pool.query(
    `UPDATE student_clearances
     SET is_fully_cleared = $1, fully_cleared_at = $2
     WHERE id = $3`,
    [fullyCleared, fullyCleared ? new Date() : null, clearanceId]
  );
}

module.exports = { router, recalcFullyCleared };
