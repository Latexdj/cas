const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription, adminOnly);

const ACTION_LABELS = {
  ATTENDANCE_REVOKED:     'Attendance Revoked',
  ATTENDANCE_DELETED:     'Attendance Deleted',
  ABSENCE_DELETED:        'Absence Deleted',
  ABSENCE_STATUS_CHANGED: 'Absence Status Changed',
  ABSENCE_CREATED_MANUAL: 'Manual Absence Created',
};

// GET /api/audit-log
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const { action, from, to } = req.query;

    const conds  = ['school_id = $1'];
    const params = [req.schoolId];
    if (action) { params.push(action);          conds.push(`action = $${params.length}`); }
    if (from)   { params.push(from);            conds.push(`created_at::date >= $${params.length}`); }
    if (to)     { params.push(to);              conds.push(`created_at::date <= $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT id, action, actor_name, target_type, target_id, details, created_at
       FROM school_audit_logs
       WHERE ${conds.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM school_audit_logs WHERE ${conds.join(' AND ')}`,
      params
    );

    res.json({ logs: rows, total: countRows[0].total, actions: Object.keys(ACTION_LABELS) });
  } catch (err) { next(err); }
});

module.exports = router;
