'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveAccess(teacherId, schoolId) {
  const [hmRes, shmRes] = await Promise.all([
    pool.query(
      `SELECT co.linked_house FROM clearance_offices co
       JOIN clearance_office_staff cos ON cos.office_id = co.id
       WHERE co.office_type = 'housemaster'
         AND cos.teacher_id = $1 AND co.school_id = $2 AND co.is_active = true
       LIMIT 1`,
      [teacherId, schoolId]
    ),
    pool.query(
      `SELECT 1 FROM clearance_offices co
       JOIN clearance_office_staff cos ON cos.office_id = co.id
       WHERE co.office_type = 'senior_housemaster'
         AND cos.teacher_id = $1 AND co.school_id = $2 AND co.is_active = true
       LIMIT 1`,
      [teacherId, schoolId]
    ),
  ]);

  if (shmRes.rows.length) {
    const { rows } = await pool.query(
      `SELECT name FROM houses WHERE school_id = $1 ORDER BY name`, [schoolId]
    );
    return { role: 'senior_housemaster', houses: rows.map(h => h.name) };
  }
  if (hmRes.rows.length && hmRes.rows[0].linked_house) {
    return { role: 'housemaster', houses: [hmRes.rows[0].linked_house] };
  }
  return { role: null, houses: [] };
}

async function autoMarkOverdue(schoolId) {
  await pool.query(
    `UPDATE exeats SET status = 'overdue'
     WHERE school_id = $1 AND status = 'active'
       AND (expected_return_date::timestamp + expected_return_time) < NOW()`,
    [schoolId]
  );
}

async function sendParentSms(phone, message) {
  const apiKey   = process.env.SMS_API_KEY;
  const senderId = process.env.SMS_SENDER_ID || 'SCHOOL';
  if (!apiKey) {
    console.warn('[Exeat SMS] SMS_API_KEY not set — SMS not sent. Configure SMS_API_KEY and SMS_SENDER_ID on Render.');
    return false;
  }
  if (!phone) {
    console.warn('[Exeat SMS] No phone number — SMS not sent.');
    return false;
  }
  try {
    // Arkesel SMS API (Ghana) — set SMS_API_KEY and SMS_SENDER_ID env vars to enable
    const url = `https://sms.arkesel.com/sms/api?action=send-sms&api_key=${encodeURIComponent(apiKey)}&to=${encodeURIComponent(phone)}&from=${encodeURIComponent(senderId)}&sms=${encodeURIComponent(message)}`;
    const res  = await fetch(url, { method: 'GET' });
    const body = await res.json().catch(() => ({}));
    if (body.status === 'success' || body.code === '0100') {
      console.log(`[Exeat SMS] Sent to ${phone}`);
      return true;
    }
    console.error('[Exeat SMS] Arkesel rejected:', JSON.stringify(body));
    return false;
  } catch (err) {
    console.error('[Exeat SMS] Request failed:', err.message);
    return false;
  }
}

const EXEAT_SELECT = `
  SELECT e.id, e.exeat_type, e.status, e.destination, e.reason,
         e.parent_contact, e.notes, e.sms_sent,
         e.departure_date::text,  e.departure_time::text,
         e.expected_return_date::text, e.expected_return_time::text,
         e.actual_return_date::text,   e.actual_return_time::text,
         e.granted_at, e.created_at,
         s.id AS student_id, s.name AS student_name,
         s.student_code, s.class_name, s.house,
         t.name AS granted_by_name
  FROM exeats e
  JOIN students s ON s.id = e.student_id
  LEFT JOIN teachers t ON t.id = e.granted_by
`;

