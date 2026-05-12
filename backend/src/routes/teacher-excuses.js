const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// GET /api/teacher-excuses  — admin sees all; teacher sees own
router.get('/', async (req, res, next) => {
  try {
    const conditions = ['te.school_id = $1'];
    const params     = [req.schoolId];

    if (req.user.role === 'teacher') {
      params.push(req.user.id);
      conditions.push(`te.teacher_id = $${params.length}`);
    } else {
      if (req.query.teacherId) {
        params.push(req.query.teacherId);
        conditions.push(`te.teacher_id = $${params.length}`);
      }
      if (req.query.status) {
        params.push(req.query.status);
        conditions.push(`te.status = $${params.length}`);
      }
    }
    if (req.query.from) {
      params.push(req.query.from);
      conditions.push(`te.date_to >= $${params.length}`);
    }
    if (req.query.to) {
      params.push(req.query.to);
      conditions.push(`te.date_from <= $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT
         te.id, te.date_from, te.date_to, te.type, te.reason,
         te.status, te.approved_at, te.created_at,
         t.id   AS teacher_id,
         t.name AS teacher_name,
         a.name AS approved_by_name
       FROM teacher_excuses te
       JOIN teachers t  ON t.id  = te.teacher_id
       LEFT JOIN teachers a ON a.id = te.approved_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY te.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/teacher-excuses — admin creates (auto-approved) or teacher requests (Pending)
router.post('/', async (req, res, next) => {
  try {
    const { teacherId, dateFrom, dateTo, type, reason } = req.body;
    const valid = ['Official Duty', 'Permission', 'Sick Leave', 'Other'];

    if (!teacherId || !dateFrom || !dateTo || !type || !reason) {
      return res.status(400).json({ error: 'teacherId, dateFrom, dateTo, type and reason are required' });
    }
    if (!valid.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${valid.join(', ')}` });
    }
    if (new Date(dateTo) < new Date(dateFrom)) {
      return res.status(400).json({ error: 'dateTo must be on or after dateFrom' });
    }

    // Teachers can only create excuses for themselves
    if (req.user.role === 'teacher' && req.user.id !== teacherId) {
      return res.status(403).json({ error: 'You can only submit excuses for yourself' });
    }

    const isAdmin  = req.user.role === 'admin' || req.user.role === 'super_admin';
    const status   = isAdmin ? 'Approved' : 'Pending';
    const approver = isAdmin ? req.user.id : null;
    const approvedAt = isAdmin ? 'now()' : null;

    const { rows } = await pool.query(
      `INSERT INTO teacher_excuses
         (school_id, teacher_id, date_from, date_to, type, reason, status, approved_by, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${isAdmin ? 'now()' : 'NULL'})
       RETURNING *`,
      [req.schoolId, teacherId, dateFrom, dateTo, type, reason.trim(), status, approver]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/teacher-excuses/:id/approve
router.patch('/:id/approve', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE teacher_excuses
       SET status = 'Approved', approved_by = $1, approved_at = now(), updated_at = now()
       WHERE id = $2 AND school_id = $3
       RETURNING id, status`,
      [req.user.id, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Excuse not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/teacher-excuses/:id/reject
router.patch('/:id/reject', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE teacher_excuses
       SET status = 'Rejected', approved_by = $1, approved_at = now(), updated_at = now()
       WHERE id = $2 AND school_id = $3
       RETURNING id, status`,
      [req.user.id, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Excuse not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/teacher-excuses/:id  — admin only
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM teacher_excuses WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Excuse not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
