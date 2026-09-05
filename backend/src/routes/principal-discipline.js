'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, managementOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, managementOnly, requireActiveSubscription);

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

module.exports = router;