// ── GET /api/exeat  (admin) ───────────────────────────────────────────────────
router.get('/', adminOnly, async (req, res, next) => {
  try {
    await autoMarkOverdue(req.schoolId);
    const { status, type, house, from, to } = req.query;
    const params  = [req.schoolId];
    const filters = [];
    if (status) { params.push(status); filters.push(`e.status = $${params.length}`); }
    if (type)   { params.push(type);   filters.push(`e.exeat_type = $${params.length}`); }
    if (house)  { params.push(house);  filters.push(`LOWER(s.house) = LOWER($${params.length})`); }
    if (from)   { params.push(from);   filters.push(`e.departure_date >= $${params.length}`); }
    if (to)     { params.push(to);     filters.push(`e.departure_date <= $${params.length}`); }

    const { rows } = await pool.query(
      `${EXEAT_SELECT}
       WHERE e.school_id = $1
         ${filters.length ? 'AND ' + filters.join(' AND ') : ''}
       ORDER BY e.departure_date DESC, e.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/exeat/on-exeat-ids  (any teacher — for register badge) ───────────
router.get('/on-exeat-ids', async (req, res, next) => {
  try {
    await autoMarkOverdue(req.schoolId);
    const { rows } = await pool.query(
      `SELECT DISTINCT student_id FROM exeats
       WHERE school_id = $1 AND status IN ('active','overdue')`,
      [req.schoolId]
    );
    res.json(rows.map(r => r.student_id));
  } catch (err) { next(err); }
});

// ── GET /api/exeat/my-house  (housemaster / senior HM) ───────────────────────
router.get('/my-house', async (req, res, next) => {
  try {
    const access = await resolveAccess(req.user.id, req.schoolId);
    if (!access.role) return res.status(403).json({ error: 'Housemaster access only' });
    await autoMarkOverdue(req.schoolId);

    const { status, type } = req.query;
    const houseParams = access.houses;
    const houseClause = `LOWER(s.house) = ANY(ARRAY[${houseParams.map((_, i) => `LOWER($${i + 2})`).join(',')}])`;
    const params = [req.schoolId, ...houseParams];
    const extra  = [];
    if (status) { params.push(status); extra.push(`e.status = $${params.length}`); }
    if (type)   { params.push(type);   extra.push(`e.exeat_type = $${params.length}`); }

    const { rows } = await pool.query(
      `${EXEAT_SELECT}
       WHERE e.school_id = $1 AND ${houseClause}
         ${extra.length ? 'AND ' + extra.join(' AND ') : ''}
       ORDER BY e.departure_date DESC, e.created_at DESC`,
      params
    );
    res.json({ role: access.role, houses: access.houses, exeats: rows });
  } catch (err) { next(err); }
});

// ── GET /api/exeat/house-students  (student picker for create modal) ──────────
router.get('/house-students', async (req, res, next) => {
  try {
    const access = await resolveAccess(req.user.id, req.schoolId);
    if (!access.role) return res.status(403).json({ error: 'Housemaster access only' });
    const houseParams = access.houses;
    const { rows } = await pool.query(
      `SELECT id, student_code, name, class_name, house, guardian_mobile
       FROM students
       WHERE school_id = $1
         AND LOWER(house) = ANY(ARRAY[${houseParams.map((_, i) => `LOWER($${i + 2})`).join(',')}])
         AND LOWER(status) = 'active'
       ORDER BY house, class_name, name`,
      [req.schoolId, ...houseParams]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/exeat  (create) ─────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const access = await resolveAccess(req.user.id, req.schoolId);
    if (!access.role) return res.status(403).json({ error: 'Housemaster access only' });

    const {
      student_id, exeat_type, destination, reason, parent_contact,
      departure_date, departure_time, expected_return_date, expected_return_time,
      notes, grant_immediately,
    } = req.body;

    if (!student_id || !exeat_type || !departure_date || !departure_time || !expected_return_date || !expected_return_time) {
      return res.status(400).json({ error: 'student_id, exeat_type, departure_date/time, expected_return_date/time are required' });
    }
    if (!['internal', 'external'].includes(exeat_type)) {
      return res.status(400).json({ error: 'exeat_type must be internal or external' });
    }
    if (exeat_type === 'external' && access.role !== 'senior_housemaster') {
      return res.status(403).json({ error: 'Only the senior housemaster can grant external exeat' });
    }
    if (exeat_type === 'internal' && access.role === 'senior_housemaster') {
      return res.status(403).json({ error: 'Internal exeat is granted by the housemaster, not the senior housemaster' });
    }

    const houseParams = access.houses;
    const { rows: sRows } = await pool.query(
      `SELECT id, name, guardian_mobile FROM students
       WHERE id = $1 AND school_id = $2
         AND LOWER(house) = ANY(ARRAY[${houseParams.map((_, i) => `LOWER($${i + 3})`).join(',')}])`,
      [student_id, req.schoolId, ...houseParams]
    );
    if (!sRows.length) return res.status(404).json({ error: 'Student not found in your house(s)' });

    const student   = sRows[0];
    const contact   = parent_contact?.trim() || student.guardian_mobile || null;
    const initStatus = grant_immediately ? 'active' : 'pending';

    const { rows } = await pool.query(
      `INSERT INTO exeats
         (school_id, student_id, exeat_type, status,
          destination, reason, parent_contact,
          departure_date, departure_time,
          expected_return_date, expected_return_time,
          notes, granted_by, granted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        req.schoolId, student_id, exeat_type, initStatus,
        destination || null, reason || null, contact,
        departure_date, departure_time, expected_return_date, expected_return_time,
        notes || null,
        initStatus === 'active' ? req.user.id : null,
        initStatus === 'active' ? new Date() : null,
      ]
    );
    const exeat = rows[0];

    if (initStatus === 'active' && contact) {
      const { rows: schRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.schoolId]);
      const schoolName = schRows[0]?.name ?? 'the school';
      const msg = `${student.name} has been granted ${exeat_type} exeat from ${schoolName}. Destination: ${destination || 'N/A'}. Expected return: ${expected_return_date} ${expected_return_time.slice(0,5)}. Contact the school for queries.`;
      await sendParentSms(contact, msg);
      await pool.query(`UPDATE exeats SET sms_sent = true WHERE id = $1`, [exeat.id]);
      exeat.sms_sent = true;
    }

    res.status(201).json(exeat);
  } catch (err) { next(err); }
});

