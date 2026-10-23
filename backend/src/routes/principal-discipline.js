'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, managementOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { queryFlaggedStudents, queryFlaggedTeachers, queryThresholds } = require('../utils/discipline-flags');

router.use(authenticate, managementOnly, requireActiveSubscription, checkModuleAccess('discipline'));

// GET /api/principal/discipline/letters
// Returns pending_approval letters for the principal's school, ordered newest first.
router.get('/letters', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT sdl.id, sdl.ref_number, sdl.letter_type, sdl.offense_category, sdl.offense_other,
              sdl.subject, sdl.body, sdl.issued_date::text,
              sdl.status, sdl.requires_approval, sdl.pdf_url, sdl.created_at,
              sdl.issued_by_name, sdl.issued_by_signature_url,
              s.id AS student_id, s.name AS student_name, s.student_code, s.class_name,
              ay.name AS academic_year_name,
              sch.name AS school_name,
              sch.letterhead_url, sch.headmaster_signature_url,
              sch.address, sch.phone, sch.email, sch.motto
       FROM student_disciplinary_letters sdl
       JOIN students s ON s.id = sdl.student_id
       JOIN schools sch ON sch.id = sdl.school_id
       LEFT JOIN academic_years ay ON ay.id = sdl.academic_year_id
       WHERE sdl.school_id = $1 AND sdl.status = 'pending_approval'
       ORDER BY sdl.created_at DESC`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/principal/discipline/letters/:id
router.get('/letters/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT sdl.*, sdl.issued_date::text,
              s.name AS student_name, s.student_code, s.class_name,
              ay.name AS academic_year_name,
              sch.name AS school_name,
              sch.letterhead_url, sch.headmaster_signature_url,
              sch.address, sch.phone, sch.email, sch.motto
       FROM student_disciplinary_letters sdl
       JOIN students s ON s.id = sdl.student_id
       JOIN schools sch ON sch.id = sdl.school_id
       LEFT JOIN academic_years ay ON ay.id = sdl.academic_year_id
       WHERE sdl.id = $1 AND sdl.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/principal/discipline/queries — read-only oversight list of all
// teacher queries for the school (drafts excluded — nothing was issued yet,
// so there's nothing for the principal to oversee). Same field shape as the
// admin's own GET /api/discipline/queries so the frontend can reuse the same
// rendering; principals view, they don't issue/edit/resolve/void here — that
// stays admin-only via /api/discipline/queries/*.
router.get('/queries', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT tq.id, tq.ref_number, tq.category, tq.category_other, tq.subject, tq.body,
              tq.issued_date::text, tq.response_deadline::text,
              tq.status, tq.teacher_response_text,
              tq.teacher_response_file_url, tq.teacher_response_file_name,
              tq.response_submitted_at, tq.resolution_notes,
              tq.resolved_by_name, tq.resolved_at, tq.created_at, tq.issued_by_name,
              tq.issued_by_signature_url, tq.pdf_url,
              tq.voided_at, tq.voided_by_name, tq.void_reason,
              t.id AS teacher_id, t.name AS teacher_name, t.department,
              ay.name AS academic_year_name
       FROM teacher_queries tq
       JOIN teachers t ON t.id = tq.teacher_id
       LEFT JOIN academic_years ay ON ay.id = tq.academic_year_id
       WHERE tq.school_id = $1 AND tq.status != 'draft'
       ORDER BY tq.created_at DESC`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/principal/discipline/flagged-students
// principal/vice_principal: all student flags + teacher flags.
// headmaster: only severity_score >= 2 (stale_serious_case + escalation_trajectory).
// Teacher flags: principal/HOD only — not exposed to headmaster in this endpoint.
router.get('/flagged-students', async (req, res, next) => {
  try {
    const isHeadmaster = req.user.role === 'headmaster';

    let [students, teachers, thresholds] = await Promise.all([
      queryFlaggedStudents(pool, req.schoolId),
      isHeadmaster ? Promise.resolve([]) : queryFlaggedTeachers(pool, req.schoolId),
      queryThresholds(pool, req.schoolId),
    ]);

    if (isHeadmaster) {
      // Headmaster: only stale_serious_case (high) and escalation_trajectory (medium-elevated)
      students = students.filter(s =>
        s.flags.some(f => f.type === 'stale_serious_case' || f.type === 'escalation_trajectory')
      );
    }

    res.json({ students, teachers, thresholds });
  } catch (err) { next(err); }
});

module.exports = router;
