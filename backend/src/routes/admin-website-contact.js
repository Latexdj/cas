const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');

router.use(authenticate, requireActiveSubscription, adminOnly, checkModuleAccess('website'));

// GET / — newest first, plus an unread count so the dashboard tile and the
// list page share one source of truth.
router.get('/', async (req, res, next) => {
  try {
    const [{ rows }, { rows: unreadRows }] = await Promise.all([
      pool.query(
        `SELECT * FROM website_contact_submissions WHERE school_id = $1 ORDER BY created_at DESC`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT count(*)::int AS n FROM website_contact_submissions WHERE school_id = $1 AND is_read = false`,
        [req.schoolId]
      ),
    ]);
    res.json({ submissions: rows, unread_count: unreadRows[0].n });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { is_read } = req.body;
    const { rows } = await pool.query(
      `UPDATE website_contact_submissions SET is_read = COALESCE($1, is_read)
       WHERE id = $2 AND school_id = $3
       RETURNING *`,
      [is_read !== undefined ? Boolean(is_read) : null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM website_contact_submissions WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
