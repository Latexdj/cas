const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const pool    = require('../config/db');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { auditLog } = require('../utils/audit');

// All routes here are super-admin only
router.use(authenticate, superAdminOnly);

// ── GET /api/schools — list all schools with subscription status ──
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.id, s.name, s.email, s.phone, s.address, s.code, s.notes, s.created_at,
        sub.status          AS subscription_status,
        sub.starts_at,
        sub.ends_at,
        sub.teacher_limit,
        p.display_name      AS plan_name,
        (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id AND t.status = 'Active')::int AS active_teachers,
        (SELECT COUNT(*) FROM attendance a WHERE a.school_id = s.id)::int AS total_attendance,
        (SELECT MAX(a2.date)::text FROM attendance a2 WHERE a2.school_id = s.id) AS last_submission
      FROM schools s
      LEFT JOIN subscriptions sub
        ON sub.id = (
          SELECT id FROM subscriptions
          WHERE school_id = s.id
          ORDER BY created_at DESC LIMIT 1
        )
      LEFT JOIN plans p ON p.id = sub.plan_id
      ORDER BY s.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/schools/:id ──
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*,
         sub.status AS subscription_status, sub.starts_at, sub.ends_at, sub.teacher_limit,
         p.name AS plan_name, p.display_name,
         (SELECT COUNT(*)::int FROM teachers t WHERE t.school_id = s.id AND t.status = 'Active') AS active_teachers,
         (SELECT COUNT(*)::int FROM attendance a WHERE a.school_id = s.id) AS total_attendance,
         (SELECT MAX(a2.date)::text FROM attendance a2 WHERE a2.school_id = s.id) AS last_submission
       FROM schools s
       LEFT JOIN subscriptions sub ON sub.id = (
         SELECT id FROM subscriptions WHERE school_id = s.id ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN plans p ON p.id = sub.plan_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'School not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/schools — create school + 14-day trial ──
router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, address, adminName, adminPin } = req.body;
    if (!name || !email || !adminName) {
      return res.status(400).json({ error: 'name, email and adminName are required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Generate next school code: CAS001, CAS002, …
      const { rows: countRows } = await client.query(`SELECT COUNT(*) FROM schools`);
      const nextNum    = parseInt(countRows[0].count) + 1;
      const schoolCode = 'CAS' + String(nextNum).padStart(3, '0');

      // Create school
      const { rows: schoolRows } = await client.query(
        `INSERT INTO schools (name, email, phone, address, code)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [name.trim(), email.trim(), phone || null, address || null, schoolCode]
      );
      const school = schoolRows[0];

      // Attach 14-day trial subscription
      const teacherLimit = Math.max(10, parseInt(req.body.teacherLimit) || 10);
      const { rows: planRows } = await client.query(
        `SELECT id FROM plans WHERE name = 'trial' LIMIT 1`
      );
      const trialPlanId = planRows[0].id;
      const trialEnd    = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO subscriptions (school_id, plan_id, status, ends_at, teacher_limit)
         VALUES ($1,$2,'trial',$3,$4)`,
        [school.id, trialPlanId, trialEnd, teacherLimit]
      );

      // Create the school admin teacher account
      const pin     = adminPin || process.env.DEFAULT_TEACHER_PIN || '1234';
      const pinHash = await bcrypt.hash(String(pin), 12);

      const { rows: adminRows } = await client.query(
        `INSERT INTO teachers (school_id, teacher_code, name, email, status, is_admin, pin_hash)
         VALUES ($1,'T001',$2,$3,'Active',true,$4) RETURNING id, name`,
        [school.id, adminName.trim(), email.trim(), pinHash]
      );

      await client.query('COMMIT');

      await auditLog('school_created', 'school', school.id, school.name, {
        email: school.email,
        code: schoolCode,
        admin: adminName,
        trial_ends: trialEnd,
      });

      res.status(201).json({
        school,
        admin: adminRows[0],
        subscription: { status: 'trial', ends_at: trialEnd },
        message: `School created. Trial ends ${trialEnd.toDateString()}. Admin PIN: ${pin}. Teacher limit: ${teacherLimit}.`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: 'A school with that email already exists' });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/schools/:id — update school details ──
router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, phone, address, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE schools
       SET name    = COALESCE($1, name),
           email   = COALESCE($2, email),
           phone   = COALESCE($3, phone),
           address = COALESCE($4, address),
           notes   = COALESCE($5, notes),
           updated_at = now()
       WHERE id = $6 RETURNING *`,
      [name || null, email || null, phone || null, address || null, notes !== undefined ? notes : null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'School not found' });

    await auditLog('school_updated', 'school', rows[0].id, rows[0].name, {
      fields: Object.keys(req.body).filter(k => req.body[k] !== undefined),
    });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/schools/:id/activate — move school to paid plan ──
router.post('/:id/activate', async (req, res, next) => {
  try {
    const { rows: schoolRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.params.id]);
    if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });

    const { rows: planRows } = await pool.query(
      `SELECT id FROM plans WHERE name = 'paid' LIMIT 1`
    );
    const paidPlanId = planRows[0].id;

    // Preserve teacher_limit from current subscription unless explicitly overridden
    const { rows: currentSubRows } = await pool.query(
      `SELECT teacher_limit FROM subscriptions WHERE school_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    );
    const teacherLimit = req.body.teacherLimit
      ? Math.max(10, parseInt(req.body.teacherLimit))
      : (currentSubRows[0]?.teacher_limit ?? 10);

    await pool.query(
      `UPDATE subscriptions SET status = 'expired', updated_at = now()
       WHERE school_id = $1 AND status IN ('trial','active')`,
      [req.params.id]
    );

    const startsAt = req.body.startsAt ? new Date(req.body.startsAt) : new Date();
    const endsAt   = req.body.endsAt   ? new Date(req.body.endsAt)   : null;

    const { rows } = await pool.query(
      `INSERT INTO subscriptions (school_id, plan_id, status, starts_at, ends_at, teacher_limit)
       VALUES ($1,$2,'active',$3,$4,$5) RETURNING *`,
      [req.params.id, paidPlanId, startsAt, endsAt, teacherLimit]
    );

    await auditLog('school_activated', 'school', req.params.id, schoolRows[0].name, {
      plan: 'paid',
      starts_at: startsAt,
      ends_at: endsAt,
      teacher_limit: teacherLimit,
      message: endsAt
        ? `Activated on paid plan until ${endsAt.toDateString()}`
        : 'Activated on paid plan (no expiry)',
    });

    res.json({ message: 'School activated on paid plan', subscription: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/schools/:id/revert-to-trial — undo accidental paid activation ──
router.post('/:id/revert-to-trial', async (req, res, next) => {
  try {
    const days = parseInt(req.body.days) || 14;
    const { rows: schoolRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.params.id]);
    if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });

    const { rows: planRows } = await pool.query(`SELECT id FROM plans WHERE name = 'trial' LIMIT 1`);
    const trialPlanId = planRows[0].id;
    const trialEnd    = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    // Preserve teacher_limit from the active subscription
    const { rows: currentSubRows } = await pool.query(
      `SELECT teacher_limit FROM subscriptions WHERE school_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    );
    const teacherLimit = currentSubRows[0]?.teacher_limit ?? 10;

    // Expire the current active subscription
    await pool.query(
      `UPDATE subscriptions SET status = 'expired', updated_at = now()
       WHERE school_id = $1 AND status = 'active'`,
      [req.params.id]
    );

    // Create a fresh trial subscription with the same teacher limit
    const { rows } = await pool.query(
      `INSERT INTO subscriptions (school_id, plan_id, status, ends_at, teacher_limit)
       VALUES ($1, $2, 'trial', $3, $4) RETURNING *`,
      [req.params.id, trialPlanId, trialEnd, teacherLimit]
    );

    await auditLog('reverted_to_trial', 'school', req.params.id, schoolRows[0].name, {
      days,
      trial_ends: trialEnd,
      message: 'Reverted from paid to trial',
    });

    res.json({ message: `Reverted to trial. Ends ${trialEnd.toDateString()}.`, subscription: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/schools/:id/extend-trial — extend trial by N days ──
router.post('/:id/extend-trial', async (req, res, next) => {
  try {
    const days = parseInt(req.body.days) || 14;
    const { rows: schoolRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.params.id]);
    if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });

    const { rows } = await pool.query(
      `UPDATE subscriptions
       SET ends_at    = ends_at + ($1 || ' days')::interval,
           status     = 'trial',
           updated_at = now()
       WHERE school_id = $2
         AND status IN ('trial','expired')
         AND id = (SELECT id FROM subscriptions WHERE school_id = $2 ORDER BY created_at DESC LIMIT 1)
       RETURNING ends_at`,
      [days, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No trial subscription found' });

    await auditLog('trial_extended', 'school', req.params.id, schoolRows[0].name, {
      days_added: days,
      new_ends_at: rows[0].ends_at,
    });

    res.json({ message: `Trial extended by ${days} days`, ends_at: rows[0].ends_at });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/schools/:id/reset-admin-pin ──
router.post('/:id/reset-admin-pin', async (req, res, next) => {
  try {
    const { pin } = req.body;
    if (!pin || String(pin).length < 4)
      return res.status(400).json({ error: 'PIN must be at least 4 characters' });

    const { rows: schoolRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.params.id]);
    if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });

    const { rows: teacherRows } = await pool.query(
      `SELECT id FROM teachers WHERE school_id = $1 AND is_admin = true ORDER BY created_at ASC LIMIT 1`,
      [req.params.id]
    );
    if (!teacherRows.length) return res.status(404).json({ error: 'Admin teacher not found' });

    const pinHash = await bcrypt.hash(String(pin), 12);
    await pool.query(
      `UPDATE teachers SET pin_hash = $1, updated_at = now() WHERE id = $2`,
      [pinHash, teacherRows[0].id]
    );

    await auditLog('admin_pin_reset', 'school', req.params.id, schoolRows[0].name, {
      message: 'Admin PIN was reset',
    });

    res.json({ message: 'Admin PIN reset successfully' });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/schools/:id/teacher-limit — update the active subscription's teacher limit ──
router.patch('/:id/teacher-limit', async (req, res, next) => {
  try {
    const limit = parseInt(req.body.teacherLimit);
    if (!limit || limit < 10)
      return res.status(400).json({ error: 'Teacher limit must be at least 10' });

    const { rows: schoolRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.params.id]);
    if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });

    const { rows } = await pool.query(
      `UPDATE subscriptions SET teacher_limit = $1, updated_at = now()
       WHERE school_id = $2
         AND id = (SELECT id FROM subscriptions WHERE school_id = $2 ORDER BY created_at DESC LIMIT 1)
       RETURNING teacher_limit`,
      [limit, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No subscription found' });

    await auditLog('teacher_limit_updated', 'school', req.params.id, schoolRows[0].name, {
      new_limit: limit,
    });

    res.json({ message: `Teacher limit updated to ${limit}`, teacher_limit: rows[0].teacher_limit });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/schools/:id ──
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: schoolRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.params.id]);
    if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });
    const schoolName = schoolRows[0].name;

    const { rowCount } = await pool.query(
      `DELETE FROM schools WHERE id = $1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'School not found' });

    await auditLog('school_deleted', 'school', req.params.id, schoolName, {
      message: 'School and all data permanently deleted',
    });

    res.json({ message: 'School and all related data deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
