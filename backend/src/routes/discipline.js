'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { uploadDocument } = require('../services/storage.service');

router.use(authenticate, requireActiveSubscription);

// ─── TEACHER QUERIES ──────────────────────────────────────────────────────────

// GET /api/discipline/queries
// Admin: all; Teacher: own only
router.get('/queries', async (req, res, next) => {
  try {
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const params = [req.schoolId];
    let extra = '';

    if (!isAdmin) {
      if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Access denied' });
      params.push(req.user.id);
      extra += ` AND tq.teacher_id = $${params.length}`;
    }

    const { teacher_id, status, category, academic_year_id } = req.query;
    if (isAdmin && teacher_id)  { params.push(teacher_id);       extra += ` AND tq.teacher_id = $${params.length}`; }
    if (status)                  { params.push(status);           extra += ` AND tq.status = $${params.length}`; }
    if (category)                { params.push(category);         extra += ` AND tq.category = $${params.length}`; }
    if (academic_year_id)        { params.push(academic_year_id); extra += ` AND tq.academic_year_id = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT tq.id, tq.category, tq.category_other, tq.subject, tq.body,
              tq.issued_date::text, tq.response_deadline::text,
              tq.status, tq.teacher_response_text,
              tq.teacher_response_file_url, tq.teacher_response_file_name,
              tq.response_submitted_at, tq.resolution_notes,
              tq.resolved_by_name, tq.resolved_at, tq.created_at, tq.issued_by_name,
              t.id AS teacher_id, t.name AS teacher_name, t.department,
              ay.name AS academic_year_name
       FROM teacher_queries tq
       JOIN teachers t ON t.id = tq.teacher_id
       LEFT JOIN academic_years ay ON ay.id = tq.academic_year_id
       WHERE tq.school_id = $1${extra}
       ORDER BY tq.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/discipline/queries/stats
router.get('/queries/stats', async (req, res, next) => {
  try {
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const params = [req.schoolId];
    let extra = '';
    if (!isAdmin) {
      if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Access denied' });
      params.push(req.user.id);
      extra = ` AND teacher_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                                                                             AS total,
         COUNT(*) FILTER (WHERE status IN ('issued','acknowledged','responded'))             AS open,
         COUNT(*) FILTER (WHERE status = 'issued')                                          AS issued,
         COUNT(*) FILTER (WHERE status = 'responded')                                       AS responded,
         COUNT(*) FILTER (WHERE status = 'resolved')                                        AS resolved,
         COUNT(*) FILTER (WHERE status = 'escalated')                                       AS escalated,
         COUNT(*) FILTER (WHERE response_deadline < CURRENT_DATE
                           AND status NOT IN ('responded','resolved','escalated'))           AS overdue
       FROM teacher_queries WHERE school_id = $1${extra}`,
      params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/discipline/queries (admin only)
router.post('/queries', adminOnly, async (req, res, next) => {
  try {
    const { teacher_id, category, category_other, subject, body,
            issued_date, response_deadline, academic_year_id } = req.body;

    const VALID_CATS = ['absenteeism','misconduct','insubordination','negligence','poor_performance','other'];
    if (!teacher_id || !category || !subject?.trim() || !body?.trim())
      return res.status(400).json({ error: 'teacher_id, category, subject and body are required' });
    if (!VALID_CATS.includes(category))
      return res.status(400).json({ error: 'Invalid category' });
    if (category === 'other' && !category_other?.trim())
      return res.status(400).json({ error: 'Specify the reason when category is Other' });

    const { rows: tRows } = await pool.query(
      `SELECT id, name FROM teachers WHERE id = $1 AND school_id = $2`, [teacher_id, req.schoolId]
    );
    if (!tRows.length) return res.status(404).json({ error: 'Teacher not found' });

    const { rows } = await pool.query(
      `INSERT INTO teacher_queries
         (school_id, teacher_id, issued_by_id, issued_by_name,
          category, category_other, subject, body,
          issued_date, response_deadline, academic_year_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'issued')
       RETURNING *`,
      [req.schoolId, teacher_id, req.user.id, req.user.name || 'Management',
       category, category_other?.trim() || null, subject.trim(), body.trim(),
       issued_date || new Date().toISOString().slice(0,10),
       response_deadline || null, academic_year_id || null]
    );

    await pool.query(
      `INSERT INTO teacher_notifications (school_id, teacher_id, title, message)
       VALUES ($1,$2,'New Query Issued',$3)`,
      [req.schoolId, teacher_id,
       `A query has been issued to you: "${subject.trim()}". Please log in to view and respond.`]
    );

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/discipline/queries/:id
router.get('/queries/:id', async (req, res, next) => {
  try {
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const params = [req.params.id, req.schoolId];
    let extra = '';
    if (!isAdmin) {
      if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Access denied' });
      params.push(req.user.id);
      extra = ` AND tq.teacher_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT tq.*, tq.issued_date::text, tq.response_deadline::text,
              t.name AS teacher_name, t.department,
              ay.name AS academic_year_name
       FROM teacher_queries tq
       JOIN teachers t ON t.id = tq.teacher_id
       LEFT JOIN academic_years ay ON ay.id = tq.academic_year_id
       WHERE tq.id = $1 AND tq.school_id = $2${extra}`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Query not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/discipline/queries/:id/acknowledge (teacher)
router.post('/queries/:id/acknowledge', async (req, res, next) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teacher access only' });
    const { rows } = await pool.query(
      `UPDATE teacher_queries SET status = 'acknowledged', updated_at = now()
       WHERE id = $1 AND school_id = $2 AND teacher_id = $3 AND status = 'issued'
       RETURNING *`,
      [req.params.id, req.schoolId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Query not found or already acknowledged' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/discipline/queries/:id/respond (teacher) — JSON body with optional base64 file
router.post('/queries/:id/respond', async (req, res, next) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teacher access only' });

    const { response_text, file_data, file_name } = req.body;
    if (!response_text?.trim() && !file_data)
      return res.status(400).json({ error: 'Provide a written response or upload a document' });

    const { rows: qRows } = await pool.query(
      `SELECT id, status FROM teacher_queries WHERE id = $1 AND school_id = $2 AND teacher_id = $3`,
      [req.params.id, req.schoolId, req.user.id]
    );
    if (!qRows.length) return res.status(404).json({ error: 'Query not found' });
    if (['resolved','escalated'].includes(qRows[0].status))
      return res.status(400).json({ error: 'Cannot respond to a closed query' });

    let fileUrl = null, fileName = null;
    if (file_data && file_name) {
      try {
        const up = await uploadDocument(file_data, file_name, `query-responses/${req.schoolId}`);
        fileUrl = up.url; fileName = up.filename;
      } catch (e) { return res.status(400).json({ error: e.message }); }
    }

    const { rows } = await pool.query(
      `UPDATE teacher_queries
       SET status = 'responded',
           teacher_response_text      = COALESCE($1, teacher_response_text),
           teacher_response_file_url  = COALESCE($2, teacher_response_file_url),
           teacher_response_file_name = COALESCE($3, teacher_response_file_name),
           response_submitted_at = now(), updated_at = now()
       WHERE id = $4 AND school_id = $5 AND teacher_id = $6
       RETURNING *`,
      [response_text?.trim() || null, fileUrl, fileName, req.params.id, req.schoolId, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/discipline/queries/:id/resolve (admin)
router.patch('/queries/:id/resolve', adminOnly, async (req, res, next) => {
  try {
    const { resolution_notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE teacher_queries
       SET status = 'resolved', resolution_notes = $1,
           resolved_by_name = $2, resolved_at = now(), updated_at = now()
       WHERE id = $3 AND school_id = $4 AND status NOT IN ('resolved','escalated')
       RETURNING *`,
      [resolution_notes?.trim() || null, req.user.name || 'Management', req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Query not found or already closed' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/discipline/queries/:id/escalate (admin)
router.patch('/queries/:id/escalate', adminOnly, async (req, res, next) => {
  try {
    const { resolution_notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE teacher_queries
       SET status = 'escalated', resolution_notes = $1,
           resolved_by_name = $2, resolved_at = now(), updated_at = now()
       WHERE id = $3 AND school_id = $4 AND status NOT IN ('resolved','escalated')
       RETURNING *`,
      [resolution_notes?.trim() || null, req.user.name || 'Management', req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Query not found or already closed' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ─── STUDENT DISCIPLINARY LETTERS ─────────────────────────────────────────────

// GET /api/discipline/letters (admin)
router.get('/letters', adminOnly, async (req, res, next) => {
  try {
    const params = [req.schoolId];
    const filters = [];
    const { student_id, class_name, letter_type, status, academic_year_id, semester } = req.query;
    if (student_id)       { params.push(student_id);       filters.push(`sdl.student_id = $${params.length}`); }
    if (class_name)       { params.push(class_name);       filters.push(`s.class_name = $${params.length}`); }
    if (letter_type)      { params.push(letter_type);      filters.push(`sdl.letter_type = $${params.length}`); }
    if (status)           { params.push(status);           filters.push(`sdl.status = $${params.length}`); }
    if (academic_year_id) { params.push(academic_year_id); filters.push(`sdl.academic_year_id = $${params.length}`); }
    if (semester)         { params.push(Number(semester));  filters.push(`sdl.semester = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT sdl.id, sdl.letter_type, sdl.offense_category, sdl.offense_other,
              sdl.subject, sdl.body, sdl.issued_date::text,
              sdl.status, sdl.acknowledged_at, sdl.acknowledged_by,
              sdl.resolution_notes, sdl.resolved_at, sdl.resolved_by_name,
              sdl.issued_by_name, sdl.created_at, sdl.semester,
              s.id AS student_id, s.name AS student_name,
              s.student_code, s.class_name,
              ay.name AS academic_year_name
       FROM student_disciplinary_letters sdl
       JOIN students s ON s.id = sdl.student_id
       LEFT JOIN academic_years ay ON ay.id = sdl.academic_year_id
       WHERE sdl.school_id = $1${filters.length ? ' AND ' + filters.join(' AND ') : ''}
       ORDER BY sdl.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/discipline/letters/stats (admin)
router.get('/letters/stats', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                                                AS total,
         COUNT(*) FILTER (WHERE status != 'resolved')          AS active,
         COUNT(*) FILTER (WHERE status = 'resolved')           AS resolved,
         COUNT(*) FILTER (WHERE letter_type = 'warning')       AS warning,
         COUNT(*) FILTER (WHERE letter_type = 'final_warning') AS final_warning,
         COUNT(*) FILTER (WHERE letter_type = 'suspension')    AS suspension,
         COUNT(*) FILTER (WHERE letter_type = 'dismissal')     AS dismissal
       FROM student_disciplinary_letters WHERE school_id = $1`,
      [req.schoolId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/discipline/letters (admin only)
router.post('/letters', adminOnly, async (req, res, next) => {
  try {
    const { student_id, letter_type, offense_category, offense_other,
            subject, body, issued_date, academic_year_id, semester } = req.body;

    const VALID_TYPES = ['warning','final_warning','suspension','dismissal','other'];
    const VALID_CATS  = ['lateness_absenteeism','fighting_assault','exam_malpractice',
                         'substance_use','insubordination','theft_damage',
                         'bullying_harassment','indecent_behavior','vandalism','other'];

    if (!student_id || !letter_type || !offense_category || !subject?.trim() || !body?.trim())
      return res.status(400).json({ error: 'student_id, letter_type, offense_category, subject and body are required' });
    if (!VALID_TYPES.includes(letter_type)) return res.status(400).json({ error: 'Invalid letter type' });
    if (!VALID_CATS.includes(offense_category))  return res.status(400).json({ error: 'Invalid offense category' });
    if (offense_category === 'other' && !offense_other?.trim())
      return res.status(400).json({ error: 'Specify the offense when category is Other' });

    const { rows: sRows } = await pool.query(
      `SELECT id, name FROM students WHERE id = $1 AND school_id = $2`, [student_id, req.schoolId]
    );
    if (!sRows.length) return res.status(404).json({ error: 'Student not found' });

    const { rows } = await pool.query(
      `INSERT INTO student_disciplinary_letters
         (school_id, student_id, issued_by_id, issued_by_name,
          letter_type, offense_category, offense_other,
          subject, body, issued_date, academic_year_id, semester, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'issued')
       RETURNING *`,
      [req.schoolId, student_id, req.user.id, req.user.name || 'Management',
       letter_type, offense_category, offense_other?.trim() || null,
       subject.trim(), body.trim(),
       issued_date || new Date().toISOString().slice(0,10),
       academic_year_id || null, semester ? Number(semester) : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/discipline/letters/:id (admin)
router.get('/letters/:id', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT sdl.*, sdl.issued_date::text,
              s.name AS student_name, s.student_code, s.class_name,
              ay.name AS academic_year_name
       FROM student_disciplinary_letters sdl
       JOIN students s ON s.id = sdl.student_id
       LEFT JOIN academic_years ay ON ay.id = sdl.academic_year_id
       WHERE sdl.id = $1 AND sdl.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/discipline/letters/:id/acknowledge (admin)
router.patch('/letters/:id/acknowledge', adminOnly, async (req, res, next) => {
  try {
    const { acknowledged_by } = req.body;
    const { rows } = await pool.query(
      `UPDATE student_disciplinary_letters
       SET status = 'acknowledged', acknowledged_at = now(),
           acknowledged_by = $1, updated_at = now()
       WHERE id = $2 AND school_id = $3 AND status = 'issued'
       RETURNING *`,
      [acknowledged_by || 'admin', req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found or already acknowledged' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/discipline/letters/:id/resolve (admin)
router.patch('/letters/:id/resolve', adminOnly, async (req, res, next) => {
  try {
    const { resolution_notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE student_disciplinary_letters
       SET status = 'resolved', resolution_notes = $1,
           resolved_by_name = $2, resolved_at = now(), updated_at = now()
       WHERE id = $3 AND school_id = $4 AND status != 'resolved'
       RETURNING *`,
      [resolution_notes?.trim() || null, req.user.name || 'Management', req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found or already resolved' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
