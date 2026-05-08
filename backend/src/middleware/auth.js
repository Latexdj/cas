const jwt  = require('jsonwebtoken');
const pool = require('../config/db');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user     = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.schoolId = req.user.schoolId || null;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function superAdminOnly(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

// Checks that the school has an active trial or paid subscription.
// Super admin bypasses this check entirely.
async function requireActiveSubscription(req, res, next) {
  if (req.user?.role === 'super_admin') return next();
  if (!req.schoolId) {
    return res.status(400).json({ error: 'School context required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT status, ends_at
       FROM subscriptions
       WHERE school_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.schoolId]
    );

    if (!rows.length) {
      return res.status(403).json({ error: 'No subscription found for this school' });
    }

    const sub = rows[0];

    // Auto-expire if the end date has passed
    if (sub.ends_at && new Date(sub.ends_at) < new Date()) {
      await pool.query(
        `UPDATE subscriptions SET status = 'expired', updated_at = now()
         WHERE school_id = $1 AND status IN ('trial', 'active')`,
        [req.schoolId]
      );
      return res.status(403).json({
        error: 'subscription_expired',
        message: sub.status === 'trial'
          ? 'Your 14-day free trial has ended. Please contact support to upgrade.'
          : 'Your subscription has expired. Please contact support to renew.',
      });
    }

    if (sub.status === 'expired' || sub.status === 'cancelled') {
      return res.status(403).json({
        error: 'subscription_expired',
        message: 'Your subscription is inactive. Please contact support.',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate, adminOnly, superAdminOnly, requireActiveSubscription };