// ── POST /api/exeat/:id/approve ───────────────────────────────────────────────
router.post('/:id/approve', async (req, res, next) => {
  try {
    const access = await resolveAccess(req.user.id, req.schoolId);
    if (!access.role) return res.status(403).json({ error: 'Housemaster access only' });

    const { rows: eRows } = await pool.query(
      `${EXEAT_SELECT}
       WHERE e.id = $1 AND e.school_id = $2 AND e.status = 'pending'`,
      [req.params.id, req.schoolId]
    );
    if (!eRows.length) return res.status(404).json({ error: 'Pending exeat not found' });

    const exeat = eRows[0];
    if (!access.houses.map(h => h.toLowerCase()).includes(exeat.house?.toLowerCase())) {
      return res.status(403).json({ error: 'Student is not in your house' });
    }
    if (exeat.exeat_type === 'external' && access.role !== 'senior_housemaster') {
      return res.status(403).json({ error: 'Only the senior housemaster can approve external exeat' });
    }
    if (exeat.exeat_type === 'internal' && access.role === 'senior_housemaster') {
      return res.status(403).json({ error: 'Internal exeat is approved by the housemaster' });
    }

    await pool.query(
      `UPDATE exeats SET status = 'active', granted_by = $1, granted_at = NOW() WHERE id = $2`,
      [req.user.id, req.params.id]
    );

    if (exeat.parent_contact) {
      const { rows: schRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.schoolId]);
      const schoolName = schRows[0]?.name ?? 'the school';
      const msg = `${exeat.student_name} has been granted ${exeat.exeat_type} exeat from ${schoolName}. Destination: ${exeat.destination || 'N/A'}. Expected return: ${exeat.expected_return_date} ${exeat.expected_return_time?.slice(0,5)}.`;
      await sendParentSms(exeat.parent_contact, msg);
      await pool.query(`UPDATE exeats SET sms_sent = true WHERE id = $1`, [req.params.id]);
    }

    const { rows } = await pool.query(
      `${EXEAT_SELECT} WHERE e.id = $1`, [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /api/exeat/:id/return ────────────────────────────────────────────────
router.post('/:id/return', async (req, res, next) => {
  try {
    const access = await resolveAccess(req.user.id, req.schoolId);
    if (!access.role) return res.status(403).json({ error: 'Housemaster access only' });

    const { actual_return_date, actual_return_time } = req.body;
    const retDate = actual_return_date || new Date().toISOString().slice(0, 10);
    const retTime = actual_return_time || new Date().toTimeString().slice(0, 8);

    const { rows: eRows } = await pool.query(
      `SELECT e.id, s.house FROM exeats e JOIN students s ON s.id = e.student_id
       WHERE e.id = $1 AND e.school_id = $2 AND e.status IN ('active','overdue')`,
      [req.params.id, req.schoolId]
    );
    if (!eRows.length) return res.status(404).json({ error: 'Active exeat not found' });
    if (!access.houses.map(h => h.toLowerCase()).includes(eRows[0].house?.toLowerCase())) {
      return res.status(403).json({ error: 'Student is not in your house' });
    }

    const { rows } = await pool.query(
      `UPDATE exeats SET status = 'returned', actual_return_date = $1, actual_return_time = $2
       WHERE id = $3 RETURNING *`,
      [retDate, retTime, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /api/exeat/:id/reject ────────────────────────────────────────────────
router.post('/:id/reject', async (req, res, next) => {
  try {
    const access = await resolveAccess(req.user.id, req.schoolId);
    if (!access.role) return res.status(403).json({ error: 'Housemaster access only' });

    const { rows: eRows } = await pool.query(
      `SELECT e.id, s.house FROM exeats e JOIN students s ON s.id = e.student_id
       WHERE e.id = $1 AND e.school_id = $2 AND e.status = 'pending'`,
      [req.params.id, req.schoolId]
    );
    if (!eRows.length) return res.status(404).json({ error: 'Pending exeat not found' });
    if (!access.houses.map(h => h.toLowerCase()).includes(eRows[0].house?.toLowerCase())) {
      return res.status(403).json({ error: 'Student is not in your house' });
    }

    const { rows } = await pool.query(
      `UPDATE exeats SET status = 'rejected', notes = COALESCE($1, notes) WHERE id = $2 RETURNING *`,
      [req.body.notes || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
