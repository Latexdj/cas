const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool   = require('../config/db');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { auditLog } = require('../utils/audit');

router.use(authenticate, superAdminOnly);

// GET /api/super-admin/stats — system-wide metrics
router.get('/stats', async (_req, res, next) => {
  try {
    const { rows: [summary] } = await pool.query(`
      SELECT
        COUNT(DISTINCT s.id)::int AS total_schools,
        COUNT(DISTINCT CASE WHEN sub.status = 'trial' AND (sub.ends_at IS NULL OR sub.ends_at > now()) THEN s.id END)::int AS trial_schools,
        COUNT(DISTINCT CASE WHEN sub.status = 'active' THEN s.id END)::int AS active_schools,
        COUNT(DISTINCT CASE WHEN sub.status IN ('expired','cancelled') OR (sub.status = 'trial' AND sub.ends_at <= now()) THEN s.id END)::int AS expired_schools,
        (SELECT COUNT(*)::int FROM teachers WHERE status = 'Active') AS total_teachers,
        (SELECT COUNT(*)::int FROM attendance WHERE date >= date_trunc('month', now())) AS attendance_this_month,
        (SELECT COUNT(*)::int FROM attendance) AS total_attendance
      FROM schools s
      LEFT JOIN subscriptions sub ON sub.id = (
        SELECT id FROM subscriptions WHERE school_id = s.id ORDER BY created_at DESC LIMIT 1
      )
    `);

    const { rows: [mostActive] } = await pool.query(`
      SELECT s.name, s.code, COUNT(a.id)::int AS attendance_count
      FROM schools s
      JOIN attendance a ON a.school_id = s.id
      WHERE a.date >= date_trunc('month', now())
      GROUP BY s.id, s.name, s.code
      ORDER BY attendance_count DESC
      LIMIT 1
    `);

    const { rows: inactive } = await pool.query(`
      SELECT s.id, s.name, s.code, MAX(a.date)::text AS last_submission
      FROM schools s
      LEFT JOIN attendance a ON a.school_id = s.id
      GROUP BY s.id, s.name, s.code
      HAVING MAX(a.date) < now() - interval '7 days' OR MAX(a.date) IS NULL
      ORDER BY last_submission ASC NULLS FIRST
      LIMIT 10
    `);

    res.json({ ...summary, most_active_school: mostActive || null, inactive_schools: inactive });
  } catch (err) { next(err); }
});

// GET /api/super-admin/audit-log
router.get('/audit-log', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await pool.query(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: [{ total }] } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs`
    );
    res.json({ logs: rows, total });
  } catch (err) { next(err); }
});

// POST /api/super-admin/change-password
router.post('/change-password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    if (String(newPassword).length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters' });

    // Check DB credentials first, fall back to env
    const { rows } = await pool.query(`SELECT * FROM super_admin_credentials WHERE id = 1`);
    const storedHash = rows.length ? rows[0].password_hash : process.env.ADMIN_PASSWORD_HASH;
    const isValid    = storedHash ? await bcrypt.compare(String(currentPassword), storedHash) : false;
    if (!isValid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash  = await bcrypt.hash(String(newPassword), 12);
    const username = rows.length ? rows[0].username : (process.env.ADMIN_USERNAME || 'admin');
    await pool.query(`
      INSERT INTO super_admin_credentials (id, username, password_hash, updated_at)
      VALUES (1, $1, $2, now())
      ON CONFLICT (id) DO UPDATE SET password_hash = $2, updated_at = now()
    `, [username, newHash]);

    await auditLog('change_password', 'super_admin', null, 'Super Admin', { message: 'Password changed' });
    res.json({ message: 'Password changed successfully' });
  } catch (err) { next(err); }
});

module.exports = router;
