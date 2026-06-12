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

// ── GET /api/exeat/settings  (admin) ─────────────────────────────────────────
router.get('/settings', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT max_internal, max_external, semester_start_date::text
       FROM exeat_settings WHERE school_id = $1`,
      [req.schoolId]
    );
    res.json(rows[0] ?? { max_internal: 5, max_external: 2, semester_start_date: null });
  } catch (err) { next(err); }
});

// ── PUT /api/exeat/settings  (admin) ─────────────────────────────────────────
router.put('/settings', adminOnly, async (req, res, next) => {
  try {
    const { max_internal, max_external, semester_start_date } = req.body;
    if (max_internal == null || max_external == null || !semester_start_date) {
      return res.status(400).json({ error: 'max_internal, max_external, and semester_start_date are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO exeat_settings (school_id, max_internal, max_external, semester_start_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (school_id) DO UPDATE
         SET max_internal = $2, max_external = $3, semester_start_date = $4, updated_at = now()
       RETURNING max_internal, max_external, semester_start_date::text`,
      [req.schoolId, max_internal, max_external, semester_start_date]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── GET /api/exeat/my-requests  (student) ────────────────────────────────────
router.get('/my-requests', async (req, res, next) => {
  try {
    if (req.user?.role !== 'student') return res.status(403).json({ error: 'Student access only' });
    await autoMarkOverdue(req.schoolId);

    const [settingsRes, exeatsRes, stuRes] = await Promise.all([
      pool.query(
        `SELECT max_internal, max_external, semester_start_date::text FROM exeat_settings WHERE school_id = $1`,
        [req.schoolId]
      ),
      pool.query(`${EXEAT_SELECT} WHERE e.student_id = $1 AND e.school_id = $2 ORDER BY e.created_at DESC`,
        [req.user.id, req.schoolId]
      ),
      pool.query(`SELECT guardian_mobile, house FROM students WHERE id = $1`, [req.user.id]),
    ]);

    const settings = settingsRes.rows[0] ?? { max_internal: null, max_external: null, semester_start_date: null };
    const exeats   = exeatsRes.rows;
    const student  = stuRes.rows[0] ?? {};

    let usedInternal = 0, usedExternal = 0;
    if (settings.semester_start_date) {
      const semExeats = exeats.filter(e =>
        e.departure_date >= settings.semester_start_date && e.status !== 'rejected'
      );
      usedInternal = semExeats.filter(e => e.exeat_type === 'internal').length;
      usedExternal = semExeats.filter(e => e.exeat_type === 'external').length;
    }

    res.json({
      exeats, settings,
      used: { internal: usedInternal, external: usedExternal },
      guardian_mobile: student.guardian_mobile ?? null,
      house: student.house ?? null,
    });
  } catch (err) { next(err); }
});

// ── POST /api/exeat/student-request  (student) ───────────────────────────────
router.post('/student-request', async (req, res, next) => {
  try {
    if (req.user?.role !== 'student') return res.status(403).json({ error: 'Student access only' });

    const { exeat_type, destination, reason, parent_contact,
            departure_date, departure_time, expected_return_date, expected_return_time, notes } = req.body;

    if (!exeat_type || !destination || !reason || !departure_date || !departure_time || !expected_return_date || !expected_return_time) {
      return res.status(400).json({ error: 'exeat_type, destination, reason, departure date/time, and expected return date/time are required' });
    }
    if (!['internal', 'external'].includes(exeat_type)) {
      return res.status(400).json({ error: 'exeat_type must be internal or external' });
    }

    const { rows: stuRows } = await pool.query(
      `SELECT name, guardian_mobile, house FROM students WHERE id = $1 AND school_id = $2`,
      [req.user.id, req.schoolId]
    );
    if (!stuRows.length) return res.status(404).json({ error: 'Student not found' });
    const student = stuRows[0];
    if (!student.house) return res.status(400).json({ error: 'You are not assigned to a house. Contact your administrator.' });

    // Quota check
    const { rows: setRows } = await pool.query(
      `SELECT max_internal, max_external, semester_start_date FROM exeat_settings WHERE school_id = $1`,
      [req.schoolId]
    );
    const settings = setRows[0];
    if (settings?.semester_start_date) {
      const maxForType = exeat_type === 'internal' ? settings.max_internal : settings.max_external;
      if (maxForType != null) {
        const { rows: cntRows } = await pool.query(
          `SELECT COUNT(*) AS cnt FROM exeats
           WHERE student_id = $1 AND school_id = $2 AND exeat_type = $3
             AND status <> 'rejected' AND departure_date >= $4`,
          [req.user.id, req.schoolId, exeat_type, settings.semester_start_date]
        );
        const used = parseInt(cntRows[0].cnt);
        if (used >= maxForType) {
          return res.status(403).json({
            error: 'quota_exceeded',
            message: `You have used all ${maxForType} ${exeat_type} exeat${maxForType !== 1 ? 's' : ''} allowed this semester. Contact your ${exeat_type === 'external' ? 'senior ' : ''}housemaster for an exception.`,
            used, max: maxForType,
          });
        }
      }
    }

    const contact = parent_contact?.trim() || student.guardian_mobile || null;
    const { rows: ins } = await pool.query(
      `INSERT INTO exeats
         (school_id, student_id, exeat_type, status, destination, reason, parent_contact,
          departure_date, departure_time, expected_return_date, expected_return_time, notes)
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [req.schoolId, req.user.id, exeat_type, destination.trim(), reason.trim(), contact,
       departure_date, departure_time, expected_return_date, expected_return_time, notes || null]
    );
    const { rows: full } = await pool.query(`${EXEAT_SELECT} WHERE e.id = $1`, [ins[0].id]);
    res.status(201).json(full[0]);
  } catch (err) { next(err); }
});

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

    const { rows: fullRows } = await pool.query(`${EXEAT_SELECT} WHERE e.id = $1`, [exeat.id]);
    res.status(201).json(fullRows[0]);
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

    await pool.query(
      `UPDATE exeats SET status = 'returned', actual_return_date = $1, actual_return_time = $2
       WHERE id = $3`,
      [retDate, retTime, req.params.id]
    );
    const { rows } = await pool.query(`${EXEAT_SELECT} WHERE e.id = $1`, [req.params.id]);
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

    await pool.query(
      `UPDATE exeats SET status = 'rejected', notes = COALESCE($1, notes) WHERE id = $2`,
      [req.body.notes || null, req.params.id]
    );
    const { rows } = await pool.query(`${EXEAT_SELECT} WHERE e.id = $1`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
