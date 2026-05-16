const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// GET /api/notifications — teacher's own notifications
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await pool.query(
      `SELECT id, title, message, read, created_at
       FROM teacher_notifications
       WHERE school_id = $1 AND teacher_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [req.schoolId, req.user.id, limit, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM teacher_notifications
       WHERE school_id = $1 AND teacher_id = $2 AND read = false`,
      [req.schoolId, req.user.id]
    );
    res.json({ count: rows[0].count });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE teacher_notifications SET read = true
       WHERE school_id = $1 AND teacher_id = $2 AND read = false`,
      [req.schoolId, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE teacher_notifications SET read = true
       WHERE id = $1 AND teacher_id = $2 AND school_id = $3`,
      [req.params.id, req.user.id, req.schoolId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
