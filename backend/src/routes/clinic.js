'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');

router.use(authenticate, requireActiveSubscription, checkModuleAccess('clinic'));

// ── Helpers ───────────────────────────────────────────────────────────────────

// Not applied as a blanket router.use(): /referral is open to any teacher
// and /my-visits, /my-health-profile are open to students, both narrower
// than full clinic-staff access, so this is applied per-route instead,
// matching how exeat.js applies adminOnly per-route rather than blanket.
async function clinicStaffOnly(req, res, next) {
  try {
    const role = req.user?.role;
    if (role === 'admin') return next();
    if (role === 'staff' && req.staffRoles?.includes('clinic')) return next();
    if (role === 'teacher') {
      const { rows } = await pool.query(
        `SELECT 1 FROM teacher_responsibility_assignments tra
         JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
         WHERE tra.teacher_id = $1 AND tr.school_id = $2 AND tr.module_key = 'clinic'`,
        [req.user.id, req.schoolId]
      );
      if (rows.length) return next();
    }
    return res.status(403).json({ error: 'Clinic staff access only' });
  } catch (err) { next(err); }
}

// Arkesel SMS API (Ghana) — same call/env-gating as exeat.js's local
// sendParentSms; duplicated here rather than extracted to a shared service
// since this is only the second consumer.
async function sendClinicSms(phone, message) {
  const apiKey   = process.env.SMS_API_KEY;
  const senderId = process.env.SMS_SENDER_ID || 'SCHOOL';
  if (!apiKey) {
    console.warn('[Clinic SMS] SMS_API_KEY not set — SMS not sent. Configure SMS_API_KEY and SMS_SENDER_ID on Render.');
    return false;
  }
  if (!phone) {
    console.warn('[Clinic SMS] No phone number — SMS not sent.');
    return false;
  }
  try {
    const url = `https://sms.arkesel.com/sms/api?action=send-sms&api_key=${encodeURIComponent(apiKey)}&to=${encodeURIComponent(phone)}&from=${encodeURIComponent(senderId)}&sms=${encodeURIComponent(message)}`;
    const res  = await fetch(url, { method: 'GET' });
    const body = await res.json().catch(() => ({}));
    if (body.status === 'success' || body.code === '0100') {
      console.log(`[Clinic SMS] Sent to ${phone}`);
      return true;
    }
    console.error('[Clinic SMS] Arkesel rejected:', JSON.stringify(body));
    return false;
  } catch (err) {
    console.error('[Clinic SMS] Request failed:', err.message);
    return false;
  }
}

const CLINIC_SELECT = `
  SELECT v.id, v.patient_type, v.visit_date::text, v.arrived_at, v.complaint,
         v.vitals_temp_c, v.vitals_bp, v.vitals_pulse, v.diagnosis_notes,
         v.treatment_given, v.outcome, v.severity, v.status, v.closed_at,
         v.sms_sent, v.notes, v.created_at,
         v.referred_by_teacher_id, rt.name AS referred_by_teacher_name,
         CASE WHEN v.patient_type = 'student' THEN s.id   ELSE t.id   END AS patient_id,
         CASE WHEN v.patient_type = 'student' THEN s.name ELSE t.name END AS patient_name,
         s.student_code, s.class_name,
         t.teacher_code,
         ast.name AS attended_by_staff_name,
         att.name AS attended_by_teacher_name
  FROM clinic_visits v
  LEFT JOIN students s ON s.id = v.student_id
  LEFT JOIN teachers t ON t.id = v.teacher_id
  LEFT JOIN teachers rt ON rt.id = v.referred_by_teacher_id
  LEFT JOIN school_staff ast ON ast.id = v.attended_by_staff_id
  LEFT JOIN teachers att ON att.id = v.attended_by_teacher_id
`;

function outcomeLabel(outcome) {
  return ({
    returned_to_class: 'returned to class',
    sent_home: 'sent home',
    referred_to_hospital: 'referred to hospital',
    admitted_in_clinic: 'admitted in the clinic',
    other: 'attended to',
  })[outcome] ?? 'attended to';
}

async function getClinicSettings(schoolId) {
  const { rows } = await pool.query(
    `SELECT sms_on_every_visit, sms_on_serious_only FROM clinic_settings WHERE school_id = $1`,
    [schoolId]
  );
  return rows[0] ?? { sms_on_every_visit: false, sms_on_serious_only: true };
}

