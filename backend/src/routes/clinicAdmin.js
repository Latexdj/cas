'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription, adminOnly } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');

router.use(authenticate, requireActiveSubscription, adminOnly, checkModuleAccess('clinic'));

router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT sms_on_every_visit, sms_on_serious_only FROM clinic_settings WHERE school_id = $1`,
      [req.schoolId]
    );
    res.json(rows[0] ?? { sms_on_every_visit: false, sms_on_serious_only: true });
  } catch (err) { next(err); }
});

router.put('/settings', async (req, res, next) => {
  try {
    const { sms_on_every_visit, sms_on_serious_only } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO clinic_settings (school_id, sms_on_every_visit, sms_on_serious_only)
       VALUES ($1, $2, $3)
       ON CONFLICT (school_id) DO UPDATE
         SET sms_on_every_visit = $2, sms_on_serious_only = $3
       RETURNING sms_on_every_visit, sms_on_serious_only`,
      [req.schoolId, !!sms_on_every_visit, sms_on_serious_only !== false]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/reports/summary', async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const conditions = ['school_id = $1'];
    const params = [req.schoolId];
    if (date_from) { params.push(date_from); conditions.push(`visit_date >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`visit_date <= $${params.length}`); }
    const where = conditions.join(' AND ');
    const [bySeverity, byOutcome, byPatientType, total] = await Promise.all([
      pool.query(`SELECT severity, COUNT(*)::int AS count FROM clinic_visits WHERE ${where} GROUP BY severity`, params),
      pool.query(`SELECT outcome, COUNT(*)::int AS count FROM clinic_visits WHERE ${where} AND outcome IS NOT NULL GROUP BY outcome`, params),
      pool.query(`SELECT patient_type, COUNT(*)::int AS count FROM clinic_visits WHERE ${where} GROUP BY patient_type`, params),
      pool.query(`SELECT COUNT(*)::int AS total FROM clinic_visits WHERE ${where}`, params),
    ]);
    res.json({
      total: total.rows[0].total,
      by_severity: bySeverity.rows,
      by_outcome: byOutcome.rows,
      by_patient_type: byPatientType.rows,
    });
  } catch (err) { next(err); }
});

router.get('/reports/export', async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const conditions = ['v.school_id = $1'];
    const params = [req.schoolId];
    if (date_from) { params.push(date_from); conditions.push(`v.visit_date >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`v.visit_date <= $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT v.visit_date::text, v.patient_type,
              COALESCE(s.name, t.name) AS patient_name,
              s.student_code, s.class_name, v.complaint, v.severity, v.outcome, v.status
       FROM clinic_visits v
       LEFT JOIN students s ON s.id = v.student_id
       LEFT JOIN teachers t ON t.id = v.teacher_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY v.visit_date DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
