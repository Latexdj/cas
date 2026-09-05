'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, managementOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, managementOnly, requireActiveSubscription);

// GET /api/principal/general-letters
// Returns pending_approval general letters for the principal's school, newest first.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT gl.id, gl.ref_number, gl.classification, gl.recipient_type,
              gl.ext_recipient_name, gl.ext_recipient_org,
              gl.internal_recipient_id, gl.internal_recipient_table,
              gl.subject, gl.body, gl.is_sensitive,
              gl.issued_date::text, gl.status,
              gl.requires_approval, gl.pdf_url,
              gl.issued_by_name, gl.issued_by_signature_url,
              gl.created_at,
              CASE WHEN gl.internal_recipient_table = 'students' THEN s.name
                   WHEN gl.internal_recipient_table = 'teachers' THEN t.name
                   ELSE NULL END AS internal_recipient_name,
              s.student_code, s.class_name, t.department,
              sch.name AS school_name
       FROM general_letters gl
       LEFT JOIN students s ON gl.internal_recipient_table = 'students' AND gl.internal_recipient_id = s.id
       LEFT JOIN teachers t ON gl.internal_recipient_table = 'teachers' AND gl.internal_recipient_id = t.id
       JOIN schools sch ON sch.id = gl.school_id
       WHERE gl.school_id = $1 AND gl.status = 'pending_approval'
       ORDER BY gl.created_at DESC`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/principal/general-letters/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT gl.*,
              gl.issued_date::text,
              CASE WHEN gl.internal_recipient_table = 'students' THEN s.name
                   WHEN gl.internal_recipient_table = 'teachers' THEN t.name
                   ELSE NULL END AS internal_recipient_name,
              s.student_code, s.class_name, t.department,
              sch.name AS school_name
       FROM general_letters gl
       LEFT JOIN students s ON gl.internal_recipient_table = 'students' AND gl.internal_recipient_id = s.id
       LEFT JOIN teachers t ON gl.internal_recipient_table = 'teachers' AND gl.internal_recipient_id = t.id
       JOIN schools sch ON sch.id = gl.school_id
       WHERE gl.id = $1 AND gl.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