async function maybeSendCloseSms(visit, schoolId) {
  const settings = await getClinicSettings(schoolId);
  const seriousOutcome = ['referred_to_hospital', 'admitted_in_clinic'].includes(visit.outcome);
  const shouldSend = settings.sms_on_every_visit ||
    (settings.sms_on_serious_only && (visit.severity === 'serious' || seriousOutcome));
  if (!shouldSend) return false;

  let phone = null;
  if (visit.patient_type === 'student') {
    const { rows } = await pool.query(`SELECT guardian_mobile FROM students WHERE id = $1`, [visit.patient_id]);
    phone = rows[0]?.guardian_mobile ?? null;
  } else {
    const { rows } = await pool.query(`SELECT phone FROM teachers WHERE id = $1`, [visit.patient_id]);
    phone = rows[0]?.phone ?? null;
  }
  if (!phone) { console.warn('[Clinic SMS] No guardian/staff phone on file — SMS not sent.'); return false; }

  const msg = `${visit.patient_name} visited the school clinic on ${visit.visit_date} for ${visit.complaint}. Outcome: ${outcomeLabel(visit.outcome)}. Please contact the school for details.`;
  const sent = await sendClinicSms(phone, msg);
  if (sent) await pool.query(`UPDATE clinic_visits SET sms_sent = true WHERE id = $1`, [visit.id]);
  return sent;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get('/dashboard', clinicStaffOnly, async (req, res, next) => {
  try {
    const [openRes, todayRes, severityRes] = await Promise.all([
      pool.query(`${CLINIC_SELECT} WHERE v.school_id = $1 AND v.status = 'open' ORDER BY v.arrived_at`, [req.schoolId]),
      pool.query(`SELECT COUNT(*)::int AS today_visits FROM clinic_visits WHERE school_id = $1 AND visit_date = CURRENT_DATE`, [req.schoolId]),
      pool.query(
        `SELECT severity, COUNT(*)::int AS count FROM clinic_visits
         WHERE school_id = $1 AND visit_date = CURRENT_DATE GROUP BY severity`,
        [req.schoolId]
      ),
    ]);
    res.json({
      open_visits: openRes.rows,
      today_visits: todayRes.rows[0].today_visits,
      severity_breakdown: severityRes.rows,
    });
  } catch (err) { next(err); }
});

// ── Patient lookup (for logging a walk-in / referral) ────────────────────────

router.get('/students/search', clinicStaffOnly, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || String(q).length < 2) return res.json([]);
    const { rows } = await pool.query(
      `SELECT id, name, student_code, class_name, status
       FROM students
       WHERE school_id = $1 AND status = 'Active'
         AND (name ILIKE $2 OR student_code ILIKE $2)
       ORDER BY name LIMIT 15`,
      [req.schoolId, `%${q}%`]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/teachers/search', clinicStaffOnly, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || String(q).length < 2) return res.json([]);
    const { rows } = await pool.query(
      `SELECT id, name, teacher_code, department
       FROM teachers
       WHERE school_id = $1 AND status = 'Active'
         AND (name ILIKE $2 OR teacher_code ILIKE $2)
       ORDER BY name LIMIT 15`,
      [req.schoolId, `%${q}%`]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Visits ────────────────────────────────────────────────────────────────────

router.get('/visits', clinicStaffOnly, async (req, res, next) => {
  try {
    const { status, patient_type, date_from, date_to, search } = req.query;
    const conditions = ['v.school_id = $1'];
    const params = [req.schoolId];
    if (status) { params.push(status); conditions.push(`v.status = $${params.length}`); }
    if (patient_type) { params.push(patient_type); conditions.push(`v.patient_type = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`v.visit_date >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`v.visit_date <= $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(s.name ILIKE $${params.length} OR t.name ILIKE $${params.length} OR s.student_code ILIKE $${params.length})`);
    }
    const { rows } = await pool.query(
      `${CLINIC_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY v.arrived_at DESC LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/visits/:id', clinicStaffOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${CLINIC_SELECT} WHERE v.id = $1 AND v.school_id = $2`, [req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Visit not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/visits', clinicStaffOnly, async (req, res, next) => {
  try {
    const { patient_type, student_id, teacher_id, complaint, vitals_temp_c, vitals_bp, vitals_pulse,
            diagnosis_notes, treatment_given, severity, notes } = req.body;
    if (!patient_type || !['student', 'teacher'].includes(patient_type))
      return res.status(400).json({ error: 'patient_type must be student or teacher' });
    if (!complaint?.trim())
      return res.status(400).json({ error: 'complaint is required' });
    if (patient_type === 'student' && !student_id)
      return res.status(400).json({ error: 'student_id is required for a student visit' });
    if (patient_type === 'teacher' && !teacher_id)
      return res.status(400).json({ error: 'teacher_id is required for a staff visit' });

    const attendedByStaffId   = req.user.role === 'staff' ? req.user.id : null;
    const attendedByTeacherId = req.user.role === 'teacher' || req.user.role === 'admin' ? req.user.id : null;

    const { rows } = await pool.query(
      `INSERT INTO clinic_visits (
         school_id, patient_type, student_id, teacher_id, complaint,
         vitals_temp_c, vitals_bp, vitals_pulse, diagnosis_notes, treatment_given,
         severity, notes, attended_by_staff_id, attended_by_teacher_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [req.schoolId, patient_type, patient_type === 'student' ? student_id : null,
       patient_type === 'teacher' ? teacher_id : null, complaint.trim(),
       vitals_temp_c ?? null, vitals_bp ?? null, vitals_pulse ?? null,
       diagnosis_notes ?? null, treatment_given ?? null,
       severity ?? 'minor', notes ?? null, attendedByStaffId, attendedByTeacherId]
    );
    const { rows: full } = await pool.query(`${CLINIC_SELECT} WHERE v.id = $1`, [rows[0].id]);
    res.status(201).json(full[0]);
  } catch (err) { next(err); }
});

router.put('/visits/:id', clinicStaffOnly, async (req, res, next) => {
  try {
    const { complaint, vitals_temp_c, vitals_bp, vitals_pulse, diagnosis_notes,
            treatment_given, severity, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE clinic_visits SET
         complaint = COALESCE($1, complaint),
         vitals_temp_c = $2, vitals_bp = $3, vitals_pulse = $4,
         diagnosis_notes = $5, treatment_given = $6,
         severity = COALESCE($7, severity), notes = $8
       WHERE id = $9 AND school_id = $10
       RETURNING id`,
      [complaint?.trim() ?? null, vitals_temp_c ?? null, vitals_bp ?? null, vitals_pulse ?? null,
       diagnosis_notes ?? null, treatment_given ?? null, severity ?? null, notes ?? null,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Visit not found' });
    const { rows: full } = await pool.query(`${CLINIC_SELECT} WHERE v.id = $1`, [rows[0].id]);
    res.json(full[0]);
  } catch (err) { next(err); }
});

router.post('/visits/:id/close', clinicStaffOnly, async (req, res, next) => {
  try {
    const { outcome } = req.body;
    if (!outcome) return res.status(400).json({ error: 'outcome is required to close a visit' });
    const { rows } = await pool.query(
      `UPDATE clinic_visits SET outcome = $1, status = 'closed', closed_at = now()
       WHERE id = $2 AND school_id = $3 AND status = 'open'
       RETURNING id, patient_type, student_id, teacher_id, visit_date::text, complaint, severity, outcome`,
      [outcome, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Open visit not found' });

    const { rows: full } = await pool.query(`${CLINIC_SELECT} WHERE v.id = $1`, [rows[0].id]);
    const visit = full[0];
    try { await maybeSendCloseSms(visit, req.schoolId); }
    catch (smsErr) { console.error('[Clinic] SMS send failed:', smsErr.message); }

    const { rows: final } = await pool.query(`${CLINIC_SELECT} WHERE v.id = $1`, [rows[0].id]);
    res.json(final[0]);
  } catch (err) { next(err); }
});

router.post('/visits/:id/reopen', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE clinic_visits SET status = 'open', closed_at = NULL
       WHERE id = $1 AND school_id = $2 AND status = 'closed'
       RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Closed visit not found' });
    const { rows: full } = await pool.query(`${CLINIC_SELECT} WHERE v.id = $1`, [rows[0].id]);
    res.json(full[0]);
  } catch (err) { next(err); }
});

// ── Teacher referral ──────────────────────────────────────────────────────────

router.get('/referral/students/search', async (req, res, next) => {
  try {
    if (req.user?.role !== 'teacher' && req.user?.role !== 'admin')
      return res.status(403).json({ error: 'Teacher access only' });
    const { q } = req.query;
    if (!q || String(q).length < 2) return res.json([]);
    const { rows } = await pool.query(
      `SELECT id, name, student_code, class_name
       FROM students
       WHERE school_id = $1 AND status = 'Active'
         AND (name ILIKE $2 OR student_code ILIKE $2)
       ORDER BY name LIMIT 15`,
      [req.schoolId, `%${q}%`]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/referral', async (req, res, next) => {
  try {
    if (req.user?.role !== 'teacher' && req.user?.role !== 'admin')
      return res.status(403).json({ error: 'Teacher access only' });
    const { student_id, complaint } = req.body;
    if (!student_id || !complaint?.trim())
      return res.status(400).json({ error: 'student_id and complaint are required' });
    const { rows } = await pool.query(
      `INSERT INTO clinic_visits (school_id, patient_type, student_id, complaint, referred_by_teacher_id)
       VALUES ($1, 'student', $2, $3, $4) RETURNING id`,
      [req.schoolId, student_id, complaint.trim(), req.user.id]
    );
    const { rows: full } = await pool.query(`${CLINIC_SELECT} WHERE v.id = $1`, [rows[0].id]);
    res.status(201).json(full[0]);
  } catch (err) { next(err); }
});

// ── Health profiles ───────────────────────────────────────────────────────────

router.get('/students/:studentId/health-profile', clinicStaffOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT blood_group, genotype, known_allergies, known_conditions, current_medications, updated_at
       FROM student_health_profiles WHERE student_id = $1 AND school_id = $2`,
      [req.params.studentId, req.schoolId]
    );
    res.json(rows[0] ?? null);
  } catch (err) { next(err); }
});

router.put('/students/:studentId/health-profile', clinicStaffOnly, async (req, res, next) => {
  try {
    const { blood_group, genotype, known_allergies, known_conditions, current_medications } = req.body;
    const updatedByStaffId = req.user.role === 'staff' ? req.user.id : null;
    const { rows } = await pool.query(
      `INSERT INTO student_health_profiles
         (school_id, student_id, blood_group, genotype, known_allergies, known_conditions, current_medications, updated_by_staff_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (student_id) DO UPDATE SET
         blood_group = $3, genotype = $4, known_allergies = $5,
         known_conditions = $6, current_medications = $7,
         updated_by_staff_id = $8, updated_at = now()
       RETURNING blood_group, genotype, known_allergies, known_conditions, current_medications, updated_at`,
      [req.schoolId, req.params.studentId, blood_group ?? null, genotype ?? null,
       known_allergies ?? null, known_conditions ?? null, current_medications ?? null, updatedByStaffId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/students/:studentId/history', clinicStaffOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${CLINIC_SELECT} WHERE v.student_id = $1 AND v.school_id = $2 ORDER BY v.arrived_at DESC`,
      [req.params.studentId, req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Student self-service ──────────────────────────────────────────────────────

router.get('/my-visits', async (req, res, next) => {
  try {
    if (req.user?.role !== 'student') return res.status(403).json({ error: 'Student access only' });
    const { rows } = await pool.query(
      `${CLINIC_SELECT} WHERE v.student_id = $1 AND v.school_id = $2 AND v.status = 'closed' ORDER BY v.arrived_at DESC`,
      [req.user.id, req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/my-health-profile', async (req, res, next) => {
  try {
    if (req.user?.role !== 'student') return res.status(403).json({ error: 'Student access only' });
    const { rows } = await pool.query(
      `SELECT blood_group, genotype, known_allergies, known_conditions, current_medications, updated_at
       FROM student_health_profiles WHERE student_id = $1 AND school_id = $2`,
      [req.user.id, req.schoolId]
    );
    res.json(rows[0] ?? null);
  } catch (err) { next(err); }
});

// ── Print ─────────────────────────────────────────────────────────────────────

router.get('/visits/:id/print', async (req, res, next) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && !(role === 'staff' && req.staffRoles?.includes('clinic')))
      return res.status(403).json({ error: 'Clinic staff access only' });
    const { rows } = await pool.query(`${CLINIC_SELECT} WHERE v.id = $1 AND v.school_id = $2`, [req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Visit not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = { router, clinicStaffOnly };
