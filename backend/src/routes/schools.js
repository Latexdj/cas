const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const pool    = require('../config/db');
const { authenticate, superAdminOnly } = require('../middleware/auth');

// All routes here are super-admin only
router.use(authenticate, superAdminOnly);

// ── GET /api/schools — list all schools with subscription status ──
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.id, s.name, s.email, s.phone, s.address, s.created_at,
        sub.status          AS subscription_status,
        sub.starts_at,
        sub.ends_at,
        p.display_name      AS plan_name,
        (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id AND t.status = 'Active')::int AS active_teachers,
        (SELECT COUNT(*) FROM attendance a WHERE a.school_id = s.id)::int AS total_attendance
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
         sub.status AS subscription_status, sub.starts_at, sub.ends_at,
         p.name AS plan_name, p.display_name
       FROM schools s
       LEFT JOIN subscriptions sub ON sub.school_id = s.id
       LEFT JOIN plans p ON p.id = sub.plan_id
       WHERE s.id = $1
       ORDER BY sub.created_at DESC`,
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
      const nextNum  = parseInt(countRows[0].count) + 1;
      const schoolCode = 'CAS' + String(nextNum).padStart(3, '0');

      // Create school
      const { rows: schoolRows } = await client.query(
        `INSERT INTO schools (name, email, phone, address, code)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [name.trim(), email.trim(), phone || null, address || null, schoolCode]
      );
      const school = schoolRows[0];

      // Attach 14-day trial subscription
      const { rows: planRows } = await client.query(
        `SELECT id FROM plans WHERE name = 'trial' LIMIT 1`
      );
      const trialPlanId = planRows[0].id;
      const trialEnd    = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO subscriptions (school_id, plan_id, status, ends_at)
         VALUES ($1,$2,'trial',$3)`,
        [school.id, trialPlanId, trialEnd]
      );

      // Create the school admin teacher account
      const pin     = adminPin || process.env.DEFAULT_TEACHER_PIN || '1234';
      const pinHash = await bcrypt.hash(String(pin), 12);

      const { rows: adminRows } = await client.query(
        `INSERT INTO teachers (school_id, name, email, status, is_admin, pin_hash)
         VALUES ($1,$2,$3,'Active',true,$4) RETURNING id, name`,
        [school.id, adminName.trim(), email.trim(), pinHash]
      );

      await client.query('COMMIT');

      res.status(201).json({
        school,
        admin: adminRows[0],
        subscription: { status: 'trial', ends_at: trialEnd },
        message: `School created. Trial ends ${trialEnd.toDateString()}. Admin PIN: ${pin}`,
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
    const { name, email, phone, address } = req.body;
    const { rows } = await pool.query(
      `UPDATE schools
       SET name    = COALESCE($1, name),
           email   = COALESCE($2, email),
           phone   = COALESCE($3, phone),
           address = COALESCE($4, address),
           updated_at = now()
       WHERE id = $5 RETURNING *`,
      [name || null, email || null, phone || null, address || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'School not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/schools/:id/activate — move school to paid plan ──
router.post('/:id/activate', async (req, res, next) => {
  try {
    const { rows: planRows } = await pool.query(
      `SELECT id FROM plans WHERE name = 'paid' LIMIT 1`
    );
    const paidPlanId = planRows[0].id;

    // Expire any existing subscriptions
    await pool.query(
      `UPDATE subscriptions SET status = 'expired', updated_at = now()
       WHERE school_id = $1 AND status IN ('trial','active')`,
      [req.params.id]
    );

    const { rows } = await pool.query(
      `INSERT INTO subscriptions (school_id, plan_id, status, ends_at)
       VALUES ($1,$2,'active',NULL) RETURNING *`,
      [req.params.id, paidPlanId]
    );
    res.json({ message: 'School activated on paid plan', subscription: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/schools/:id/extend-trial — extend trial by N days ──
router.post('/:id/extend-trial', async (req, res, next) => {
  try {
    const days = parseInt(req.body.days) || 14;
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
    res.json({ message: `Trial extended by ${days} days`, ends_at: rows[0].ends_at });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/schools/:id ──
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM schools WHERE id = $1`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'School not found' });
    res.json({ message: 'School and all related data deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
