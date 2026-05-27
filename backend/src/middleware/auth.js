const jwt  = require('jsonwebtoken');
const pool = require('../config/db');

// In-memory subscription cache — avoids a DB round-trip on every API request.
// TTL of 5 minutes is acceptable: a newly activated or expired subscription
// takes effect within 5 minutes without any explicit invalidation needed.
const subCache = new Map(); // schoolId → { status, ends_at, cachedAt }
const SUB_CACHE_TTL_MS = 5 * 60 * 1000;

function clearSubCache(schoolId) {
  if (schoolId) subCache.delete(schoolId);
  else subCache.clear();
}
// Export so routes that change subscription status can bust the cache.
module.exports.clearSubCache = clearSubCache;

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user     = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.schoolId = req.user.schoolId || null;

    // Re-validate teacher/admin/student accounts on every request so that
    // deactivating a user takes effect immediately, not after token expiry.
    if (req.user.role === 'teacher' || req.user.role === 'admin') {
      const { rows } = await pool.query(
        `SELECT status FROM teachers WHERE id = $1 AND school_id = $2`,
        [req.user.id, req.schoolId]
      );
      if (!rows.length || rows[0].status !== 'Active') {
        return res.status(401).json({
          error: 'Your account has been deactivated. Please contact your administrator.',
        });
      }
    }
    if (req.user.role === 'student') {
      const { rows } = await pool.query(
        `SELECT status FROM students WHERE id = $1 AND school_id = $2`,
        [req.user.id, req.schoolId]
      );
      if (!rows.length || rows[0].status !== 'Active') {
        return res.status(401).json({
          error: 'Your account has been deactivated. Please contact your administrator.',
        });
      }
    }
    if (req.user.role === 'clearance_staff') {
      const { rows } = await pool.query(
        `SELECT is_active FROM clearance_staff WHERE id = $1 AND school_id = $2`,
        [req.user.id, req.schoolId]
      );
      if (!rows.length || !rows[0].is_active) {
        return res.status(401).json({
          error: 'Your account has been deactivated. Please contact your administrator.',
        });
      }
    }

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(err);
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
    const schoolId = req.schoolId;
    const now = Date.now();
    const cached = subCache.get(schoolId);

    let sub;
    if (cached && (now - cached.cachedAt) < SUB_CACHE_TTL_MS) {
      sub = { status: cached.status, ends_at: cached.ends_at };
    } else {
      const { rows } = await pool.query(
        `SELECT status, ends_at
         FROM subscriptions
         WHERE school_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [schoolId]
      );

      if (!rows.length) {
        return res.status(403).json({ error: 'No subscription found for this school' });
      }

      sub = rows[0];
      subCache.set(schoolId, { status: sub.status, ends_at: sub.ends_at, cachedAt: now });
    }

    // Auto-expire if the end date has passed
    if (sub.ends_at && new Date(sub.ends_at) < new Date()) {
      subCache.delete(schoolId);
      await pool.query(
        `UPDATE subscriptions SET status = 'expired', updated_at = now()
         WHERE school_id = $1 AND status IN ('trial', 'active')`,
        [schoolId]
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
